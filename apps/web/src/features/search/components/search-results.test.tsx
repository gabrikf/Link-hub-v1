import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The card links to a profile route; the router is irrelevant to what we assert,
// so Link becomes a plain anchor.
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
    // Search listings no longer carry an address (F3).
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
    workExperiences: [
      {
        title: "Staff Engineer",
        companyName: "Acme",
        description: "Rebuilt the settlement engine",
        mainStack: ["Node.js", "Kafka"],
        startDate: "2021-01-01",
        endDate: null,
        isCurrent: true,
        employmentType: "full-time",
        workModel: "remote",
      },
    ],
    workEvidence: [],
    aiScore: 0.82,
    ...overrides,
  } as RankedCandidate;
}

const noop = () => {};

describe("SearchResults", () => {
  it("shows a dated work history instead of a bare role list", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("Proof of work")).toBeInTheDocument();
    expect(screen.getByText(/Jan 2021 — Present/)).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Rebuilt the settlement engine")).toBeInTheDocument();
    expect(screen.getByText("Kafka")).toBeInTheDocument();
  });

  it("presents one match signal, not a raw cosine similarity", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.queryByText(/Similarity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.412/)).not.toBeInTheDocument();
  });

  it("collapses a long work history behind a toggle and expands on demand", async () => {
    const user = userEvent.setup();
    const experiences = Array.from({ length: 6 }, (_, index) => ({
      title: `Role ${index}`,
      companyName: `Company ${index}`,
      description: null,
      mainStack: [],
      startDate: "2020-01-01",
      endDate: "2021-01-01",
      isCurrent: false,
      employmentType: null,
      workModel: null,
    }));

    render(
      <SearchResults
        results={[makeCandidate({ workExperiences: experiences })]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("Role 2")).toBeInTheDocument();
    expect(screen.queryByText("Role 5")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show 3 more roles/ }));

    expect(screen.getByText("Role 5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show fewer roles/ }));

    expect(screen.queryByText("Role 5")).not.toBeInTheDocument();
  });

  it("surfaces commit posts as evidence of what the candidate shipped", () => {
    render(
      <SearchResults
        results={[
          makeCandidate({
            workEvidence: [
              {
                id: "post-1",
                title: "Invoice reconciliation worker",
                excerpt: "Shipped across 14 commits",
                source: "commit",
                tags: ["billing"],
                publishedAt: new Date("2024-05-01T12:00:00Z"),
                externalUrl: "https://example.com/commit",
              },
            ],
          }),
        ]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("Shipped work")).toBeInTheDocument();
    expect(screen.getByText("Commit")).toBeInTheDocument();
    expect(
      screen.getByText("Invoice reconciliation worker"),
    ).toBeInTheDocument();
    expect(screen.getByText("Shipped across 14 commits")).toBeInTheDocument();
    expect(screen.getByText("#billing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Source/ })).toHaveAttribute(
      "href",
      "https://example.com/commit",
    );
  });

  it("omits the shipped-work section when there is no evidence", () => {
    render(
      <SearchResults
        results={[makeCandidate({ workEvidence: [] })]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(screen.queryByText("Shipped work")).not.toBeInTheDocument();
  });

  it("renders skeleton cards while a search is in flight", () => {
    const { container } = render(
      <SearchResults
        results={[]}
        isBusy
        hasSearched={false}
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Searching candidates",
    );
    expect(container.querySelectorAll(".anim-sheen").length).toBeGreaterThan(0);
    // The "nothing here yet" copy must not fight the loading state.
    expect(screen.queryByText(/No results yet/)).not.toBeInTheDocument();
  });

  it("shows the pre-search prompt when no search has run yet", () => {
    render(
      <SearchResults
        results={[]}
        isBusy={false}
        hasSearched={false}
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText(/No results yet/)).toBeInTheDocument();
    // A result count for a search that never ran is a lie.
    expect(screen.queryByText(/0 candidates/)).not.toBeInTheDocument();
  });

  it("tells a recruiter their filters were too narrow after a search finds nobody", () => {
    render(
      <SearchResults
        results={[]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    // Must NOT tell someone who just searched to "write in the chat box to start".
    expect(screen.queryByText(/No results yet/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/No candidates matched this search/),
    ).toBeInTheDocument();
    expect(screen.getByText(/removing a mandatory filter/)).toBeInTheDocument();
    expect(screen.getByText("0 candidates re-ranked locally")).toBeInTheDocument();
  });

  it("explains what the match percentage means without relying on a title tooltip", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(
      screen.getByText(/is how much of your search a candidate covers/),
    ).toBeInTheDocument();
  });

  it("does not use the loading sheen on a loaded match badge", () => {
    const { container } = render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    // `anim-sheen` is what Skeleton uses; on settled data it reads as "still loading".
    expect(container.querySelectorAll(".anim-sheen")).toHaveLength(0);
  });

  // The label changed with the PII fix: search listings no longer contain an
  // email at all, so the card asks the server to reveal one rather than copying
  // a field it already has.
  it("requests a contact reveal with the candidate's rank position", async () => {
    const user = userEvent.setup();
    const onCopyEmail = vi.fn();
    const candidate = makeCandidate();

    render(
      <SearchResults
        results={[candidate]}
        isBusy={false}
        hasSearched
        onCopyEmail={onCopyEmail}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Reveal Email/ }));

    expect(onCopyEmail).toHaveBeenCalledWith(candidate, 0);
  });
});
