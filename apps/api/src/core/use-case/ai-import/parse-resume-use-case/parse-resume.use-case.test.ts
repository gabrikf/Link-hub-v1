/**
 * The precedence matrix, exercised through the use case rather than through
 * `resolveResponseLanguage` directly.
 *
 * The resolver already has 65 tests of its own. What has never been covered is
 * the wiring around it: which text is handed to the detector, whether the
 * stored preference is actually read, and whether the answer survives the trip
 * to the provider. Every bug this feature can realistically have lives in that
 * wiring — `userId` was being dropped at exactly this boundary before this
 * change — so the assertions below are on the input the provider was handed,
 * not on the resolver's return value.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import type {
  IResumeParsingProvider,
  ParsedResume,
  ResumeParsingInput,
} from "../../../providers/resume-parsing/resume-parsing-provider.js";
import { InMemorySkillCatalogRepository } from "../../../repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { InMemoryTitleCatalogRepository } from "../../../repositories/title-catalog/in-memory-title-catalog-repository.js";
import { InMemoryUserPreferencesRepository } from "../../../repositories/user-preferences/in-memory-user-preferences-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { ParseResumeUseCase } from "./parse-resume.use-case.js";

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

/** Stands in for the paid model and records exactly what it was asked. */
class RecordingResumeParsingProvider implements IResumeParsingProvider {
  readonly calls: ResumeParsingInput[] = [];

  async parseResume(input: ResumeParsingInput): Promise<ParsedResume> {
    this.calls.push(input);
    return EMPTY_PARSE;
  }

  get lastCall(): ResumeParsingInput {
    // Index access rather than `Array.prototype.at`: apps/api compiles to
    // es2020 and does not have it.
    const call = this.calls[this.calls.length - 1];
    if (!call) {
      throw new Error("the provider was never called");
    }
    return call;
  }
}

/**
 * Realistic prose in each locale. Word salad would let a detector tuned on
 * single words look perfect and then meet a real CV.
 */
const PORTUGUESE_RESUME = `
Sou desenvolvedora back-end há nove anos e trabalho principalmente com sistemas
distribuídos. Na última empresa fui responsável pela migração de um monólito
para serviços menores, o que reduziu o tempo de deploy pela metade. Também
liderei um time de cinco pessoas e ajudei a definir o processo de revisão de
código que a equipe usa até hoje.
`;

const ENGLISH_RESUME = `
I am a senior backend engineer with nine years of experience building payment
systems at scale. In my last role I was responsible for migrating a monolith
into a set of smaller services, which halved our deploy time. I also led a team
of five engineers and helped define the code review process the team still
uses today.
`;

/**
 * A links block: the one input that can manufacture a fluent-looking
 * Portuguese score out of no prose at all, because every `.com` tokenises to
 * the Portuguese preposition `com`. `detectLanguage` abstains on it, which is
 * what makes it the right fixture for "detection had nothing to say".
 */
const UNDETECTABLE_RESUME = `
https://github.com/gabrielk
https://linkedin.com/in/gabrielk
https://stackoverflow.com/users/1234567
https://medium.com/@gabrielk
https://twitter.com/gabrielk
https://gitlab.com/gabrielk
https://dev.to/gabrielk
https://gabrielk.dev
`;

