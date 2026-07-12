import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog } from "./dialog";

/**
 * The Dialog drops its own `w-[92vw]` / `max-w-lg` defaults only when the caller
 * supplies a matching-prefix override, so a caller's width actually wins without
 * needing tailwind-merge. These assert that suppression matrix.
 */
describe("Dialog width-class suppression", () => {
  const contentClasses = (): string[] =>
    screen.getByRole("dialog").className.split(/\s+/);

  it("keeps both defaults when no width override is passed", () => {
    render(
      <Dialog open title="Plain">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("w-[92vw]");
    expect(classes).toContain("max-w-lg");
  });

  it("keeps the default width but overrides max-w when only max-w is set", () => {
    render(
      <Dialog open title="Wide" contentClassName="max-w-2xl">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("w-[92vw]");
    expect(classes).toContain("max-w-2xl");
    expect(classes).not.toContain("max-w-lg");
  });

  it("drops both defaults when the caller sets its own w- and max-w", () => {
    render(
      <Dialog open title="Widest" contentClassName="w-[96vw] max-w-6xl">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("w-[96vw]");
    expect(classes).toContain("max-w-6xl");
    expect(classes).not.toContain("w-[92vw]");
    expect(classes).not.toContain("max-w-lg");
  });
});
