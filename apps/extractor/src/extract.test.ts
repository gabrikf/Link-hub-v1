import { ingestActivitySchemaInput } from "@repo/schemas";
import { afterAll, describe, expect, it } from "vitest";
import { buildEnvelope, extract, resolveAuthors } from "./extract.js";
import {
  cleanupTempRepos,
  commit,
  createBranch,
  createTempRepo,
  setConfig,
  setRemote,
} from "./test-support.js";

afterAll(cleanupTempRepos);

const CONNECTION_ID = "6b1d0f6e-6a3b-4d05-9d4e-6b0a35f2c8a1";

/**
 * Every string a nervous user would grep the payload for. These are planted in
 * the throwaway repository as the remote URL, the branch name, the file paths,
 * the commit messages and the collaborators' addresses — i.e. in every place
 * this tool reads from — and then asserted absent from the serialized output.
 *
 * Scanning the serialized JSON, rather than checking field by field, is the
 * point: a field added later that leaks one of these fails this test without
 * anyone remembering to extend it.
 */
const CONFIDENTIAL = [
  "acme-corp",
  "project-nightingale",
  "AcmeInvoiceService",
  "billing-exploit",
  "feature/nightingale-rollout",
  "bob.smith@acme-corp.com",
  "carol@acme-corp.com",
  "me@acme-corp.com",
  "github.com",
];

function buildConfidentialRepo(): { repo: string; author: string } {
  const repo = createTempRepo("crafthub-acme-");
  setRemote(repo, "git@github.com:acme-corp/project-nightingale.git");
  createBranch(repo, "feature/nightingale-rollout");

  commit(repo, {
    authorEmail: "me@acme-corp.com",
    message: "fix: patch the billing-exploit in project-nightingale",
    date: "2026-03-04",
    coAuthors: ["bob.smith@acme-corp.com", "carol@acme-corp.com"],
    files: {
      "src/billing/AcmeInvoiceService.ts": "export const rate = 1;\n",
      "src/billing/schema.sql": "select 1;\n",
      "package-lock.json": '{"lockfileVersion":3}\n',
      "vendor/acme/legacy.go": "package acme\n",
    },
  });

  commit(repo, {
    authorEmail: "me@acme-corp.com",
    message: "feat: project-nightingale rollout switch",
    date: "2026-03-06",
    files: { "src/rollout.py": "x = 1\n" },
  });

  return { repo, author: "me@acme-corp.com" };
}

