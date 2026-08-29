import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ingestActivitySchemaInput } from "@repo/schemas";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "../config.js";
import {
  cleanupTempRepos,
  commit,
  createTempDir,
  createTempRepo,
  setRemote,
} from "../test-support.js";
import { runExtractCli } from "./extract-cli.js";

afterAll(cleanupTempRepos);

const CONNECTION_ID = "6b1d0f6e-6a3b-4d05-9d4e-6b0a35f2c8a1";

let repo: string;
let outDir: string;
let out: string;
let stdout: string[];
let stderr: string[];

/**
 * A `fetch` that fails the test if it is ever called. This is how "extracting
 * never uploads as a side effect" is proven: not by reading the code, but by
 * making any network call at all an error.
 */
function forbidNetwork(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("the extract step must not touch the network");
    }),
  );
}

function respondWith(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const spy = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  repo = createTempRepo("crafthub-cli-repo-");
  setRemote(repo, "git@github.com:acme-corp/project-nightingale.git");
  commit(repo, {
    authorEmail: "me@acme-corp.com",
    message: "feat: nightingale billing",
    date: "2026-05-01",
    files: { "src/a.ts": "1\n", "package-lock.json": "{}\n" },
  });

  outDir = createTempDir("crafthub-cli-out-");
  out = join(outDir, "activity.json");

  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void stdout.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void stderr.push(a.join(" ")));

  resetConfigCache();
  process.env.CRAFTHUB_EXTRACTOR_CONFIG = "/nonexistent/crafthub.json";
  delete process.env.CRAFTHUB_CONNECTION_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CRAFTHUB_API_TOKEN;
  delete process.env.CRAFTHUB_API_URL;
  delete process.env.CRAFTHUB_EXTRACTOR_CONFIG;
  resetConfigCache();
});

describe("extract stops at review", () => {
  it("writes a pretty-printed file, says nothing was uploaded, and makes no request", async () => {
    forbidNetwork();

    const code = await runExtractCli([
      repo,
      "--author",
      "me@acme-corp.com",
      "--connection",
      CONNECTION_ID,
      "--out",
      out,
      // The pinned commit date is outside the default 90-day window.
      "--since",
      "2020-01-01",
    ]);

    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);

    const raw = readFileSync(out, "utf8");
    // Pretty-printed, because the user is invited to open it.
    expect(raw).toContain("\n  ");
    expect(raw.split("\n").length).toBeGreaterThan(10);

    // It is byte-for-byte a valid request body.
    const parsed = ingestActivitySchemaInput.safeParse(JSON.parse(raw));
    expect(parsed.success).toBe(true);

    const printed = stdout.join("\n");
    expect(printed).toContain("NOTHING HAS BEEN UPLOADED");
    expect(printed).toContain("2026-05-01");
    expect(printed).toContain("typescript");
    expect(printed).toContain(out);
    // The summary tells a nervous reader what is NOT in the file.
    expect(printed).toContain("commit messages");
    expect(printed).toContain("timezone offsets");
    expect(printed).toContain("crafthub-extract upload");

    // The summary is a review aid, so it must not leak what the file does not.
    expect(printed).not.toContain("nightingale");
    expect(printed).not.toContain("acme-corp");
  });

  it("does not need a token", async () => {
    forbidNetwork();
    delete process.env.CRAFTHUB_API_TOKEN;

    const code = await runExtractCli([
      repo,
      "-a",
      "me@acme-corp.com",
      "--connection",
      CONNECTION_ID,
      "-o",
      out,
      "--since",
      "2020-01-01",
    ]);
    expect(code).toBe(0);
    expect(stderr.join("\n")).toBe("");
  });

  it("refuses to run without a connection id, before writing anything", async () => {
    forbidNetwork();
    const code = await runExtractCli([
      repo,
      "-a",
      "me@acme-corp.com",
      "-o",
      out,
      "--since",
      "2020-01-01",
    ]);
    expect(code).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(stderr.join("\n")).toContain("connection");
  });
});

describe("upload is a separate, explicit action", () => {
  async function extractFirst(): Promise<void> {
    forbidNetwork();
    await runExtractCli([
      repo,
      "-a",
      "me@acme-corp.com",
      "--connection",
      CONNECTION_ID,
      "-o",
      out,
      "--since",
      "2020-01-01",
    ]);
    vi.unstubAllGlobals();
  }

  it("posts the reviewed file to /me/activity with a bearer token", async () => {
    await extractFirst();
    const fetchSpy = respondWith(200, { recorded: 1, duplicates: 0 });
    process.env.CRAFTHUB_API_TOKEN = "lh_pat_test";
    process.env.CRAFTHUB_API_URL = "https://api.example.test";

    expect(await runExtractCli(["upload", out])).toBe(0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/me/activity");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer lh_pat_test",
    );

    const body = JSON.parse(init.body as string);
    expect(body.source).toBe("extractor");
    expect(body.connectionId).toBe(CONNECTION_ID);
    // What is sent is exactly what was reviewed.
    expect(body.events).toEqual(JSON.parse(readFileSync(out, "utf8")).events);
    expect(stdout.join("\n")).toContain("1 recorded");
  });

  it("uploads after extracting only when --yes is passed", async () => {
    const fetchSpy = respondWith(200, { recorded: 1, duplicates: 0 });
    process.env.CRAFTHUB_API_TOKEN = "lh_pat_test";

    await runExtractCli([
      repo,
      "-a",
      "me@acme-corp.com",
      "--connection",
      CONNECTION_ID,
      "-o",
      out,
      "--since",
      "2020-01-01",
      "--yes",
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(stdout.join("\n")).toContain("review step is being skipped");
  });

  it("explains a 403 in terms of the scope that is missing", async () => {
    await extractFirst();
    respondWith(403, { message: "forbidden" });
    process.env.CRAFTHUB_API_TOKEN = "lh_pat_test";

    expect(await runExtractCli(["upload", out])).toBe(1);
    const message = stderr.join("\n");
    expect(message).toContain("activity:write");
    expect(message).toContain("Settings");
    expect(message).toContain("Nothing was uploaded");
  });

  it("explains a 401 as an expired token", async () => {
    await extractFirst();
    respondWith(401, {});
    process.env.CRAFTHUB_API_TOKEN = "lh_pat_test";

    expect(await runExtractCli(["upload", out])).toBe(1);
    expect(stderr.join("\n")).toContain("Personal Access Token");
  });

  it("asks for a token rather than failing obscurely", async () => {
    await extractFirst();
    delete process.env.CRAFTHUB_API_TOKEN;

    expect(await runExtractCli(["upload", out])).toBe(1);
    expect(stderr.join("\n")).toContain("CRAFTHUB_API_TOKEN");
  });

  it("rejects a hand-edited file that is no longer valid", async () => {
    await extractFirst();
    const edited = JSON.parse(readFileSync(out, "utf8"));
    // Someone pastes a repo name back in where a fingerprint belongs.
    edited.events[0].repoFingerprint = "acme-corp/project-nightingale";
    writeFileSync(out, JSON.stringify(edited), "utf8");
    process.env.CRAFTHUB_API_TOKEN = "lh_pat_test";
    const fetchSpy = respondWith(200, { recorded: 0, duplicates: 0 });

    expect(await runExtractCli(["upload", out])).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("hex sha-256");
  });
});
