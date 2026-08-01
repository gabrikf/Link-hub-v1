import { describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { IResumeEmbeddingQueue } from "../../../providers/queue/resume-embedding-queue.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemorySkillCatalogRepository } from "../../../repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { InMemoryTitleCatalogRepository } from "../../../repositories/title-catalog/in-memory-title-catalog-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { ApplyAiResumeImportUseCase } from "./apply-ai-resume-import.use-case.js";

class NoopQueue implements IResumeEmbeddingQueue {
  async enqueue(): Promise<void> {}
}

/**
 * Counts every repository call by method name.
 *
 * The point of these tests is not only that the import produces the right rows
 * — it is that it stops producing them one round trip at a time. Applying a
 * parsed resume used to issue four sequential queries per skill and per title
 * (catalog lookup, catalog insert, link-exists check, link insert), so a
 * 30-skill resume meant ~120 serial queries while the user watched a spinner.
 * Asserting on the call counts is the only way that regression stays fixed:
 * a reverted batch would still pass every behavioural assertion below.
 */
function countingProxy<T extends object>(
  target: T,
  counts: Map<string, number>,
): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);

      if (typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) => {
        counts.set(String(prop), (counts.get(String(prop)) ?? 0) + 1);
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
}

function makeSut() {
  const counts = new Map<string, number>();

  const usersRepository = new InMemoryUsersRepository();
  const resumesRepository = new InMemoryResumesRepository();
  const skillCatalogRepository = new InMemorySkillCatalogRepository();
  const titleCatalogRepository = new InMemoryTitleCatalogRepository();
  const resumeSkillRepository = new InMemoryResumeSkillRepository();
  const resumeTitleRepository = new InMemoryResumeTitleRepository();
  const workExperienceRepository = new InMemoryWorkExperienceRepository();

  const useCase = new ApplyAiResumeImportUseCase(
    usersRepository,
    resumesRepository,
    countingProxy(skillCatalogRepository, counts),
    countingProxy(titleCatalogRepository, counts),
    countingProxy(resumeSkillRepository, counts),
    countingProxy(resumeTitleRepository, counts),
    workExperienceRepository,
    new EnqueueResumeEmbeddingUseCase(new NoopQueue()),
  );

  return {
    useCase,
    counts,
    usersRepository,
    resumesRepository,
    skillCatalogRepository,
    titleCatalogRepository,
    resumeSkillRepository,
    resumeTitleRepository,
    workExperienceRepository,
  };
}

async function seedUser(usersRepository: InMemoryUsersRepository) {
  const user = UserEntity.create({
    email: "candidate@example.com",
    login: "candidate",
    name: "Candidate",
    password: "hashed",
    description: null,
    avatarUrl: null,
    googleId: null,
  });

  await usersRepository.create(user);
  return user;
}

