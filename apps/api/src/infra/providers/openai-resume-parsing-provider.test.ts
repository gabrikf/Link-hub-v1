/**
 * The provider that turns a CV into a profile. It had no unit test at all,
 * which is uncomfortable given that it is the most expensive prompt this
 * codebase sends and the one whose output is written straight into a user's
 * public profile.
 *
 * Three things are worth proving here, and none of them is "the code runs":
 *
 * 1. The resolved language actually reaches the model. It is decided three
 *    layers up, and a value that is computed and then dropped looks identical
 *    to one that works until a Brazilian user reads their English summary.
 * 2. Forcing a language does not corrupt the wire values. `contractType` and
 *    its siblings are matched against `parsedResumeDataSchema`; a model that
 *    helpfully translates `full-time` into `tempo integral` breaks the import
 *    in production and nowhere else.
 * 3. The line structure of a work-experience description survives. Models
 *    answer with unicode bullet glyphs, CRLF and glued-up single lines;
 *    `normalizeDescriptionMarkdown` is what turns that into Markdown the
 *    profile renders as a list instead of one long smear.
 *
 * No network: the OpenAI client is replaced with a fake that records the
 * messages it was handed. A real call here would be a charge on a real key.
 */
import { parsedResumeDataSchema } from "@repo/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordOpenAiRequest,
  recordOpenAiUsage,
} from "../observability/metrics.js";
import type { ResumeParsingInput } from "../../core/providers/resume-parsing/resume-parsing-provider.js";
import {
  normalizeDescriptionMarkdown,
  OpenAiResumeParsingProvider,
} from "./openai-resume-parsing-provider.js";

vi.mock("../observability/metrics.js", () => ({
  recordOpenAiUsage: vi.fn(),
  recordOpenAiRequest: vi.fn(),
}));

describe("normalizeDescriptionMarkdown", () => {
  it("keeps a bullet list as one item per line", () => {
    const description = "- Led the payments team\n- Shipped the new checkout";

    expect(normalizeDescriptionMarkdown(description)).toBe(description);
  });

  it("rewrites unicode bullet glyphs to Markdown list markers", () => {
    const result = normalizeDescriptionMarkdown(
      "• Built the API\n▪ Owned the queue\n◦ Cut p99 latency\n‣ Mentored two juniors\n● Ran the on-call rota",
    );

    expect(result).toBe(
      [
        "- Built the API",
        "- Owned the queue",
        "- Cut p99 latency",
        "- Mentored two juniors",
        "- Ran the on-call rota",
      ].join("\n"),
    );
  });

  it("rewrites an en dash or em dash used as a bullet", () => {
    expect(
      normalizeDescriptionMarkdown("– Owned billing\n— Owned payouts"),
    ).toBe("- Owned billing\n- Owned payouts");
  });

  it("splits a line that carries several bullet glyphs into separate items", () => {
    const glued = "• Led the payments team • Shipped checkout • Cut latency";

    expect(normalizeDescriptionMarkdown(glued)).toBe(
      "- Led the payments team\n- Shipped checkout\n- Cut latency",
    );
  });

  it("leaves a prose paragraph as a paragraph", () => {
    const prose =
      "Owned the payments platform end to end, from the ledger to the checkout UI.";

    expect(normalizeDescriptionMarkdown(prose)).toBe(prose);
  });

  it("does not split prose on a dash range or a middle-dot separator", () => {
    const prose = "React · Node · Postgres, 2020 – 2022, no bullets here.";

    expect(normalizeDescriptionMarkdown(prose)).toBe(prose);
  });

  it("keeps a blank line between a lead-in paragraph and its bullets", () => {
    const result = normalizeDescriptionMarkdown(
      "Payments team lead.\n\n• Rebuilt the ledger\n• Halved chargebacks",
    );

    expect(result).toBe(
      "Payments team lead.\n\n- Rebuilt the ledger\n- Halved chargebacks",
    );
  });

  it("normalizes CRLF, collapses padding and drops runs of blank lines", () => {
    const result = normalizeDescriptionMarkdown(
      "Lead\r\n\r\n\r\n\r\n•\tShipped   checkout   \r\n•  Cut latency",
    );

    expect(result).toBe("Lead\n\n- Shipped checkout\n- Cut latency");
  });

  it("is idempotent — running it twice changes nothing", () => {
    const once = normalizeDescriptionMarkdown("• A\n▪ B\n\n\nplain prose");

    expect(normalizeDescriptionMarkdown(once)).toBe(once);
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeDescriptionMarkdown("  \n\n \t ")).toBe("");
  });
});

