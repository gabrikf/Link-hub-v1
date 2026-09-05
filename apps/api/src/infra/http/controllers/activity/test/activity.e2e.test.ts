/**
 * E2E tests for the activity ingestion layer's authenticated surface: the
 * connections CRUD (JWT only) and `POST /me/activity` (PAT with `activity:write`).
 *
 * Runs against the DB-free Fastify app from `buildTestApp()` via app.inject(),
 * so the real guards, the real zod validation and the real global error handler
 * are all in the path.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../../../core/entity/activity-event/activity-event-entity.js";
import { GitConnectionEntity } from "../../../../../core/entity/git-connection/git-connection-entity.js";
import {
  counterpartyFingerprintInput,
  repoFingerprintInput,
} from "../../../../../core/use-case/activity/shared/repo-fingerprint.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";
import { expectDefined } from "../../../../../test-support/expect-defined.js";

const JSON_HEADERS = { "content-type": "application/json" };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Activity E2E — connections CRUD (JWT only)", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authedUser() {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);
    return { user, token };
  }

  /** Mints a real PAT through the real create-token route. */
  async function mintPat(jwt: string, scopes: string[]) {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ name: "agent", scopes }),
    });

    return response.json().token as string;
  }

  it("creates a github connection and returns the plaintext webhook secret exactly once", async () => {
    const { token } = await authedUser();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/connections",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: "github",
        kind: "personal",
        displayName: "Personal GitHub",
        externalAccountId: "octocat",
      }),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created.webhookSecret).toEqual(expect.any(String));
    expect(created.webhookSecret.length).toBeGreaterThan(20);

    // Every later read of the same connection must omit it.
    const list = await ctx.app.inject({
      method: "GET",
      url: "/me/connections",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(list.statusCode).toBe(200);
    const [listed] = list.json();
    expect(listed).not.toHaveProperty("webhookSecret");
    expect(list.body).not.toContain(created.webhookSecret);
  });

  it("returns a null webhook secret for a local tool that receives no webhooks", async () => {
    const { token } = await authedUser();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/connections",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: "claude_code",
        kind: "personal",
        displayName: "Claude Code",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().webhookSecret).toBeNull();
  });

  it("answers a duplicate provider+kind source with 409, not a unique-violation 500", async () => {
    const { token } = await authedUser();
    const body = JSON.stringify({
      provider: "extractor",
      kind: "personal",
      displayName: "First laptop",
    });

    const first = await ctx.app.inject({
      method: "POST",
      url: "/me/connections",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body,
    });
    expect(first.statusCode).toBe(201);

    const second = await ctx.app.inject({
      method: "POST",
      url: "/me/connections",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body,
    });
    expect(second.statusCode).toBe(409);
    // The message names the row the user already has, so the fix is obvious.
    expect(second.json().message).toContain("First laptop");
  });

  it("allows personal, work AND mixed rows of the same local provider", async () => {
    // The null-account identity is (user, provider, kind), so the three kinds in
    // `gitConnectionKindSchema` are three different rows — three disclosure
    // scopes on one machine, not a duplicate. Only a repeat of the SAME kind is
    // the 409 above.
    const { token } = await authedUser();

    for (const kind of ["personal", "work", "mixed"] as const) {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/connections",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: "extractor",
          kind,
          displayName: `${kind} laptop`,
        }),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().kind).toBe(kind);
    }

    const list = await ctx.app.inject({
      method: "GET",
      url: "/me/connections",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(
      list
        .json()
        .map((row: { kind: string }) => row.kind)
        .sort(),
    ).toEqual(["mixed", "personal", "work"]);
  });

  it("lists only the caller's own connections", async () => {
    const { token } = await authedUser();
    const stranger = await ctx.seedUser();

    await ctx.app.inject({
      method: "POST",
      url: "/me/connections",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: "github",
        kind: "personal",
        displayName: "Mine",
      }),
    });

    ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: stranger.id,
        provider: "github",
        kind: "personal",
        displayName: "Theirs",
        externalAccountId: null,
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: "secret",
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    const response = await ctx.app.inject({
      method: "GET",
      url: "/me/connections",
      headers: { authorization: `Bearer ${token}` },
    });

    const listed = response.json();
    expect(listed).toHaveLength(1);
    expect(listed[0].displayName).toBe("Mine");
  });

  it("updates and deletes the caller's own connection", async () => {
    const { token } = await authedUser();

    const created = await ctx.app.inject({
      method: "POST",
      url: "/me/connections",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: "gitlab",
        kind: "personal",
        displayName: "GitLab",
      }),
    });
    const id = created.json().id as string;

    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/me/connections/${id}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: "Work GitLab", kind: "work" }),
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json().displayName).toBe("Work GitLab");
    expect(patched.json().kind).toBe("work");
    expect(patched.json()).not.toHaveProperty("webhookSecret");

    const deleted = await ctx.app.inject({
      method: "DELETE",
      url: `/me/connections/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ success: true });
    expect(await ctx.gitConnectionRepository.findById(id)).toBeNull();
  });

  it("returns 404 when touching another user's connection, hiding that the id exists", async () => {
    const { token } = await authedUser();
    const stranger = await ctx.seedUser();
    const theirs = ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: stranger.id,
        provider: "github",
        kind: "personal",
        displayName: "Theirs",
        externalAccountId: null,
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: "secret",
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/me/connections/${theirs.id}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: "Hijacked" }),
    });
    expect(patched.statusCode).toBe(404);

    const deleted = await ctx.app.inject({
      method: "DELETE",
      url: `/me/connections/${theirs.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.statusCode).toBe(404);
  });

  describe("PATs are locked out of the connections surface entirely", () => {
    /**
     * A connection defines the disclosure scope its own ingestion runs under.
     * If a PAT could create or repoint one, a token minted for `activity:write`
     * could re-classify an employer's work as personal and publish it — so the
     * routes use the JWT-only `authGuard`, which rejects any `lh_pat_` token
     * regardless of the scopes it carries.
     */
    it("rejects POST /me/connections from a PAT even with every scope", async () => {
      const { token } = await authedUser();
      const pat = await mintPat(token, [
        "posts:read",
        "posts:write",
        "profile:read",
        "activity:write",
      ]);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/connections",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          provider: "github",
          kind: "personal",
          displayName: "Snuck in",
        }),
      });

      expect(response.statusCode).toBe(401);
      expect(ctx.gitConnectionRepository.items).toHaveLength(0);
    });

    it("rejects GET, PATCH and DELETE from a PAT as well", async () => {
      const { user, token } = await authedUser();
      const pat = await mintPat(token, ["activity:write"]);
      const connection = ctx.gitConnectionRepository.seed(
        GitConnectionEntity.create({
          userId: user.id,
          provider: "github",
          kind: "personal",
          displayName: "Mine",
          externalAccountId: null,
          workExperienceId: null,
          disclosureLevelOverride: null,
          webhookSecret: "secret",
          autoPostEnabled: false,
          cadence: "weekly",
          includeAgentSummary: false,
          lastDigestAt: null,
        }),
      );

      const authorization = `Bearer ${pat}`;

      expect(
        (
          await ctx.app.inject({
            method: "GET",
            url: "/me/connections",
            headers: { authorization },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await ctx.app.inject({
            method: "PATCH",
            url: `/me/connections/${connection.id}`,
            headers: { ...JSON_HEADERS, authorization },
            body: JSON.stringify({ displayName: "x" }),
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await ctx.app.inject({
            method: "DELETE",
            url: `/me/connections/${connection.id}`,
            headers: { authorization },
          })
        ).statusCode,
      ).toBe(401);
    });
  });
});

