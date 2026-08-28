import { parsedResumeDataSchema } from "@repo/schemas";
import { describe, expect, it, vi } from "vitest";
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
    expect(normalizeDescriptionMarkdown("– Owned billing\n— Owned payouts")).toBe(
      "- Owned billing\n- Owned payouts",
    );
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

/** Minimal stand-in for the OpenAI chat completions client. */
function fakeCompletionClient(content: string) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      },
    },
  };
}

function withFakeClient(
  provider: OpenAiResumeParsingProvider,
  client: unknown,
): OpenAiResumeParsingProvider {
  (provider as unknown as { client: unknown }).client = client;
  return provider;
}

describe("OpenAiResumeParsingProvider", () => {
  it("preserves the bullet structure of a parsed work experience", async () => {
    const provider = withFakeClient(
      new OpenAiResumeParsingProvider("test-key"),
      fakeCompletionClient(
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
      ),
    );

    const parsed = await provider.parseResume({
      resumeText: "irrelevant, the client is faked",
      knownSkills: [],
      knownTitles: [],
    });

    expect(parsed.workExperiences[0]?.description).toBe(
      "- Led the payments team\n- Shipped the new checkout",
    );
  });

  it("produces a payload that satisfies the shared parsedResumeData contract", async () => {
    const provider = withFakeClient(
      new OpenAiResumeParsingProvider("test-key"),
      fakeCompletionClient(
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
      ),
    );

    const parsed = await provider.parseResume({
      resumeText: "irrelevant, the client is faked",
      knownSkills: [],
      knownTitles: [],
    });

    // Contract assertion: this exact object is what the parse route sends to
    // the web review step, so it has to survive the shared schema.
    const contract = parsedResumeDataSchema.parse(parsed);

    expect(contract.workExperiences?.[0]?.description).toBe(
      "- Rebuilt the ledger\n- Halved chargebacks",
    );
    expect(contract.workExperiences?.[0]?.description).toContain("\n");
  });

  it("keeps a description of null as null", async () => {
    const provider = withFakeClient(
      new OpenAiResumeParsingProvider("test-key"),
      fakeCompletionClient(
        JSON.stringify({
          workExperiences: [
            { title: "Engineer", companyName: "Acme", description: null },
          ],
        }),
      ),
    );

    const parsed = await provider.parseResume({
      resumeText: "irrelevant, the client is faked",
      knownSkills: [],
      knownTitles: [],
    });

    expect(parsed.workExperiences[0]?.description).toBeNull();
  });
});
