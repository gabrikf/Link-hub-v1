import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ExtractorSettings } from "../settings.js";
import {
  cleanupTempRepos,
  commit,
  createTempDir,
  createTempRepo,
  setRemote,
} from "../test-support.js";
import { handleSessionEnd, handleStop } from "./handlers.js";
import { claudeSettingsHooks, claudeSettingsSnippet } from "./settings-snippet.js";
import { Spool } from "./spool.js";

afterAll(cleanupTempRepos);

const CONNECTION_ID = "6b1d0f6e-6a3b-4d05-9d4e-6b0a35f2c8a1";

/** Prose a model wrote about the work — the field that must not travel. */
const AGENT_PROSE =
  "I refactored the AcmeInvoiceService billing pipeline for project-nightingale " +
  "and fixed the rate-limit bug in the customer onboarding flow.";

let repo: string;
let spoolDir: string;

function settings(overrides: Partial<ExtractorSettings> = {}): ExtractorSettings {
  return { connectionId: CONNECTION_ID, ...overrides };
}

function stopPayload(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-abc",
    transcript_path: "/home/someone/.claude/projects/x/transcript.jsonl",
    cwd: repo,
    last_assistant_message: AGENT_PROSE,
    permission_mode: "acceptEdits",
    stop_hook_active: false,
    ...overrides,
  };
}

function spoolFiles(): string[] {
  return existsSync(spoolDir) ? readdirSync(spoolDir) : [];
}

beforeEach(() => {
  repo = createTempRepo("linkhub-hook-repo-");
  setRemote(repo, "git@github.com:acme-corp/project-nightingale.git");
  commit(repo, { files: { "src/a.ts": "1\n" }, date: "2026-04-01" });
  spoolDir = createTempDir("linkhub-hook-spool-");
});

describe("Stop: stop_hook_active", () => {
  it("does nothing at all and writes no file", () => {
    const result = handleStop(stopPayload({ stop_hook_active: true }), {
      settings: settings(),
      spoolDir,
    });

    expect(result.spooled).toBe(false);
    expect(result.reason).toBe("stop_hook_active");
    // Not "an empty spool" — no spool file was created at all. Claude is
    // continuing after this hook already ran; touching anything here is how a
    // hook loop starts.
    expect(spoolFiles()).toEqual([]);
  });
});

describe("Stop: the agent's own prose", () => {
  it("is absent by default", () => {
    const result = handleStop(stopPayload(), { settings: settings(), spoolDir });
    expect(result.spooled).toBe(true);

    const records = new Spool(spoolDir).read();
    expect(records).toHaveLength(1);
    expect(records[0]?.event.payload?.agentSummary).toBeUndefined();

    // The regression guard: scan everything on disk, not just the field.
    const onDisk = readFileSync(join(spoolDir, "events.jsonl"), "utf8");
    expect(onDisk).not.toContain(AGENT_PROSE);
    expect(onDisk).not.toContain("AcmeInvoiceService");
    expect(onDisk).not.toContain("project-nightingale");
    expect(onDisk).not.toContain("acme-corp");
    expect(onDisk).not.toContain(repo);
  });

  it("stays absent when the setting is merely missing or falsy", () => {
    for (const value of [undefined, false, null, 0, "true"] as unknown[]) {
      const dir = createTempDir("linkhub-spool-falsy-");
      handleStop(stopPayload(), {
        settings: settings({ includeAgentSummary: value as boolean }),
        spoolDir: dir,
      });
      const records = new Spool(dir).read();
      expect(records[0]?.event.payload?.agentSummary, String(value)).toBeUndefined();
    }
  });

  it("is included only on an explicit opt-in, and is truncated", () => {
    const long = "x".repeat(500);
    handleStop(stopPayload({ last_assistant_message: long }), {
      settings: settings({ includeAgentSummary: true }),
      spoolDir,
    });

    const summary = new Spool(spoolDir).read()[0]?.event.payload?.agentSummary;
    // 300 is the ceiling `activityPayloadSchema` puts on a payload value.
    expect(summary).toBe("x".repeat(300));
  });
});

