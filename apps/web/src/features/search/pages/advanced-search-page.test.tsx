import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RankedCandidate } from "../types/advanced-search";

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

// The on-device reranker downloads a TF.js bundle; irrelevant to what this file
// asserts, so it hands back the API's own ordering.
vi.mock("../hooks/use-ai-rerank", () => ({
  useAiRerank: () => ({
    rerank: ({ candidates }: { candidates: RankedCandidate[] }) =>
      Promise.resolve({ candidates, degraded: false }),
    warmUp: () => {},
    isModelLoading: false,
  }),
}));

import { AdvancedSearchPage } from "./advanced-search-page";

function makeCandidate(index: number): RankedCandidate {
  return {
    userId: `user-${index}`,
    resumeId: `resume-${index}`,
    username: `dev${index}`,
    name: `Dev ${index}`,
    userPhoto: null,
    profileDescription: null,
    similarity: 0.4,
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
    aiScore: 0.82,
  } as RankedCandidate;
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

async function runSearch(resultCount: number) {
  const user = userEvent.setup();

  searchRecruiterResumes.mockResolvedValue({
    input: {
      semanticQuery: "Senior React frontend engineer with TypeScript",
      filters: {},
    },
    candidates: Array.from({ length: resultCount }, (_, index) =>
      makeCandidate(index),
    ),
  });

  renderPage();

  await user.type(
    screen.getByLabelText(/who are you looking for/i),
    "Senior React frontend engineer with TypeScript",
  );
  await user.click(screen.getByRole("button", { name: /search top 50/i }));

  // Precondition, not the assertion: the results really did land. Without it a
  // missing announcement is indistinguishable from a search that never ran.
  await screen.findByText(`${resultCount} candidates re-ranked locally`);
}

afterEach(() => {
  searchRecruiterResumes.mockReset();
});

/**
 * BUG-20260823-mobile-search-no-feedback.
 *
 * On a 390x844 phone the results land ~1069px below the fold, so a successful
 * search leaves the viewport pixel-identical. Nothing scrolls, nothing takes
 * focus, and the polite live region — which does say "Searching candidates"
 * while the request is in flight — says nothing at all when the results
 * arrive. The recruiter cannot tell success from failure and re-taps, which is
 * a paid embedding + pgvector query + a fresh on-device re-rank per tap.
 *
 * The geometry half cannot be proved here (jsdom has no layout); it belongs to
 * the visual scenario. What is provable at this layer is the two things that
 * cause it: nothing is announced, and nothing takes focus.
 */
describe("AdvancedSearchPage — feedback when a search lands", () => {
  it("announces how many candidates were found", async () => {
    await runSearch(3);

    const announcement = await screen.findByText(/3 candidates found/i);

    expect(announcement).toHaveAttribute("aria-live", "polite");
  });

  it("announces that a search found nobody", async () => {
    await runSearch(0);

    const announcement = await screen.findByText(/no candidates found/i, {
      selector: "[aria-live]",
    });

    expect(announcement).toHaveAttribute("aria-live", "polite");
  });

  it("moves focus to the results so the phone viewport follows them", async () => {
    await runSearch(3);

    expect(
      await screen.findByRole("region", { name: /results/i }),
    ).toHaveFocus();
  });
});
