// Imported by path, not by the `@repo/schemas` specifier: the package's
// `exports` map declares only an `import` condition, and Playwright's TypeScript
// loader emits CommonJS — so `require("@repo/schemas")` fails with
// ERR_PACKAGE_PATH_NOT_EXPORTED. Reported as a finding rather than patched;
// this file may not touch `packages/**`. Requires `npm run build:schemas`.
import {
  recruiterSearchResponseSchema,
  type RecruiterSearchResponse,
} from "../../packages/schemas/dist/index.js";
import type { Page, Request } from "@playwright/test";
import { ACCOUNTS } from "../support/accounts";
import { expect, recruiterTest } from "../support/fixtures";

/**
 * JOURNEY 3 — a recruiter finds real developers with semantic search + the
 * on-device "AI Match %".
 *
 * READ-ONLY. Nothing here mutates another account's data; the only writes the
 * product makes are its own interaction rows (`POST /interactions`), which are
 * append-only training signal and are what a real recruiter session produces
 * anyway.
 *
 * BUDGET. `POST /resumes/search` is quota-guarded
 * (`AI_QUOTA_RECRUITER_SEARCH_DAILY`, default 30/day/user) and every call costs
 * a query-conversion completion plus an embedding. This file therefore spends
 * exactly THREE real searches on the desktop project (one filled/perf, two for
 * the relevance comparison) and one more on the mobile project via the
 * `@responsive` tag. The loading, empty and error states are driven with
 * `page.route` instead — they are UI states, not retrieval behaviour, and
 * paying an embedding to see a skeleton would put the nightly loop into quota
 * exhaustion inside a week.
 */

const SEARCH_ROUTE = "/dashboard/search";
const SEARCH_ENDPOINT = "**/resumes/search";

/** Search + query conversion + embedding + a cold TF.js model load. */
const SEARCH_TIMEOUT_MS = 60_000;

const REACT_JOB_DESCRIPTION = [
  "Senior Frontend Engineer (React)",
  "",
  "We are hiring a senior frontend engineer to own our customer-facing web app.",
  "You will build and maintain a React + TypeScript single-page application,",
  "extend our design system, and drive testing and accessibility standards.",
  "",
  "Required: 5+ years with React, strong TypeScript, hooks, state management,",
  "component architecture, CSS, unit and end-to-end testing.",
  "Nice to have: Next.js, design systems, web performance work.",
].join("\n");

const GO_SRE_JOB_DESCRIPTION = [
  "Site Reliability Engineer (Go)",
  "",
  "We are hiring an SRE to run our production platform.",
  "You will write Go services and tooling, operate Kubernetes clusters,",
  "manage infrastructure with Terraform, build Prometheus and Grafana",
  "observability, and take part in the on-call rotation.",
  "",
  "Required: Go, Kubernetes, Terraform, Linux, CI/CD pipelines, incident",
  "response and postmortems. Nice to have: AWS, service mesh, eBPF.",
].join("\n");

/**
 * A synthetic result used ONLY by the mocked states. It is parsed through the
 * shared schema at module scope, so the day `recruiterSearchResultSchema`
 * changes shape this file fails at import time instead of quietly mocking a
 * payload the real API can no longer produce.
 */