describe("Stop: debounce", () => {
  it("spools once, then skips every turn where HEAD has not moved", () => {
    const deps = { settings: settings(), spoolDir };

    expect(handleStop(stopPayload(), deps).spooled).toBe(true);
    // An idle turn: a question answered, some code read, nothing committed.
    expect(handleStop(stopPayload(), deps).reason).toBe("head_unchanged");
    expect(handleStop(stopPayload(), deps).reason).toBe("head_unchanged");
    expect(new Spool(spoolDir).read()).toHaveLength(1);
  });

  it("spools again once work actually lands", () => {
    const deps = { settings: settings(), spoolDir };
    handleStop(stopPayload(), deps);
    expect(handleStop(stopPayload(), deps).spooled).toBe(false);

    commit(repo, { files: { "src/b.py": "1\n" }, date: "2026-04-02" });
    expect(handleStop(stopPayload(), deps).spooled).toBe(true);

    const records = new Spool(spoolDir).read();
    expect(records).toHaveLength(2);
    // The second record credits what landed between the two HEADs.
    expect(records[1]?.event.technologies).toEqual(["python"]);
    expect(records[1]?.event.payload?.commits).toBe(1);
    // Distinct HEADs mean distinct, stable delivery ids.
    expect(records[0]?.event.externalDeliveryId).not.toBe(
      records[1]?.event.externalDeliveryId,
    );
  });

  it("keeps two repositories in one session apart", () => {
    const other = createTempRepo("linkhub-hook-other-");
    setRemote(other, "git@github.com:acme-corp/other.git");
    commit(other, { files: { "main.go": "1\n" } });

    const deps = { settings: settings(), spoolDir };
    handleStop(stopPayload(), deps);
    handleStop(stopPayload({ cwd: other }), deps);

    const records = new Spool(spoolDir).read();
    expect(records).toHaveLength(2);
    expect(records[0]?.event.repoFingerprint).not.toBe(
      records[1]?.event.repoFingerprint,
    );
  });

  it("writes nothing when the tool is not configured", () => {
    const result = handleStop(stopPayload(), { settings: {}, spoolDir });
    expect(result.reason).toBe("no_connection");
    expect(spoolFiles()).toEqual([]);
  });

  it("writes nothing outside a git repository", () => {
    const result = handleStop(stopPayload({ cwd: createTempDir() }), {
      settings: settings(),
      spoolDir,
    });
    expect(result.reason).toBe("not_a_git_repo");
    expect(spoolFiles()).toEqual([]);
  });

  it("records only a date, and only hashes", () => {
    handleStop(stopPayload(), {
      settings: settings(),
      spoolDir,
      today: () => "2026-04-01",
    });
    const event = new Spool(spoolDir).read()[0]?.event;
    expect(event?.kind).toBe("agent_session");
    expect(event?.occurredOn).toBe("2026-04-01");
    expect(event?.repoFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(event?.externalDeliveryId).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("SessionEnd: flushing", () => {
  it("keeps the spool when the upload cannot happen", async () => {
    handleStop(stopPayload(), { settings: settings(), spoolDir });
    expect(new Spool(spoolDir).read()).toHaveLength(1);

    // No token: the common case of installing the hook before minting a PAT.
    const previous = process.env.LINKHUB_API_TOKEN;
    delete process.env.LINKHUB_API_TOKEN;
    try {
      const result = await handleSessionEnd(
        { session_id: "session-abc", cwd: repo, session_end_reason: "exit" },
        { settings: settings(), spoolDir },
      );
      expect(result.flushed).toBe(0);
      expect(result.reason).toBe("no_token");
    } finally {
      if (previous !== undefined) process.env.LINKHUB_API_TOKEN = previous;
    }

    // Nothing lost: the next session that ends successfully carries it.
    expect(new Spool(spoolDir).read()).toHaveLength(1);
  });

  it("is a no-op on an empty spool", async () => {
    const result = await handleSessionEnd(
      { session_id: "session-abc" },
      { settings: settings(), spoolDir },
    );
    expect(result.reason).toBe("empty_spool");
  });
});

describe("the spool file itself", () => {
  it("survives a truncated line rather than wedging behind it", () => {
    handleStop(stopPayload(), { settings: settings(), spoolDir });
    const path = join(spoolDir, "events.jsonl");
    writeFileSync(path, `${readFileSync(path, "utf8")}{"connectionId":"trunc`, "utf8");
    expect(new Spool(spoolDir).read()).toHaveLength(1);
  });

  it("removes only what was delivered", () => {
    const spool = new Spool(spoolDir);
    handleStop(stopPayload(), { settings: settings(), spoolDir });
    commit(repo, { files: { "src/c.rs": "1\n" } });
    handleStop(stopPayload(), { settings: settings(), spoolDir });

    const [first, second] = spool.read();
    spool.removeDelivered(new Set([first!.event.externalDeliveryId]));

    const remaining = spool.read();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.event.externalDeliveryId).toBe(
      second!.event.externalDeliveryId,
    );
  });
});

describe("the settings snippet", () => {
  it("hooks Stop and SessionEnd, and only SessionEnd is async", () => {
    const hooks = claudeSettingsHooks() as {
      hooks: Record<string, Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>>;
    };

    const stop = hooks.hooks.Stop?.[0]?.hooks?.[0];
    const sessionEnd = hooks.hooks.SessionEnd?.[0]?.hooks?.[0];

    expect(stop?.command).toBe("linkhub-hook stop");
    expect(stop?.async).toBeUndefined();

    // SessionEnd hooks share a ~1.5s budget; the network call must not sit in it.
    expect(sessionEnd?.command).toBe("linkhub-hook session-end");
    expect(sessionEnd?.async).toBe(true);

    expect(hooks.hooks.Stop?.[0]?.matcher).toBe("");
    expect(JSON.parse(claudeSettingsSnippet())).toEqual(hooks);
  });

  it("threads a custom command and config path through", () => {
    const snippet = claudeSettingsSnippet({
      command: "/opt/linkhub/bin/linkhub-hook",
      configPath: "/etc/linkhub.json",
    });
    expect(snippet).toContain("/opt/linkhub/bin/linkhub-hook stop --config /etc/linkhub.json");
  });
});

/**
 * The exit-code guarantee, proven the only way that means anything: by running
 * the real executable. Exit code 2 blocks the agent and any other non-zero is a
 * reported error, so every one of these must be 0.
 */
describe("the executable never blocks a session", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const packageRoot = join(here, "..", "..");
  // tsx is hoisted to the monorepo root by npm workspaces.
  const tsx = join(packageRoot, "..", "..", "node_modules", ".bin", "tsx");
  const bin = join(packageRoot, "src", "bin", "linkhub-hook.ts");

  /** A real config file, so the "wrote nothing" assertions are not vacuous. */
  function writeConfig(spool: string): string {
    const dir = createTempDir("linkhub-bin-config-");
    const path = join(dir, "extractor.json");
    writeFileSync(
      path,
      JSON.stringify({ connectionId: CONNECTION_ID, spoolDir: spool }),
      "utf8",
    );
    return path;
  }

  function runHook(args: string[], stdin: string, configPath?: string) {
    const result = spawnSync(tsx, [bin, ...args], {
      input: stdin,
      encoding: "utf8",
      env: {
        ...process.env,
        LINKHUB_EXTRACTOR_CONFIG: configPath ?? "/nonexistent/linkhub.json",
      },
    });
    // A spawn that never started would make every `status === 0` assertion
    // below pass against `null`, which is the opposite of what they claim.
    expect(result.error, String(result.error)).toBeUndefined();
    return result;
  }

  it("exits 0 and writes nothing when stop_hook_active is true", () => {
    const spool = createTempDir("linkhub-bin-spool-");
    const config = writeConfig(spool);

    // Control: the same payload WITHOUT the flag does spool, so the assertion
    // below is about `stop_hook_active` and not about a broken setup.
    const control = runHook(["stop"], JSON.stringify(stopPayload()), config);
    expect(control.status).toBe(0);
    expect(existsSync(join(spool, "events.jsonl"))).toBe(true);

    const blocked = createTempDir("linkhub-bin-spool-blocked-");
    const result = runHook(
      ["stop"],
      JSON.stringify(stopPayload({ stop_hook_active: true })),
      writeConfig(blocked),
    );
    expect(result.status).toBe(0);
    expect(existsSync(join(blocked, "events.jsonl"))).toBe(false);
  });

  it("exits 0 on malformed stdin, an unknown command and no input", () => {
    expect(runHook(["stop"], "this is not json").status).toBe(0);
    expect(runHook(["session-end"], "{").status).toBe(0);
    expect(runHook(["stop"], "").status).toBe(0);
    expect(runHook(["nonsense"], "{}").status).toBe(0);
  });

  it("exits 0 when the API is unreachable, and keeps the spool", () => {
    const spool = createTempDir("linkhub-bin-spool-offline-");
    const config = writeConfig(spool);
    runHook(["stop"], JSON.stringify(stopPayload()), config);
    expect(new Spool(spool).read()).toHaveLength(1);

    const result = spawnSync(
      tsx,
      [bin, "session-end"],
      {
        input: JSON.stringify({ session_id: "session-abc", cwd: repo }),
        encoding: "utf8",
        env: {
          ...process.env,
          LINKHUB_EXTRACTOR_CONFIG: config,
          LINKHUB_API_TOKEN: "lh_pat_definitely_not_valid",
          // Nothing is listening here; this is the offline case.
          LINKHUB_API_URL: "http://127.0.0.1:9",
        },
      },
    );
    expect(result.status).toBe(0);
    // Self-healing: the backlog waits for the next session.
    expect(new Spool(spool).read()).toHaveLength(1);
  });

  it("prints a pasteable settings snippet", () => {
    const result = runHook(["print-settings"], "");
    expect(result.status).toBe(0);
    const json = result.stdout.slice(0, result.stdout.indexOf("\n#"));
    expect(JSON.parse(json)).toEqual(claudeSettingsHooks());
  });
});
