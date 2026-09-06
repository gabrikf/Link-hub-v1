import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Route splitting is a bundle-size contract, and the only way to break it is
 * silent: import a page component at the top of `router.tsx` and pass it
 * straight to `component:`. Everything still works. Every test still passes.
 * The entry chunk just quietly grows by whatever that page drags in, and the
 * public `/profile/$username` page — shareable, mobile-heavy, the one route
 * that needs none of the dashboard's dependencies — pays for it.
 *
 * That is how the entry bundle got to 996 kB / 295 kB gzip before splitting
 * took it to 336 kB / 108 kB gzip. `apps/web/AGENTS.md` states the rule; this
 * is the same rule as a check, so it cannot be forgotten in review.
 *
 * `App` is the deliberate exception: it is the root layout, present on every
 * route by definition, so lazy-loading it would split nothing.
 */
// jsdom does not give this module a file: URL, so resolve from the workspace
// root vitest already runs in rather than from import.meta.
const ROUTER_SOURCE = readFileSync(resolve(process.cwd(), "src/router.tsx"), "utf8");

/** Every `component:` value in the file, with the line it sits on. */
function componentAssignments(source: string) {
  return source
    .split("\n")
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((entry) => entry.text.startsWith("component:"))
    .map((entry) => ({ ...entry, value: entry.text.slice("component:".length).trim() }));
}

describe("router.tsx route splitting", () => {
  it("gives every route component except the root layout to lazyRouteComponent", () => {
    const eager = componentAssignments(ROUTER_SOURCE).filter(
      (entry) => !entry.value.startsWith("lazyRouteComponent") && entry.value !== "App,",
    );

    expect(
      eager.map((entry) => `router.tsx:${entry.line}  component: ${entry.value}`),
    ).toEqual([]);
  });

  it("has at least one lazy route, so the check cannot pass by finding nothing", () => {
    expect(ROUTER_SOURCE.match(/component:\s*lazyRouteComponent/g)?.length ?? 0).toBeGreaterThan(5);
  });

  it("fails when a page component is assigned eagerly", () => {
    const sabotaged = ROUTER_SOURCE.replace(
      /component: lazyRouteComponent\(/,
      "component: DashboardPage, // (",
    );
    const eager = componentAssignments(sabotaged).filter(
      (entry) => !entry.value.startsWith("lazyRouteComponent") && entry.value !== "App,",
    );

    expect(eager.length).toBeGreaterThan(0);
  });
});