type CapturedMessage = { role: string; content: string };

type CapturedCall = {
  model: string;
  messages: CapturedMessage[];
};

/**
 * A stand-in for the OpenAI client that answers with a fixed body and keeps
 * every request, so a test can assert on the prompt that was actually sent
 * rather than on a prompt constant it re-derives itself.
 */
function fakeClient(content: string) {
  const calls: CapturedCall[] = [];

  return {
    calls,
    client: {
      chat: {
        completions: {
          create: async (params: CapturedCall) => {
            calls.push(params);
            return {
              choices: [{ message: { content } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 },
            };
          },
        },
      },
    },
  };
}

function buildProvider(content: string) {
  const { calls, client } = fakeClient(content);
  const provider = new OpenAiResumeParsingProvider("test-key");
  (provider as unknown as { client: unknown }).client = client;

  return {
    provider,
    systemPrompt: () => {
      // Index access rather than `Array.prototype.at`: apps/api compiles to
      // es2020 and does not have it.
      const call = calls[calls.length - 1];
      if (!call) {
        throw new Error("the model was never called");
      }
      const system = call.messages.find(
        (message: CapturedMessage) => message.role === "system",
      );
      if (!system) {
        throw new Error("no system message was sent");
      }
      return system.content;
    },
  };
}

/**
 * What a well-behaved model returns for a Portuguese CV: prose in Portuguese,
 * enum values still in their English wire spelling.
 */
const PORTUGUESE_RESPONSE = JSON.stringify({
  headlineTitle: "Engenheira de Software Sênior",
  summary:
    "Desenvolvedora back-end com nove anos de experiência em sistemas distribuídos.",
  totalYearsExperience: 9,
  location: "São Paulo, Brasil",
  seniorityLevel: "senior",
  workModel: "remote",
  contractType: "full-time",
  salaryExpectationMin: null,
  salaryExpectationMax: null,
  spokenLanguages: ["Português", "Inglês"],
  noticePeriod: null,
  openToRelocation: false,
  skills: ["TypeScript", "PostgreSQL"],
  titles: ["Engenheira de Software"],
  workExperiences: [
    {
      title: "Engenheira de Software Sênior",
      companyName: "Acme",
      employmentType: "full-time",
      workModel: "remote",
      locationCity: "São Paulo",
      locationState: "SP",
      locationCountry: "Brasil",
      startDate: "2021-03-01",
      endDate: null,
      isCurrent: true,
      description: "- Liderei a migração de um monólito para serviços menores",
      mainStack: ["TypeScript", "PostgreSQL"],
    },
  ],
  profileName: "Ana Souza",
  profileDescription: "Engenheira de software focada em back-end.",
});

/**
 * Everything but the language, so each test names only the thing it is about.
 * Typed rather than `as const`: the provider takes mutable `string[]`, and a
 * frozen literal is not assignable to it.
 */
const BASE_INPUT: Omit<ResumeParsingInput, "language"> = {
  resumeText: "Sou desenvolvedora back-end há nove anos.",
  knownSkills: [],
  knownTitles: [],
};

/**
 * The bullet-preservation tests do not care which language was resolved — the
 * client is faked — but `language` is a required field on the input, so they
 * name one rather than leaning on an optional they would not get.
 */
const ENGLISH_INPUT: ResumeParsingInput = {
  resumeText: "irrelevant, the client is faked",
  knownSkills: [],
  knownTitles: [],
  language: "en-US",
};

describe("OpenAiResumeParsingProvider — response language", () => {
  beforeEach(() => {
    vi.mocked(recordOpenAiUsage).mockReset();
    vi.mocked(recordOpenAiRequest).mockReset();
  });

  it("tells the model to answer in Brazilian Portuguese when that is the resolved language", async () => {
    const { provider, systemPrompt } = buildProvider(PORTUGUESE_RESPONSE);

    await provider.parseResume({ ...BASE_INPUT, language: "pt-BR" });

    // The instruction is asserted on the prompt actually handed to the client,
    // not on the module's prompt constant — the constant being right is no use
    // if the call site forgets to append it.
    expect(systemPrompt()).toContain("Brazilian Portuguese");
    expect(systemPrompt()).toContain("pt-BR");
  });

  it.each([
    ["pt-BR", "Brazilian Portuguese"],
    ["es-ES", "European Spanish"],
    ["en-US", "English"],
  ] as const)("names %s in the prompt as %s", async (language, name) => {
    const { provider, systemPrompt } = buildProvider(PORTUGUESE_RESPONSE);

    await provider.parseResume({ ...BASE_INPUT, language });

    expect(systemPrompt()).toContain(name);
  });

  it("names the four free-text fields the language rule applies to", async () => {
    const { provider, systemPrompt } = buildProvider(PORTUGUESE_RESPONSE);

    await provider.parseResume({ ...BASE_INPUT, language: "pt-BR" });

    const prompt = systemPrompt();
    for (const field of [
      "headlineTitle",
      "summary",
      "profileDescription",
      "description",
    ]) {
      expect(prompt).toContain(field);
    }
  });

  it("tells the model, in the same breath, not to translate the wire values", async () => {
    const { provider, systemPrompt } = buildProvider(PORTUGUESE_RESPONSE);

    await provider.parseResume({ ...BASE_INPUT, language: "pt-BR" });

    const prompt = systemPrompt();

    // The language instruction and the do-not-translate carve-out have to
    // travel together. A prompt that says "answer in Portuguese" and leaves
    // the enums unqualified is the exact shape of the production bug.
    expect(prompt).toContain(
      "leave structured field names, enum values and identifiers exactly as specified",
    );
    expect(prompt).toMatch(/enum values[^]*?(not|NOT) .*translat/i);
    expect(prompt).toContain("full-time");
  });

  it("returns schema-valid enum values on a non-English run", async () => {
    const { provider } = buildProvider(PORTUGUESE_RESPONSE);

    const parsed = await provider.parseResume({
      ...BASE_INPUT,
      language: "pt-BR",
    });

    // The whole payload goes through the shared contract, the same one the
    // route serialises against.
    expect(() => parsedResumeDataSchema.parse(parsed)).not.toThrow();

    expect(parsed.contractType).toBe("full-time");
    expect(parsed.seniorityLevel).toBe("senior");
    expect(parsed.workModel).toBe("remote");
    expect(parsed.workExperiences[0]?.employmentType).toBe("full-time");

    // ...and the prose really is Portuguese, so this is not passing because
    // the fixture was quietly English.
    expect(parsed.summary).toContain("Desenvolvedora");
    expect(parsed.headlineTitle).toBe("Engenheira de Software Sênior");
  });

  it("drops a translated enum instead of emitting an invalid wire value", async () => {
    // The belt to the prompt's braces. If a model ignores the instruction and
    // returns "tempo integral", the normaliser must nullify it — a null
    // contract type is a missing field the user can fix in the review step, an
    // unrecognised string is a 500 on a route that already charged for the
    // parse.
    const { provider } = buildProvider(
      JSON.stringify({
        ...JSON.parse(PORTUGUESE_RESPONSE),
        contractType: "tempo integral",
        seniorityLevel: "sênior",
        workModel: "remoto",
      }),
    );

    const parsed = await provider.parseResume({
      ...BASE_INPUT,
      language: "pt-BR",
    });

    expect(parsed.contractType).toBeNull();
    expect(parsed.seniorityLevel).toBeNull();
    expect(parsed.workModel).toBeNull();
    expect(() => parsedResumeDataSchema.parse(parsed)).not.toThrow();
  });

  it("keeps the resume text and the catalogues in the user message", async () => {
    const { calls, client } = fakeClient(PORTUGUESE_RESPONSE);
    const provider = new OpenAiResumeParsingProvider("test-key");
    (provider as unknown as { client: unknown }).client = client;

    await provider.parseResume({
      resumeText: "Sou desenvolvedora back-end.",
      knownSkills: ["TypeScript"],
      knownTitles: ["Software Engineer"],
      language: "pt-BR",
    });

    const lastCall = calls[calls.length - 1];
    const user = lastCall?.messages.find(
      (message: CapturedMessage) => message.role === "user",
    );
    expect(user?.content).toContain("Sou desenvolvedora back-end.");
    expect(user?.content).toContain("TypeScript");
    expect(user?.content).toContain("Software Engineer");
  });

  it("bounds timeout and retries so a hung call cannot hold a request for half an hour", () => {
    const provider = new OpenAiResumeParsingProvider("test-key");
    const client = (
      provider as unknown as { client: { timeout: number; maxRetries: number } }
    ).client;

    expect(client.timeout).toBeLessThanOrEqual(60_000);
    expect(client.maxRetries).toBeLessThanOrEqual(3);
  });

  it("rejects an unparseable response instead of returning a broken profile", async () => {
    const { provider } = buildProvider("not json");

    await expect(
      provider.parseResume({ ...BASE_INPUT, language: "pt-BR" }),
    ).rejects.toThrow(/invalid resume parsing response/i);
  });
});

describe("OpenAiResumeParsingProvider — description structure", () => {
  it("preserves the bullet structure of a parsed work experience", async () => {
    const { provider } = buildProvider(
      JSON.stringify({
        workExperiences: [
          {
            title: "Staff Engineer",
            companyName: "Acme",
            isCurrent: true,
            description:
              "•  Led the payments team\r\n•  Shipped the new checkout",
            mainStack: ["TypeScript"],
          },
        ],
      }),
    );

    const parsed = await provider.parseResume(ENGLISH_INPUT);

    expect(parsed.workExperiences[0]?.description).toBe(
      "- Led the payments team\n- Shipped the new checkout",
    );
  });

  it("produces a payload that satisfies the shared parsedResumeData contract", async () => {
    const { provider } = buildProvider(
      JSON.stringify({
        headlineTitle: "Staff Engineer",
        summary: "Payments specialist.",
        totalYearsExperience: 9,
        skills: ["TypeScript"],
        titles: ["Staff Engineer"],
        workExperiences: [
          {
            title: "Staff Engineer",
            companyName: "Acme",
            employmentType: "full-time",
            workModel: "remote",
            startDate: "2020-01",
            isCurrent: true,
            description: "▪ Rebuilt the ledger\n▪ Halved chargebacks",
            mainStack: ["TypeScript", "Postgres"],
          },
        ],
        profileName: "Ada Lovelace",
      }),
    );

    const parsed = await provider.parseResume(ENGLISH_INPUT);

    // Contract assertion: this exact object is what the parse route sends to
    // the web review step, so it has to survive the shared schema.
    const contract = parsedResumeDataSchema.parse(parsed);

    expect(contract.workExperiences?.[0]?.description).toBe(
      "- Rebuilt the ledger\n- Halved chargebacks",
    );
    expect(contract.workExperiences?.[0]?.description).toContain("\n");
  });

  it("keeps a description of null as null", async () => {
    const { provider } = buildProvider(
      JSON.stringify({
        workExperiences: [
          { title: "Engineer", companyName: "Acme", description: null },
        ],
      }),
    );

    const parsed = await provider.parseResume(ENGLISH_INPUT);

    expect(parsed.workExperiences[0]?.description).toBeNull();
  });
});
