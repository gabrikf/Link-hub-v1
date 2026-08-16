import type {
  ActivityEventKind,
  AgentDisclosureLevel,
  GitConnectionKind,
} from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { ForbiddenError } from "../../../errors/index.js";
import { InMemoryActivityEventRepository } from "../../../repositories/activity-event/in-memory-activity-event-repository.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { assertMachineAuthoredPostIsImmutable } from "../../posts/shared/post-status-rules.js";
import { CreatePostUseCase } from "../../posts/create-post-use-case/create-post.use-case.js";
import { BuildCandidateEvidenceUseCase } from "../build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import { GenerateActivityDigestUseCase } from "./generate-activity-digest.use-case.js";

const EMPLOYER = "Nubank";
const NOW = new Date("2026-08-14T09:00:00.000Z");
const WINDOW = { from: "2026-08-08", to: "2026-08-14" };

const REPO = "a".repeat(64);
let deliveryCounter = 0;

describe("GenerateActivityDigestUseCase", () => {
  let gitConnectionRepository: InMemoryGitConnectionRepository;
  let activityEventRepository: InMemoryActivityEventRepository;
  let postsRepository: InMemoryPostsRepository;
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: GenerateActivityDigestUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    gitConnectionRepository = new InMemoryGitConnectionRepository();
    activityEventRepository = new InMemoryActivityEventRepository();
    postsRepository = new InMemoryPostsRepository();
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();

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

    sut = new GenerateActivityDigestUseCase(
      gitConnectionRepository,
      postsRepository,
      usersRepository,
      workExperienceRepository,
      new BuildCandidateEvidenceUseCase(activityEventRepository),
      new CreatePostUseCase(
        postsRepository,
        usersRepository,
        workExperienceRepository,
      ),
    );
  });

  function makeConnection(
    overrides: Partial<{
      kind: GitConnectionKind;
      provider: "github" | "gitlab" | "claude_code" | "extractor";
      workExperienceId: string | null;
      disclosureLevelOverride: AgentDisclosureLevel | null;
      lastDigestAt: Date | null;
    }> = {},
  ): GitConnectionEntity {
    const connection = GitConnectionEntity.create({
      userId: user.id,
      provider: overrides.provider ?? "github",
      kind: overrides.kind ?? "personal",
      displayName: "GitHub",
      externalAccountId: "gh-1",
      workExperienceId: overrides.workExperienceId ?? null,
      disclosureLevelOverride: overrides.disclosureLevelOverride ?? null,
      webhookSecret: null,
      autoPostEnabled: true,
      cadence: "weekly",
      includeAgentSummary: false,
      lastDigestAt: overrides.lastDigestAt ?? null,
    });

    gitConnectionRepository.seed(connection);
    return connection;
  }

  async function seedEvent(
    connection: GitConnectionEntity,
    overrides: {
      kind?: ActivityEventKind;
      occurredOn?: string;
      technologies?: string[];
      actorIsOwner?: boolean;
      counterpartyFingerprints?: string[];
    } = {},
  ) {
    deliveryCounter += 1;

    await activityEventRepository.create(
      ActivityEventEntity.create({
        userId: connection.userId,
        connectionId: connection.id,
        source: "github",
        externalDeliveryId: `delivery-${deliveryCounter}`,
        kind: overrides.kind ?? "pull_request_merged",
        occurredOn: overrides.occurredOn ?? "2026-08-10",
        repoFingerprint: REPO,
        technologies: overrides.technologies ?? ["TypeScript"],
        actorIsOwner: overrides.actorIsOwner ?? true,
        counterpartyFingerprints: overrides.counterpartyFingerprints ?? [
          "1".repeat(64),
        ],
        payload: null,
      }),
    );
  }

  describe("an empty window", () => {
    it("produces no post at all — a silent week is a fine outcome", async () => {
      const connection = makeConnection();

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(result.status).toBe("skipped_no_activity");
      expect(result.post).toBeNull();
      // Not a "no activity this week" update. A profile that publishes the
      // user's silence, automatically, forever, is worse than no profile.
      expect(postsRepository.getAll()).toHaveLength(0);
    });

    it("advances the cadence anyway, so the next window does not keep growing", async () => {
      const connection = makeConnection();

      await sut.execute({ connectionId: connection.id, window: WINDOW, now: NOW });

      expect(connection.lastDigestAt).toEqual(NOW);
    });

    it("produces no post for a window of nothing but commits", async () => {
      const connection = makeConnection();
      await seedEvent(connection, { kind: "commit" });
      await seedEvent(connection, { kind: "commit" });

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      // Commit history is forgeable with a shell loop, so it cannot be the sole
      // basis of a post that claims to be evidence.
      expect(result.status).toBe("skipped_no_activity");
      expect(postsRepository.getAll()).toHaveLength(0);
    });
  });

  describe("idempotency", () => {
    it("produces exactly one post when run twice for the same window", async () => {
      const connection = makeConnection();
      await seedEvent(connection);

      const first = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });
      const second = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: new Date("2026-08-14T10:00:00.000Z"),
      });

      expect(first.status).toBe("created");
      expect(second.status).toBe("skipped_duplicate");
      expect(second.post?.id).toBe(first.post?.id);
      expect(postsRepository.getAll()).toHaveLength(1);
    });

    it("keys on the window, so the next period is still a legitimate post", async () => {
      const connection = makeConnection();
      await seedEvent(connection);
      await seedEvent(connection, { occurredOn: "2026-08-18" });

      await sut.execute({ connectionId: connection.id, window: WINDOW, now: NOW });
      const next = await sut.execute({
        connectionId: connection.id,
        window: { from: "2026-08-15", to: "2026-08-21" },
        now: new Date("2026-08-21T09:00:00.000Z"),
      });

      expect(next.status).toBe("created");
      expect(postsRepository.getAll()).toHaveLength(2);
    });

    it("stamps the digest key on the post so the guarantee survives a restart", async () => {
      const connection = makeConnection();
      await seedEvent(connection);

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(result.post?.metadata?.digestKey).toBe(result.digestKey);
      expect(
        await postsRepository.findByDigestKey(user.id, result.digestKey),
      ).not.toBeNull();
    });
  });

  describe("the produced post", () => {
    it("waits for a human: pending_review, never published", async () => {
      const connection = makeConnection();
      await seedEvent(connection);

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(result.post?.status).toBe("pending_review");
      expect(result.post?.publishedAt).toBeNull();
    });

    it("is content-immutable afterwards", async () => {
      const connection = makeConnection();
      await seedEvent(connection);

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      // The whole value of a machine-authored post is that the candidate did
      // not polish the numbers after the fact.
      expect(() =>
        assertMachineAuthoredPostIsImmutable(result.post!.source, {
          body: "Merged 500 changes.",
        }),
      ).toThrow(ForbiddenError);
      expect(() =>
        assertMachineAuthoredPostIsImmutable(result.post!.source, {
          source: "manual",
        }),
      ).toThrow(ForbiddenError);
    });

    it.each([
      ["github", "commit"],
      ["gitlab", "commit"],
      ["claude_code", "agent"],
      ["extractor", "agent"],
    ] as const)(
      "labels a %s connection's digest with source '%s'",
      async (provider, expected) => {
        const connection = makeConnection({ provider });
        await seedEvent(connection);

        const result = await sut.execute({
          connectionId: connection.id,
          window: WINDOW,
          now: NOW,
        });

        expect(result.post?.source).toBe(expected);
      },
    );

    it("carries the provenance facts needed to explain every number", async () => {
      const connection = makeConnection();
      await seedEvent(connection);

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      const metadata = result.post?.metadata as Record<string, unknown>;

      expect(metadata.engine).toBe("deterministic-digest-v1");
      expect(metadata.window).toEqual(WINDOW);
      expect(metadata.connectionId).toBe(connection.id);
      expect(metadata.eventCount).toBe(1);
      expect(Array.isArray(metadata.claims)).toBe(true);
      // Present for the "why did I get this number" panel, absent from the body.
      expect(metadata).toHaveProperty("commitCount");
    });

    it("never carries a repository or reviewer fingerprint anywhere", async () => {
      const connection = makeConnection();
      const reviewer = "7".repeat(64);
      await seedEvent(connection, { counterpartyFingerprints: [reviewer] });

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      const serialized = JSON.stringify(result.post?.toJSON());
      expect(serialized).not.toContain(REPO);
      expect(serialized).not.toContain(reviewer);
    });

    it("stamps lastDigestAt so the next window starts where this one ended", async () => {
      const connection = makeConnection();
      await seedEvent(connection);

      await sut.execute({ connectionId: connection.id, window: WINDOW, now: NOW });

      expect(connection.lastDigestAt).toEqual(NOW);
    });
  });

  describe("a WORK connection at 'summary'", () => {
    async function seedEmployer(
      disclosureLevel: AgentDisclosureLevel | null,
    ): Promise<WorkExperienceEntity> {
      const role = WorkExperienceEntity.create({
        userId: user.id,
        title: "Senior Engineer",
        companyName: EMPLOYER,
        employmentType: "full-time",
        workModel: "remote",
        locationCity: null,
        locationState: null,
        locationCountry: null,
        startDate: "2023-01-01",
        endDate: null,
        isCurrent: true,
        description: null,
        mainStack: ["TypeScript"],
        disclosureLevel,
        displayOrder: 0,
      });

      workExperienceRepository.seed(role);
      return role;
    }

    it("never emits the employer name, and attributes the post to the role", async () => {
      const role = await seedEmployer("summary");
      const connection = makeConnection({
        kind: "work",
        workExperienceId: role.id,
      });
      await seedEvent(connection);

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(result.status).toBe("created");

      const post = result.post!;
      const serialized = JSON.stringify(post.toJSON());

      expect(serialized).not.toContain(EMPLOYER);
      expect(post.title).not.toContain(EMPLOYER);
      expect(post.body).not.toContain(EMPLOYER);
      expect(post.workExperienceId).toBe(role.id);
      expect((post.metadata as Record<string, unknown>).disclosureLevel).toBe(
        "summary",
      );
    });

    it("holds a MIXED connection to the same rules as a work one", async () => {
      // `mixed` is one machine holding personal AND employer repositories. Its
      // digest aggregates both, so nothing in it can be attributed to the
      // personal half — it inherits the employer's level and is attributed to
      // the role, exactly like `work` above.
      const role = await seedEmployer("summary");
      // Account set WIDER than the role on purpose: if `mixed` were treated as
      // personal, `resolvesDisclosureVia()` would return null, the role would be
      // skipped and this digest would publish at `full`.
      user.updateAgentPolicy({ disclosureLevel: "full" });
      await usersRepository.update(user);

      const connection = makeConnection({
        kind: "mixed",
        workExperienceId: role.id,
      });
      await seedEvent(connection, { technologies: [EMPLOYER, "TypeScript"] });

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(result.status).toBe("created");

      const post = result.post!;

      expect(JSON.stringify(post.toJSON())).not.toContain(EMPLOYER);
      expect(post.tags).toEqual(["typescript"]);
      expect(post.workExperienceId).toBe(role.id);
      expect((post.metadata as Record<string, unknown>).disclosureLevel).toBe(
        "summary",
      );
      expect((post.metadata as Record<string, unknown>).connectionKind).toBe(
        "mixed",
      );
    });

    it("drops a technology tag that happens to be the employer's name", async () => {
      // The one route by which an employer name could reach a deterministic
      // template: a tag written by an outside hook.
      const role = await seedEmployer("summary");
      const connection = makeConnection({
        kind: "work",
        workExperienceId: role.id,
      });
      await seedEvent(connection, { technologies: [EMPLOYER, "TypeScript"] });

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(JSON.stringify(result.post?.toJSON())).not.toContain(EMPLOYER);
      expect(result.post?.tags).toEqual(["typescript"]);
    });

    it("honours a connection-level override that is STRICTER than the account", async () => {
      // `assertPostRespectsDisclosure` resolves the level from the account and
      // the role only, so a connection override is enforced by the generator's
      // own check. Without it, a user who set the account to `full` and this
      // connection to `summary` would have the connection's setting ignored.
      await seedEmployer(null);
      user.updateAgentPolicy({ disclosureLevel: "full" });
      await usersRepository.update(user);

      const connection = makeConnection({
        kind: "personal",
        disclosureLevelOverride: "summary",
      });
      await seedEvent(connection, { technologies: [EMPLOYER] });

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(JSON.stringify(result.post?.toJSON())).not.toContain(EMPLOYER);
      expect((result.post?.metadata as Record<string, unknown>).disclosureLevel).toBe(
        "summary",
      );
    });

    it("does not apply an employer's rules to a personal connection", async () => {
      // A personal connection carries no role even when one is set, so the
      // employer's own override must not redact the user's side projects.
      const role = await seedEmployer("summary");
      const connection = makeConnection({
        kind: "personal",
        workExperienceId: role.id,
      });
      await seedEvent(connection);

      const result = await sut.execute({
        connectionId: connection.id,
        window: WINDOW,
        now: NOW,
      });

      expect(result.post?.workExperienceId).toBeNull();
    });
  });

  describe("window derivation", () => {
    it("derives the window from lastDigestAt when the caller supplies none", async () => {
      const connection = makeConnection({
        lastDigestAt: new Date("2026-08-07T09:00:00.000Z"),
      });
      await seedEvent(connection);

      const result = await sut.execute({ connectionId: connection.id, now: NOW });

      expect(result.window).toEqual({ from: "2026-08-08", to: "2026-08-14" });
    });
  });
});
