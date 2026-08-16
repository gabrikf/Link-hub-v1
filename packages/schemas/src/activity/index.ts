import { z } from "zod/v4";
import { agentDisclosureLevelSchema } from "../agent-policy/index.js";

/**
 * Automatic developer-activity ingestion.
 *
 * The shapes here are written defensively on purpose: the ingestion endpoints
 * are reachable by a Claude Code hook, a forge webhook and a local CLI, none of
 * which LinkHub controls. Anything this module does not accept cannot be
 * persisted, which makes the schema — not a code review — the thing that keeps
 * repo names, commit messages and third-party identities out of the database.
 */

/** Where a connection points. `claude_code` and `extractor` are local tools with no forge account. */
export const gitConnectionProviderSchema = z.enum([
  "github",
  "gitlab",
  "claude_code",
  "extractor",
]);

/**
 * Personal work is the user's own to publish. WORK activity is an employer's,
 * so it inherits a disclosure level and never carries identifying detail.
 *
 * `mixed` is one machine carrying both — the normal case for a developer whose
 * laptop holds side projects next to the day job. It is NOT a third privacy
 * level: mixed activity is held to the WORK rules, because once the two are
 * aggregated there is no way to prove any given number came from the personal
 * half, and the strictest applicable rule is the only safe one.
 */
export const gitConnectionKindSchema = z.enum(["personal", "work", "mixed"]);

/** Which delivery mechanism produced an event. Half of the idempotency key. */
export const activitySourceSchema = z.enum([
  "hook",
  "github",
  "gitlab",
  "extractor",
]);

export const activityEventKindSchema = z.enum([
  "commit",
  "pull_request_merged",
  "review_submitted",
  "review_received",
  "release",
  "agent_session",
]);

/**
 * How often a connection is allowed to turn activity into a digest post.
 * Weekly is the floor by design — a profile that posts daily reads as a
 * commit firehose, which is exactly what recruiters tune out. `biweekly`
 * exists so two machines (or two accounts) can alternate weeks and still add
 * up to one post a week between them.
 */
export const digestCadenceSchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "off",
]);

/**
 * A weekly rhythm is frequent enough to stay a real signal and rare enough that
 * a profile does not become a commit firehose.
 */
export const DEFAULT_DIGEST_CADENCE = "weekly";

/**
 * A hashed identifier: a repository fingerprint or a counterparty fingerprint.
 * Hex sha-256, so the length is fixed — a value that is not 64 hex characters
 * is a clear-text identity that escaped hashing, and must be rejected rather
 * than stored.
 */
export const activityFingerprintSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Must be a hex sha-256 fingerprint");

/** `YYYY-MM-DD`. Never a timestamp — see `ingestActivityEventSchemaInput`. */
export const activityDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a YYYY-MM-DD date");

const technologyTagSchema = z.string().trim().min(1).max(40);

/**
 * Read model for a connection.
 *
 * `webhookSecret` is deliberately ABSENT: it is a credential the API verifies
 * signatures with, and no read path — not the owner's own settings screen —
 * has a reason to see it again after creation.
 */
export const gitConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: gitConnectionProviderSchema,
  kind: gitConnectionKindSchema,
  displayName: z.string(),
  externalAccountId: z.string().nullable(),
  workExperienceId: z.string().nullable(),
  disclosureLevelOverride: agentDisclosureLevelSchema.nullable(),
  autoPostEnabled: z.boolean(),
  cadence: digestCadenceSchema,
  includeAgentSummary: z.boolean(),
  lastDigestAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createGitConnectionSchemaInput = z.object({
  provider: gitConnectionProviderSchema,
  kind: gitConnectionKindSchema,
  displayName: z.string().trim().min(1, "Display name is required").max(80),
  externalAccountId: z.string().trim().min(1).max(200).nullable().optional(),
  /** Only meaningful for `kind: "work"`; it is what the disclosure level is inherited through. */
  workExperienceId: z.string().uuid().nullable().optional(),
  disclosureLevelOverride: agentDisclosureLevelSchema.nullable().optional(),
  autoPostEnabled: z.boolean().default(false),
  cadence: digestCadenceSchema.default(DEFAULT_DIGEST_CADENCE),
  /**
   * Sending the coding agent's own task summary is OFF unless the user turns it
   * on. That prose is written by a model about work that may not be the user's
   * to describe, so it must never be enabled by omission.
   */
  includeAgentSummary: z.boolean().default(false),
});

export const updateGitConnectionSchemaInput = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  kind: gitConnectionKindSchema.optional(),
  workExperienceId: z.string().uuid().nullable().optional(),
  disclosureLevelOverride: agentDisclosureLevelSchema.nullable().optional(),
  autoPostEnabled: z.boolean().optional(),
  cadence: digestCadenceSchema.optional(),
  includeAgentSummary: z.boolean().optional(),
});

/**
 * Bounded, shallow, already-redacted context. Kept small because it is the one
 * open-ended field on an activity event, and an open-ended field is where a
 * commit message ends up if nothing stops it.
 */
const activityPayloadSchema = z.record(
  z.string().max(60),
  z.union([z.string().max(300), z.number(), z.boolean()]),
);

