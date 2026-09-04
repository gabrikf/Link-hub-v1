import { describe, expect, it } from "vitest";
import { repoFingerprintInput } from "../../../core/use-case/activity/shared/repo-fingerprint.js";
import {
  mapGithubDelivery,
  mapGitlabDelivery,
  toDateOnly,
} from "./forge-payload-mapper.js";

const RECEIVED_AT = new Date("2026-08-14T09:00:00.000Z");

describe("mapGithubDelivery", () => {
  const pushPayload = {
    ref: "refs/heads/main",
    repository: {
      full_name: "acme/rocket",
      html_url: "https://github.com/acme/rocket",
      default_branch: "main",
    },
    head_commit: {
      timestamp: "2026-08-13T23:41:07+02:00",
      message: "fix: stop the leak",
      author: { username: "octocat" },
    },
    commits: [
      {
        timestamp: "2026-08-13T22:10:00+02:00",
        message: "wip",
        author: { username: "octocat" },
      },
      {
        timestamp: "2026-08-13T23:41:07+02:00",
        message: "fix: stop the leak",
        author: { username: "collaborator" },
      },
    ],
    sender: { login: "octocat" },
  };

  it("maps a push to a commit event carrying the repo in the clear for hashing", () => {
    const [event] = mapGithubDelivery(
      "push",
      pushPayload,
      "octocat",
      RECEIVED_AT,
    );

    expect(event.kind).toBe("commit");
    expect(event.repo).toBe("https://github.com/acme/rocket");
    expect(event.payload).toEqual({ commitCount: 2, onDefaultBranch: true });
  });

  it("synthesizes a host-qualified repo when the payload has no html_url", () => {
    const bareRepository = {
      full_name: pushPayload.repository.full_name,
      default_branch: pushPayload.repository.default_branch,
    };

    const [event] = mapGithubDelivery(
      "push",
      { ...pushPayload, repository: bareRepository },
      "octocat",
      RECEIVED_AT,
    );

    expect(event.repo).toBe("https://github.com/acme/rocket");
  });

  it("fingerprints a webhook repo identically to the extractor's SSH remote", () => {
    // The parity contract: a repo reported by webhook and the same repo
    // hashed locally from `git@github.com:acme/rocket.git` must land on ONE
    // fingerprint. A bare "acme/rocket" would take the local-path branch of
    // `normalizeRepoIdentity` and resolve against process.cwd().
    const [withUrl] = mapGithubDelivery(
      "push",
      pushPayload,
      "octocat",
      RECEIVED_AT,
    );
    const bareRepository = {
      full_name: pushPayload.repository.full_name,
      default_branch: pushPayload.repository.default_branch,
    };
    const [synthesized] = mapGithubDelivery(
      "push",
      { ...pushPayload, repository: bareRepository },
      "octocat",
      RECEIVED_AT,
    );

    const expected = repoFingerprintInput("git@github.com:acme/rocket.git");
    expect(repoFingerprintInput(withUrl.repo)).toBe(expected);
    expect(repoFingerprintInput(synthesized.repo)).toBe(expected);
  });

  it("derives occurredOn as a DATE, discarding the hour and the offset", () => {
    const [event] = mapGithubDelivery(
      "push",
      pushPayload,
      "octocat",
      RECEIVED_AT,
    );

    expect(event.occurredOn).toBe("2026-08-13");
    expect(JSON.stringify(event)).not.toContain("23:41");
    expect(JSON.stringify(event)).not.toContain("+02:00");
  });

  it("keeps branch names, commit messages and file paths out of the mapped event", () => {
    const [event] = mapGithubDelivery(
      "push",
      pushPayload,
      "octocat",
      RECEIVED_AT,
    );

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("refs/heads/main");
    expect(serialized).not.toContain("stop the leak");
    // `ref` is read only to answer this boolean.
    expect(event.payload).toHaveProperty("onDefaultBranch", true);
  });

  it("reports a non-default branch without naming it", () => {
    const [event] = mapGithubDelivery(
      "push",
      { ...pushPayload, ref: "refs/heads/feat/secret-codename" },
      "octocat",
      RECEIVED_AT,
    );

    expect(event.payload).toHaveProperty("onDefaultBranch", false);
    expect(JSON.stringify(event)).not.toContain("secret-codename");
  });

  it("lists other commit authors as counterparties and excludes the owner", () => {
    const [event] = mapGithubDelivery(
      "push",
      pushPayload,
      "octocat",
      RECEIVED_AT,
    );

    expect(event.counterparties).toEqual(["collaborator"]);
  });

  it("ignores a push with no commits, which is a branch or tag operation", () => {
    expect(
      mapGithubDelivery(
        "push",
        { ...pushPayload, commits: [], head_commit: null },
        "octocat",
        RECEIVED_AT,
      ),
    ).toEqual([]);
  });

  it("maps a merged pull request and ignores one that was merely closed", () => {
    const base = {
      action: "closed",
      repository: { full_name: "acme/rocket" },
      pull_request: {
        merged: true,
        merged_at: "2026-08-12T08:00:00Z",
        title: "Confidential migration",
        user: { login: "octocat" },
        merged_by: { login: "maintainer" },
      },
    };

    const [merged] = mapGithubDelivery(
      "pull_request",
      base,
      "octocat",
      RECEIVED_AT,
    );
    expect(merged.kind).toBe("pull_request_merged");
    expect(merged.occurredOn).toBe("2026-08-12");
    expect(merged.counterparties).toEqual(["maintainer"]);
    expect(JSON.stringify(merged)).not.toContain("Confidential migration");

    expect(
      mapGithubDelivery(
        "pull_request",
        { ...base, pull_request: { ...base.pull_request, merged: false } },
        "octocat",
        RECEIVED_AT,
      ),
    ).toEqual([]);
  });

  it("separates a review the owner gave from one they received", () => {
    const payload = {
      action: "submitted",
      repository: { full_name: "acme/rocket" },
      review: {
        submitted_at: "2026-08-11T10:00:00Z",
        user: { login: "octocat" },
      },
      pull_request: { user: { login: "someone-else" } },
    };

    const [given] = mapGithubDelivery(
      "pull_request_review",
      payload,
      "octocat",
      RECEIVED_AT,
    );
    expect(given.kind).toBe("review_submitted");
    expect(given.actorIsOwner).toBe(true);
    expect(given.counterparties).toEqual(["someone-else"]);

    const [received] = mapGithubDelivery(
      "pull_request_review",
      payload,
      "someone-else",
      RECEIVED_AT,
    );
    expect(received.kind).toBe("review_received");
    expect(received.actorIsOwner).toBe(false);
    expect(received.counterparties).toEqual(["octocat"]);
  });

  it("ignores event types CraftHub does not model", () => {
    expect(
      mapGithubDelivery(
        "issue_comment",
        { repository: { full_name: "acme/rocket" } },
        "octocat",
        RECEIVED_AT,
      ),
    ).toEqual([]);
  });

  it("ignores a payload with no repository identity", () => {
    expect(
      mapGithubDelivery("push", { commits: [] }, null, RECEIVED_AT),
    ).toEqual([]);
    expect(
      mapGithubDelivery("push", "not an object", null, RECEIVED_AT),
    ).toEqual([]);
  });
});

