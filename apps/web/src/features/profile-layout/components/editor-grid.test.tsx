import { describe, expect, it } from "vitest";
import { ensureProcessShim } from "./editor-grid";

/**
 * react-grid-layout bundles react-draggable, whose `log()` reads
 * `process.env.DRAGGABLE_DEBUG` at the start of every drag/resize. In the
 * browser `process` is undefined, so without the shim that read throws and the
 * gesture aborts — the drag/resize silently does nothing. This regression has
 * landed three times, so guard the shim explicitly.
 */
describe("editor-grid process shim", () => {
  it("leaves process.env defined after importing the module", () => {
    // Importing editor-grid runs ensureProcessShim() at module load.
    expect(
      (globalThis as { process?: { env?: unknown } }).process?.env,
    ).toBeDefined();
  });

  it("installs process.env when the runtime has no process global", () => {
    const scope = globalThis as { process?: unknown };
    const original = scope.process;
    try {
      delete scope.process;
      ensureProcessShim();
      expect(
        (globalThis as { process?: { env?: unknown } }).process?.env,
      ).toBeDefined();
    } finally {
      scope.process = original;
    }
  });
});
