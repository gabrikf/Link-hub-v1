/**
 * E2E tests for the forge webhook receivers.
 *
 * These go through the real encapsulated raw-body content-type parser, the real
 * `preValidation` verification hook and the real ingestion use case, because the
 * things most likely to break here — signing the re-serialised body instead of
 * the bytes, verifying after schema validation, a 500 that loses the delivery —
 * are all invisible to a unit test of the crypto alone.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitConnectionEntity } from "../../../../core/entity/git-connection/git-connection-entity.js";
import {
  counterpartyFingerprintInput,
  repoFingerprintInput,
} from "../../../../core/use-case/activity/shared/repo-fingerprint.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

const GITHUB_SECRET = "It's a Secret to Everybody";
const GITLAB_PLAINTEXT_SECRET = "a-plaintext-gitlab-token";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function githubSignature(secret: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function makeGitlabSigningSecret() {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function gitlabSignature(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

const GITHUB_PUSH_BODY = JSON.stringify({
  ref: "refs/heads/main",
  repository: { full_name: "acme/rocket", default_branch: "main" },
  head_commit: {
    timestamp: "2026-08-13T23:41:07+02:00",
    message: "fix: patch the leak in the vault",
    author: { username: "octocat" },
  },
  commits: [
    {
      timestamp: "2026-08-13T23:41:07+02:00",
      message: "fix: patch the leak in the vault",
      author: { username: "octocat" },
    },
    {
      timestamp: "2026-08-13T23:45:00+02:00",
      message: "chore: tidy",
      author: { username: "collaborator" },
    },
  ],
  sender: { login: "octocat" },
});

/** 20 embedded commits, 57 real ones — the cap GitLab applies to the array. */
const GITLAB_PUSH_BODY = JSON.stringify({
  object_kind: "push",
  ref: "refs/heads/main",
  project: { path_with_namespace: "acme/rocket", default_branch: "main" },
  total_commits_count: 57,
  user_username: "dev",
  user_email: "dev@example.com",
  commits: Array.from({ length: 20 }, (_, i) => ({
    timestamp: "2026-08-12T18:00:00+00:00",
    message: `commit ${i}`,
    author: { name: "Dev", email: "dev@example.com" },
  })),
});

