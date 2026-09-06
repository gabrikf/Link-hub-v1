import type {
  IngestActivityEventInput,
  IngestActivityInput,
} from "@repo/schemas";
import {
  deliveryIdForCommit,
  fingerprintCounterparty,
  fingerprintRepo,
} from "./fingerprint.js";
import {
  configuredAuthorEmail,
  isGitRepository,
  readCommits,
  repositoryIdentity,
  type RawCommit,
} from "./git.js";
import { inferTechnologies } from "./technologies.js";

/**
 * Local git history → the exact JSON the API accepts.
 *
 * The transformation in `toEvent` is the whole product. Read it as a list of
 * what is DROPPED: the repo path and remote (hashed), the commit sha (hashed
 * into an id), the commit date's time and offset (never requested), the author
 * (used to filter, then discarded), the co-authors' emails (hashed), and every
 * file path (reduced to a set of technology tags and a count). What survives is
 * a date, some tags, and numbers.
 */

export interface ExtractOptions {
  /** Author emails that count as the user's own. At least one is required. */
  readonly authors: readonly string[];
  readonly since?: string;
  readonly until?: string;
  readonly maxCommits?: number;
}

/** Aggregate facts about a run, for the review summary. Contains no identities. */
export interface ExtractStats {
  readonly repositories: number;
  readonly commits: number;
  readonly earliestDate: string | null;
  readonly latestDate: string | null;
  readonly technologies: readonly string[];
  readonly counterparties: number;
  /** Repos that were asked for but are not git repositories. Paths, for the console only. */
  readonly skippedPaths: readonly string[];
}

export interface ExtractResult {
  readonly events: IngestActivityEventInput[];
  readonly stats: ExtractStats;
}

/**
 * One commit → one event.
 *
 * `actorIsOwner` is unconditionally true: `readCommits` already filtered to the
 * user's own author emails, so every commit that reaches here is theirs by
 * construction. Commits where the user is only a co-author are not collected —
 * claiming them would need the other person's history, which this tool has no
 * business reading.
 */
function toEvent(
  commit: RawCommit,
  repoFingerprint: string,
): IngestActivityEventInput {
  const technologies = inferTechnologies(commit.changedPaths);

  const counterpartyFingerprints = [
    ...new Set(commit.coAuthorEmails.map(fingerprintCounterparty)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    externalDeliveryId: deliveryIdForCommit(repoFingerprint, commit.sha),
    kind: "commit",
    occurredOn: commit.date,
    repoFingerprint,
    technologies,
    actorIsOwner: true,
    // Only the pre-hashed field is ever populated. The clear-text
    // `counterparties` field exists in the schema for callers that cannot hash;
    // this one can, so it never uses it.
    ...(counterpartyFingerprints.length > 0
      ? { counterpartyFingerprints }
      : {}),
    payload: {
      // A count, not a list. "How much moved" is signal; which files moved is
      // the employer's business.
      changedFiles: commit.changedPaths.length,
    },
  };
}

/** Extracts one repository. Throws only if the path is not a git repository. */
export function extractRepository(
  repoPath: string,
  options: ExtractOptions,
): { events: IngestActivityEventInput[]; commits: RawCommit[] } {
  const repoFingerprint = fingerprintRepo(repositoryIdentity(repoPath));
  const commits = readCommits(repoPath, {
    authors: options.authors,
    since: options.since,
    until: options.until,
    maxCommits: options.maxCommits,
  });
  return {
    events: commits.map((commit) => toEvent(commit, repoFingerprint)),
    commits,
  };
}

/** Running totals folded across every event `extract` collects. */
interface ExtractAccumulator {
  readonly technologies: Set<string>;
  readonly counterparties: Set<string>;
  earliestDate: string | null;
  latestDate: string | null;
}

/** Folds one event's technologies, counterparties and date range into `acc`. */
function foldEventStats(
  event: IngestActivityEventInput,
  acc: ExtractAccumulator,
): void {
  for (const tag of event.technologies ?? []) acc.technologies.add(tag);
  for (const fp of event.counterpartyFingerprints ?? [])
    acc.counterparties.add(fp);
  if (!acc.earliestDate || event.occurredOn < acc.earliestDate) {
    acc.earliestDate = event.occurredOn;
  }
  if (!acc.latestDate || event.occurredOn > acc.latestDate) {
    acc.latestDate = event.occurredOn;
  }
}

/**
 * Extracts several repositories into one payload.
 *
 * Events are sorted by date then delivery id so two runs over the same history
 * produce byte-identical files. That is not cosmetic: a user who wants to check
 * this tool can run it twice and `diff` the results, and any difference is then
 * a real difference rather than noise.
 */
export function extract(
  repoPaths: readonly string[],
  options: ExtractOptions,
): ExtractResult {
  if (options.authors.length === 0) {
    throw new Error(
      "No author email to match. Pass --author <email> (repeatable), or set " +
        "`git config user.email` in the repository.",
    );
  }

  const events: IngestActivityEventInput[] = [];
  const skippedPaths: string[] = [];
  const acc: ExtractAccumulator = {
    technologies: new Set<string>(),
    counterparties: new Set<string>(),
    earliestDate: null,
    latestDate: null,
  };
  let repositories = 0;

  for (const repoPath of repoPaths) {
    if (!isGitRepository(repoPath)) {
      skippedPaths.push(repoPath);
      continue;
    }
    repositories += 1;

    const { events: repoEvents } = extractRepository(repoPath, options);
    for (const event of repoEvents) {
      events.push(event);
      foldEventStats(event, acc);
    }
  }

  events.sort(
    (a, b) =>
      a.occurredOn.localeCompare(b.occurredOn) ||
      a.externalDeliveryId.localeCompare(b.externalDeliveryId),
  );

  return {
    events,
    stats: {
      repositories,
      commits: events.length,
      earliestDate: acc.earliestDate,
      latestDate: acc.latestDate,
      technologies: [...acc.technologies].sort((a, b) => a.localeCompare(b)),
      counterparties: acc.counterparties.size,
      skippedPaths,
    },
  };
}

/** Wraps extracted events in the envelope the API expects. */
export function buildEnvelope(
  connectionId: string,
  events: IngestActivityEventInput[],
): IngestActivityInput {
  return { connectionId, source: "extractor", events };
}

/**
 * The author emails to match, in precedence order: explicit flags, then the
 * settings file, then the repositories' own `git config user.email`.
 *
 * The last step reads EVERY repository's config rather than just the first,
 * because the reason a person has two emails is usually that one repo is
 * configured with the work address and another with the personal one. Taking
 * only the first would silently drop half their history — the exact gap this
 * was asked to close.
 */
export function resolveAuthors(
  fromFlags: readonly string[],
  fromSettings: readonly string[] | undefined,
  repoPaths: readonly string[],
): string[] {
  const explicit = [...fromFlags, ...(fromSettings ?? [])]
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length > 0) return [...new Set(explicit)];

  const discovered = repoPaths
    .filter((path) => isGitRepository(path))
    .map((path) => configuredAuthorEmail(path))
    .filter((email): email is string => Boolean(email))
    .map((email) => email.trim().toLowerCase());

  return [...new Set(discovered)];
}