/**
 * One event as the hook, a webhook handler or the extractor POSTs it.
 *
 * Note what is NOT here and never will be: repository name, branch name, file
 * paths, commit messages, hour-of-day and timezone offset. `occurredOn` is a
 * DATE at the coarsest granularity that still supports per-week and per-month
 * aggregation, because a timestamp would publish when the user sleeps.
 *
 * `counterparties` is the exception that proves the rule. It accepts CLEAR
 * reviewer/approver ids so the API can hash them the moment they arrive —
 * hashing at ingestion, never at render — and callers that can hash for
 * themselves send `counterpartyFingerprints` instead. Whichever field is used,
 * only hashes are ever persisted.
 */
export const ingestActivityEventSchemaInput = z.object({
  externalDeliveryId: z.string().trim().min(1).max(200),
  kind: activityEventKindSchema,
  occurredOn: activityDateSchema,
  /** Either the already-hashed repo, or `repo` below for the API to hash. */
  repoFingerprint: activityFingerprintSchema.optional(),
  /** An opaque repo identifier the API fingerprints on arrival and does not store. */
  repo: z.string().trim().min(1).max(400).optional(),
  technologies: z.array(technologyTagSchema).max(30).default([]),
  actorIsOwner: z.boolean().default(true),
  /** Clear third-party ids, hashed on arrival and never stored as given. */
  counterparties: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
  /** Pre-hashed third-party ids, for callers that hash locally. */
  counterpartyFingerprints: z.array(activityFingerprintSchema).max(200).optional(),
  payload: activityPayloadSchema.nullable().optional(),
});

/**
 * The batch envelope. The hook fires per turn and the extractor uploads a run's
 * worth at once, so both post a list; a single event is a list of one.
 */
export const ingestActivitySchemaInput = z.object({
  connectionId: z.string().uuid(),
  source: activitySourceSchema,
  events: z.array(ingestActivityEventSchemaInput).min(1).max(500),
});

export const activityEventSchema = z.object({
  id: z.string(),
  userId: z.string(),
  connectionId: z.string(),
  source: activitySourceSchema,
  externalDeliveryId: z.string(),
  kind: activityEventKindSchema,
  occurredOn: activityDateSchema,
  repoFingerprint: z.string(),
  technologies: z.array(z.string()),
  actorIsOwner: z.boolean(),
  counterpartyFingerprints: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});

/**
 * Per-event outcome of an ingestion call. `duplicate` is a success, not a
 * failure: redelivery, a manual resend and a double-firing hook must all be
 * free no-ops, so the caller needs a way to see "already had it" that is not an
 * error it might retry.
 */
export const ingestActivityResultSchema = z.object({
  recorded: z.number().int().min(0),
  duplicates: z.number().int().min(0),
});

export const gitConnectionParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Live status of a connection, for the setup wizard's "listening for first
 * activity" step and the settings row. Counts and dates only — deliberately
 * nothing that could echo back an identity, because this read model is the one
 * the UI polls in a loop.
 */
export const gitConnectionHealthSchema = z.object({
  connectionId: z.string(),
  totalEvents: z.number().int().min(0),
  /** Date of the newest ingested event, or null when nothing has arrived yet. */
  lastEventOn: activityDateSchema.nullable(),
  eventsLast7Days: z.number().int().min(0),
  /** Distinct repo fingerprints seen in the last 30 days — "3 repos", never which. */
  distinctReposLast30Days: z.number().int().min(0),
  lastDigestAt: z.coerce.date().nullable(),
  nextDigestDueAt: z.coerce.date().nullable(),
});

/**
 * A digest rendered on demand and thrown away: what the next scheduled post
 * WOULD say, so the user can see a real post before enabling anything.
 *
 * `no_activity` and `insufficient_evidence` are distinct on purpose — the first
 * means "nothing has arrived, check the connection", the second means "events
 * arrived but none of them clears the publishable-claim bar yet", and the two
 * need different guidance in the UI.
 */
export const digestPreviewSchema = z.object({
  status: z.enum(["ready", "no_activity", "insufficient_evidence"]),
  post: z
    .object({
      title: z.string(),
      body: z.string(),
      tags: z.array(z.string()).nullable(),
    })
    .nullable(),
  window: z.object({ from: activityDateSchema, to: activityDateSchema }),
  eventCount: z.number().int().min(0),
});

export type GitConnectionProvider = z.infer<typeof gitConnectionProviderSchema>;
export type GitConnectionKind = z.infer<typeof gitConnectionKindSchema>;
export type ActivitySource = z.infer<typeof activitySourceSchema>;
export type ActivityEventKind = z.infer<typeof activityEventKindSchema>;
export type DigestCadence = z.infer<typeof digestCadenceSchema>;
export type GitConnection = z.infer<typeof gitConnectionSchema>;
export type CreateGitConnectionInput = z.infer<
  typeof createGitConnectionSchemaInput
>;
export type UpdateGitConnectionInput = z.infer<
  typeof updateGitConnectionSchemaInput
>;
export type IngestActivityEventInput = z.infer<
  typeof ingestActivityEventSchemaInput
>;
export type IngestActivityInput = z.infer<typeof ingestActivitySchemaInput>;
export type IngestActivityResult = z.infer<typeof ingestActivityResultSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type GitConnectionHealth = z.infer<typeof gitConnectionHealthSchema>;
export type DigestPreview = z.infer<typeof digestPreviewSchema>;
