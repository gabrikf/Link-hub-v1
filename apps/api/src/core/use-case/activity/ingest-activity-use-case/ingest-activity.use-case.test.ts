import { createHash } from "node:crypto";
import type { IngestActivityEventInput } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { BadRequestError, ForbiddenError } from "../../../errors/index.js";
import { InMemoryActivityEventRepository } from "../../../repositories/activity-event/in-memory-activity-event-repository.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import {
  GeneratedToken,
  ITokenProvider,
} from "../../../providers/token/token-provider.js";
import {
  counterpartyFingerprintInput,
  repoFingerprintInput,
} from "../shared/repo-fingerprint.js";
import { IngestActivityUseCase } from "./ingest-activity.use-case.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** What the extractor (and now the API) stores for a clear repo identity. */
function repoFingerprint(value: string): string {
  return sha256(repoFingerprintInput(value));
}

function counterpartyFingerprint(value: string): string {
  return sha256(counterpartyFingerprintInput(value));
}

/**
 * Same algorithm as `CryptoTokenProvider`, declared here rather than imported so
 * this core test stays free of an infra import — the layering rule the use case
 * itself obeys by taking the provider through its constructor.
 */
class TestTokenProvider implements ITokenProvider {
  generate(): GeneratedToken {
    throw new Error("not used by IngestActivityUseCase");
  }

  generateOpaqueToken(): string {
    throw new Error("not used by IngestActivityUseCase");
  }

  hash(value: string): string {
    return sha256(value);
  }
}

function makeEvent(
  overrides: Partial<IngestActivityEventInput> = {},
): IngestActivityEventInput {
  return {
    externalDeliveryId: "delivery-1",
    kind: "commit",
    occurredOn: "2026-08-14",
    technologies: [],
    actorIsOwner: true,
    repo: "acme/secret-project",
    ...overrides,
  } as IngestActivityEventInput;
}

