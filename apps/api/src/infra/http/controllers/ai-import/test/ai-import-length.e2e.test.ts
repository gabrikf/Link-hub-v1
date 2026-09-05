/**
 * E2E tests for the length gate on `POST /me/resume/ai-import/parse`.
 *
 * The route accepts both multipart and JSON, so it carries no `body:` schema and
 * checks the resolved text by hand. It has always had a MINIMUM; it had no
 * maximum, so a paste of any size under Fastify's 1 MiB body limit reached the
 * paid model — and above the model's context window that surfaced as a 500
 * ("something went wrong") instead of "your resume is too long".
 *
 * `aiResumeImportTextInputSchema` in `@repo/schemas` declares the cap, so these
 * tests pin the shared schema and the HTTP behaviour to the same number.
 *
 * Hermetic: `buildTestApp()` plus a recording parsing provider, so no database
 * and no OpenAI call. The provider's call log is the real assertion — a request
 * that is rejected for length must never reach the model.
 */
// Before tsyringe: the container's decorators need the polyfill in place first.
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { container } from "tsyringe";
import { aiResumeImportTextInputSchema } from "@repo/schemas";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";
import { TOKENS } from "../../../../di/container.js";
import { InMemorySkillCatalogRepository } from "../../../../../core/repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { InMemoryTitleCatalogRepository } from "../../../../../core/repositories/title-catalog/in-memory-title-catalog-repository.js";
import { InMemoryUserPreferencesRepository } from "../../../../../core/repositories/user-preferences/in-memory-user-preferences-repository.js";
import { ParseResumeUseCase } from "../../../../../core/use-case/ai-import/parse-resume-use-case/parse-resume.use-case.js";
import type {
  IResumeParsingProvider,
  ParsedResume,
  ResumeParsingInput,
} from "../../../../../core/providers/resume-parsing/resume-parsing-provider.js";

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * The cap declared by `aiResumeImportTextInputSchema`, pinned here from the
 * outside. The contract test below asserts the schema still agrees, so this
 * number cannot drift away from the shared contract unnoticed.
 */
const CAP = 100_000;

const EMPTY_PARSE: ParsedResume = {
  headlineTitle: null,
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
  workExperiences: [],
  profileName: null,
  profileDescription: null,
};

/** Stands in for the paid model and records every call it receives. */
class RecordingResumeParsingProvider implements IResumeParsingProvider {
  readonly calls: ResumeParsingInput[] = [];

  async parseResume(input: ResumeParsingInput): Promise<ParsedResume> {
    this.calls.push(input);
    return EMPTY_PARSE;
  }
}

describe("AI import E2E — resume text length", () => {
  let ctx: TestAppHandles;
  let parsingProvider: RecordingResumeParsingProvider;

  beforeEach(async () => {
    ctx = await buildTestApp();
    parsingProvider = new RecordingResumeParsingProvider();
    container.registerInstance(
      TOKENS.ParseResumeUseCase,
      new ParseResumeUseCase(
        ctx.usersRepository,
        new InMemorySkillCatalogRepository(),
        new InMemoryTitleCatalogRepository(),
        parsingProvider,
        new InMemoryUserPreferencesRepository(),
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

  it("refuses a paste one character over the cap, before the model is called", async () => {
    const response = await parse("a".repeat(CAP + 1));

    expect(response.statusCode).toBe(400);
    // The message has to name the limit: "something went wrong" gives the
    // developer no way to know what to do about it.
    expect(response.json<{ message: string }>().message).toContain(
      CAP.toLocaleString("en-US"),
    );
    // The whole point of the gate. Reaching the provider is both the bill and
    // the 500 the user actually sees.
    expect(parsingProvider.calls).toHaveLength(0);
  });

  it("accepts a paste of exactly the cap", async () => {
    const response = await parse("a".repeat(CAP));

    // Pins the boundary so the fix cannot be off by one.
    expect(response.statusCode).toBe(200);
    expect(parsingProvider.calls).toHaveLength(1);
    expect(parsingProvider.calls[0]?.resumeText).toHaveLength(CAP);
  });

  it("still refuses a paste under the minimum, with its own message", async () => {
    const response = await parse("too short");

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain(
      "enough content to parse",
    );
    expect(parsingProvider.calls).toHaveLength(0);
  });

  it("matches the cap declared by the shared schema", () => {
    // The contract, not the handler: this is what makes the number in
    // `@repo/schemas` the single source of truth for the tests above.
    expect(
      aiResumeImportTextInputSchema.safeParse({ resumeText: "a".repeat(CAP) })
        .success,
    ).toBe(true);
    expect(
      aiResumeImportTextInputSchema.safeParse({
        resumeText: "a".repeat(CAP + 1),
      }).success,
    ).toBe(false);
  });
});
