import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a
      href="#profile"
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
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
    // Search listings never carry an address any more. A card that still reads
    // this field renders (and copies) `null`.
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
    aiScore: 0.82,
    ...overrides,
  } as RankedCandidate;
}

const noop = () => {};

describe("F3 — the contact button no longer reads a listing email", () => {
  it("offers a reveal action even though the candidate carries no email", () => {
    // The old card rendered "Copy Email" and copied `candidate.email`. That
    // field is now always null, so a card wired to it would silently copy
    // nothing. The reveal action must be present and enabled regardless.
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    const button = screen.getByRole("button", { name: /Reveal Email/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("hands the caller the candidate and its rank so the reveal can be attributed", async () => {
    const user = userEvent.setup();
    const onCopyEmail = vi.fn();

    render(
      <SearchResults
        results={[
          makeCandidate({ resumeId: "first" }),
          makeCandidate({ resumeId: "second", username: "grace" }),
        ]}
        isBusy={false}
        hasSearched
        onCopyEmail={onCopyEmail}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: /Reveal Email/i })[1]!,
    );

    expect(onCopyEmail).toHaveBeenCalledTimes(1);
    const [candidate, index] = onCopyEmail.mock.calls[0]!;
    expect(candidate.resumeId).toBe("second");
    // 0-based index; the page turns it into a 1-based rank for the audit row.
    expect(index).toBe(1);
  });

  it("renders no mailto link built from the listing payload", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    const mailtoLinks = screen
      .queryAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("mailto:"));

    expect(mailtoLinks).toHaveLength(0);
  });
});

describe("F20-web — the negative signal has an affordance", () => {
  it("reports a not-relevant candidate exactly once", async () => {
    const user = userEvent.setup();
    const onNotRelevant = vi.fn();

    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
        onNotRelevant={onNotRelevant}
      />,
    );

    const button = screen.getByRole("button", { name: /Not relevant/i });
    await user.click(button);

    expect(onNotRelevant).toHaveBeenCalledTimes(1);
    expect(onNotRelevant.mock.calls[0]![0].resumeId).toBe("resume-1");

    // Disabled afterwards, so one opinion cannot become five rows.
    const marked = screen.getByRole("button", { name: /Marked not relevant/i });
    expect(marked).toBeDisabled();
    await user.click(marked).catch(() => {});
    expect(onNotRelevant).toHaveBeenCalledTimes(1);
  });

  it("reports a profile view when the recruiter opens a candidate", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();

    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
        onViewProfile={onViewProfile}
      />,
    );

    await user.click(screen.getByRole("link", { name: /Ada Lovelace/ }));

    expect(onViewProfile).toHaveBeenCalledTimes(1);
    expect(onViewProfile.mock.calls[0]![1]).toBe(0);
  });
});

describe("F15 — degraded ranking is visible but not blocking", () => {
  it("shows the results and the notice together", () => {
    render(
      <SearchResults
        results={[makeCandidate({ aiScore: null })]}
        isBusy={false}
        hasSearched
        degradedNotice="On-device ranking is unavailable right now."
        onCopyEmail={noop}
      />,
    );

    // Both, not either.
    expect(screen.getByRole("status")).toHaveTextContent(
      "On-device ranking is unavailable right now.",
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText(/No candidates matched/)).not.toBeInTheDocument();
  });

  it("shows no percentage rather than inventing one", () => {
    render(
      <SearchResults
        results={[makeCandidate({ aiScore: null })]}
        isBusy={false}
        hasSearched
        degradedNotice="Ranking unavailable"
        onCopyEmail={noop}
      />,
    );

    expect(screen.getByText("Match unavailable")).toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
    // The raw cosine must not leak out as a stand-in.
    expect(screen.queryByText(/41%|0\.412/)).not.toBeInTheDocument();
  });

  it("renders no notice on a healthy search", () => {
    render(
      <SearchResults
        results={[makeCandidate()]}
        isBusy={false}
        hasSearched
        onCopyEmail={noop}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});
