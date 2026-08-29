import { use, type ReactNode } from "react";
import type { BootResult } from "../lib/app-boot";

/**
 * Holds the app back until `lib/app-boot.ts` has decided who the viewer is and
 * what to render for them.
 *
 * React 19's `use()` rather than a `useState` + `useEffect` pair. The promise is
 * created once at module scope in `main.tsx`, so `use()` simply suspends on it
 * and the `<Suspense fallback>` around this component is the loading state —
 * no state to set, nothing to re-run under StrictMode, and no `setState` in an
 * effect (a lint rule this repo is actively ratcheting down).
 *
 * `bootApp` documents that it never rejects, which is what makes suspending on
 * it safe: a rejection here would propagate to the error boundary and replace
 * the whole app with a failure page.
 */
export function BootGate({
  boot,
  children,
}: {
  boot: Promise<BootResult>;
  children: ReactNode;
}) {
  use(boot);
  return <>{children}</>;
}
