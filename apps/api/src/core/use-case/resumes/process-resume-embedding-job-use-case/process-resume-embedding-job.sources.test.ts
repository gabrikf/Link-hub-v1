import { beforeEach, describe, expect, it } from "vitest";
import { PostEntity } from "../../../entity/post/post-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryResumeEmbeddingsRepository } from "../../../repositories/resume-embedding/in-memory-resume-embedding-repository.js";
import { InMemoryResumeSectionEmbeddingsRepository } from "../../../repositories/resume-section-embedding/in-memory-resume-section-embedding-repository.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { ProcessResumeEmbeddingJobUseCase } from "./process-resume-embedding-job.use-case.js";
import { expectDefined } from "../../../../test-support/expect-defined.js";

class CountingEmbeddingProvider implements IEmbeddingProvider {
  public readonly texts: string[] = [];

  async createEmbedding(text: string): Promise<number[]> {
    this.texts.push(text);
    return [0.1, 0.2, 0.3];
  }

  reset(): void {
    this.texts.length = 0;
  }
}

describe("ProcessResumeEmbeddingJobUseCase — per-source vectors", () => {
  let resumesRepository: InMemoryResumesRepository;
  let resumeSkillRepository: InMemoryResumeSkillRepository;
  let resumeTitleRepository: InMemoryResumeTitleRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumeEmbeddingsRepository: InMemoryResumeEmbeddingsRepository;
  let sectionRepository: InMemoryResumeSectionEmbeddingsRepository;
  let postRepository: InMemoryPostsRepository;
  let embeddingProvider: CountingEmbeddingProvider;
  let sut: ProcessResumeEmbeddingJobUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    resumeSkillRepository = new InMemoryResumeSkillRepository();
    resumeTitleRepository = new InMemoryResumeTitleRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumeEmbeddingsRepository = new InMemoryResumeEmbeddingsRepository();
    sectionRepository = new InMemoryResumeSectionEmbeddingsRepository();
    postRepository = new InMemoryPostsRepository();
    embeddingProvider = new CountingEmbeddingProvider();

    sut = new ProcessResumeEmbeddingJobUseCase(
      resumesRepository,
      resumeSkillRepository,
      resumeTitleRepository,
      workExperienceRepository,
      resumeEmbeddingsRepository,
      embeddingProvider,
      postRepository,
      sectionRepository,
    );
  });

  async function seedFullCandidate() {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
      summary: "Node and TypeScript",
    });

    resumeSkillRepository.seed(
      ResumeSkillEntity.create({
        resumeId: resume.id,
        skillId: "skill-1",
        skillName: "TypeScript",
        yearsExperience: 5,
        displayOrder: 0,
      }),
    );

    workExperienceRepository.seed(
      WorkExperienceEntity.create({
        userId: "user-1",
        title: "Staff Engineer",
        companyName: "Globex",
        employmentType: null,
        workModel: null,
        locationCity: null,
        locationState: null,
        locationCountry: null,
        startDate: null,
        endDate: null,
        isCurrent: true,
        description: "Led the payments platform",
        mainStack: ["Go"],
        displayOrder: 0,
      }),
    );

    await postRepository.create(
      PostEntity.create({
        userId: "user-1",
        source: "commit",
        title: "Migrated payments to event sourcing",
        body: "A write-up of the migration.",
        coverImageUrl: null,
        images: null,
        tags: ["payments"],
        status: "published",
        externalUrl: null,
        metadata: null,
        publishedAt: new Date("2026-02-01"),
      }),
    );

    return resume;
  }

  const run = (resumeId: string) =>
    sut.execute({
      resumeId,
      userId: "user-1",
      reason: "resume-upsert",
      triggeredAt: new Date().toISOString(),
    });

  it("writes one vector per source alongside the blended one", async () => {
    const resume = await seedFullCandidate();
    await run(resume.id);

    const sections = await sectionRepository.findByUserId("user-1");

    expect(
      sections.map((item) => item.source).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["posts", "profile", "work"]);
    expect(
      await resumeEmbeddingsRepository.findByResumeId(resume.id),
    ).not.toBeNull();
    // Blended + three sources.
    expect(embeddingProvider.texts).toHaveLength(4);
  });

  it("skips a source the candidate has no content for", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
      summary: "Node and TypeScript",
    });

    await run(resume.id);

    const sections = await sectionRepository.findByUserId("user-1");

    // A profile always exists; work and posts do not, and embedding an empty
    // document would give every content-less candidate the same vector.
    expect(sections.map((item) => item.source)).toEqual(["profile"]);
    expect(embeddingProvider.texts).toHaveLength(2);
  });

  it("hashes each source separately, so an untouched source costs nothing", async () => {
    const resume = await seedFullCandidate();
    await run(resume.id);
    embeddingProvider.reset();

    // Only the work history changes.
    workExperienceRepository.seed(
      WorkExperienceEntity.create({
        userId: "user-1",
        title: "Principal Engineer",
        companyName: "Initech",
        employmentType: null,
        workModel: null,
        locationCity: null,
        locationState: null,
        locationCountry: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        description: null,
        mainStack: [],
        displayOrder: 1,
      }),
    );

    await run(resume.id);

    // The blended document changed too (it contains the work chunks), so two
    // calls: blended + work. `profile` and `posts` are untouched and free.
    expect(embeddingProvider.texts).toHaveLength(2);
    expect(embeddingProvider.texts[1]).toContain(
      "experience: Principal Engineer at Initech",
    );
    expect(embeddingProvider.texts[1]).not.toContain("skill: TypeScript");
  });

  it("does nothing at all when nothing changed", async () => {
    const resume = await seedFullCandidate();
    await run(resume.id);
    embeddingProvider.reset();

    await run(resume.id);

    expect(embeddingProvider.texts).toHaveLength(0);
  });

  it("drops a source's vector when its content goes away", async () => {
    const resume = await seedFullCandidate();
    await run(resume.id);

    const [firstPost] = await postRepository.listPublishedByUserId("user-1", {
      limit: 10,
      offset: 0,
    });
    const post = expectDefined(firstPost, "the published post");
    await postRepository.delete(post.id);

    await run(resume.id);

    const sections = await sectionRepository.findByUserId("user-1");

    // A stale `posts` vector would keep answering posts-scoped searches for
    // work the candidate has removed.
    expect(
      sections.map((item) => item.source).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["profile", "work"]);
  });

  it("only embeds published posts", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
      summary: null,
    });

    await postRepository.create(
      PostEntity.create({
        userId: "user-1",
        source: "manual",
        title: "Unreleased",
        body: "draft",
        coverImageUrl: null,
        images: null,
        tags: null,
        status: "draft",
        externalUrl: null,
        metadata: null,
        publishedAt: null,
      }),
    );

    await run(resume.id);

    const sections = await sectionRepository.findByUserId("user-1");
    expect(sections.map((item) => item.source)).toEqual(["profile"]);
  });

  it("still maintains the blended vector when per-source wiring is absent", async () => {
    // Backwards compatibility: a wiring that predates per-source search must
    // keep producing the blended vector the unscoped search relies on.
    const legacy = new ProcessResumeEmbeddingJobUseCase(
      resumesRepository,
      resumeSkillRepository,
      resumeTitleRepository,
      workExperienceRepository,
      resumeEmbeddingsRepository,
      embeddingProvider,
    );

    const resume = await seedFullCandidate();
    await legacy.execute({
      resumeId: resume.id,
      userId: "user-1",
      reason: "resume-upsert",
      triggeredAt: new Date().toISOString(),
    });

    expect(
      await resumeEmbeddingsRepository.findByResumeId(resume.id),
    ).not.toBeNull();
    expect(await sectionRepository.findByUserId("user-1")).toEqual([]);
  });
});