function mockedResponse(candidateCount: number): RecruiterSearchResponse {
  const candidates = Array.from({ length: candidateCount }, (_, index) => ({
    userId: `00000000-0000-4000-8000-00000000${String(index).padStart(4, "0")}`,
    resumeId: `00000000-0000-4000-8000-00000001${String(index).padStart(4, "0")}`,
    username: ACCOUNTS.developer.login,
    name: `Mocked Candidate ${index + 1}`,
    userPhoto: null,
    profileDescription: null,
    similarity: 0.6 - index * 0.01,
    email: null,
    headlineTitle: "Senior React Engineer",
    summary: "Builds design systems in React and TypeScript.",
    totalYearsExperience: 8,
    location: "Remote",
    seniorityLevel: "senior" as const,
    workModel: "remote" as const,
    contractType: "clt" as const,
    spokenLanguages: ["English"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    skills: ["React", "TypeScript"],
    titles: ["Senior Frontend Engineer"],
    workExperiences: [],
    workEvidence: [],
  }));

  return recruiterSearchResponseSchema.parse({
    input: {
      semanticQuery: "Role: Frontend Engineer\nCore Skills: React, TypeScript",
      filters: {},
    },
    candidates,
  });
}

function jobDescriptionField(page: Page) {
  return page.getByLabel("Who are you looking for?");
}

function submitButton(page: Page) {
  return page.getByRole("button", { name: /search top 50/i });
}

async function runSearch(page: Page, jobDescription: string): Promise<void> {
  await jobDescriptionField(page).fill(jobDescription);
  await submitButton(page).click();
}

/**
 * Open the search route and wait for it to stop moving.
 *
 * NOT cosmetic. On a cold Vite dev server this route pulls in the TensorFlow.js
 * bundle through the reranker worker, and Vite answers a first-ever visit with
 * "new dependencies optimized" followed by a FULL PAGE RELOAD. A submit issued
 * in that window is thrown away with the document and the search request is
 * never sent — which reads exactly like a broken search button. Settling first
 * makes the difference between the first and the second run of this file
 * disappear.
 */
async function openSearchPage(page: Page): Promise<void> {
  await page.goto(SEARCH_ROUTE);
  await page.waitForLoadState("networkidle");
  await expect(submitButton(page)).toBeEnabled();
}

/** The `@username` line under each candidate's name, in rendered order. */
async function visibleUsernames(page: Page): Promise<string[]> {
  const links = page.getByRole("article").getByRole("link");
  const hrefs = await links.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("href") ?? ""),
  );
  return hrefs
    .filter((href) => href.startsWith("/profile/"))
    .map((href) => href.replace("/profile/", ""));
}

/**
 * The AI Match chip renders as `62%` above a `Good match` label inside the
 * card, with no test id and no role of its own — so the number is read back out
 * of the card's own text. Reported as a finding rather than patched: this file
 * may not touch product source.
 */
const MATCH_CHIP = /(\d+)%\s*\n?\s*(Strong|Good|Partial|Weak) match/;

async function visibleMatchScores(page: Page): Promise<number[]> {
  const cards = await page.getByRole("article").allInnerTexts();
  return cards
    .map((text) => MATCH_CHIP.exec(text)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number(value));
}

type RequestLog = {
  /** Every request the page made to the api, as `METHOD /path`. */
  api: string[];
  /** Every request for an on-device model artifact. */
  model: string[];
};

function recordRequests(page: Page): RequestLog {
  const log: RequestLog = { api: [], model: [] };
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.port === "3333") {
      log.api.push(`${request.method()} ${url.pathname}`);
      return;
    }
    if (url.pathname.startsWith("/ai-models/")) {
      log.model.push(url.pathname);
    }
  });
  return log;
}

function countByEndpoint(entries: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return counts;
}