describe("ParseResumeUseCase — response language", () => {
  let usersRepository: InMemoryUsersRepository;
  let preferencesRepository: InMemoryUserPreferencesRepository;
  let provider: RecordingResumeParsingProvider;
  let sut: ParseResumeUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    preferencesRepository = new InMemoryUserPreferencesRepository();
    provider = new RecordingResumeParsingProvider();

    user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);

    sut = new ParseResumeUseCase(
      usersRepository,
      new InMemorySkillCatalogRepository(),
      new InMemoryTitleCatalogRepository(),
      provider,
      preferencesRepository,
    );
  });

  async function storePreference(language: "pt-BR" | "en-US" | "es-ES") {
    const preferences = await preferencesRepository.provisionDefaults(user.id);
    preferences.applyUpdate({ language });
    await preferencesRepository.save(preferences);
  }

  it("follows the resume's own language when detection is confident", async () => {
    await sut.execute({ userId: user.id, resumeText: PORTUGUESE_RESUME });

    expect(provider.lastCall.language).toBe("pt-BR");
  });

  it("lets the resume's language beat a conflicting stored preference", async () => {
    // The user's interface is English; the document in hand is Portuguese.
    // The document wins — it is direct evidence about this specific content,
    // where the preference is about the chrome. This is the rule the user
    // stated: "if user sent a text in x language the response should be in the
    // same x language".
    await storePreference("en-US");

    await sut.execute({ userId: user.id, resumeText: PORTUGUESE_RESUME });

    expect(provider.lastCall.language).toBe("pt-BR");
  });

  it("falls back to the stored preference when the resume is undetectable", async () => {
    await storePreference("pt-BR");

    await sut.execute({ userId: user.id, resumeText: UNDETECTABLE_RESUME });

    expect(provider.lastCall.language).toBe("pt-BR");
  });

  it("falls back to Accept-Language when there is no preference either", async () => {
    // No stored row at all — an untouched account, which means "follow the
    // device", and the device said es-ES.
    await sut.execute({
      userId: user.id,
      resumeText: UNDETECTABLE_RESUME,
      acceptLanguage: "es-ES,es;q=0.9",
    });

    expect(provider.lastCall.language).toBe("es-ES");
  });

  it("ignores Accept-Language when a preference exists", async () => {
    await storePreference("pt-BR");

    await sut.execute({
      userId: user.id,
      resumeText: UNDETECTABLE_RESUME,
      acceptLanguage: "es-ES,es;q=0.9",
    });

    expect(provider.lastCall.language).toBe("pt-BR");
  });

  it("falls back to en-US when nothing has an opinion", async () => {
    await sut.execute({ userId: user.id, resumeText: UNDETECTABLE_RESUME });

    expect(provider.lastCall.language).toBe("en-US");
  });

  it.each([
    ["garbage", "!!!;;;q=;;;"],
    ["a locale we do not ship", "de-DE,fr-FR;q=0.8"],
    ["a wildcard", "*"],
    ["an empty header", ""],
  ])(
    "never throws into the request on %s — it lands on en-US",
    async (_label, header) => {
      await expect(
        sut.execute({
          userId: user.id,
          resumeText: UNDETECTABLE_RESUME,
          acceptLanguage: header,
        }),
      ).resolves.toBeDefined();

      expect(provider.lastCall.language).toBe("en-US");
    },
  );

  it("reads the preference of the caller, not of some other account", async () => {
    // The obvious way to get this wrong is to look the preference up by
    // something other than the id that was plumbed in — the whole point of
    // this change is that `userId` reaches this far.
    const other = UserEntity.create({
      email: "other@example.com",
      login: "other",
      name: "Other",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(other);

    const otherPreferences = await preferencesRepository.provisionDefaults(
      other.id,
    );
    otherPreferences.applyUpdate({ language: "es-ES" });
    await preferencesRepository.save(otherPreferences);

    await storePreference("pt-BR");

    await sut.execute({ userId: user.id, resumeText: UNDETECTABLE_RESUME });

    expect(provider.lastCall.language).toBe("pt-BR");
  });

  it("does not write a preferences row as a side effect of parsing", async () => {
    // Reading a resume is a read. A `provisionDefaults` here would create rows
    // for every user who ever imported a CV, which is how "follow the device"
    // quietly becomes "frozen to whatever the default was".
    await sut.execute({ userId: user.id, resumeText: ENGLISH_RESUME });

    expect(preferencesRepository.count()).toBe(0);
  });

  it("still passes the catalogues and the resume text through", async () => {
    // Guards against the language work quietly changing what the provider is
    // asked for.
    await sut.execute({ userId: user.id, resumeText: ENGLISH_RESUME });

    expect(provider.lastCall.resumeText).toBe(ENGLISH_RESUME);
    expect(provider.lastCall.knownSkills).toEqual([]);
    expect(provider.lastCall.knownTitles).toEqual([]);
  });

  it("rejects an unknown user before spending a model call", async () => {
    await expect(
      sut.execute({ userId: "nope", resumeText: ENGLISH_RESUME }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);

    expect(provider.calls).toHaveLength(0);
  });
});