describe("IngestActivityUseCase", () => {
  let gitConnectionRepository: InMemoryGitConnectionRepository;
  let activityEventRepository: InMemoryActivityEventRepository;
  let sut: IngestActivityUseCase;
  let connection: GitConnectionEntity;

  beforeEach(() => {
    gitConnectionRepository = new InMemoryGitConnectionRepository();
    activityEventRepository = new InMemoryActivityEventRepository();
    sut = new IngestActivityUseCase(
      gitConnectionRepository,
      activityEventRepository,
      new TestTokenProvider(),
    );

    connection = GitConnectionEntity.create({
      userId: OWNER_ID,
      provider: "claude_code",
      kind: "personal",
      displayName: "Local",
      externalAccountId: null,
      workExperienceId: null,
      disclosureLevelOverride: null,
      webhookSecret: null,
      autoPostEnabled: false,
      cadence: "weekly",
      includeAgentSummary: false,
      lastDigestAt: null,
    });
    gitConnectionRepository.seed(connection);
  });

  describe("ownership", () => {
    it("refuses to append to someone else's connection", async () => {
      await expect(
        sut.execute({
          userId: STRANGER_ID,
          connectionId: connection.id,
          source: "hook",
          events: [makeEvent()],
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(activityEventRepository.items).toHaveLength(0);
    });

    it("answers Forbidden — not NotFound — for a connection id that does not exist", async () => {
      // Distinguishing the two would make this endpoint an oracle for which
      // connection ids are real.
      await expect(
        sut.execute({
          userId: OWNER_ID,
          connectionId: "33333333-3333-4333-8333-333333333333",
          source: "hook",
          events: [makeEvent()],
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("hashing on arrival", () => {
    it("fingerprints a clear repo and never stores the clear value", async () => {
      await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: [makeEvent({ repo: "acme/secret-project" })],
      });

      const [stored] = activityEventRepository.items;
      expect(stored.repoFingerprint).toBe(repoFingerprint("acme/secret-project"));
      expect(stored.repoFingerprint).toMatch(/^[0-9a-f]{64}$/);

      // Nothing anywhere in the persisted row may contain the repository name.
      expect(JSON.stringify(stored.toJSON())).not.toContain("secret-project");
      expect(stored).not.toHaveProperty("repo");
    });

    it("fingerprints clear counterparties and never stores the clear ids", async () => {
      await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: [
          makeEvent({
            counterparties: ["reviewer-anna", "reviewer-bo", "reviewer-anna"],
          }),
        ],
      });

      const [stored] = activityEventRepository.items;
      expect(stored.counterpartyFingerprints).toEqual([
        counterpartyFingerprint("reviewer-anna"),
        counterpartyFingerprint("reviewer-bo"),
      ]);

      const serialized = JSON.stringify(stored.toJSON());
      expect(serialized).not.toContain("reviewer-anna");
      expect(serialized).not.toContain("reviewer-bo");
    });

    it("accepts fingerprints computed by the caller unchanged", async () => {
      const fingerprint = repoFingerprint("acme/secret-project");

      await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "extractor",
        events: [
          makeEvent({
            repo: undefined,
            repoFingerprint: fingerprint,
            counterpartyFingerprints: [counterpartyFingerprint("reviewer-anna")],
          }),
        ],
      });

      const [stored] = activityEventRepository.items;
      expect(stored.repoFingerprint).toBe(fingerprint);
      expect(stored.counterpartyFingerprints).toEqual([
        counterpartyFingerprint("reviewer-anna"),
      ]);
    });

    it("gives a clear webhook repo and the extractor's pre-hashed form ONE identity", async () => {
      // The parity bug this hashing exists to prevent: the same repo cloned
      // over HTTPS (reported clear by a webhook relay) and over SSH (hashed
      // locally by the extractor) must land on one fingerprint, or every
      // per-repo aggregate counts it twice.
      await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: [
          makeEvent({
            externalDeliveryId: "clear",
            repo: "https://github.com/acme/api",
          }),
        ],
      });
      await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "extractor",
        events: [
          makeEvent({
            externalDeliveryId: "pre-hashed",
            repo: undefined,
            repoFingerprint: repoFingerprint("git@github.com:acme/api.git"),
          }),
        ],
      });

      const [fromWebhook, fromExtractor] = activityEventRepository.items;
      expect(fromWebhook.repoFingerprint).toBe(fromExtractor.repoFingerprint);
    });

    it("accepts both forms when they agree", async () => {
      const result = await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: [
          makeEvent({
            repo: "acme/secret-project",
            repoFingerprint: repoFingerprint("acme/secret-project"),
            counterparties: ["reviewer-anna"],
            counterpartyFingerprints: [counterpartyFingerprint("reviewer-anna")],
          }),
        ],
      });

      expect(result).toEqual({ recorded: 1, duplicates: 0 });
    });
  });

  describe("rejections", () => {
    it("rejects an event whose clear repo and fingerprint disagree", async () => {
      await expect(
        sut.execute({
          userId: OWNER_ID,
          connectionId: connection.id,
          source: "hook",
          events: [
            makeEvent({
              repo: "acme/secret-project",
              repoFingerprint: repoFingerprint("acme/something-else"),
            }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(activityEventRepository.items).toHaveLength(0);
    });

    it("rejects an event whose clear counterparties and fingerprints disagree", async () => {
      await expect(
        sut.execute({
          userId: OWNER_ID,
          connectionId: connection.id,
          source: "hook",
          events: [
            makeEvent({
              counterparties: ["reviewer-anna"],
              counterpartyFingerprints: [counterpartyFingerprint("reviewer-bo")],
            }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects an event that sends neither a repo nor a repoFingerprint", async () => {
      await expect(
        sut.execute({
          userId: OWNER_ID,
          connectionId: connection.id,
          source: "hook",
          events: [makeEvent({ repo: undefined })],
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("writes nothing at all when a later event in the batch is invalid", async () => {
      await expect(
        sut.execute({
          userId: OWNER_ID,
          connectionId: connection.id,
          source: "hook",
          events: [
            makeEvent({ externalDeliveryId: "good" }),
            makeEvent({ externalDeliveryId: "bad", repo: undefined }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestError);

      // Validating the whole batch before writing any of it is what keeps a
      // rejected call replayable.
      expect(activityEventRepository.items).toHaveLength(0);
    });
  });

  describe("idempotency", () => {
    const batch = [
      makeEvent({ externalDeliveryId: "d-1" }),
      makeEvent({ externalDeliveryId: "d-2" }),
      makeEvent({ externalDeliveryId: "d-3" }),
    ];

    it("replaying an identical batch records nothing and reports duplicates", async () => {
      const first = await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: batch,
      });
      expect(first).toEqual({ recorded: 3, duplicates: 0 });

      const replay = await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: batch,
      });

      expect(replay).toEqual({ recorded: 0, duplicates: 3 });
      expect(activityEventRepository.items).toHaveLength(3);
    });

    it("absorbs a duplicate that arrives inside the same batch", async () => {
      const result = await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: [
          makeEvent({ externalDeliveryId: "same" }),
          makeEvent({ externalDeliveryId: "same" }),
        ],
      });

      expect(result).toEqual({ recorded: 1, duplicates: 1 });
    });

    it("treats the same delivery id from a different source as a different event", async () => {
      // The key is (source, externalDeliveryId): a hook's "1" and a webhook's
      // "1" are unrelated deliveries that happen to share a counter.
      await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "hook",
        events: [makeEvent({ externalDeliveryId: "1" })],
      });

      const result = await sut.execute({
        userId: OWNER_ID,
        connectionId: connection.id,
        source: "github",
        events: [makeEvent({ externalDeliveryId: "1" })],
      });

      expect(result).toEqual({ recorded: 1, duplicates: 0 });
      expect(activityEventRepository.items).toHaveLength(2);
    });
  });

  it("attributes the event to the connection's owner, not to whoever posted it", async () => {
    await sut.execute({
      userId: OWNER_ID,
      connectionId: connection.id,
      source: "hook",
      events: [makeEvent()],
    });

    const [stored] = activityEventRepository.items;
    expect(stored.userId).toBe(OWNER_ID);
    expect(stored.connectionId).toBe(connection.id);
    expect(stored.source).toBe("hook");
  });
});
