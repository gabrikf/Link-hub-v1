/**
 * E2E tests for bullet/line structure on `POST /me/resume/ai-import/parse`.
 *
 * The user-visible bug was that an imported role came back as one glued
 * paragraph. Two separate places could cause that, and this file pins the two
 * ends of the HTTP hop that the unit tests cannot see:
 *
 *   1. INBOUND — the resume text the route hands to the parsing provider still
 *      has its newlines. The provider is the only thing that can preserve the
 *      resume's bullets, and it can only do that if it is given them.
 *   2. OUTBOUND — a multi-line `description` survives Fastify's response
 *      serialization. The route declares `aiResumeImportParseResponseSchema` as
 *      its 200 schema, so a shape that trimmed or flattened the field would
 *      silently undo the fix on the wire, where no unit test would notice.
 *
 * Hermetic: `buildTestApp()` plus a recording parsing provider, so no database
 * and no OpenAI call.
 */
// Before tsyringe: the container's decorators need the polyfill in place first.
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { container } from "tsyringe";
import { aiResumeImportParseResponseSchema } from "@repo/schemas";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";
import { TOKENS } from "../../../../di/container.js";
import { InMemorySkillCatalogRepository } from "../../../../../core/repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { InMemoryTitleCatalogRepository } from "../../../../../core/repositories/title-catalog/in-memory-title-catalog-repository.js";
import { ParseResumeUseCase } from "../../../../../core/use-case/ai-import/parse-resume-use-case/parse-resume.use-case.js";
import type {
  IResumeParsingProvider,
  ParsedResume,
  ResumeParsingInput,
} from "../../../../../core/providers/resume-parsing/resume-parsing-provider.js";

const JSON_HEADERS = { "content-type": "application/json" };

const BULLETED_DESCRIPTION =
  "- Led the payments team\n- Shipped the new checkout\n- Cut p99 latency by 40%";

const RESUME_TEXT = [
  "Ada Lovelace",
  "Staff Engineer",
  "",
  "EXPERIENCE",
  "Acme — Staff Engineer (2020 - present)",
  "- Led the payments team",
  "- Shipped the new checkout",
  "",
  "Globex — Senior Engineer (2017 - 2020)",
  "- Rebuilt the ledger",
].join("\n");

function parsedWith(description: string | null): ParsedResume {
  return {
    headlineTitle: "Staff Engineer",
    summary: null,
    totalYearsExperience: null,
    location: null,
    seniorityLevel: null,
    workModel: null,
    contractType: null,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    spokenLanguages: [],
    noticePeriod: null,
    openToRelocation: null,
    skills: [],
    titles: [],
    workExperiences: [
      {
        title: "Staff Engineer",
        companyName: "Acme",
        employmentType: null,
        workModel: null,
        locationCity: null,
        locationState: null,
        locationCountry: null,
        startDate: "2020-01-01",
        endDate: null,
        isCurrent: true,
        description,
        mainStack: ["TypeScript"],
      },
    ],
    profileName: "Ada Lovelace",
    profileDescription: null,
  };
}

/** Stands in for the paid model and records the text it was handed. */
class RecordingResumeParsingProvider implements IResumeParsingProvider {
  readonly calls: ResumeParsingInput[] = [];
  result: ParsedResume = parsedWith(BULLETED_DESCRIPTION);

  async parseResume(input: ResumeParsingInput): Promise<ParsedResume> {
    this.calls.push(input);
    return this.result;
  }
}

describe("AI import E2E — bullets and line structure", () => {
  let ctx: TestAppHandles;
  let parsingProvider: RecordingResumeParsingProvider;

  beforeEach(async () => {
    ctx = await buildTestApp();
    parsingProvider = new RecordingResumeParsingProvider();
    container.registerInstance(
      TOKENS.ParseResumeUseCase,
      // The fifth argument is the preferences repository the response-language
      // rule reads: `ParseResumeUseCase` resolves the language of the summary
      // from the stored preference, the resume's own text and the inbound
      // `Accept-Language`. Reuse the app's instance rather than a fresh one so
      // this stays the same store the rest of the request sees.
      new ParseResumeUseCase(
        ctx.usersRepository,
        new InMemorySkillCatalogRepository(),
        new InMemoryTitleCatalogRepository(),
        parsingProvider,
        ctx.userPreferencesRepository,
      ),
    );
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function parse(resumeText: string) {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);

    return ctx.app.inject({
      method: "POST",
      url: "/me/resume/ai-import/parse",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ resumeText }),
    });
  }

  it("hands the model a resume that still has its line breaks", async () => {
    const response = await parse(RESUME_TEXT);

    expect(response.statusCode).toBe(200);
    expect(parsingProvider.calls).toHaveLength(1);

    const sent = parsingProvider.calls[0].resumeText;
    // The whole point: the model cannot preserve bullet structure it was never
    // shown. A single glued line here is the bug.
    expect(sent).toContain("\n");
    expect(sent.split("\n").length).toBeGreaterThan(5);
    expect(sent).toContain("\n- Led the payments team");
    expect(sent).toContain("\n\nGlobex");
  });

  it("returns a multi-line description unflattened over the wire", async () => {
    const response = await parse(RESUME_TEXT);
    const body = response.json<{
      parsed: { workExperiences: Array<{ description: string }> };
    }>();

    const description = body.parsed.workExperiences[0].description;
    expect(description).toBe(BULLETED_DESCRIPTION);
    expect(description.split("\n")).toHaveLength(3);
  });

  it("keeps a blank line inside a description through serialization", async () => {
    parsingProvider.result = parsedWith(
      "Payments team lead.\n\n- Rebuilt the ledger\n- Halved chargebacks",
    );

    const response = await parse(RESUME_TEXT);
    const body = response.json<{
      parsed: { workExperiences: Array<{ description: string }> };
    }>();

    expect(body.parsed.workExperiences[0].description).toBe(
      "Payments team lead.\n\n- Rebuilt the ledger\n- Halved chargebacks",
    );
  });

  it("matches the shared parse-response contract with a bulleted description", () => {
    // Contract assertion on the real wire payload shape, so a schema change
    // that started trimming or flattening `description` fails here.
    const parsedBody = aiResumeImportParseResponseSchema.parse({
      parsed: parsedWith(BULLETED_DESCRIPTION),
    });

    expect(parsedBody.parsed.workExperiences?.[0]?.description).toBe(
      BULLETED_DESCRIPTION,
    );
  });
});
