import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecruiterSearchResult } from "@repo/schemas";

/**
 * BUG: "AI Match %" heats up and freezes phones.
 *
 * The cost this file guards is the DOWNLOAD, not the scoring. Instantiating the
 * worker is what pulls ~1.39 MB of TensorFlow plus the model weights and starts
 * a TF init on the device, so "load it and then skip the maths" would still
 * cost a recruiter on a phone everything the setting is meant to save.
 *
 * Every assertion below therefore watches the WORKER FACTORY. `use-ai-rerank`
 * is deliberately NOT mocked here — the real hook runs, so the gate is proved
 * where it actually has to hold.
 */
class FakeWorker {
  private listeners = new Map<string, Set<(event: unknown) => void>>();
  behaviour: "success" | "worker-error" = "success";

  addEventListener(type: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  postMessage(message: { payload: { candidates: RecruiterSearchResult[] } }) {
    queueMicrotask(() => {
      if (this.behaviour === "worker-error") {
        this.emit("error", new Event("error"));
        return;
      }

      this.emit("message", {
        data: {
          type: "RERANK_RESULT",
          payload: {
            candidates: message.payload.candidates.map((candidate, index) => ({
              ...candidate,
              aiScore: 0.9 - index * 0.1,
            })),
          },
        },
      });
    });
  }
}

const worker = new FakeWorker();
/** The sensor. Called at all ⇒ the model download started. */
const getRerankerWorker = vi.fn(() => worker);

vi.mock("../../../lib/reranker-worker-singleton", () => ({
  getRerankerWorker: () => getRerankerWorker(),
  terminateRerankerWorker: () => {},
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../../lib/auth-tokens", () => ({
  getAuthTokens: () => ({ accessToken: "x", refreshToken: "y" }),
}));

const searchRecruiterResumes = vi.fn();
vi.mock("../../../lib/auth-api", () => ({
  searchRecruiterResumes: (input: unknown) => searchRecruiterResumes(input),
  revealCandidateContact: vi.fn(),
  trackInteraction: vi.fn(() => Promise.resolve()),
}));

const { AdvancedSearchPage } = await import("./advanced-search-page");

const STORAGE_KEY = "crafthub-ai-match";

/** Makes `matchMedia` answer the pointer-capability query one way or the other. */
function installDevice(isTouchFirst: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: isTouchFirst,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

function makeCandidate(index: number): RecruiterSearchResult {
  return {
    userId: `user-${index}`,
    resumeId: `resume-${index}`,
    username: `dev${index}`,
    name: `Dev ${index}`,
    userPhoto: null,
    profileDescription: null,
    similarity: 0.5 - index * 0.01,
    email: null,
    headlineTitle: "Senior React Engineer",
    summary: "Builds design systems",
    totalYearsExperience: 7,
    location: "Lisbon",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    spokenLanguages: ["English"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    skills: ["React"],
    titles: ["Frontend Engineer"],
    workExperiences: [],
    workEvidence: [],
  } as RecruiterSearchResult;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdvancedSearchPage />
    </QueryClientProvider>,
  );
}

async function runSearch(candidateCount = 3) {
  const user = userEvent.setup();

  searchRecruiterResumes.mockResolvedValue({
    input: {
      semanticQuery: "Senior React frontend engineer with TypeScript",
      filters: {},
    },
    candidates: Array.from({ length: candidateCount }, (_, index) =>
      makeCandidate(index),
    ),
  });

  renderPage();

  await user.type(
    screen.getByLabelText(/who are you looking for/i),
    "Senior React frontend engineer with TypeScript",
  );
  await user.click(screen.getByRole("button", { name: /search top 50/i }));

  return user;
}

beforeEach(() => {
  window.localStorage.clear();
  worker.behaviour = "success";
  getRerankerWorker.mockClear();
  searchRecruiterResumes.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI Match is off by default on a phone", () => {
  beforeEach(() => {
    installDevice(true);
  });

  it("never instantiates the worker, so the model is never downloaded", async () => {
    await runSearch();

    await screen.findByText("3 candidates in search order");

    // The whole ticket in one assertion: no worker, no 1.39 MB download, no
    // TF.js init, nothing for the phone to heat up over.
    expect(getRerankerWorker).not.toHaveBeenCalled();
  });

  it("still renders every candidate the API returned", async () => {
    await runSearch();

    expect(await screen.findByText("Dev 0")).toBeInTheDocument();
    expect(screen.getByText("Dev 2")).toBeInTheDocument();
  });

  it("shows no failure notice — off by choice is not a fault", async () => {
    await runSearch();
    await screen.findByText("3 candidates in search order");

    expect(
      screen.queryByText(/On-device ranking is unavailable/i),
    ).not.toBeInTheDocument();
    // The degraded notice is the only `role="status"` in the results region.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains the state instead of printing a broken match badge", async () => {
    await runSearch();
    await screen.findByText("3 candidates in search order");

    expect(screen.getByText(/AI Match is off/i)).toBeInTheDocument();
    // "Match unavailable" is what a FAILED rerank says. Reusing it here would
    // tell a recruiter something is broken when nothing is.
    expect(screen.queryByText("Match unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("turns on when the recruiter asks, and remembers the choice", async () => {
    const user = await runSearch();
    await screen.findByText("3 candidates in search order");

    await user.click(screen.getByRole("switch", { name: /AI Match/i }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("on");
    // Flipping it on warms the model up immediately, exactly as the desktop
    // page has always done on mount.
    expect(getRerankerWorker).toHaveBeenCalled();
  });

  it("warns that running it on a phone can heat and slow the device", async () => {
    await runSearch();

    expect(
      await screen.findByText(/heat up and stop responding/i),
    ).toBeInTheDocument();
  });

  it("respects a stored 'on' over the device default", async () => {
    window.localStorage.setItem(STORAGE_KEY, "on");

    await runSearch();

    expect(await screen.findByText("3 candidates re-ranked locally")).
      toBeInTheDocument();
    expect(getRerankerWorker).toHaveBeenCalled();
  });
});

describe("AI Match is on by default on a desktop — no regression", () => {
  beforeEach(() => {
    installDevice(false);
  });

  it("warms the worker up on mount, before any search is run", () => {
    renderPage();

    expect(getRerankerWorker).toHaveBeenCalled();
  });

  it("re-ranks and shows a match percentage", async () => {
    await runSearch();

    expect(
      await screen.findByText("3 candidates re-ranked locally"),
    ).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.queryByText(/AI Match is off/i)).not.toBeInTheDocument();
  });

  it("respects a stored 'off' over the device default", async () => {
    window.localStorage.setItem(STORAGE_KEY, "off");

    await runSearch();

    expect(
      await screen.findByText("3 candidates in search order"),
    ).toBeInTheDocument();
    expect(getRerankerWorker).not.toHaveBeenCalled();
  });

  it("still shows the degraded notice when the worker genuinely fails", async () => {
    worker.behaviour = "worker-error";

    await runSearch();

    // A real fault must keep reading as a fault. This is the case the
    // off-by-choice state must never be confused with.
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/On-device ranking is unavailable/i);
    expect(screen.getAllByText("Match unavailable")).toHaveLength(3);
    expect(screen.queryByText(/AI Match is off/i)).not.toBeInTheDocument();
  });
});
