import { ResourceNotFoundError } from "../../../errors/index.js";
import { resolveResponseLanguage } from "../../../lang/resolve-response-language.js";
import { IResumeParsingProvider } from "../../../providers/resume-parsing/resume-parsing-provider.js";
import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";
import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";
import { IUserPreferencesRepository } from "../../../repositories/user-preferences/user-preferences-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface IParseResumeInput {
  userId: string;
  resumeText: string;
  /**
   * The raw inbound `Accept-Language` header, passed through untouched.
   *
   * Raw rather than pre-parsed because `resolveResponseLanguage` already owns
   * the parsing, and a controller that parsed it first would be a second place
   * where the header's quality values could be read differently.
   */
  acceptLanguage?: string | null;
}

export class ParseResumeUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private skillCatalogRepository: ISkillCatalogRepository,
    private titleCatalogRepository: ITitleCatalogRepository,
    private resumeParsingProvider: IResumeParsingProvider,
    private userPreferencesRepository: IUserPreferencesRepository,
  ) {}

  async execute(input: IParseResumeInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const [skills, titles, preferences] = await Promise.all([
      this.skillCatalogRepository.listForUser(input.userId),
      this.titleCatalogRepository.listForUser(input.userId),
      // `findByUserId`, not `provisionDefaults`: reading a resume must not
      // write a preferences row as a side effect. A missing row means "follow
      // the device", which is exactly what a null preference already resolves
      // to.
      this.userPreferencesRepository.findByUserId(input.userId),
    ]);

    /**
     * The resume's own language wins over the stored preference when the
     * detector is confident. Someone who pasted a Portuguese CV wants a
     * Portuguese summary back, even if their interface is in English — the
     * text in hand is direct evidence about this specific content, where the
     * preference is about the chrome. `resolveResponseLanguage` owns that
     * precedence, and never throws: the worst case is `en-US`.
     */
    const language = resolveResponseLanguage({
      userText: input.resumeText,
      preference: preferences?.language ?? null,
      acceptLanguage: input.acceptLanguage,
    });

    return this.resumeParsingProvider.parseResume({
      resumeText: input.resumeText,
      knownSkills: skills.map((skill) => skill.name),
      knownTitles: titles.map((title) => title.name),
      language,
    });
  }
}
