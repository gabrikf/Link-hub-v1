import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHARACTERIZATION suite for `loadConfig()`.
 *
 * `loadConfig` memoizes into a module-level `cached`, so every test needs a
 * fresh copy of the module: `vi.resetModules()` + a dynamic `import()`.
 */

type ConfigModule = typeof import("./config.js");

async function freshModule(): Promise<ConfigModule> {
  vi.resetModules();
  return import("./config.js");
}

const ORIGINAL_URL = process.env.LINKHUB_API_URL;
const ORIGINAL_TOKEN = process.env.LINKHUB_API_TOKEN;

beforeEach(() => {
  delete process.env.LINKHUB_API_URL;
  delete process.env.LINKHUB_API_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.LINKHUB_API_URL;
  else process.env.LINKHUB_API_URL = ORIGINAL_URL;
  if (ORIGINAL_TOKEN === undefined) delete process.env.LINKHUB_API_TOKEN;
  else process.env.LINKHUB_API_TOKEN = ORIGINAL_TOKEN;
});

describe("api url", () => {
  it("defaults to the local api port when LINKHUB_API_URL is unset", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    const { loadConfig } = await freshModule();

    expect(loadConfig().apiUrl).toBe("http://localhost:3333");
  });

  it("strips every trailing slash", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    process.env.LINKHUB_API_URL = "https://api.linkhub.dev///";
    const { loadConfig } = await freshModule();

    expect(loadConfig().apiUrl).toBe("https://api.linkhub.dev");
  });

  it("trims surrounding whitespace before stripping slashes", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    process.env.LINKHUB_API_URL = "  https://api.linkhub.dev/  ";
    const { loadConfig } = await freshModule();

    expect(loadConfig().apiUrl).toBe("https://api.linkhub.dev");
  });

  it("keeps a path prefix on the base URL", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    process.env.LINKHUB_API_URL = "https://linkhub.dev/api/";
    const { loadConfig } = await freshModule();

    expect(loadConfig().apiUrl).toBe("https://linkhub.dev/api");
  });

  it("accepts an empty LINKHUB_API_URL as an empty base URL", async () => {
    // CHARACTERIZATION: `??` only falls back on null/undefined, so an env entry
    // explicitly set to "" (common in a hand-written MCP client config JSON)
    // does NOT get the default — apiUrl becomes "" and every request becomes a
    // relative URL that fetch rejects. The resulting transport error does name
    // LINKHUB_API_URL, which keeps this below the bug bar.
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    process.env.LINKHUB_API_URL = "";
    const { loadConfig } = await freshModule();

    expect(loadConfig().apiUrl).toBe("");
  });
});

describe("token", () => {
  it("throws an actionable ConfigError when the PAT is missing", async () => {
    const { loadConfig, ConfigError } = await freshModule();

    expect(() => loadConfig()).toThrow(ConfigError);
    try {
      loadConfig();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("LINKHUB_API_TOKEN is not set");
      expect(message).toContain("lh_pat_");
      expect(message).toContain("Settings → Personal Access Tokens");
      expect((err as Error).name).toBe("ConfigError");
    }
  });

  it("treats a whitespace-only PAT as missing", async () => {
    process.env.LINKHUB_API_TOKEN = "   \t \n ";
    const { loadConfig, ConfigError } = await freshModule();

    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("treats an empty PAT as missing", async () => {
    process.env.LINKHUB_API_TOKEN = "";
    const { loadConfig, ConfigError } = await freshModule();

    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("trims a pasted PAT that carries surrounding whitespace", async () => {
    process.env.LINKHUB_API_TOKEN = "  lh_pat_abc123\n";
    const { loadConfig } = await freshModule();

    expect(loadConfig().token).toBe("lh_pat_abc123");
  });

  it("does not validate the token's shape", async () => {
    // CHARACTERIZATION: any non-blank string is accepted; a wrong token is only
    // discovered as a 401 on the first call. That 401 has its own clear
    // message, so this is deliberate rather than a defect.
    process.env.LINKHUB_API_TOKEN = "not-a-pat-at-all";
    const { loadConfig } = await freshModule();

    expect(loadConfig().token).toBe("not-a-pat-at-all");
  });
});

describe("memoization", () => {
  it("returns the identical object on a second call", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    const { loadConfig } = await freshModule();

    expect(loadConfig()).toBe(loadConfig());
  });

  it("ignores env changes made after the first successful call", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_first";
    process.env.LINKHUB_API_URL = "http://first.example";
    const { loadConfig } = await freshModule();

    const first = loadConfig();

    process.env.LINKHUB_API_TOKEN = "lh_pat_second";
    process.env.LINKHUB_API_URL = "http://second.example";

    expect(loadConfig()).toEqual({
      apiUrl: "http://first.example",
      token: "lh_pat_first",
    });
    expect(loadConfig()).toBe(first);
  });

  it("does not memoize the failure — a later call can still succeed", async () => {
    const { loadConfig, ConfigError } = await freshModule();

    expect(() => loadConfig()).toThrow(ConfigError);

    process.env.LINKHUB_API_TOKEN = "lh_pat_late";
    expect(loadConfig().token).toBe("lh_pat_late");
  });

  it("gives a genuinely fresh module per resetModules, so tests do not bleed", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_one";
    const first = await freshModule();
    expect(first.loadConfig().token).toBe("lh_pat_one");

    process.env.LINKHUB_API_TOKEN = "lh_pat_two";
    const second = await freshModule();
    expect(second.loadConfig().token).toBe("lh_pat_two");
  });
});