describe("mapGitlabDelivery", () => {
  /** GitLab caps `commits` at 20 entries; `total_commits_count` is the real number. */
  const cappedPush = {
    object_kind: "push",
    ref: "refs/heads/main",
    project: { path_with_namespace: "acme/rocket", default_branch: "main" },
    total_commits_count: 57,
    user_email: "dev@example.com",
    commits: Array.from({ length: 20 }, (_, i) => ({
      timestamp: `2026-08-1${i < 10 ? 0 : 1}T12:00:00+00:00`,
      message: `commit ${i}`,
      author: { name: "Dev", email: "dev@example.com" },
    })),
  };

  it("prefers web_url so self-hosted instances keep their real host, and synthesizes gitlab.com otherwise", () => {
    const [fromUrl] = mapGitlabDelivery(
      "Push Hook",
      {
        ...cappedPush,
        project: {
          ...cappedPush.project,
          web_url: "https://gitlab.example.com/acme/rocket",
        },
      },
      null,
      RECEIVED_AT,
    );
    expect(fromUrl.repo).toBe("https://gitlab.example.com/acme/rocket");

    const [synthesized] = mapGitlabDelivery(
      "Push Hook",
      cappedPush,
      null,
      RECEIVED_AT,
    );
    expect(synthesized.repo).toBe("https://gitlab.com/acme/rocket");
    // Parity with the extractor's clone-URL hashing for the same project.
    expect(repoFingerprintInput(synthesized.repo)).toBe(
      repoFingerprintInput("git@gitlab.com:acme/rocket.git"),
    );
  });

  it("uses total_commits_count, not the capped commits array", () => {
    const [event] = mapGitlabDelivery(
      "Push Hook",
      cappedPush,
      null,
      RECEIVED_AT,
    );

    expect(event.payload).toHaveProperty("commitCount", 57);
    expect(event.payload).not.toHaveProperty("commitCount", 20);
  });

  it("falls back to the array length only when the count is absent", () => {
    const withoutCount = {
      object_kind: cappedPush.object_kind,
      ref: cappedPush.ref,
      project: cappedPush.project,
      user_email: cappedPush.user_email,
      commits: cappedPush.commits,
    };

    const [event] = mapGitlabDelivery(
      "Push Hook",
      withoutCount,
      null,
      RECEIVED_AT,
    );

    expect(event.payload).toHaveProperty("commitCount", 20);
  });

  it("takes counterparties from commit author EMAIL, since GitLab has no username there", () => {
    const [event] = mapGitlabDelivery(
      "Push Hook",
      {
        ...cappedPush,
        commits: [
          {
            timestamp: "2026-08-11T12:00:00+00:00",
            author: { name: "Dev", email: "dev@example.com" },
          },
          {
            timestamp: "2026-08-11T13:00:00+00:00",
            author: { name: "Other", email: "other@example.com" },
          },
        ],
      },
      null,
      RECEIVED_AT,
    );

    // The pusher's own address is not a counterparty; the other author is, and
    // it leaves here in the clear for the use case to fingerprint.
    expect(event.counterparties).toEqual(["other@example.com"]);
  });

  it("maps a merged merge request and ignores other actions", () => {
    const payload = {
      object_kind: "merge_request",
      project: { path_with_namespace: "acme/rocket" },
      user: { username: "dev" },
      object_attributes: {
        action: "merge",
        title: "Internal rework",
        updated_at: "2026-08-10 08:30:00 UTC",
      },
    };

    const [event] = mapGitlabDelivery(
      "Merge Request Hook",
      payload,
      "dev",
      RECEIVED_AT,
    );
    expect(event.kind).toBe("pull_request_merged");
    expect(event.occurredOn).toBe("2026-08-10");
    expect(JSON.stringify(event)).not.toContain("Internal rework");

    expect(
      mapGitlabDelivery(
        "Merge Request Hook",
        { ...payload, object_attributes: { action: "open" } },
        "dev",
        RECEIVED_AT,
      ),
    ).toEqual([]);
  });

  it("ignores event types CraftHub does not model", () => {
    expect(
      mapGitlabDelivery(
        "Note Hook",
        { project: { path_with_namespace: "acme/rocket" } },
        null,
        RECEIVED_AT,
      ),
    ).toEqual([]);
  });
});

describe("toDateOnly", () => {
  it("slices the leading date out of a forge timestamp without parsing it", () => {
    // A Date round trip would shift this to the 14th for readers east of UTC.
    expect(toDateOnly("2026-08-13T23:59:00+02:00", RECEIVED_AT)).toBe(
      "2026-08-13",
    );
  });

  it("falls back to the delivery date when the payload carries no timestamp", () => {
    expect(toDateOnly(undefined, RECEIVED_AT)).toBe("2026-08-14");
    expect(toDateOnly(12345, RECEIVED_AT)).toBe("2026-08-14");
    expect(toDateOnly("yesterday", RECEIVED_AT)).toBe("2026-08-14");
  });
});
