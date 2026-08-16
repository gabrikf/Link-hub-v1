import type { ActivityEventKind } from "@repo/schemas";

/**
 * Translates a forge webhook payload into the ingestion contract.
 *
 * The mapper is where a rich, chatty, identity-laden forge payload becomes the
 * four or five facts LinkHub is willing to keep. What it must NEVER carry out
 * the other side, no matter how convenient the source field is:
 *
 * - repository names, branch names, file paths, commit messages, PR/issue titles;
 * - hour-of-day or timezone offset — `occurredOn` is a DATE, derived by taking
 *   the leading `YYYY-MM-DD` of the forge's own timestamp so that the clock time
 *   is discarded before it is ever in a variable, not after.
 *
 * `repo` and `counterparties` leave here in the CLEAR by design: the ingestion
 * use case fingerprints them on arrival and drops the clear values. Hashing here
 * as well would just be a second implementation of the same rule to keep in sync.
 */

/** One event, before `externalDeliveryId` is assigned from the delivery headers. */
export interface MappedForgeEvent {
  kind: ActivityEventKind;
  occurredOn: string;
  /** Clear repository identifier. Hashed by `IngestActivityUseCase`, never stored. */
  repo: string;
  technologies: string[];
  actorIsOwner: boolean;
  /** Clear third-party ids. Hashed by `IngestActivityUseCase`, never stored. */
  counterparties: string[];
  payload: Record<string, string | number | boolean> | null;
}

export function mapGithubDelivery(
  eventName: string,
  payload: unknown,
  ownerAccountId: string | null,
  receivedAt: Date = new Date(),
): MappedForgeEvent[] {
  const body = asRecord(payload);

  if (!body) {
    return [];
  }

  const repository = asRecord(body.repository);
  // Host-qualified on purpose: `normalizeRepoIdentity` treats a bare
  // "acme/thing" as a filesystem path and resolves it against process.cwd(),
  // so the fingerprint would vary by deployment and never match the
  // extractor's `github.com/acme/thing`. `html_url` carries the real host;
  // the synthesized fallback assumes github.com, which is what sends this
  // webhook shape.
  // Scheme included: `normalizeRepoIdentity` only takes its URL branch for
  // scheme or scp-like forms, so a bare `github.com/acme/thing` would still
  // be absolutised as a filesystem path.
  const fullName = asString(repository?.full_name);
  const repo =
    asString(repository?.html_url) ??
    (fullName ? `https://github.com/${fullName}` : undefined);

  // Without a repository identity there is no `repo_fingerprint` to store, and
  // the column is NOT NULL. Dropping the delivery beats inventing one.
  if (!repo) {
    return [];
  }

  switch (eventName) {
    case "push":
      return mapGithubPush(body, repo, ownerAccountId, receivedAt);
    case "pull_request":
      return mapGithubPullRequest(body, repo, ownerAccountId, receivedAt);
    case "pull_request_review":
      return mapGithubReview(body, repo, ownerAccountId, receivedAt);
    case "release":
      return mapGithubRelease(body, repo, receivedAt);
    default:
      // An event type LinkHub does not model is not an error — GitHub sends
      // whatever the hook is subscribed to, and a 4xx here would only make the
      // delivery look broken in the forge's UI.
      return [];
  }
}

function mapGithubPush(
  body: Record<string, unknown>,
  repo: string,
  ownerAccountId: string | null,
  receivedAt: Date,
): MappedForgeEvent[] {
  const commits = asArray(body.commits);
  const headCommit = asRecord(body.head_commit);

  if (commits.length === 0 && !headCommit) {
    // A branch delete or a tag push carries no commits; there is no work to
    // record, only a branch name we are not allowed to keep.
    return [];
  }

  const lastCommit = asRecord(commits[commits.length - 1]);
  const occurredOn = toDateOnly(
    headCommit?.timestamp ?? lastCommit?.timestamp,
    receivedAt,
  );

  // `ref` is READ but never stored: it only answers the boolean below. A branch
  // name is exactly the kind of identifier this product exists not to publish.
  const ref = asString(body.ref);
  const defaultBranch = asString(asRecord(body.repository)?.default_branch);

  const counterparties = distinct(
    commits
      .map((commit) => asString(asRecord(asRecord(commit)?.author)?.username))
      .filter(isPresent),
  ).filter((login) => login !== ownerAccountId);

  return [
    {
      kind: "commit",
      occurredOn,
      repo,
      technologies: [],
      actorIsOwner: true,
      counterparties,
      payload: {
        commitCount: commits.length,
        onDefaultBranch:
          ref !== undefined &&
          defaultBranch !== undefined &&
          ref === `refs/heads/${defaultBranch}`,
      },
    },
  ];
}

