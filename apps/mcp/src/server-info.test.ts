import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SERVER_NAME, SERVER_VERSION } from "./server-info.js";

const packageJson: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), {
    encoding: "utf8",
  }),
);

function readPackageField(field: string): string {
  if (typeof packageJson !== "object" || packageJson === null) {
    throw new Error("package.json did not parse to an object");
  }
  const value = (packageJson as Record<string, unknown>)[field];
  if (typeof value !== "string") {
    throw new Error(`package.json is missing a string "${field}"`);
  }
  return value;
}

describe("server identity", () => {
  // Bumping the package version for a release and forgetting this literal is
  // the whole failure mode: every host would keep reporting the old version.
  it("reports the version npm publishes", () => {
    expect(SERVER_VERSION).toBe(readPackageField("version"));
  });

  // The name users type in `/mcp__crafthub__weekly_update` and see in their
  // client's server list. Renaming the npm package without renaming the server
  // silently breaks every documented invocation.
  it("matches the published binary name", () => {
    expect(`crafthub-mcp`).toBe(readPackageField("name"));
    expect(SERVER_NAME).toBe("crafthub");
  });
});
