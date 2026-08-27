import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for `loadConfig()`.
 *
 * The module memoizes into a file-level `cached`, so every test re-imports it
 * through `vi.resetModules()` — otherwise the second test in the file would be
 * asserting against the first one's environment.
 */
async function freshLoadConfig() {
  vi.resetModules();
  return await import("./config.js");
}

const ENV_KEYS = ["LINKHUB_API_URL", "LINKHUB_API_TOKEN"] as const;

describe("loadConfig", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("throws ConfigError naming the env var when the token is missing", async () => {
    const { loadConfig, ConfigError } = await freshLoadConfig();

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(/LINKHUB_API_TOKEN is not set/);
  });

  it("treats a whitespace-only token as missing", async () => {
    process.env.LINKHUB_API_TOKEN = "   ";
    const { loadConfig, ConfigError } = await freshLoadConfig();

    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("defaults the api url to localhost:3333 and trims the token", async () => {
    process.env.LINKHUB_API_TOKEN = "  lh_pat_abc  ";
    const { loadConfig } = await freshLoadConfig();

    expect(loadConfig()).toEqual({
      apiUrl: "http://localhost:3333",
      token: "lh_pat_abc",
    });
  });

  it("strips every trailing slash from the api url", async () => {
    process.env.LINKHUB_API_URL = "  https://api.linkhub.dev///  ";
    process.env.LINKHUB_API_TOKEN = "lh_pat_abc";
    const { loadConfig } = await freshLoadConfig();

    expect(loadConfig().apiUrl).toBe("https://api.linkhub.dev");
  });

  it("memoizes: a later environment change does not reach a second call", async () => {
    process.env.LINKHUB_API_TOKEN = "lh_pat_first";
    const { loadConfig } = await freshLoadConfig();
    const first = loadConfig();

    process.env.LINKHUB_API_TOKEN = "lh_pat_second";

    expect(loadConfig()).toBe(first);
    expect(loadConfig().token).toBe("lh_pat_first");
  });
});