function mapGithubPullRequest(
  body: Record<string, unknown>,
  repo: string,
  ownerAccountId: string | null,
  receivedAt: Date,
): MappedForgeEvent[] {
  const pullRequest = asRecord(body.pull_request);

  // Only a MERGE is activity. `opened`/`closed`-without-merge say nothing about
  // work that landed, and `synchronize` fires on every push to the branch.
  if (asString(body.action) !== "closed" || pullRequest?.merged !== true) {
    return [];
  }

  const author = asString(asRecord(pullRequest.user)?.login);
  const mergedBy = asString(asRecord(pullRequest.merged_by)?.login);
  const actorIsOwner = ownerAccountId === null || author === ownerAccountId;

  return [
    {
      kind: "pull_request_merged",
      occurredOn: toDateOnly(pullRequest.merged_at, receivedAt),
      repo,
      technologies: [],
      actorIsOwner,
      counterparties: distinct(
        [actorIsOwner ? mergedBy : author].filter(isPresent),
      ).filter((login) => login !== ownerAccountId),
      payload: null,
    },
  ];
}

function mapGithubReview(
  body: Record<string, unknown>,
  repo: string,
  ownerAccountId: string | null,
  receivedAt: Date,
): MappedForgeEvent[] {
  if (asString(body.action) !== "submitted") {
    return [];
  }

  const review = asRecord(body.review);
  const reviewer = asString(asRecord(review?.user)?.login);
  const author = asString(asRecord(asRecord(body.pull_request)?.user)?.login);

  // The connection's own forge account id is the only way to tell a review the
  // user GAVE from one they RECEIVED, and the two are different signals: one is
  // work done for other people, the other is trust placed in the user's work.
  const reviewedByOwner = ownerAccountId !== null && reviewer === ownerAccountId;

  return [
    {
      kind: reviewedByOwner ? "review_submitted" : "review_received",
      occurredOn: toDateOnly(review?.submitted_at, receivedAt),
      repo,
      technologies: [],
      actorIsOwner: reviewedByOwner,
      counterparties: distinct(
        [reviewedByOwner ? author : reviewer].filter(isPresent),
      ).filter((login) => login !== ownerAccountId),
      payload: null,
    },
  ];
}

function mapGithubRelease(
  body: Record<string, unknown>,
  repo: string,
  receivedAt: Date,
): MappedForgeEvent[] {
  if (asString(body.action) !== "published") {
    return [];
  }

  const release = asRecord(body.release);

  return [
    {
      kind: "release",
      occurredOn: toDateOnly(release?.published_at, receivedAt),
      repo,
      technologies: [],
      actorIsOwner: true,
      counterparties: [],
      payload: null,
    },
  ];
}

export function mapGitlabDelivery(
  eventName: string,
  payload: unknown,
  ownerAccountId: string | null,
  receivedAt: Date = new Date(),
): MappedForgeEvent[] {
  const body = asRecord(payload);

  if (!body) {
    return [];
  }

  const project = asRecord(body.project);
  // Same host-qualification rule as the GitHub mapper: a bare namespace path
  // would be fingerprinted as a local filesystem path. `web_url` carries the
  // instance's real host, which matters for self-hosted GitLab; the fallback
  // assumes gitlab.com.
  const path = asString(project?.path_with_namespace);
  const repo =
    asString(project?.web_url) ??
    (path ? `https://gitlab.com/${path}` : undefined);

  if (!repo) {
    return [];
  }

  switch (eventName) {
    case "Push Hook":
    case "Tag Push Hook":
      return mapGitlabPush(body, repo, receivedAt);
    case "Merge Request Hook":
      return mapGitlabMergeRequest(body, repo, ownerAccountId, receivedAt);
    case "Release Hook":
      return mapGitlabRelease(body, repo, receivedAt);
    default:
      return [];
  }
}