describe("the payload never carries a clear-text identity", () => {
  it("contains none of the strings it was built from", () => {
    const { repo, author } = buildConfidentialRepo();
    const { events } = extract([repo], { authors: [author] });
    const envelope = buildEnvelope(CONNECTION_ID, events);

    const serialized = JSON.stringify(envelope);
    for (const secret of CONFIDENTIAL) {
      expect(serialized, `leaked: ${secret}`).not.toContain(secret);
    }
    // The temp directory name is the other half of the repo's identity.
    expect(serialized).not.toContain(repo);
  });

  it("hashes the repo and every collaborator to 64 hex characters", () => {
    const { repo, author } = buildConfidentialRepo();
    const { events } = extract([repo], { authors: [author] });

    expect(events.length).toBe(2);
    for (const event of events) {
      expect(event.repoFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(event.externalDeliveryId).toMatch(/^[0-9a-f]{64}$/);
      for (const fp of event.counterpartyFingerprints ?? []) {
        expect(fp).toMatch(/^[0-9a-f]{64}$/);
      }
      // The clear-text field exists in the schema for callers that cannot
      // hash. This one can, so it must never be populated.
      expect(event.counterparties).toBeUndefined();
    }

    const withCoAuthors = events.find(
      (e) => (e.counterpartyFingerprints ?? []).length > 0,
    );
    expect(withCoAuthors?.counterpartyFingerprints).toHaveLength(2);
  });

  it("records a date and never a time, an hour or an offset", () => {
    const { repo, author } = buildConfidentialRepo();
    const { events } = extract([repo], { authors: [author] });

    for (const event of events) {
      expect(event.occurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(events.map((e) => e.occurredOn)).toEqual(["2026-03-04", "2026-03-06"]);
    // No ISO timestamp, no offset, anywhere in the payload.
    expect(JSON.stringify(events)).not.toMatch(/\d{2}:\d{2}/);
  });

  it("produces an envelope the API's own schema accepts", () => {
    const { repo, author } = buildConfidentialRepo();
    const { events } = extract([repo], { authors: [author] });
    const parsed = ingestActivitySchemaInput.safeParse(
      buildEnvelope(CONNECTION_ID, events),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.source).toBe("extractor");
  });
});

describe("technology inference over real history", () => {
  it("ignores lockfiles and vendored directories in the changeset", () => {
    const { repo, author } = buildConfidentialRepo();
    const { events } = extract([repo], { authors: [author] });

    const first = events[0];
    // The commit touched a lockfile and a vendored .go file alongside real work.
    expect(first?.technologies).toEqual(["sql", "typescript"]);
    expect(first?.technologies).not.toContain("go");
    // The file COUNT still reflects everything that moved; only the technology
    // attribution is filtered.
    expect(first?.payload?.changedFiles).toBe(4);
  });
});

describe("multiple author emails", () => {
  it("matches every address the user commits under, and nobody else's", () => {
    const repo = createTempRepo();
    setRemote(repo, "git@github.com:acme-corp/multi.git");

    commit(repo, {
      authorEmail: "me@work.example",
      date: "2026-01-02",
      files: { "a.ts": "1\n" },
    });
    commit(repo, {
      authorEmail: "me@personal.dev",
      date: "2026-01-03",
      files: { "b.py": "1\n" },
    });
    commit(repo, {
      authorEmail: "ME@Work.Example",
      date: "2026-01-04",
      files: { "c.go": "1\n" },
    });
    commit(repo, {
      authorEmail: "someone-else@acme-corp.com",
      date: "2026-01-05",
      files: { "d.rb": "1\n" },
    });

    const { events, stats } = extract([repo], {
      authors: ["me@work.example", "me@personal.dev"],
    });

    expect(events).toHaveLength(3);
    expect(stats.technologies).toEqual(["go", "python", "typescript"]);
    // The colleague's commit is not the user's to publish.
    expect(stats.technologies).not.toContain("ruby");
  });

  it("does not let git's substring matching claim a similar address", () => {
    const repo = createTempRepo();
    commit(repo, {
      authorEmail: "me@corp.test",
      date: "2026-01-02",
      files: { "a.ts": "1\n" },
    });
    // git's --author is a substring regex, so this would match "me@corp.test"
    // if the exact re-check in readCommits were removed.
    commit(repo, {
      authorEmail: "notme@corp.test",
      date: "2026-01-03",
      files: { "b.py": "1\n" },
    });

    const { events } = extract([repo], { authors: ["me@corp.test"] });
    expect(events).toHaveLength(1);
    expect(events[0]?.technologies).toEqual(["typescript"]);
  });

  it("discovers a different configured email per repository", () => {
    const workRepo = createTempRepo();
    const personalRepo = createTempRepo();
    // The reason people have two addresses in the first place.
    commit(workRepo, { files: { "a.ts": "1\n" } });
    commit(personalRepo, { files: { "b.ts": "1\n" } });
    setConfig(workRepo, "user.email", "me@work.example");
    setConfig(personalRepo, "user.email", "me@personal.dev");

    const authors = resolveAuthors([], undefined, [workRepo, personalRepo]);
    expect(authors.sort()).toEqual(["me@personal.dev", "me@work.example"]);
  });

  it("prefers explicit flags over discovery", () => {
    const repo = createTempRepo();
    commit(repo, { files: { "a.ts": "1\n" } });
    expect(resolveAuthors(["Flag@Example.com"], ["cfg@example.com"], [repo])).toEqual([
      "flag@example.com",
      "cfg@example.com",
    ]);
  });
});

describe("re-running the extractor", () => {
  it("produces byte-identical output, so a repeat upload is a no-op", () => {
    const { repo, author } = buildConfidentialRepo();

    const first = extract([repo], { authors: [author] });
    const second = extract([repo], { authors: [author] });

    expect(second.events.map((e) => e.externalDeliveryId)).toEqual(
      first.events.map((e) => e.externalDeliveryId),
    );
    // Not just the ids: the whole serialized payload, which is what lets a user
    // diff two runs and trust that nothing moved.
    expect(JSON.stringify(buildEnvelope(CONNECTION_ID, second.events))).toBe(
      JSON.stringify(buildEnvelope(CONNECTION_ID, first.events)),
    );
  });

  it("keeps ids stable when new commits are added on top", () => {
    const { repo, author } = buildConfidentialRepo();
    const before = extract([repo], { authors: [author] });

    commit(repo, {
      authorEmail: author,
      date: "2026-03-09",
      files: { "src/extra.rs": "fn main() {}\n" },
    });
    const after = extract([repo], { authors: [author] });

    expect(after.events).toHaveLength(before.events.length + 1);
    // Every previously extracted event keeps its id — the server sees the old
    // ones as duplicates and records only the new one.
    for (const id of before.events.map((e) => e.externalDeliveryId)) {
      expect(after.events.map((e) => e.externalDeliveryId)).toContain(id);
    }
  });

  it("gives the same ids from a second clone at a different path", () => {
    const { repo, author } = buildConfidentialRepo();
    const clone = createTempRepo("crafthub-clone-");
    // A clone of the same work repo on another machine: different path, same
    // remote, so the same repo fingerprint and the same delivery ids.
    setRemote(clone, "git@github.com:acme-corp/project-nightingale.git");
    commit(clone, { files: { "seed.ts": "1\n" } });

    const original = extract([repo], { authors: [author] });
    const fingerprints = new Set(original.events.map((e) => e.repoFingerprint));
    expect(fingerprints.size).toBe(1);

    const cloneRun = extract([clone], { authors: ["default@example.test"] });
    expect(cloneRun.events[0]?.repoFingerprint).toBe([...fingerprints][0]);
  });
});

describe("robustness", () => {
  it("skips paths that are not git repositories instead of failing", () => {
    const { repo, author } = buildConfidentialRepo();
    const { events, stats } = extract([repo, "/definitely/not/a/repo"], {
      authors: [author],
    });
    expect(events.length).toBe(2);
    expect(stats.skippedPaths).toEqual(["/definitely/not/a/repo"]);
  });

  it("returns nothing for a repository with no commits", () => {
    const empty = createTempRepo();
    const { events } = extract([empty], { authors: ["me@example.test"] });
    expect(events).toEqual([]);
  });

  it("refuses to run with no author to match", () => {
    const repo = createTempRepo();
    expect(() => extract([repo], { authors: [] })).toThrow(/author/i);
  });
});
