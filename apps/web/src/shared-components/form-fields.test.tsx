import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedbackMessage } from "./feedback-message";
import { Input } from "./input";
import { TextArea } from "./text-area";

/**
 * A screen-reader user submitting a bad login used to hear silence: the error
 * was an unlinked sibling `<p>` with no id, no `aria-invalid` and no live
 * region, so nothing announced and nothing said which field was wrong.
 */

const cases = [
  {
    name: "Input",
    renderField: (props: { error?: string; describedBy?: string }) =>
      render(
        <Input
          id="email"
          label="Email"
          error={props.error}
          aria-describedby={props.describedBy}
        />,
      ),
  },
  {
    name: "TextArea",
    renderField: (props: { error?: string; describedBy?: string }) =>
      render(
        <TextArea
          id="bio"
          label="Bio"
          error={props.error}
          aria-describedby={props.describedBy}
        />,
      ),
  },
];

describe.each(cases)("$name error wiring", ({ renderField }) => {
  it("links the error to the control and marks it invalid", () => {
    renderField({ error: "Enter a valid value." });

    const control = screen.getByRole("textbox");
    expect(control).toHaveAttribute("aria-invalid", "true");

    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const errorNode = document.getElementById(describedBy as string);
    expect(errorNode).toHaveTextContent("Enter a valid value.");
    expect(errorNode).toHaveAttribute("role", "alert");
  });

  it("announces the error through a live region", () => {
    renderField({ error: "Enter a valid value." });

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid value.");
  });

  it("appends to, rather than clobbering, a caller's aria-describedby", () => {
    renderField({ error: "Enter a valid value.", describedBy: "helper-1" });

    const describedBy = screen
      .getByRole("textbox")
      .getAttribute("aria-describedby");

    expect(describedBy?.split(" ")).toContain("helper-1");
    expect(describedBy?.split(" ")).toHaveLength(2);
  });

  it("sets neither attribute when there is no error", () => {
    renderField({});

    const control = screen.getByRole("textbox");
    expect(control).not.toHaveAttribute("aria-invalid");
    expect(control).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("carries a visible focus ring and a dark-mode-legible error colour", () => {
    renderField({ error: "Enter a valid value." });

    expect(screen.getByRole("textbox").className).toContain(
      "focus-visible:ring-violet-500",
    );
    // text-red-600 alone measures 3.08:1 on zinc-800; red-400 clears 4.5:1.
    expect(screen.getByRole("alert").className).toContain("dark:text-red-400");
  });
});

describe("FeedbackMessage", () => {
  it("interrupts for errors", () => {
    render(<FeedbackMessage tone="error" message="Login failed." />);

    const node = screen.getByRole("alert");
    expect(node).toHaveTextContent("Login failed.");
    expect(node).toHaveAttribute("aria-live", "assertive");
  });

  it("waits its turn for confirmations", () => {
    render(<FeedbackMessage tone="success" message="Saved." />);

    const node = screen.getByRole("status");
    expect(node).toHaveTextContent("Saved.");
    expect(node).toHaveAttribute("aria-live", "polite");
  });
});
