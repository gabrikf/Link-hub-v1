import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { SearchResults } from "./search-results";
import type { RankedCandidate } from "../types/advanced-search";

function makeCandidate(
  overrides: Partial<RankedCandidate> = {},
): RankedCandidate {
  return {
    userId: "user-1",
    resumeId: "resume-1",
    username: "ada",
    name: "Ada Lovelace",
    userPhoto: null,
    profileDescription: null,
    similarity: 0.412,
    email: null,
    headlineTitle: "Backend Engineer",
    summary: "Payments specialist",
    totalYearsExperience: 8,
    location: "Lisbon",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    spokenLanguages: ["English"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    skills: ["Node.js"],
    titles: ["Backend Engineer"],
    workExperiences: [],
    workEvidence: [],
    aiScore: null,
    ...overrides,
  } as RankedCandidate;
}

const noop = () => {};

/**
 * Off-by-choice and degraded-by-failure produce an identical candidate list
 * with `aiScore: null`. They are not the same state, and the screen must not
 * describe them the same way: one is a setting the recruiter can flip, the
 * other is a fault they can do nothing about.
 */
describe("SearchResults — AI Match switched off", () => {
  it("keeps the results and says so without a warning", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        isAiMatchOn={false}
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/AI Match is off/i)).toBeInTheDocument();
    // The degraded notice is the region's only `role="status"`.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not claim the candidates were re-ranked locally", () => {
    render(
      <SearchResults
        results={[makeCandidate(), makeCandidate({ resumeId: "resume-2" })]}
        isBusy={false}
        hasSearched
        isAiMatchOn={false}
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("2 candidates in search order")).toBeInTheDocument();
    expect(
      screen.queryByText(/re-ranked locally/i),
    ).not.toBeInTheDocument();
  });

  it("drops the match badge and its explainer rather than showing an empty one", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        isAiMatchOn={false}
        onCopyEmail={noop}
      />,
    );

    expect(screen.queryByText("Match unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    // Explaining a percentage that is not on screen is noise.
    expect(
      screen.queryByText(/is how much of your search a candidate covers/),
    ).not.toBeInTheDocument();
  });

  it("says nothing about ranking before the first search", () => {
    render(
      <SearchResults
        results={[]}
        isBusy={false}
        hasSearched={false}
        isAiMatchOn={false}
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("Ordered by the search engine")).toBeInTheDocument();
    expect(
      screen.queryByText("Re-ranked on your device"),
    ).not.toBeInTheDocument();
  });

  it("still shows the degraded warning when a failure is passed alongside", () => {
    // A recruiter who has AI Match ON and hits a broken model gets the warning;
    // this asserts the two notices never trade places.
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        degradedNotice="On-device ranking is unavailable right now."
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "On-device ranking is unavailable right now.",
    );
    expect(screen.queryByText(/AI Match is off/i)).not.toBeInTheDocument();
    expect(screen.getByText("Match unavailable")).toBeInTheDocument();
  });
});
