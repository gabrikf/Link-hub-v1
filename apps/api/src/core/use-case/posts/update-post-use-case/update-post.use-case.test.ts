import { beforeEach, describe, expect, it } from "vitest";
import type {
  PostSource,
  PostStatus,
} from "../../../entity/post/post-entity.js";
import { makePost } from "../../../entity/post/post-test-factory.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import {
  IUpdatePostInput,
  UpdatePostUseCase,
} from "./update-post.use-case.js";

describe("UpdatePostUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: UpdatePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new UpdatePostUseCase(postsRepository);
  });

  async function seedPost(
    overrides: Partial<{
      userId: string;
      body: string;
      status: "draft" | "published";
      publishedAt: Date | null;
    }> = {},
  ) {
    const post = makePost({
      userId: overrides.userId ?? "owner",
      body: overrides.body ?? "original body",
      status: overrides.status ?? "draft",
      publishedAt: overrides.publishedAt ?? null,
    });
    await postsRepository.create(post);
    return post;
  }

  it("applies a partial update, leaving untouched fields intact", async () => {
    const post = await seedPost({ body: "original", status: "draft" });

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      title: "New Title",
    });

    expect(result.title).toBe("New Title");
    // Body was not part of the patch, so it is preserved.
    expect(result.body).toBe("original");
    expect(result.status).toBe("draft");
  });

  it("stamps publishedAt when transitioning draft -> published", async () => {
    const post = await seedPost({ status: "draft", publishedAt: null });
    expect(post.publishedAt).toBeNull();

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
    });

    expect(result.status).toBe("published");
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it("does NOT re-stamp publishedAt on a subsequent update once published", async () => {
    const post = await seedPost({ status: "draft", publishedAt: null });

    const firstPublish = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
    });
    const originalPublishedAt = firstPublish.publishedAt;
    expect(originalPublishedAt).toBeInstanceOf(Date);

    const secondUpdate = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
      body: "edited after publishing",
    });

    expect(secondUpdate.body).toBe("edited after publishing");
    expect(secondUpdate.publishedAt).toEqual(originalPublishedAt);
  });

  it("throws ForbiddenError when a non-owner updates the post", async () => {
    const post = await seedPost({ userId: "owner" });

    await expect(
      sut.execute({ userId: "intruder", postId: post.id, body: "hijacked" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws ResourceNotFoundError when the post is missing", async () => {
    await expect(
      sut.execute({ userId: "owner", postId: "missing", body: "x" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe("UpdatePostUseCase — machine-authored content is immutable", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: UpdatePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new UpdatePostUseCase(postsRepository);
  });

  async function seedMachinePost(
    overrides: { source?: PostSource; status?: PostStatus } = {},
  ) {
    const post = makePost({
      userId: "owner",
      body: "written by software",
      source: overrides.source ?? "commit",
      status: overrides.status ?? "pending_review",
      publishedAt: null,
    });
    await postsRepository.create(post);
    return post;
  }

  it.each(["mcp", "agent", "commit"] as const)(
    "rejects a body edit on a %s-authored post",
    async (source) => {
      const post = await seedMachinePost({ source });

      await expect(
        sut.execute({
          userId: "owner",
          postId: post.id,
          body: "polished by the candidate",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const stored = await postsRepository.findById(post.id);
      expect(stored!.body).toBe("written by software");
    },
  );

  it("rejects a title edit on a machine-authored post", async () => {
    const post = await seedMachinePost();

    await expect(
      sut.execute({ userId: "owner", postId: post.id, title: "Nicer headline" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects laundering the source to 'manual' to unlock editing", async () => {
    const post = await seedMachinePost();

    // `source` is no longer part of `IUpdatePostInput` — provenance is
    // write-once — so this request can only be built by casting, exactly as a
    // client putting an unexpected field on the wire would. It is still
    // rejected rather than ignored: `source` remains on
    // MACHINE_AUTHORED_IMMUTABLE_FIELDS, which is the second line of defence
    // guarding this helper's arbitrary patch bag.
    const forged: IUpdatePostInput & { source: PostSource } = {
      userId: "owner",
      postId: post.id,
      source: "manual",
    };

    await expect(sut.execute(forged)).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.source).toBe("commit");
  });

  it("rejects the edit for a PAT caller too, not just the web session", async () => {
    const post = await seedMachinePost();

    await expect(
      sut.execute({
        userId: "owner",
        postId: post.id,
        authType: "pat",
        tags: ["rewritten"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a status change bundled with a content change", async () => {
    const post = await seedMachinePost();

    await expect(
      sut.execute({
        userId: "owner",
        postId: post.id,
        status: "published",
        body: "sneaky edit on the way out",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.status).toBe("pending_review");
  });

  it("lets the OWNER attach an externalUrl afterwards, leaving the text frozen", async () => {
    // The link points AT the work (the PR, the release) rather than being part
    // of what the software said, and the public URL often only exists after
    // the digest was generated — so it is the one content field the owner may
    // add in a real session.
    const post = await seedMachinePost();

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      authType: "jwt",
      externalUrl: "https://github.com/acme/api/pull/42",
    });

    expect(result.externalUrl).toBe("https://github.com/acme/api/pull/42");
    expect(result.body).toBe("written by software");
  });

  it("rejects an externalUrl from a PAT caller — only the human decides where a machine post links", async () => {
    // An agent that can attach a link to a frozen post can retarget what the
    // immutable text appears to vouch for.
    const post = await seedMachinePost();

    await expect(
      sut.execute({
        userId: "owner",
        postId: post.id,
        authType: "pat",
        externalUrl: "https://github.com/attacker/repo",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.externalUrl).toBeNull();
  });

  it("still rejects an externalUrl bundled with a content edit", async () => {
    const post = await seedMachinePost();

    await expect(
      sut.execute({
        userId: "owner",
        postId: post.id,
        authType: "jwt",
        externalUrl: "https://github.com/acme/api/pull/42",
        body: "polished on the way in",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.body).toBe("written by software");
    expect(stored!.externalUrl).toBeNull();
  });

  it("accepts a status-only approval of a machine-authored post", async () => {
    const post = await seedMachinePost();

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
    });

    expect(result.status).toBe("published");
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.body).toBe("written by software");
  });

  it("leaves a post the user wrote themselves fully editable", async () => {
    const post = makePost({
      userId: "owner",
      body: "my own words",
      source: "manual",
      status: "draft",
    });
    await postsRepository.create(post);

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      title: "My headline",
      body: "my own edited words",
      tags: ["typescript"],
      status: "published",
    });

    expect(result.title).toBe("My headline");
    expect(result.body).toBe("my own edited words");
    expect(result.tags).toEqual(["typescript"]);
    expect(result.status).toBe("published");
  });
});

/**
 * Provenance forgery: the attack the `source` field makes possible if an update
 * is allowed to set it.
 *
 * `assertMachineAuthoredPostIsImmutable` protects a post that is ALREADY
 * machine-authored, so it is a no-op for a manual post — which is exactly the
 * post an attacker starts from. Hand-write a post, then PATCH
 * `source: "commit"` onto it, and it wears the machine-authored badge the whole
 * review feature exists to make trustworthy, while its text is whatever the
 * human wanted it to say. `CreatePostUseCase` already refuses this at creation
 * time (a non-PAT caller is forced to `manual`); these tests hold the same line
 * on the update path.
 */
describe("UpdatePostUseCase — provenance cannot be forged", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: UpdatePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new UpdatePostUseCase(postsRepository);
  });

  /**
   * What a caller can actually put on the wire, which is not what the use case
   * accepts. `source` is no longer part of `IUpdatePostInput` — that removal IS
   * the fix — so the test has to reconstruct the hostile request explicitly.
   */
  type ForgedUpdateInput = IUpdatePostInput & { source: PostSource };

  async function seedManualPost() {
    const post = makePost({
      userId: "owner",
      body: "I am great, trust me",
      source: "manual",
      status: "draft",
      publishedAt: null,
    });
    await postsRepository.create(post);
    return post;
  }

  it.each(["mcp", "agent", "commit"] as const)(
    "ignores an attempt to promote a manual post to source '%s'",
    async (forgedSource) => {
      const post = await seedManualPost();

      const forged: ForgedUpdateInput = {
        userId: "owner",
        postId: post.id,
        authType: "jwt",
        source: forgedSource,
        body: "I am great, trust me",
      };

      const result = await sut.execute(forged);

      expect(result.source).toBe("manual");
      const stored = await postsRepository.findById(post.id);
      expect(stored!.source).toBe("manual");
    },
  );

  it("ignores a forged source even from a PAT caller", async () => {
    // A PAT may CREATE a machine-authored post; it still may not relabel one
    // that a human already wrote. Provenance describes who authored the text,
    // and the text here was authored by the human.
    const post = await seedManualPost();

    const forged: ForgedUpdateInput = {
      userId: "owner",
      postId: post.id,
      authType: "pat",
      source: "commit",
    };

    const result = await sut.execute(forged);

    expect(result.source).toBe("manual");
  });

  it("does not let a machine-authored post be laundered into a manual one", async () => {
    // The other direction, which `assertMachineAuthoredPostIsImmutable` already
    // rejects loudly: relabelling to `manual` would unlock the content edits
    // that rule exists to prevent, so it must stay an error rather than
    // becoming a silently-ignored field.
    const post = makePost({
      userId: "owner",
      body: "written by software",
      source: "commit",
      status: "pending_review",
      publishedAt: null,
    });
    await postsRepository.create(post);

    const forged: ForgedUpdateInput = {
      userId: "owner",
      postId: post.id,
      authType: "jwt",
      source: "manual",
      body: "polished by the candidate",
    };

    await expect(sut.execute(forged)).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.source).toBe("commit");
    expect(stored!.body).toBe("written by software");
  });
});

describe("UpdatePostUseCase — status transitions", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: UpdatePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new UpdatePostUseCase(postsRepository);
  });

  async function seed(status: PostStatus) {
    const post = makePost({
      userId: "owner",
      body: "body",
      status,
      publishedAt: status === "published" ? new Date("2024-01-01") : null,
    });
    await postsRepository.create(post);
    return post;
  }

  it("allows pending_review -> published (approval)", async () => {
    const post = await seed("pending_review");

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
    });

    expect(result.status).toBe("published");
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["published", "draft"],
    ["published", "pending_review"],
    ["pending_review", "draft"],
    ["draft", "pending_review"],
  ] as const)("rejects %s -> %s", async (from, to) => {
    const post = await seed(from);

    await expect(
      sut.execute({ userId: "owner", postId: post.id, status: to }),
    ).rejects.toBeInstanceOf(BadRequestError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.status).toBe(from);
  });

  it.each(["draft", "pending_review", "published"] as const)(
    "treats re-sending the current status (%s) as a no-op, not an error",
    async (status) => {
      const post = await seed(status);

      const result = await sut.execute({
        userId: "owner",
        postId: post.id,
        status,
      });

      expect(result.status).toBe(status);
    },
  );

  // BUG-20260822-agent-self-publish: the review queue promises the user that
  // nothing is public until they approve it. A PAT is software, so it may not
  // release its own post from that queue.
  describe("only a real session may release a post from review", () => {
    it("throws ForbiddenError on pending_review -> published from a PAT", async () => {
      const post = await seed("pending_review");

      await expect(
        sut.execute({
          userId: "owner",
          postId: post.id,
          status: "published",
          authType: "pat",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const stored = await postsRepository.findById(post.id);
      expect(stored!.status).toBe("pending_review");
      expect(stored!.publishedAt).toBeNull();
    });

    it("still allows pending_review -> published from the owner's session", async () => {
      const post = await seed("pending_review");

      const result = await sut.execute({
        userId: "owner",
        postId: post.id,
        status: "published",
        authType: "jwt",
      });

      expect(result.status).toBe("published");
    });

    it("still allows draft -> published from a PAT — a draft awaits nobody", async () => {
      const post = await seed("draft");

      const result = await sut.execute({
        userId: "owner",
        postId: post.id,
        status: "published",
        authType: "pat",
      });

      expect(result.status).toBe("published");
    });

    it("still treats a PAT re-sending pending_review as a no-op", async () => {
      const post = await seed("pending_review");

      const result = await sut.execute({
        userId: "owner",
        postId: post.id,
        status: "pending_review",
        authType: "pat",
      });

      expect(result.status).toBe("pending_review");
    });
  });
});

describe("UpdatePostUseCase — disclosure policy + search freshness", () => {
  let postsRepository: InMemoryPostsRepository;
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: UpdatePostUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    postsRepository = new InMemoryPostsRepository();
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();

    sut = new UpdatePostUseCase(
      postsRepository,
      usersRepository,
      workExperienceRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );

    user = UserEntity.create({
      email: "author@example.com",
      login: "author",
      name: "Author",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);

    await workExperienceRepository.create(
      WorkExperienceEntity.create({
        userId: user.id,
        title: "Engineer",
        companyName: "Acme Corp",
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
        disclosureLevel: null,
        displayOrder: 0,
      }),
    );
  });

  async function seedOwnPost(body = "clean body") {
    const post = makePost({
      userId: user.id,
      body,
      status: "published",
      publishedAt: new Date(),
    });
    await postsRepository.create(post);
    return post;
  }

  it("rejects an agent edit that introduces the employer name", async () => {
    const post = await seedOwnPost();

    await expect(
      sut.execute({
        userId: user.id,
        postId: post.id,
        authType: "pat",
        body: "Actually this was all at Acme Corp.",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("checks the POST-PATCH result, so a title-only edit can't smuggle a term past a clean body", async () => {
    const post = await seedOwnPost("A perfectly clean body.");

    await expect(
      sut.execute({
        userId: user.id,
        postId: post.id,
        authType: "pat",
        title: "My time at Acme Corp",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("catches an existing violation carried over from an untouched field", async () => {
    // Seeded directly (as a human post would be), then edited by an agent: the
    // body it did not touch is still part of what the agent is now publishing.
    const post = await seedOwnPost("Written by the human about Acme Corp.");

    await expect(
      sut.execute({
        userId: user.id,
        postId: post.id,
        authType: "pat",
        title: "New title",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("does not block the human editing their own post", async () => {
    const post = await seedOwnPost();

    const updated = await sut.execute({
      userId: user.id,
      postId: post.id,
      authType: "jwt",
      body: "I worked at Acme Corp and I'll say so.",
    });

    expect(updated.body).toContain("Acme Corp");
  });

  it("enqueues a re-embedding after updating a published post", async () => {
    await resumesRepository.upsertByUserId(user.id, { summary: "hi" });
    const post = await seedOwnPost();

    await sut.execute({ userId: user.id, postId: post.id, body: "edited" });

    expect(queue.jobs).toHaveLength(1);
  });

  it("does not enqueue when the post stays a draft", async () => {
    await resumesRepository.upsertByUserId(user.id, { summary: "hi" });
    const draft = makePost({ userId: user.id, body: "draft", status: "draft" });
    await postsRepository.create(draft);

    await sut.execute({ userId: user.id, postId: draft.id, body: "still draft" });

    expect(queue.jobs).toHaveLength(0);
  });

  it("persists workExperienceId on update", async () => {
    const post = await seedOwnPost();
    const [role] = await workExperienceRepository.findByUserId(user.id);

    const updated = await sut.execute({
      userId: user.id,
      postId: post.id,
      workExperienceId: role.id,
    });

    expect(updated.workExperienceId).toBe(role.id);
  });
});
