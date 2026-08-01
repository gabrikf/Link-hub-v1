import { ResourceNotFoundError } from "../../../errors/index.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";
import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";
import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";

export interface IApplyAiResumeImportWorkExperience {
  title: string;
  companyName: string;
  employmentType?: string | null;
  workModel?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  locationCountry?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
  mainStack?: string[];
}

export interface IApplyAiResumeImportInput {
  userId: string;
  resume?: {
    headlineTitle?: string | null;
    summary?: string | null;
    totalYearsExperience?: number | null;
    location?: string | null;
    seniorityLevel?: string | null;
    workModel?: string | null;
    contractType?: string | null;
    salaryExpectationMin?: number | null;
    salaryExpectationMax?: number | null;
    spokenLanguages?: string[];
    noticePeriod?: string | null;
    openToRelocation?: boolean;
  };
  skills?: string[];
  titles?: string[];
  primaryTitle?: string | null;
  workExperiences?: IApplyAiResumeImportWorkExperience[];
  profileName?: string;
  profileDescription?: string | null;
}

export interface ApplyAiResumeImportResult {
  skillsAdded: number;
  titlesAdded: number;
  workExperiencesAdded: number;
}

function normalizeCatalogName(value: string) {
  return value.trim().toLowerCase();
}

export class ApplyAiResumeImportUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private resumesRepository: IResumesRepository,
    private skillCatalogRepository: ISkillCatalogRepository,
    private titleCatalogRepository: ITitleCatalogRepository,
    private resumeSkillRepository: IResumeSkillRepository,
    private resumeTitleRepository: IResumeTitleRepository,
    private workExperienceRepository: IWorkExperienceRepository,
    private enqueueResumeEmbeddingUseCase: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(
    input: IApplyAiResumeImportInput,
  ): Promise<ApplyAiResumeImportResult> {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    await this.applyProfile(input);

    const needsResume =
      input.resume !== undefined ||
      Boolean(input.skills?.length) ||
      Boolean(input.titles?.length);

    let resumeId: string | null = null;

    if (needsResume) {
      const resume = await this.resumesRepository.upsertByUserId(
        input.userId,
        input.resume ?? {},
      );
      resumeId = resume.id;
    }

    const skillsAdded = resumeId
      ? await this.applySkills(resumeId, input.skills ?? [])
      : 0;

    const titlesAdded = resumeId
      ? await this.applyTitles(resumeId, input.titles ?? [], input.primaryTitle)
      : 0;

    const workExperiencesAdded = await this.applyWorkExperiences(
      input.userId,
      input.workExperiences ?? [],
    );

    if (resumeId) {
      try {
        await this.enqueueResumeEmbeddingUseCase.execute({
          resumeId,
          userId: input.userId,
          reason: "ai-resume-import",
        });
      } catch (error) {
        console.error("Failed to enqueue resume embedding job", error);
      }
    }

    return { skillsAdded, titlesAdded, workExperiencesAdded };
  }

  private async applyProfile(input: IApplyAiResumeImportInput) {
    const hasName =
      typeof input.profileName === "string" &&
      input.profileName.trim().length > 0;
    const hasDescription = input.profileDescription !== undefined;

    if (!hasName && !hasDescription) {
      return;
    }

    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      return;
    }

    if (hasName) {
      user.name = input.profileName!.trim();
    }

    if (hasDescription) {
      user.updateDescription(input.profileDescription ?? null);
    }

    user.updateTimestamp();
    await this.usersRepository.update(user);
  }

  /**
   * Maps every requested name to a catalog id, creating the ones that are new.
   *
   * Deliberately batched. This used to be `findByNormalizedName` +
   * (conditionally) `create` per name, then an `exists` and a `create` per
   * link — four sequential round trips each. A resume with 30 skills and 10
   * titles meant ~160 serial queries while a user watched a spinner. Now it is
   * a fixed handful regardless of resume size.
   */
  private async resolveCatalogIds(
    repository: ISkillCatalogRepository | ITitleCatalogRepository,
    names: string[],
  ): Promise<Map<string, string>> {
    const normalizedNames = names.map(normalizeCatalogName);

    const existing =
      await repository.findManyByNormalizedNames(normalizedNames);
    const idByNormalizedName = new Map(
      existing.map((item) => [item.normalizedName, item.id]),
    );

    const missing = names.filter(
      (name) => !idByNormalizedName.has(normalizeCatalogName(name)),
    );

    if (missing.length > 0) {
      const created = await repository.createMany(
        missing.map((name) => ({
          name: name.trim(),
          normalizedName: normalizeCatalogName(name),
          isDefault: false,
          createdByUserId: null,
        })),
      );

      for (const item of created) {
        idByNormalizedName.set(item.normalizedName, item.id);
      }
    }

    return idByNormalizedName;
  }

  private async applySkills(
    resumeId: string,
    skillNames: string[],
  ): Promise<number> {
    const names = dedupeNames(skillNames);

    if (names.length === 0) {
      return 0;
    }

    const [idByNormalizedName, alreadyLinked, lastOrder] = await Promise.all([
      this.resolveCatalogIds(this.skillCatalogRepository, names),
      this.resumeSkillRepository
        .listByResumeId(resumeId)
        .then((items) => new Set(items.map((item) => item.skillId))),
      this.resumeSkillRepository.findLastOrderByResumeId(resumeId),
    ]);

    let nextOrder = lastOrder ?? -1;
    const toCreate: Array<{
      resumeId: string;
      skillId: string;
      yearsExperience: number | null;
      displayOrder: number;
    }> = [];

    for (const name of names) {
      const skillId = idByNormalizedName.get(normalizeCatalogName(name));

      if (!skillId || alreadyLinked.has(skillId)) {
        continue;
      }

      // Two input names can normalise to the same catalog row; the set keeps
      // the second one from claiming a display order it will never use.
      alreadyLinked.add(skillId);

      nextOrder += 1;
      toCreate.push({
        resumeId,
        skillId,
        yearsExperience: null,
        displayOrder: nextOrder,
      });
    }

    await this.resumeSkillRepository.createMany(toCreate);

    return toCreate.length;
  }

  private async applyTitles(
    resumeId: string,
    titleNames: string[],
    primaryTitle: string | null | undefined,
  ): Promise<number> {
    const names = dedupeNames(titleNames);

    if (names.length === 0) {
      return 0;
    }

    const [idByNormalizedName, alreadyLinked, lastOrder] = await Promise.all([
      this.resolveCatalogIds(this.titleCatalogRepository, names),
      this.resumeTitleRepository
        .listByResumeId(resumeId)
        .then((items) => new Set(items.map((item) => item.titleId))),
      this.resumeTitleRepository.findLastOrderByResumeId(resumeId),
    ]);

    const normalizedPrimary = primaryTitle
      ? normalizeCatalogName(primaryTitle)
      : null;
    let primaryAssigned = false;
    let nextOrder = lastOrder ?? -1;

    const toCreate: Array<{
      resumeId: string;
      titleId: string;
      isPrimary: boolean;
      displayOrder: number;
    }> = [];

    for (const name of names) {
      const titleId = idByNormalizedName.get(normalizeCatalogName(name));

      if (!titleId || alreadyLinked.has(titleId)) {
        continue;
      }

      alreadyLinked.add(titleId);

      const isPrimary =
        !primaryAssigned && normalizedPrimary === normalizeCatalogName(name);

      if (isPrimary) {
        primaryAssigned = true;
      }

      nextOrder += 1;
      toCreate.push({ resumeId, titleId, isPrimary, displayOrder: nextOrder });
    }

    if (toCreate.length === 0) {
      return 0;
    }

    // Demote the incumbent before the batch lands, exactly as the per-row path
    // did — otherwise the resume would briefly carry two primary titles.
    if (primaryAssigned) {
      await this.resumeTitleRepository.clearPrimary(resumeId);
    }

    await this.resumeTitleRepository.createMany(toCreate);

    return toCreate.length;
  }

  private async applyWorkExperiences(
    userId: string,
    workExperiences: IApplyAiResumeImportWorkExperience[],
  ): Promise<number> {
    if (workExperiences.length === 0) {
      return 0;
    }

    const existing = await this.workExperienceRepository.findByUserId(userId);
    const existingKeys = new Set(
      existing.map((item) => workExperienceKey(item.title, item.companyName)),
    );

    let nextOrder =
      (await this.workExperienceRepository.findLastOrderByUserId(userId)) ?? -1;
    let added = 0;

    for (const entry of workExperiences) {
      const key = workExperienceKey(entry.title, entry.companyName);
      if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);

      const isCurrent = entry.isCurrent ?? false;
      nextOrder += 1;

      const workExperience = WorkExperienceEntity.create({
        userId,
        title: entry.title,
        companyName: entry.companyName,
        employmentType: entry.employmentType ?? null,
        workModel: entry.workModel ?? null,
        locationCity: entry.locationCity ?? null,
        locationState: entry.locationState ?? null,
        locationCountry: entry.locationCountry ?? null,
        startDate: entry.startDate ?? null,
        endDate: isCurrent ? null : (entry.endDate ?? null),
        isCurrent,
        description: entry.description ?? null,
        mainStack: entry.mainStack ?? [],
        displayOrder: nextOrder,
      });

      await this.workExperienceRepository.create(workExperience);
      added += 1;
    }

    return added;
  }
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function workExperienceKey(title: string, companyName: string): string {
  return `${title.trim().toLowerCase()}@@${companyName.trim().toLowerCase()}`;
}
