import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const makeSkills = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `skill-id-${index + 1}`,
    resumeId: "resume-1",
    skillId: `skill-${index + 1}`,
    skillName: `skill-${index + 1}`,
    yearsExperience: null,
    displayOrder: index,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }));

const renderWithSkills = (count: number) =>
  render(<ResumeReadOnlyCard resume={{ ...resume, skills: makeSkills(count) }} />);

/** Every rendered skill chip, matched by its own name rather than a testid. */
const skillChips = () => screen.queryAllByText(/^skill-\d+$/);

describe("ResumeReadOnlyCard — collapsed skills", () => {
  it("shows five skills and a control for the rest", () => {
    renderWithSkills(40);

    expect(skillChips()).toHaveLength(5);
    // 40 - 5. Counted, not written into the fixture.
    expect(screen.getByRole("button", { name: /\+35/ })).toBeInTheDocument();
  });

  it("reads +1 with exactly six skills", () => {
    renderWithSkills(6);

    expect(skillChips()).toHaveLength(5);
    expect(screen.getByRole("button", { name: /\+1\b/ })).toBeInTheDocument();
  });

  it("renders no control at all when nothing is hidden", () => {
    renderWithSkills(5);

    expect(skillChips()).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /\+/ })).not.toBeInTheDocument();
  });

  it("expands to every skill and collapses again on click", async () => {
    const user = userEvent.setup();
    renderWithSkills(40);

    const control = screen.getByRole("button", { name: /\+35/ });
    expect(control).toHaveAttribute("aria-expanded", "false");

    await user.click(control);

    expect(skillChips()).toHaveLength(40);
    const collapseControl = screen.getByRole("button", { name: "Show less" });
    expect(collapseControl).toHaveAttribute("aria-expanded", "true");

    await user.click(collapseControl);

    expect(skillChips()).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: /\+35/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("is reachable by Tab and activates on Enter", async () => {
    const user = userEvent.setup();
    renderWithSkills(40);

    await user.tab();

    expect(screen.getByRole("button", { name: /\+35/ })).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(skillChips()).toHaveLength(40);
  });

  it("activates on Space", async () => {
    const user = userEvent.setup();
    renderWithSkills(40);

    screen.getByRole("button", { name: /\+35/ }).focus();
    await user.keyboard(" ");

    expect(skillChips()).toHaveLength(40);
  });

  it("leaves a short titles list alone", () => {
    render(
      <ResumeReadOnlyCard
        resume={{
          ...resume,
          titles: [
            {
              id: "title-1",
              resumeId: "resume-1",
              titleId: "t-1",
              titleName: "Staff Engineer",
              isPrimary: true,
              displayOrder: 0,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            },
            {
              id: "title-2",
              resumeId: "resume-1",
              titleId: "t-2",
              titleName: "Tech Lead",
              isPrimary: false,
              displayOrder: 1,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Staff Engineer\(primary\)/)).toBeInTheDocument();
    expect(screen.getByText("Tech Lead")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+/ })).not.toBeInTheDocument();
  });
});
