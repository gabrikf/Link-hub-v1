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
      typeof input.profileName === "string" && input.profileName.trim().length > 0;
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

  private async resolveOrCreateSkillId(name: string): Promise<string> {
    const normalizedName = normalizeCatalogName(name);
    const existing =
      await this.skillCatalogRepository.findByNormalizedName(normalizedName);

    if (existing) {
      return existing.id;
    }

    const created = await this.skillCatalogRepository.create({
      name: name.trim(),
      normalizedName,
      isDefault: false,
      createdByUserId: null,
    });

    return created.id;
  }

  private async resolveOrCreateTitleId(name: string): Promise<string> {
    const normalizedName = normalizeCatalogName(name);
    const existing =
      await this.titleCatalogRepository.findByNormalizedName(normalizedName);

    if (existing) {
      return existing.id;
    }

    const created = await this.titleCatalogRepository.create({
      name: name.trim(),
      normalizedName,
      isDefault: false,
      createdByUserId: null,
    });

    return created.id;
  }

  private async applySkills(
    resumeId: string,
    skillNames: string[],
  ): Promise<number> {
    let added = 0;
    let nextOrder =
      (await this.resumeSkillRepository.findLastOrderByResumeId(resumeId)) ?? -1;

    for (const name of dedupeNames(skillNames)) {
      const skillId = await this.resolveOrCreateSkillId(name);
      const alreadyLinked = await this.resumeSkillRepository.exists(
        resumeId,
        skillId,
      );

      if (alreadyLinked) {
        continue;
      }

      nextOrder += 1;
      await this.resumeSkillRepository.create({
        resumeId,
        skillId,
        yearsExperience: null,
        displayOrder: nextOrder,
      });
      added += 1;
    }

    return added;
  }

  private async applyTitles(
    resumeId: string,
    titleNames: string[],
    primaryTitle: string | null | undefined,
  ): Promise<number> {
    let added = 0;
    let nextOrder =
      (await this.resumeTitleRepository.findLastOrderByResumeId(resumeId)) ?? -1;

    const normalizedPrimary = primaryTitle
      ? normalizeCatalogName(primaryTitle)
      : null;
    let primaryAssigned = false;

    for (const name of dedupeNames(titleNames)) {
      const titleId = await this.resolveOrCreateTitleId(name);
      const alreadyLinked = await this.resumeTitleRepository.exists(
        resumeId,
        titleId,
      );

      if (alreadyLinked) {
        continue;
      }

      const isPrimary =
        !primaryAssigned && normalizedPrimary === normalizeCatalogName(name);

      if (isPrimary) {
        await this.resumeTitleRepository.clearPrimary(resumeId);
        primaryAssigned = true;
      }

      nextOrder += 1;
      await this.resumeTitleRepository.create({
        resumeId,
        titleId,
        isPrimary,
        displayOrder: nextOrder,
      });
      added += 1;
    }

    return added;
  }

  private async applyWorkExperiences(
    userId: string,
    workExperiences: IApplyAiResumeImportWorkExperience[],
  ): Promise<number> {
    if (workExperiences.length === 0) {
      return 0;
    }

    const existing =
      await this.workExperienceRepository.findByUserId(userId);
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
