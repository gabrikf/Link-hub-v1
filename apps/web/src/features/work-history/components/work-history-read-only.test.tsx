import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkHistoryReadOnly } from "./work-history-read-only";

const experience = {
  id: "exp-1",
  title: "Staff Engineer",
  companyName: "Acme",
  employmentType: "full-time",
  workModel: "remote",
  locationCity: "Lisbon",
  locationState: null,
  locationCountry: "PT",
  startDate: "2020-01-01",
  endDate: null,
  isCurrent: true,
  description: null,
  mainStack: ["TypeScript"],
};

describe("WorkHistoryReadOnly", () => {
  it("renders entry placeholders inside the same timeline list while loading", () => {
    const { container } = render(
      <WorkHistoryReadOnly workExperiences={[]} isLoading />,
    );

    const list = container.querySelector("ol");
    // Same timeline rule + spacing as the populated list, so the card keeps
    // its height when the entries land.
    expect(list?.className).toContain("border-l");
    expect(list?.className).toContain("space-y-3");
    expect(list?.querySelectorAll("li")).toHaveLength(2);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading work history",
    );
    expect(
      screen.queryByText(/no work experience added yet/i),
    ).not.toBeInTheDocument();
  });

  it("renders real entries with no placeholders once loaded", () => {
    const { container } = render(
      <WorkHistoryReadOnly workExperiences={[experience]} />,
    );

    expect(screen.getByText("Staff Engineer")).toBeInTheDocument();
    expect(container.querySelectorAll(".anim-sheen")).toHaveLength(0);
  });

  it("shows the empty state when nothing is loading", () => {
    render(<WorkHistoryReadOnly workExperiences={[]} />);

    expect(
      screen.getByText(/no work experience added yet/i),
    ).toBeInTheDocument();
  });
});
