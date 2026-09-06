import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectPanel } from "./connect-panel";
import { resolveApiUrl } from "../lib/mcp-config";

const TOOL_TABS = ["Claude Desktop", "Claude Code", "Cursor", "VS Code"];

/** All rendered code/pre text — snippets plus inline <code> spans. */
function codeTextOf(container: HTMLElement): string {
  return Array.from(container.querySelectorAll("code, pre"))
    .map((el) => el.textContent ?? "")
    .join("\n");
}

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

  it("emits npx snippets for the published package, never a checkout path", () => {
    const { container } = render(<ConnectPanel token={null} />);
    const codeText = codeTextOf(container);

    expect(codeText).toContain("npx");
    expect(codeText).toContain("crafthub-mcp@latest");

    // The whole point of publishing: nothing on this panel may ask a user to
    // clone, build or path-resolve this repo. These four are every spelling of
    // that instruction the panel used to carry.
    expect(codeText).not.toContain("apps/mcp/dist");
    expect(codeText).not.toContain("/absolute/path/to");
    expect(codeText).not.toContain("git rev-parse");
    expect(codeText).not.toContain("--workspace=");
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
      screen.getByText(/filled in with the token you just created/i),
    ).toBeInTheDocument();
    // The token dies with the tab (session-scoped stash), so say exactly that.
    expect(screen.getByText(/gone when this tab closes/i)).toBeInTheDocument();
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
    expect(screen.getByText("Terminal (claude mcp add)")).toBeInTheDocument();
  });

  it("gives Claude Code a copy-paste `claude mcp add` with no path to edit", async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectPanel token={null} />);

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    const cli = Array.from(container.querySelectorAll("pre"))
      .map((el) => el.textContent ?? "")
      .find((text) => text.includes("claude mcp add"));

    expect(cli).toContain("-- npx -y crafthub-mcp@latest");
    // Nothing on this tab depends on where — or whether — the user has a
    // checkout of this repository.
    expect(codeTextOf(container)).not.toContain("apps/mcp/dist");
  });

  it("shows a host-specific verification step", async () => {
    const user = userEvent.setup();
    render(<ConnectPanel token={null} />);

    expect(
      screen.getByText(/Check it worked — Claude Desktop/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(
      screen.getByText(/Check it worked — Claude Code/),
    ).toBeInTheDocument();
    expect(screen.getByText(/claude mcp list/)).toBeInTheDocument();
  });

  it("explains how to invoke the weekly_update prompt in each host", async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectPanel token={null} />);

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(codeTextOf(container)).toContain("/mcp__crafthub__weekly_update");

    await user.click(screen.getByRole("tab", { name: "VS Code" }));
    expect(codeTextOf(container)).toContain("/mcp.crafthub.weekly_update");

    // Claude Desktop has no slash commands at all. Showing "/weekly_update"
    // in a copy box is what sent users to type it and get "Unknown command".
    await user.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(codeTextOf(container)).toContain(
      "+ menu → crafthub → weekly_update",
    );
    expect(codeTextOf(container)).not.toContain("/weekly_update");
  });

  it("describes what the agent collects from commits", () => {
    const { container } = render(<ConnectPanel token={null} />);

    expect(
      screen.getByText(/What your agent does with your commits/),
    ).toBeInTheDocument();
    expect(screen.getByText("What actually shipped")).toBeInTheDocument();
    expect(screen.getByText("Impact")).toBeInTheDocument();
    expect(screen.getByText("Real numbers")).toBeInTheDocument();
    // The house-style resource is discoverable from the UI too.
    expect(codeTextOf(container)).toContain("crafthub://guides/post-quality");
  });

  it("contrasts a weak commit-log post with a strong outcome-led one", () => {
    render(<ConnectPanel token={null} />);

    expect(screen.getByText(/a commit log with bullets/i)).toBeInTheDocument();
    expect(screen.getByText(/outcome, impact, stack/i)).toBeInTheDocument();
    // The strong example names a searchable stack.
    expect(
      screen.getByText(/TypeScript, React 19, Fastify, Drizzle, PostgreSQL/),
    ).toBeInTheDocument();
  });

  /**
   * The no-token branch — i.e. what every new user sees — laid out the 31-char
   * `lh_pat_xxxx…` placeholder in a nowrap flex row. `_` is not a break
   * opportunity under `word-break: normal`, so at 375px its min-content width
   * exceeded the panel and produced a page-wide horizontal scrollbar.
   */
  it("lets the token placeholder wrap instead of forcing page overflow", () => {
    const { container } = render(<ConnectPanel token={null} />);

    const placeholder = screen.getByText("lh_pat_xxxxxxxxxxxxxxxxxxxxxxxx");
    expect(placeholder).toHaveClass("break-all");
    expect(placeholder.closest("p")).toHaveClass("flex-wrap");

    // The <pre> snippets keep their own horizontal scroll container.
    for (const pre of container.querySelectorAll("pre")) {
      expect(pre).toHaveClass("overflow-x-auto");
    }
  });

  /**
   * The panel used to open with a collapsed "build it from a checkout first"
   * disclosure, because the package was unpublished and there was no other way
   * to run the server. Now that `crafthub-mcp` is on npm there is no local
   * build, so the disclosure is gone and step 1 is the first thing on screen.
   */
  it("starts at step 1 with no local-build disclosure above it", () => {
    const { container } = render(<ConnectPanel token={null} />);

    expect(screen.queryByText(/Running CraftHub locally\?/)).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Add CraftHub to your tool")).toBeInTheDocument();
  });

  /**
   * With no `VITE_API_URL` the fallback used to be a hardcoded
   * `http://localhost:3333`, so a user on a deployed instance copied a config
   * aimed at their own machine — the MCP server started and every tool call
   * failed. The page's own origin is right far more often.
   */
  describe("resolveApiUrl", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("prefers an explicitly configured VITE_API_URL", () => {
      vi.stubEnv("VITE_API_URL", "https://api.crafthub.example");
      expect(resolveApiUrl()).toBe("https://api.crafthub.example");
    });

    it("falls back to the page origin rather than a hardcoded localhost", () => {
      vi.stubEnv("VITE_API_URL", "");
      expect(resolveApiUrl()).toBe(window.location.origin);
      expect(resolveApiUrl()).not.toBe("http://localhost:3333");
    });
  });
});
