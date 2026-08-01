import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TagInput } from "./tag-input";

function ControlledTagInput({ initial = [] }: { initial?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial);
  return <TagInput id="tags" label="Tags" value={tags} onChange={setTags} />;
}

describe("TagInput", () => {
  it("adds a chip when Enter is pressed and strips a leading '#'", async () => {
    const user = userEvent.setup();
    render(<ControlledTagInput />);

    const input = screen.getByLabelText("Tags");
    await user.type(input, "#react{Enter}");

    // Chips render as "#<tag>"; the leading '#' the user typed is stripped
    // before storage so it is not doubled.
    expect(screen.getByText("#react")).toBeInTheDocument();
    // Input is cleared after commit.
    expect(input).toHaveValue("");
  });

  it("removes a chip via its remove button", async () => {
    const user = userEvent.setup();
    render(<ControlledTagInput initial={["react", "vite"]} />);

    expect(screen.getByText("#react")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove react" }));

    expect(screen.queryByText("#react")).not.toBeInTheDocument();
    expect(screen.getByText("#vite")).toBeInTheDocument();
  });

  it("ignores duplicate tags (case-insensitive)", async () => {
    const user = userEvent.setup();
    render(<ControlledTagInput initial={["react"]} />);

    const input = screen.getByLabelText("Tags");
    await user.type(input, "React{Enter}");

    expect(screen.getAllByText(/^#react$/i)).toHaveLength(1);
  });

  it("removes the last chip on Backspace when the draft is empty", async () => {
    const user = userEvent.setup();
    render(<ControlledTagInput initial={["react", "vite"]} />);

    const input = screen.getByLabelText("Tags");
    input.focus();
    await user.keyboard("{Backspace}");

    expect(screen.queryByText("#vite")).not.toBeInTheDocument();
    expect(screen.getByText("#react")).toBeInTheDocument();
  });
});
