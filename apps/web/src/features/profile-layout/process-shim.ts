/**
 * ROOT-CAUSE FIX for "blocks can't be dragged or resized".
 *
 * react-grid-layout v2 bundles react-draggable, whose internal `log()` helper
 * executes `if (process.env.DRAGGABLE_DEBUG) …` at the START of every drag and
 * resize gesture (DraggableCore.handleDragStart). Vite does not define `process`
 * in the browser, so that line throws `ReferenceError: process is not defined`,
 * which aborts the gesture before it can move anything — the block silently
 * snaps back and nothing happens. It affects BOTH drag and resize because the
 * resize handles use react-draggable too.
 *
 * The proper place to fix this would be Vite's `define`/`optimizeDeps`, but that
 * config is owned by a parallel agent. A minimal `process` shim installed before
 * the grid mounts makes `process.env.DRAGGABLE_DEBUG` evaluate to `undefined`
 * instead of throwing, in both dev and production builds.
 *
 * It lives beside the grid rather than inside `editor-grid.tsx` because a module
 * that exports a component may export nothing else — fast refresh gives up on
 * the whole file otherwise.
 */

/**
 * Install the `process` shim if the runtime doesn't have one (browsers don't).
 * Exported so a unit test can guard that this stays put — the drag/resize bug it
 * fixes has silently regressed three times. Idempotent.
 */
export function ensureProcessShim(): void {
  const globalScope = globalThis as unknown as {
    process?: { env: Record<string, string | undefined> };
  };
  if (typeof globalScope.process === "undefined") {
    globalScope.process = { env: {} };
  }
}