recruiterTest.describe("recruiter semantic search", () => {
  recruiterTest(
    "a pasted job description returns a ranked, scored candidate list @responsive",
    async ({ page, guard }) => {
      recruiterTest.setTimeout(150_000);

      const requests = recordRequests(page);
      let searchStartedAt = 0;
      let searchLatencyMs = 0;
      let capturedBody: unknown = null;

      page.on("request", (request) => {
        if (request.url().includes("/resumes/search")) {
          searchStartedAt = Date.now();
        }
      });

      await openSearchPage(page);

      // The fourth state, before anything is asked for: not "no matches", but
      // "nothing asked yet".
      await expect(
        page.getByText(/no results yet\. write in the chat box/i),
      ).toBeVisible();

      const searchResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/resumes/search") &&
          response.request().method() === "POST",
        { timeout: SEARCH_TIMEOUT_MS },
      );

      await runSearch(page, REACT_JOB_DESCRIPTION);

      const response = await searchResponse;
      searchLatencyMs = Date.now() - searchStartedAt;
      expect(response.status(), "search endpoint status").toBe(200);
      capturedBody = await response.json();

      // The contract, asserted against a payload the running api actually
      // produced — not against a fixture that can drift away from it.
      const parsed = recruiterSearchResponseSchema.parse(capturedBody);
      expect(parsed.candidates.length, "candidates returned by the api").toBeGreaterThan(9);
      expect(parsed.input.semanticQuery.length).toBeGreaterThan(0);

      const results = page.getByRole("article");
      await expect(results.first()).toBeVisible({ timeout: SEARCH_TIMEOUT_MS });
      await expect(
        page.getByText(/\d+ candidates re-ranked locally/),
      ).toBeVisible({ timeout: SEARCH_TIMEOUT_MS });

      const renderedCount = await results.count();
      expect(renderedCount, "candidate cards rendered").toBe(
        parsed.candidates.length,
      );

      // If the on-device model failed, every card shows "—" instead of a
      // percentage. That is a real degradation, not a test-environment quirk,
      // so it fails here rather than being tolerated.
      await expect(
        page.getByRole("status").filter({ hasText: /on-device ranking is unavailable/i }),
        "the reranker degraded — every AI Match % would be missing",
      ).toHaveCount(0);

      const scores = await visibleMatchScores(page);
      expect(scores.length, "cards showing an AI Match %").toBe(renderedCount);
      for (const score of scores) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
      // The worker sorts by aiScore descending, so the list must be monotonic:
      // a top result may never score below one printed under it.
      const sortedDescending = [...scores].sort((a, b) => b - a);
      expect(scores, "AI Match % ordering").toEqual(sortedDescending);

      // ---- performance / cost signals -------------------------------------
      const apiCounts = countByEndpoint(requests.api);
      const searchCalls = apiCounts.get("POST /resumes/search") ?? 0;
      const worstEndpoint = [...apiCounts.entries()].sort((a, b) => b[1] - a[1])[0];

      // Measured, not guessed. These numbers are the point of the perf check and
      // belong in the run log where a nightly regression is readable.
      console.log(
        `[journey-3] search latency ${searchLatencyMs}ms · api requests ${requests.api.length} ` +
          `(${[...apiCounts.entries()].map(([key, value]) => `${key} x${value}`).join(", ")}) ` +
          `· model artifact requests ${requests.model.length} · cards ${renderedCount}`,
      );

      expect(searchCalls, "one user action must fire exactly one search").toBe(1);
      expect(
        requests.api.length,
        `api request storm for one search: ${JSON.stringify([...apiCounts])}`,
      ).toBeLessThan(15);
      expect(
        worstEndpoint?.[1] ?? 0,
        `one endpoint dominated a single search: ${worstEndpoint?.[0]}`,
      ).toBeLessThan(6);
      expect(
        requests.model.length,
        "the model bundle should be fetched once, not per search",
      ).toBeLessThan(12);

      // ---- click through to the candidate ---------------------------------
      const usernames = await visibleUsernames(page);
      expect(usernames.length).toBe(renderedCount);
      const [topUsername] = usernames;
      expect(topUsername, "top candidate username").toBeTruthy();

      await results.first().getByRole("link").first().click();
      await expect(page).toHaveURL(new RegExp(`/profile/${topUsername}$`), {
        timeout: 20_000,
      });
      await expect(page.getByRole("heading").first()).toBeVisible();

      expect(guard.errors, "console errors across the search journey").toEqual([]);
    },
  );

  recruiterTest(
    "a different stack returns a materially different candidate set",
    async ({ page, guard }) => {
      recruiterTest.setTimeout(180_000);

      await openSearchPage(page);

      await runSearch(page, REACT_JOB_DESCRIPTION);
      await expect(page.getByRole("article").first()).toBeVisible({
        timeout: SEARCH_TIMEOUT_MS,
      });
      await expect(page.getByText(/\d+ candidates re-ranked locally/)).toBeVisible({
        timeout: SEARCH_TIMEOUT_MS,
      });
      const reactUsernames = await visibleUsernames(page);

      await runSearch(page, GO_SRE_JOB_DESCRIPTION);
      // The previous list stays on screen while the next search runs, so waiting
      // for "articles exist" would pass instantly on stale results.
      await expect
        .poll(
          async () => {
            const current = await visibleUsernames(page);
            return current[0] === reactUsernames[0] ? "unchanged" : "changed";
          },
          {
            timeout: SEARCH_TIMEOUT_MS,
            message: "the second search never replaced the first result set",
          },
        )
        .toBe("changed");
      const goUsernames = await visibleUsernames(page);

      expect(reactUsernames.length).toBeGreaterThan(9);
      expect(goUsernames.length).toBeGreaterThan(9);

      // The real assertion: not "both were non-empty" but "the ranking moved".
      const reactTop = new Set(reactUsernames.slice(0, 10));
      const goTop = new Set(goUsernames.slice(0, 10));
      const overlap = [...goTop].filter((username) => reactTop.has(username));

      // The evidence behind the relevance assertion, printed so a nightly run
      // shows WHICH people moved, not just that a number changed.
      console.log(
        `[journey-3] relevance · react top10 ${[...reactTop].join(", ")} · ` +
          `go top10 ${[...goTop].join(", ")} · overlap ${overlap.length}`,
      );

      expect(
        overlap.length,
        `the two job descriptions returned the same people (${overlap.join(", ")}) — ` +
          "semantic retrieval is not discriminating between stacks",
      ).toBeLessThanOrEqual(3);

      expect(guard.errors, "console errors across two searches").toEqual([]);
    },
  );

  recruiterTest(
    "the loading state is shown while a search is in flight",
    async ({ page, guard }) => {
      const payload = mockedResponse(2);
      // Held open by the test rather than by a fixed sleep: the request is
      // released the instant the loading assertions are done, so the response
      // is never in flight longer than the state it is there to prove.
      let releaseSearch: () => void = () => {};
      const heldUntilAsserted = new Promise<void>((resolve) => {
        releaseSearch = resolve;
      });

      await page.route(SEARCH_ENDPOINT, async (route) => {
        await heldUntilAsserted;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(payload),
        });
      });

      await openSearchPage(page);
      await runSearch(page, REACT_JOB_DESCRIPTION);

      await expect(page.getByText("Ranking candidates…")).toBeVisible();
      await expect(page.getByRole("button", { name: /processing/i })).toBeVisible();
      // Skeletons are `aria-hidden`, so the only thing a screen reader gets
      // while the list loads is this live region. Asserted by attachment, not
      // visibility — it is `sr-only`.
      await expect(
        page.getByRole("status").filter({ hasText: "Searching candidates" }),
      ).toHaveCount(1);

      releaseSearch();

      await expect(page.getByRole("article").first()).toBeVisible({
        timeout: SEARCH_TIMEOUT_MS,
      });
      await expect(page.getByText("Ranking candidates…")).toHaveCount(0);

      // Chromium reports a transport-layer error for whatever is in flight when
      // the host's network interface changes underneath it. It says nothing
      // about this screen, and holding a request open is exactly the window
      // that catches one — so this ONE class is excluded here and nowhere else.
      const productErrors = guard.errors.filter(
        (message) => !/ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED/.test(message),
      );
      expect(productErrors, "console errors during the loading state").toEqual([]);
    },
  );

  recruiterTest(
    "a search that matches nobody shows the empty state, not the initial one",
    async ({ page, guard }) => {
      const payload = mockedResponse(0);
      await page.route(SEARCH_ENDPOINT, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(payload),
        });
      });

      await openSearchPage(page);
      await expect(
        page.getByText(/no results yet\. write in the chat box/i),
      ).toBeVisible();

      await runSearch(page, "COBOL mainframe engineer, JCL, CICS, VSAM, z/OS");

      await expect(
        page.getByText(/no candidates matched this search/i),
      ).toBeVisible({ timeout: SEARCH_TIMEOUT_MS });
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByText("0 candidates re-ranked locally")).toBeVisible();

      expect(guard.errors, "console errors on the empty state").toEqual([]);
    },
  );

  recruiterTest(
    "a failing search tells the recruiter instead of rendering nothing",
    async ({ page, guard }) => {
      await page.route(SEARCH_ENDPOINT, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal server error" }),
        });
      });

      await openSearchPage(page);
      await runSearch(page, REACT_JOB_DESCRIPTION);

      await expect(page.getByText("Internal server error")).toBeVisible({
        timeout: SEARCH_TIMEOUT_MS,
      });
      // The page must stay usable: the composer keeps the query and the button
      // comes back out of its busy state.
      await expect(submitButton(page)).toBeEnabled();
      await expect(jobDescriptionField(page)).toHaveValue(REACT_JOB_DESCRIPTION);

      // Two console errors are expected and are the mock's own footprint: the
      // browser logs every 500 response, and `reportError` logs in DEV by
      // design. Anything else on this screen is a real fault.
      const expectedFromTheMock = [/\[search\.run\]/, /status of 500/i];
      const unexpected = guard.errors.filter(
        (message) => !expectedFromTheMock.some((pattern) => pattern.test(message)),
      );
      expect(unexpected, "console errors beyond the deliberate 500").toEqual([]);
    },
  );
});