describe("Activity E2E — POST /me/activity", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function setup(scopes: string[] = ["activity:write"]) {
    const user = await ctx.seedUser();
    const jwt = await ctx.signJwt(user.id);

    const patResponse = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ name: "hook", scopes }),
    });
    const pat = patResponse.json().token as string;

    const connection = ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: user.id,
        provider: "claude_code",
        kind: "personal",
        displayName: "Claude Code",
        externalAccountId: null,
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: null,
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    return { user, jwt, pat, connection };
  }

  function batch(connectionId: string) {
    return {
      connectionId,
      source: "hook",
      events: [
        {
          externalDeliveryId: "session-a:1",
          kind: "commit",
          occurredOn: "2026-08-14",
          repo: "acme/rocket",
        },
        {
          externalDeliveryId: "session-a:2",
          kind: "commit",
          occurredOn: "2026-08-14",
          repo: "acme/rocket",
        },
      ],
    };
  }

  it("records a batch, then returns {recorded: 0, duplicates: N} with 200 on replay", async () => {
    const { pat, connection } = await setup();
    const body = JSON.stringify(batch(connection.id));
    const headers = { ...JSON_HEADERS, authorization: `Bearer ${pat}` };

    const first = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers,
      body,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ recorded: 2, duplicates: 0 });

    const replay = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers,
      body,
    });

    // A retrying hook must see a success, never an error it will retry harder.
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ recorded: 0, duplicates: 2 });
    expect(ctx.activityEventRepository.items).toHaveLength(2);
  });

  it("hashes a clear repo on arrival and stores no clear value anywhere", async () => {
    const { pat, connection } = await setup();

    await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        connectionId: connection.id,
        source: "hook",
        events: [
          {
            externalDeliveryId: "d-1",
            kind: "review_submitted",
            occurredOn: "2026-08-14",
            repo: "acme/project-nimbus",
            counterparties: ["reviewer-anna", "reviewer-bo"],
          },
        ],
      }),
    });

    const [storedEvent] = ctx.activityEventRepository.items;
    const stored = expectDefined(storedEvent, "the stored activity event");
    // The extractor's prefixed-and-normalized form, not a bare sha256 of the
    // clear value — parity is what keeps webhook and extractor events deduped.
    expect(stored.repoFingerprint).toBe(
      sha256(repoFingerprintInput("acme/project-nimbus")),
    );
    expect(stored.counterpartyFingerprints).toEqual([
      sha256(counterpartyFingerprintInput("reviewer-anna")),
      sha256(counterpartyFingerprintInput("reviewer-bo")),
    ]);

    const serialized = JSON.stringify(
      ctx.activityEventRepository.items.map((event) => event.toJSON()),
    );
    expect(serialized).not.toContain("project-nimbus");
    expect(serialized).not.toContain("reviewer-anna");
    expect(serialized).not.toContain("reviewer-bo");
  });

  it("returns 403 for a PAT that lacks activity:write", async () => {
    const { pat, connection } = await setup(["posts:read", "profile:read"]);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify(batch(connection.id)),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("activity:write");
    expect(ctx.activityEventRepository.items).toHaveLength(0);
  });

  it("returns 403 for a PAT created with the DEFAULT scopes", async () => {
    // `activity:write` is deliberately absent from the default grant, so every
    // existing setup flow that omits `scopes` stays locked out.
    const user = await ctx.seedUser();
    const jwt = await ctx.signJwt(user.id);
    const patResponse = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ name: "default-scopes" }),
    });
    const pat = patResponse.json().token as string;

    const connection = ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: user.id,
        provider: "claude_code",
        kind: "personal",
        displayName: "Claude Code",
        externalAccountId: null,
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: null,
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify(batch(connection.id)),
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when ingesting for someone else's connectionId", async () => {
    const { pat } = await setup();
    const stranger = await ctx.seedUser();
    const theirs = ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: stranger.id,
        provider: "claude_code",
        kind: "personal",
        displayName: "Theirs",
        externalAccountId: null,
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: null,
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify(batch(theirs.id)),
    });

    expect(response.statusCode).toBe(403);
    expect(ctx.activityEventRepository.items).toHaveLength(0);
  });

  it("rejects a clear-text value where a fingerprint was promised", async () => {
    const { pat, connection } = await setup();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        connectionId: connection.id,
        source: "extractor",
        events: [
          {
            externalDeliveryId: "d-1",
            kind: "commit",
            occurredOn: "2026-08-14",
            // Not 64 hex characters: an identity that escaped hashing.
            repoFingerprint: "acme/rocket",
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(ctx.activityEventRepository.items).toHaveLength(0);
  });

  it("rejects an event with neither a repo nor a repoFingerprint", async () => {
    const { pat, connection } = await setup();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        connectionId: connection.id,
        source: "hook",
        events: [
          {
            externalDeliveryId: "d-1",
            kind: "commit",
            occurredOn: "2026-08-14",
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a timestamp where a date was required", async () => {
    const { pat, connection } = await setup();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        connectionId: connection.id,
        source: "hook",
        events: [
          {
            externalDeliveryId: "d-1",
            kind: "commit",
            occurredOn: "2026-08-14T23:41:07+02:00",
            repo: "acme/rocket",
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("accepts a JWT session too — a real session bypasses scopes", async () => {
    const { jwt, connection } = await setup();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/activity",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify(batch(connection.id)),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recorded: 2, duplicates: 0 });
  });
});

describe("Activity E2E — GET /me/connections/:id/health and /digest-preview", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  function today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async function setup() {
    const user = await ctx.seedUser();
    const jwt = await ctx.signJwt(user.id);

    const connection = ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: user.id,
        provider: "github",
        kind: "personal",
        displayName: "GitHub",
        externalAccountId: "gh-1",
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: null,
        autoPostEnabled: true,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    return { user, jwt, connection };
  }

  let deliveryCounter = 0;

  async function seedEvent(
    connection: GitConnectionEntity,
    overrides: Partial<{
      kind: "commit" | "pull_request_merged";
      occurredOn: string;
      repoFingerprint: string;
    }> = {},
  ) {
    deliveryCounter += 1;
    await ctx.activityEventRepository.create(
      ActivityEventEntity.create({
        userId: connection.userId,
        connectionId: connection.id,
        source: "github",
        externalDeliveryId: `e2e-${deliveryCounter}`,
        kind: overrides.kind ?? "pull_request_merged",
        occurredOn: overrides.occurredOn ?? today(),
        repoFingerprint: overrides.repoFingerprint ?? "a".repeat(64),
        technologies: ["TypeScript"],
        actorIsOwner: true,
        counterpartyFingerprints: ["1".repeat(64)],
        payload: null,
      }),
    );
  }

  it("reports the connection's counters and digest schedule", async () => {
    const { jwt, connection } = await setup();
    await seedEvent(connection, { repoFingerprint: "a".repeat(64) });
    await seedEvent(connection, { repoFingerprint: "b".repeat(64) });
    // Ancient event: still in the total, out of both rolling windows.
    await seedEvent(connection, { occurredOn: "2020-01-01" });

    const response = await ctx.app.inject({
      method: "GET",
      url: `/me/connections/${connection.id}/health`,
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(response.statusCode).toBe(200);
    const health = response.json();
    expect(health.connectionId).toBe(connection.id);
    expect(health.totalEvents).toBe(3);
    expect(health.lastEventOn).toBe(today());
    expect(health.eventsLast7Days).toBe(2);
    expect(health.distinctReposLast30Days).toBe(2);
    expect(health.lastDigestAt).toBeNull();
    expect(health.nextDigestDueAt).toBeNull();
  });

  it("previews the digest without persisting a post or advancing the cadence", async () => {
    const { jwt, connection } = await setup();
    await seedEvent(connection);

    const response = await ctx.app.inject({
      method: "GET",
      url: `/me/connections/${connection.id}/digest-preview`,
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(response.statusCode).toBe(200);
    const preview = response.json();
    expect(preview.status).toBe("ready");
    expect(preview.eventCount).toBe(1);
    expect(preview.post.title).toContain("Merged 1 change");
    expect(preview.post.tags).toEqual(["typescript"]);

    // A preview is a pure read: nothing written, nothing stamped.
    expect(ctx.postsRepository.getAll()).toHaveLength(0);
    expect(connection.lastDigestAt).toBeNull();
  });

  it("distinguishes no_activity from insufficient_evidence", async () => {
    const { jwt, connection } = await setup();

    const empty = await ctx.app.inject({
      method: "GET",
      url: `/me/connections/${connection.id}/digest-preview`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(empty.json().status).toBe("no_activity");

    // Commits alone never clear the publishable bar.
    await seedEvent(connection, { kind: "commit" });

    const commitsOnly = await ctx.app.inject({
      method: "GET",
      url: `/me/connections/${connection.id}/digest-preview`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(commitsOnly.json().status).toBe("insufficient_evidence");
    expect(commitsOnly.json().eventCount).toBe(1);
  });

  it("answers 404 — identically — for a missing id and someone else's connection", async () => {
    const { jwt } = await setup();
    const stranger = await ctx.seedUser();
    const theirs = ctx.gitConnectionRepository.seed(
      GitConnectionEntity.create({
        userId: stranger.id,
        provider: "github",
        kind: "personal",
        displayName: "Theirs",
        externalAccountId: null,
        workExperienceId: null,
        disclosureLevelOverride: null,
        webhookSecret: null,
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
        lastDigestAt: null,
      }),
    );

    const missingId = "33333333-3333-4333-8333-333333333333";

    for (const suffix of ["health", "digest-preview"]) {
      const missing = await ctx.app.inject({
        method: "GET",
        url: `/me/connections/${missingId}/${suffix}`,
        headers: { authorization: `Bearer ${jwt}` },
      });
      const notMine = await ctx.app.inject({
        method: "GET",
        url: `/me/connections/${theirs.id}/${suffix}`,
        headers: { authorization: `Bearer ${jwt}` },
      });

      // Same status AND same message shape: anything that differs is an oracle
      // telling an authenticated user which connection ids exist.
      expect(missing.statusCode).toBe(404);
      expect(notMine.statusCode).toBe(404);
    }
  });

  it("rejects a PAT on both routes, whatever scopes it carries", async () => {
    const { jwt, connection } = await setup();
    const patResponse = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        name: "agent",
        scopes: ["posts:read", "posts:write", "profile:read", "activity:write"],
      }),
    });
    const pat = patResponse.json().token as string;

    for (const suffix of ["health", "digest-preview"]) {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/me/connections/${connection.id}/${suffix}`,
        headers: { authorization: `Bearer ${pat}` },
      });

      expect(response.statusCode).toBe(401);
    }
  });
});