describe("ApplyAiResumeImportUseCase", () => {
  it("does not scale its query count with the number of skills and titles", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    const skills = Array.from({ length: 30 }, (_, i) => `skill-${i}`);
    const titles = Array.from({ length: 10 }, (_, i) => `title-${i}`);

    await sut.useCase.execute({ userId: user.id, skills, titles });

    // Per-name lookups are the shape of the bug. None of these may be reached.
    expect(sut.counts.get("findByNormalizedName")).toBeUndefined();
    expect(sut.counts.get("exists")).toBeUndefined();
    expect(sut.counts.get("create")).toBeUndefined();

    // Skills: one catalog read, one catalog write, one link read, one last-order
    // read, one link write. Same for titles. Forty names, ten queries.
    expect(sut.counts.get("findManyByNormalizedNames")).toBe(2);
    expect(sut.counts.get("createMany")).toBe(4);
    expect(sut.counts.get("listByResumeId")).toBe(2);
    expect(sut.counts.get("findLastOrderByResumeId")).toBe(2);
  });

  it("creates every skill and title exactly once, in input order", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    const result = await sut.useCase.execute({
      userId: user.id,
      skills: ["React", "Node.js", "PostgreSQL"],
      titles: ["Fullstack Engineer", "Backend Engineer"],
    });

    expect(result.skillsAdded).toBe(3);
    expect(result.titlesAdded).toBe(2);

    const resume = await sut.resumesRepository.findByUserId(user.id);
    const linkedSkills = await sut.resumeSkillRepository.listByResumeId(
      resume!.id,
    );
    const catalog = await sut.skillCatalogRepository.findManyByNormalizedNames([
      "react",
      "node.js",
      "postgresql",
    ]);

    expect(catalog).toHaveLength(3);
    expect(linkedSkills.map((item) => item.displayOrder)).toEqual([0, 1, 2]);
    expect(
      linkedSkills.map(
        (item) => catalog.find((entry) => entry.id === item.skillId)?.name,
      ),
    ).toEqual(["React", "Node.js", "PostgreSQL"]);
  });

  it("reuses an existing catalog entry rather than creating a duplicate", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    await sut.skillCatalogRepository.create({
      name: "React",
      normalizedName: "react",
      isDefault: true,
      createdByUserId: null,
    });

    await sut.useCase.execute({
      userId: user.id,
      skills: ["  REACT  ", "Vue"],
    });

    const react = await sut.skillCatalogRepository.findManyByNormalizedNames([
      "react",
    ]);

    expect(react).toHaveLength(1);
    // The pre-existing catalog name wins; the import does not rewrite it.
    expect(react[0].name).toBe("React");
  });

  it("skips skills the resume already has and continues the display order", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    await sut.useCase.execute({ userId: user.id, skills: ["React", "Vue"] });
    const second = await sut.useCase.execute({
      userId: user.id,
      skills: ["React", "Svelte"],
    });

    expect(second.skillsAdded).toBe(1);

    const resume = await sut.resumesRepository.findByUserId(user.id);
    const linked = await sut.resumeSkillRepository.listByResumeId(resume!.id);

    expect(linked).toHaveLength(3);
    expect(linked.map((item) => item.displayOrder)).toEqual([0, 1, 2]);
  });

  it("marks the primary title and demotes any incumbent", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    await sut.useCase.execute({
      userId: user.id,
      titles: ["Backend Engineer"],
      primaryTitle: "Backend Engineer",
    });

    await sut.useCase.execute({
      userId: user.id,
      titles: ["Staff Engineer"],
      primaryTitle: "Staff Engineer",
    });

    const resume = await sut.resumesRepository.findByUserId(user.id);
    const linked = await sut.resumeTitleRepository.listByResumeId(resume!.id);
    const primaries = linked.filter((item) => item.isPrimary);

    expect(linked).toHaveLength(2);
    expect(primaries).toHaveLength(1);
    expect(sut.counts.get("clearPrimary")).toBe(2);
  });

  it("leaves the incumbent primary alone when no new primary is created", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    await sut.useCase.execute({
      userId: user.id,
      titles: ["Backend Engineer"],
      primaryTitle: "Backend Engineer",
    });

    const before = sut.counts.get("clearPrimary");

    // "Backend Engineer" is already linked, so nothing new is created — and
    // nothing should be demoted either.
    await sut.useCase.execute({
      userId: user.id,
      titles: ["Backend Engineer"],
      primaryTitle: "Backend Engineer",
    });

    expect(sut.counts.get("clearPrimary")).toBe(before);

    const resume = await sut.resumesRepository.findByUserId(user.id);
    const linked = await sut.resumeTitleRepository.listByResumeId(resume!.id);

    expect(linked.filter((item) => item.isPrimary)).toHaveLength(1);
  });

  it("collapses names that differ only in case or whitespace", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    const result = await sut.useCase.execute({
      userId: user.id,
      skills: ["TypeScript", "typescript", "  TYPESCRIPT  ", ""],
    });

    expect(result.skillsAdded).toBe(1);

    const resume = await sut.resumesRepository.findByUserId(user.id);
    const linked = await sut.resumeSkillRepository.listByResumeId(resume!.id);

    expect(linked).toHaveLength(1);
  });

  it("touches no skill or title repository when there is nothing to import", async () => {
    const sut = makeSut();
    const user = await seedUser(sut.usersRepository);

    const result = await sut.useCase.execute({
      userId: user.id,
      resume: { headlineTitle: "Backend Engineer" },
    });

    expect(result).toEqual({
      skillsAdded: 0,
      titlesAdded: 0,
      workExperiencesAdded: 0,
    });
    expect(sut.counts.size).toBe(0);
  });
});