describe("Webhooks E2E", () => {
  let ctx: TestAppHandles;
  let githubConnection: GitConnectionEntity;
  let gitlabPlaintextConnection: GitConnectionEntity;
  let gitlabSigningConnection: GitConnectionEntity;
  let gitlabSigningSecret: string;

  beforeEach(async () => {
    ctx = await buildTestApp();
    const user = await ctx.seedUser();
    gitlabSigningSecret = makeGitlabSigningSecret();

    const seed = (
      provider: "github" | "gitlab",
      webhookSecret: string | null,
      externalAccountId: string | null,
    ) =>
      ctx.gitConnectionRepository.seed(
        GitConnectionEntity.create({
          userId: user.id,
          provider,
          kind: "personal",
          displayName: provider,
          externalAccountId,
          workExperienceId: null,
          disclosureLevelOverride: null,
          webhookSecret,
          autoPostEnabled: false,
          cadence: "weekly",
          includeAgentSummary: false,
          lastDigestAt: null,
        }),
      );

    githubConnection = seed("github", GITHUB_SECRET, "octocat");
    gitlabPlaintextConnection = seed(
      "gitlab",
      GITLAB_PLAINTEXT_SECRET,
      "dev",
    );
    gitlabSigningConnection = seed("gitlab", gitlabSigningSecret, "dev");
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  describe("GitHub", () => {
    function post(
      body: string,
      headers: Record<string, string>,
      connectionId = githubConnection.id,
    ) {
      return ctx.app.inject({
        method: "POST",
        url: `/webhooks/github/${connectionId}`,
        headers: { ...JSON_HEADERS, ...headers },
        body,
      });
    }

    it("accepts a correctly signed push and answers 202", async () => {
      const response = await post(GITHUB_PUSH_BODY, {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": githubSignature(
          GITHUB_SECRET,
          GITHUB_PUSH_BODY,
        ),
      });

      // 202, never 200-after-processing: the forge is told we have the event,
      // and nothing expensive happens on its clock.
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ recorded: 1, duplicates: 0 });

      const [stored] = ctx.activityEventRepository.items;
      expect(stored.source).toBe("github");
      expect(stored.externalDeliveryId).toBe("delivery-1");
      expect(stored.kind).toBe("commit");
      expect(stored.occurredOn).toBe("2026-08-13");
      // Prefixed-and-normalized like the extractor's hash, so a webhook and a
      // local extractor reporting the same repo agree on one fingerprint —
      // pinned against the clone URL the extractor would hash.
      expect(stored.repoFingerprint).toBe(
        sha256(repoFingerprintInput("git@github.com:acme/rocket.git")),
      );
      expect(stored.counterpartyFingerprints).toEqual([
        sha256(counterpartyFingerprintInput("collaborator")),
      ]);
    });

    it("stores no repo name, branch name, commit message or hour of day", async () => {
      await post(GITHUB_PUSH_BODY, {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": githubSignature(
          GITHUB_SECRET,
          GITHUB_PUSH_BODY,
        ),
      });

      const serialized = JSON.stringify(
        ctx.activityEventRepository.items.map((event) => event.toJSON()),
      );
      expect(serialized).not.toContain("acme/rocket");
      expect(serialized).not.toContain("refs/heads/main");
      expect(serialized).not.toContain("vault");
      expect(serialized).not.toContain("23:41");
      expect(serialized).not.toContain("collaborator");
      expect(serialized).not.toContain("octocat");
    });

    it("rejects a tampered body with 401 and records nothing", async () => {
      const signature = githubSignature(GITHUB_SECRET, GITHUB_PUSH_BODY);
      const tampered = GITHUB_PUSH_BODY.replace("acme/rocket", "acme/other");

      const response = await post(tampered, {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": signature,
      });

      expect(response.statusCode).toBe(401);
      expect(ctx.activityEventRepository.items).toHaveLength(0);
    });

    it("verifies BEFORE schema validation: an unsigned malformed body gets 401, not 400", async () => {
      // This is the whole reason verification lives in `preValidation`. With a
      // zod `schema.body` on a `preHandler`, this request would be answered
      // with a 400 describing our schema to a caller who never authenticated.
      const response = await post("this is not json at all", {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
      });

      expect(response.statusCode).toBe(401);
    });

    it("ignores the legacy sha1 header", async () => {
      const sha1 = `sha1=${createHmac("sha1", GITHUB_SECRET).update(GITHUB_PUSH_BODY).digest("hex")}`;

      const response = await post(GITHUB_PUSH_BODY, {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature": sha1,
      });

      expect(response.statusCode).toBe(401);
    });

    it("is idempotent: a redelivery of the same X-GitHub-Delivery records nothing", async () => {
      const headers = {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": githubSignature(
          GITHUB_SECRET,
          GITHUB_PUSH_BODY,
        ),
      };

      await post(GITHUB_PUSH_BODY, headers);
      const replay = await post(GITHUB_PUSH_BODY, headers);

      expect(replay.statusCode).toBe(202);
      expect(replay.json()).toEqual({ recorded: 0, duplicates: 1 });
      expect(ctx.activityEventRepository.items).toHaveLength(1);
    });

    it("acknowledges an event type it does not model without recording anything", async () => {
      const body = JSON.stringify({
        repository: { full_name: "acme/rocket" },
        comment: { body: "nice" },
      });

      const response = await post(body, {
        "x-github-event": "issue_comment",
        "x-github-delivery": "delivery-2",
        "x-hub-signature-256": githubSignature(GITHUB_SECRET, body),
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ recorded: 0, duplicates: 0 });
    });

    it("404s a connection id that is unknown, not a uuid, or the wrong forge", async () => {
      const headers = {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": githubSignature(
          GITHUB_SECRET,
          GITHUB_PUSH_BODY,
        ),
      };

      for (const connectionId of [
        "55555555-5555-4555-8555-555555555555",
        "not-a-uuid",
        // A real connection, but a GitLab one: the github endpoint must not
        // authenticate against it.
        gitlabPlaintextConnection.id,
      ]) {
        const response = await post(GITHUB_PUSH_BODY, headers, connectionId);
        expect(response.statusCode).toBe(404);
      }
    });

    it("serves the webhook at exactly one path, not a versioned twin", async () => {
      // A webhook URL that resolves at two paths is a second endpoint nobody
      // remembers to rotate the secret for. The plugin therefore carries no
      // prefix of its own, and `routes/index.ts` registers it ONCE — unlike
      // every other module, which is mounted bare and under `/api/v1`.
      const response = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/webhooks/github/${githubConnection.id}`,
        headers: {
          ...JSON_HEADERS,
          "x-github-event": "push",
          "x-github-delivery": "delivery-1",
          "x-hub-signature-256": githubSignature(
            GITHUB_SECRET,
            GITHUB_PUSH_BODY,
          ),
        },
        body: GITHUB_PUSH_BODY,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GitLab — legacy plaintext token", () => {
    function post(body: string, headers: Record<string, string>) {
      return ctx.app.inject({
        method: "POST",
        url: `/webhooks/gitlab/${gitlabPlaintextConnection.id}`,
        headers: { ...JSON_HEADERS, ...headers },
        body,
      });
    }

    it("accepts a matching X-Gitlab-Token and answers 202", async () => {
      const response = await post(GITLAB_PUSH_BODY, {
        "x-gitlab-event": "Push Hook",
        "x-gitlab-event-uuid": "gl-delivery-1",
        "x-gitlab-token": GITLAB_PLAINTEXT_SECRET,
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ recorded: 1, duplicates: 0 });

      const [stored] = ctx.activityEventRepository.items;
      expect(stored.source).toBe("gitlab");
      expect(stored.occurredOn).toBe("2026-08-12");
      expect(stored.repoFingerprint).toBe(
        sha256(repoFingerprintInput("git@gitlab.com:acme/rocket.git")),
      );
      // `total_commits_count`, NOT the 20-entry array.
      expect(stored.payload).toMatchObject({ commitCount: 57 });
    });

    it("rejects a wrong token with 401", async () => {
      const response = await post(GITLAB_PUSH_BODY, {
        "x-gitlab-event": "Push Hook",
        "x-gitlab-event-uuid": "gl-delivery-1",
        "x-gitlab-token": "wrong",
      });

      expect(response.statusCode).toBe(401);
      expect(ctx.activityEventRepository.items).toHaveLength(0);
    });

    it("rejects a delivery with no credentials at all", async () => {
      const response = await post(GITLAB_PUSH_BODY, {
        "x-gitlab-event": "Push Hook",
        "x-gitlab-event-uuid": "gl-delivery-1",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GitLab — 19.0+ signing token", () => {
    const deliveryId = "01936c1f-0000-7000-8000-0123456789ab";

    function post(body: string, headers: Record<string, string>) {
      return ctx.app.inject({
        method: "POST",
        url: `/webhooks/gitlab/${gitlabSigningConnection.id}`,
        headers: { ...JSON_HEADERS, ...headers },
        body,
      });
    }

    function signedHeaders(
      body: string,
      secrets: string[],
      timestamp = Math.floor(Date.now() / 1000),
    ) {
      return {
        "x-gitlab-event": "Push Hook",
        "webhook-id": deliveryId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": secrets
          .map(
            (secret) =>
              `v1,${gitlabSignature(secret, deliveryId, timestamp, body)}`,
          )
          .join(" "),
      };
    }

    it("accepts a webhook-signature over {id}.{timestamp}.{rawBody}", async () => {
      const response = await post(
        GITLAB_PUSH_BODY,
        signedHeaders(GITLAB_PUSH_BODY, [gitlabSigningSecret]),
      );

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ recorded: 1, duplicates: 0 });
      // `webhook-id` doubles as the delivery id when no event UUID is sent.
      expect(ctx.activityEventRepository.items[0].externalDeliveryId).toBe(
        deliveryId,
      );
    });

    it("accepts a rotated key: the header is a space-separated list", async () => {
      const response = await post(
        GITLAB_PUSH_BODY,
        signedHeaders(GITLAB_PUSH_BODY, [
          makeGitlabSigningSecret(),
          gitlabSigningSecret,
        ]),
      );

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ recorded: 1, duplicates: 0 });
    });

    it("rejects a signature from a key we do not hold", async () => {
      const response = await post(
        GITLAB_PUSH_BODY,
        signedHeaders(GITLAB_PUSH_BODY, [makeGitlabSigningSecret()]),
      );

      expect(response.statusCode).toBe(401);
    });

    it("rejects an expired timestamp even though the signature is valid", async () => {
      const stale = Math.floor(Date.now() / 1000) - 301;

      const response = await post(
        GITLAB_PUSH_BODY,
        signedHeaders(GITLAB_PUSH_BODY, [gitlabSigningSecret], stale),
      );

      expect(response.statusCode).toBe(401);
      expect(ctx.activityEventRepository.items).toHaveLength(0);
    });

    it("rejects a tampered body", async () => {
      const headers = signedHeaders(GITLAB_PUSH_BODY, [gitlabSigningSecret]);
      const tampered = GITLAB_PUSH_BODY.replace(
        '"total_commits_count":57',
        '"total_commits_count":999',
      );

      expect((await post(tampered, headers)).statusCode).toBe(401);
    });

    it("prefers the signed path and does not fall back to a plaintext token", async () => {
      // Otherwise an attacker who learned the token could downgrade every
      // signed delivery just by sending the weaker header alongside a bad one.
      const headers = {
        ...signedHeaders(GITLAB_PUSH_BODY, [makeGitlabSigningSecret()]),
        "x-gitlab-token": gitlabSigningSecret,
      };

      expect((await post(GITLAB_PUSH_BODY, headers)).statusCode).toBe(401);
    });
  });
});