function mapGitlabPush(
  body: Record<string, unknown>,
  repo: string,
  receivedAt: Date,
): MappedForgeEvent[] {
  const commits = asArray(body.commits);

  /**
   * `total_commits_count` is AUTHORITATIVE and `commits.length` is not: GitLab
   * caps the embedded array at 20 entries, so a 60-commit push that read the
   * array would be recorded as a third of the work it was.
   */
  const commitCount = asNumber(body.total_commits_count) ?? commits.length;

  if (commitCount === 0) {
    return [];
  }

  const lastCommit = asRecord(commits[commits.length - 1]);
  const ref = asString(body.ref);
  const defaultBranch = asString(asRecord(body.project)?.default_branch);
  const pusherEmail = asString(body.user_email);

  /**
   * Email, not username: GitLab's `commits[].author` carries only `name` and
   * `email` — there is no `username` field to reach for, unlike GitHub. It is
   * hashed on arrival like every other counterparty id.
   */
  const counterparties = distinct(
    commits
      .map((commit) => asString(asRecord(asRecord(commit)?.author)?.email))
      .filter(isPresent),
  ).filter((email) => email !== pusherEmail);

  return [
    {
      kind: "commit",
      occurredOn: toDateOnly(lastCommit?.timestamp, receivedAt),
      repo,
      technologies: [],
      actorIsOwner: true,
      counterparties,
      payload: {
        commitCount,
        onDefaultBranch:
          ref !== undefined &&
          defaultBranch !== undefined &&
          ref === `refs/heads/${defaultBranch}`,
      },
    },
  ];
}

function mapGitlabMergeRequest(
  body: Record<string, unknown>,
  repo: string,
  ownerAccountId: string | null,
  receivedAt: Date,
): MappedForgeEvent[] {
  const attributes = asRecord(body.object_attributes);

  if (asString(attributes?.action) !== "merge") {
    return [];
  }

  const actor = asString(asRecord(body.user)?.username);

  return [
    {
      kind: "pull_request_merged",
      // There is no `compare` field and no `merged_at` on every GitLab version;
      // `updated_at` is the timestamp the merge wrote.
      occurredOn: toDateOnly(
        attributes?.updated_at ?? attributes?.created_at,
        receivedAt,
      ),
      repo,
      technologies: [],
      actorIsOwner: ownerAccountId === null || actor === ownerAccountId,
      counterparties: distinct([actor].filter(isPresent)).filter(
        (username) => username !== ownerAccountId,
      ),
      payload: null,
    },
  ];
}

function mapGitlabRelease(
  body: Record<string, unknown>,
  repo: string,
  receivedAt: Date,
): MappedForgeEvent[] {
  if (asString(body.action) !== "create") {
    return [];
  }

  return [
    {
      kind: "release",
      occurredOn: toDateOnly(body.released_at ?? body.created_at, receivedAt),
      repo,
      technologies: [],
      actorIsOwner: true,
      counterparties: [],
      payload: null,
    },
  ];
}

/**
 * The leading `YYYY-MM-DD` of a forge timestamp, or the date the delivery
 * arrived when it has none.
 *
 * A string slice, not a `Date`: parsing "2026-08-14T23:40:00+02:00" into a Date
 * and formatting it back would shift the day by the reader's timezone, which is
 * both wrong and a way for the user's working hours to leak back in through the
 * boundary case.
 */
export function toDateOnly(value: unknown, fallback: Date): string {
  const text = asString(value);
  const match = text?.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) {
    return match[1];
  }

  return fallback.toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}
