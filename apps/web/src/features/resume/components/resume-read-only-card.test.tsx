import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResumeReadOnlyCard } from "./resume-read-only-card";

const resume = {
  headlineTitle: "Staff Engineer",
  summary: "Builds things.",
  totalYearsExperience: 9,
  location: "Lisbon",
  seniorityLevel: "staff" as const,
  workModel: "remote" as const,
  contractType: "clt" as const,
  salaryExpectationMin: 100,
  salaryExpectationMax: 200,
  spokenLanguages: ["English"],
  noticePeriod: "30 days",
  openToRelocation: true,
  skills: [],
  titles: [],
};

describe("ResumeReadOnlyCard", () => {
  it("keeps the header and swaps only the body for a skeleton while loading", () => {
    const { container } = render(
      <ResumeReadOnlyCard
        resume={null}
        isLoading
        action={<button type="button">Edit</button>}
      />,
    );

    // The header is real content that is already known — it must not move.
    expect(screen.getByRole("heading", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText("Read-only overview")).toBeInTheDocument();

    // Skeletons are aria-hidden, so the region announces itself separately.
    expect(screen.getByRole("status")).toHaveTextContent("Loading resume");

    // The body mirrors the populated card: 8 meta pills and 3 chip rows.
    expect(container.querySelectorAll(".anim-sheen.rounded-lg")).toHaveLength(8);

    // Neither the empty state nor a live action leaks into the loading state.
    expect(screen.queryByText(/no resume yet/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("renders the real card with no placeholders once loaded", () => {
    const { container } = render(<ResumeReadOnlyCard resume={resume} />);

    expect(screen.getByText("Staff Engineer")).toBeInTheDocument();
    expect(container.querySelectorAll(".anim-sheen")).toHaveLength(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is no resume and nothing is loading", () => {
    render(<ResumeReadOnlyCard resume={null} />);

    expect(screen.getByText(/no resume yet/i)).toBeInTheDocument();
  });
});
