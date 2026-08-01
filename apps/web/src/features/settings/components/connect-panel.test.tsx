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

  it("emits node-based stdio snippets (NOT an @linkhub/mcp npm package)", () => {
    const { container } = render(<ConnectPanel token={null} />);
    const codeText = codeTextOf(container);

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
      screen.getByText(/filled in with the token you just created/i),
    ).toBeInTheDocument();
    // The token is unrecoverable after a reload, so say so.
    expect(screen.getByText(/gone as soon as you reload/i)).toBeInTheDocument();
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

  it("replaces the hand-edited path step with copyable build + path commands", () => {
    const { container } = render(<ConnectPanel token={null} />);
    const codeText = codeTextOf(container);

    // The build step is a copyable command, not prose.
    expect(screen.getByText("Terminal — build once")).toBeInTheDocument();
    expect(codeText).toContain("npm run build --workspace=mcp");

    // A one-liner that prints the user's real absolute entry path.
    expect(
      screen.getByText("Terminal — print your absolute entry path"),
    ).toBeInTheDocument();
    expect(codeText).toContain("git rev-parse --show-toplevel");
  });

  it("resolves the entry path inline in the Claude Code CLI snippet", async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectPanel token={null} />);

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    const cli = Array.from(container.querySelectorAll("pre"))
      .map((el) => el.textContent ?? "")
      .find((text) => text.includes("claude mcp add"));

    // Zero-edit: the shell resolves the absolute path itself.
    expect(cli).toContain(
      'node "$(git rev-parse --show-toplevel)/apps/mcp/dist/index.js"',
    );
    expect(cli).not.toContain("/absolute/path/to/linkhub");

    // The whole Claude Code tab is hand-edit free — the project-scoped
    // .mcp.json uses a repo-relative path.
    expect(codeTextOf(container)).not.toContain("/absolute/path/to/linkhub");
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
    expect(codeTextOf(container)).toContain("/linkhub:weekly_update");

    await user.click(screen.getByRole("tab", { name: "VS Code" }));
    expect(codeTextOf(container)).toContain("/mcp.linkhub.weekly_update");
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
    expect(codeTextOf(container)).toContain("linkhub://guides/post-quality");
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
   * Building from a checkout is impossible for a user who never had one, and
   * the package is unpublished so `npx` is not an option either. It must not
   * read as a mandatory numbered step.
   */
  it("folds the local-checkout build into an opt-in disclosure", () => {
    render(<ConnectPanel token={null} />);

    const summary = screen.getByText(/Running LinkHub locally\?/);
    const details = summary.closest("details");

    expect(details).not.toBeNull();
    // Collapsed by default — the hosted path is the default path.
    expect(details).not.toHaveAttribute("open");

    // And the numbered flow now starts at "Add LinkHub to your tool".
    expect(screen.getByText("Add LinkHub to your tool")).toBeInTheDocument();
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
      vi.stubEnv("VITE_API_URL", "https://api.linkhub.example");
      expect(resolveApiUrl()).toBe("https://api.linkhub.example");
    });

    it("falls back to the page origin rather than a hardcoded localhost", () => {
      vi.stubEnv("VITE_API_URL", "");
      expect(resolveApiUrl()).toBe(window.location.origin);
      expect(resolveApiUrl()).not.toBe("http://localhost:3333");
    });
  });
});
