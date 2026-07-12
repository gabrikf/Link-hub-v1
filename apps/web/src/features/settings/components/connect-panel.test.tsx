import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConnectPanel } from "./connect-panel";

const TOOL_TABS = ["Claude Desktop", "Claude Code", "Cursor", "VS Code"];

describe("ConnectPanel", () => {
  it("renders a tab for each of the 4 AI tools", () => {
    render(<ConnectPanel token={null} />);
    const tablist = screen.getByRole("tablist", { name: "AI tool" });
    for (const label of TOOL_TABS) {
      expect(
        within(tablist).getByRole("tab", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("emits node-based stdio snippets (NOT an @linkhub/mcp npm package)", () => {
    const { container } = render(<ConnectPanel token={null} />);
    const codeText = Array.from(container.querySelectorAll("code, pre"))
      .map((el) => el.textContent ?? "")
      .join("\n");

    expect(codeText).toContain("node");
    expect(codeText).toContain("apps/mcp/dist/index.js");
    expect(codeText).not.toContain("@linkhub/mcp");
    expect(codeText).not.toContain("npx");
  });

  it("shows the placeholder token until a real one is provided", () => {
    const { container, rerender } = render(<ConnectPanel token={null} />);
    expect(container.textContent).toContain("lh_pat_xxxxxxxx");

    rerender(<ConnectPanel token="lh_pat_realsecret123" />);
    const snippetText = Array.from(container.querySelectorAll("pre"))
      .map((el) => el.textContent ?? "")
      .join("\n");
    expect(snippetText).toContain("lh_pat_realsecret123");
    expect(
      screen.getByText(/pre-filled with the token you just created/i),
    ).toBeInTheDocument();
  });

  it("switches the visible snippet when another tool tab is selected", async () => {
    const user = userEvent.setup();
    render(<ConnectPanel token={null} />);

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    // Claude Code exposes a `claude mcp add` terminal snippet; the Claude
    // Desktop config file is no longer visible.
    expect(
      screen.queryByText("claude_desktop_config.json"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Terminal (claude mcp add)"),
    ).toBeInTheDocument();
  });
});
