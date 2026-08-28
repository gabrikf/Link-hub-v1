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

describe("WorkHistoryReadOnly — description structure", () => {
  /**
   * Scopes an assertion to the rendered description, so the card's own title
   * and company `<p>` elements are not counted as description paragraphs.
   */
  function md(container: HTMLElement): HTMLElement {
    const block = container.querySelector<HTMLElement>(".work-history-md");
    if (!block) {
      throw new Error("no rendered description found");
    }
    return block;
  }

  function renderWithDescription(description: string) {
    return render(
      <WorkHistoryReadOnly
        workExperiences={[{ ...experience, description }]}
      />,
    );
  }

  it("renders a bulleted description as a real list, not one glued paragraph", () => {
    const { container } = renderWithDescription(
      "- Led the payments team\n- Shipped the new checkout",
    );

    const items = md(container).querySelectorAll("ul li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Led the payments team");
    expect(items[1]).toHaveTextContent("Shipped the new checkout");
  });

  it("renders bullets a user pasted from a PDF (• glyphs) as a list too", () => {
    const { container } = renderWithDescription(
      "• Rebuilt the ledger\n• Halved chargebacks",
    );

    expect(md(container).querySelectorAll("ul li")).toHaveLength(2);
    expect(container.textContent).not.toContain("•");
  });

  it("keeps a hand-typed line break as a line break instead of gluing the lines", () => {
    const { container } = renderWithDescription(
      "Led the payments team.\nShipped the new checkout.",
    );

    expect(md(container).querySelectorAll("br")).toHaveLength(1);
    expect(md(container).querySelectorAll("p")).toHaveLength(1);
    expect(container.textContent).not.toContain(
      "Led the payments team. Shipped the new checkout.",
    );
  });

  it("keeps a blank line as a separate paragraph", () => {
    const { container } = renderWithDescription(
      "Payments team lead.\n\nAlso ran the on-call rota.",
    );

    expect(md(container).querySelectorAll("p")).toHaveLength(2);
  });

  it("renders a lead-in paragraph followed by its bullet list", () => {
    const { container } = renderWithDescription(
      "Owned billing end to end.\n\n- Rebuilt the ledger\n- Halved chargebacks",
    );

    expect(md(container).querySelectorAll("p")).toHaveLength(1);
    expect(md(container).querySelectorAll("ul li")).toHaveLength(2);
  });

  it("renders nothing extra when there is no description", () => {
    const { container } = render(
      <WorkHistoryReadOnly workExperiences={[experience]} />,
    );

    expect(container.querySelector(".work-history-md")).toBeNull();
  });
});
