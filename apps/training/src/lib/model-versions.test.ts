import { describe, expect, it } from "vitest";
import { parseVersionNumber, resolveNextVersion } from "./model-versions.js";

describe("parseVersionNumber", () => {
  it("parses well-formed versions", () => {
    expect(parseVersionNumber("v1")).toBe(1);
    expect(parseVersionNumber(" v42 ")).toBe(42);
  });

  it("rejects anything that is not exactly vN", () => {
    // `parseInt("2-hotfix", 10)` returns 2 — which is how a malformed pointer
    // used to resolve to a directory that already existed.
    expect(parseVersionNumber("v2-hotfix")).toBeNull();
    expect(parseVersionNumber("latest")).toBeNull();
    expect(parseVersionNumber("")).toBeNull();
    expect(parseVersionNumber("v0")).toBeNull();
    expect(parseVersionNumber("v-1")).toBeNull();
  });
});

describe("F32 — resolveNextVersion never overwrites an existing model directory", () => {
  it("advances past the current pointer", () => {
    expect(resolveNextVersion("v3", ["v1", "v2", "v3"]).next).toBe("v4");
  });

  it("advances past every directory on disk, not just the pointer", () => {
    expect(resolveNextVersion("v2", ["v1", "v2", "v3", "v7"]).next).toBe("v8");
  });

  it("does not reuse v2 when the pointer is unparseable", () => {
    // `parseInt(...)` → NaN → `Number.isFinite(NaN)` false → fell back to "v2"
    // and `model.save()` then clobbered the artifact the browser was serving.
    const resolved = resolveNextVersion("corrupted", ["v1", "v2"]);

    expect(resolved.next).toBe("v3");
    expect(["v1", "v2"]).not.toContain(resolved.next);
  });

  it("handles a missing pointer and an empty directory", () => {
    expect(resolveNextVersion(null, []).next).toBe("v2");
    expect(resolveNextVersion(null, []).current).toBe("v1");
  });

  it("ignores non-version directories", () => {
    expect(resolveNextVersion("v1", ["v1", "tmp", ".cache"]).next).toBe("v2");
  });
});
