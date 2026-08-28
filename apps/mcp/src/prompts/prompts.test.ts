import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import type { AgentDisclosureLevel } from "@repo/schemas";
import { levelInfo, type DisclosureContext } from "../disclosure.js";
import { POST_GUIDELINES, POST_GUIDELINES_URI } from "../resources/index.js";
import { DISCLOSURE_POLICY_URI } from "../resources/disclosure-policy.js";
import { registerAllPrompts } from "./index.js";
import { buildWorkflowText } from "./shared.js";

/**
 * Characterization tests for the MCP workflow prompts.
 *
 * These pin TODAY'S behaviour of `weekly_update` and `since_last_post`: the
 * names a host agent binds to, the arguments they accept, and — the part that
 * matters most — that the user's disclosure policy is rendered into the prompt
 * text itself. A prompt that forgets the policy is how an agent ends up writing
 * an employer's name into a public post.
 *
 * Nothing here touches the network or stdio: the register functions are handed
 * an in-memory fake host that records what they registered, and the captured
 * handlers are invoked directly.
 */

// ── The fake host ───────────────────────────────────────────────────────────

/** The three optional string arguments the two prompts between them accept. */
interface PromptArgs {
  readonly period?: string;
  readonly repo?: string;
  readonly status?: string;
}

interface RecordedPromptConfig {
  readonly title?: string;
  readonly description?: string;
  readonly argsSchema?: Readonly<Record<string, unknown>>;
}

interface RecordedPrompt {
  readonly name: string;
  readonly config: RecordedPromptConfig;
  readonly handler: (args: PromptArgs) => GetPromptResult;
}

interface FakeHost {
  /** Cast once, here, so no test has to reach for a cast of its own. */
  readonly server: McpServer;
  /** Registration order, which is also the order a host lists them in. */
  readonly order: readonly string[];
  readonly prompts: ReadonlyMap<string, RecordedPrompt>;
}

function createFakeHost(): FakeHost {
  const order: string[] = [];
  const prompts = new Map<string, RecordedPrompt>();

  const fake = {
    registerPrompt(
      name: string,
      config: RecordedPromptConfig,
      handler: (args: PromptArgs) => GetPromptResult,
    ): void {
      order.push(name);
      prompts.set(name, { name, config, handler });
    },
  };

  return { server: fake as unknown as McpServer, order, prompts };
}

function promptNamed(host: FakeHost, name: string): RecordedPrompt {
  const prompt = host.prompts.get(name);
  if (!prompt) throw new Error(`prompt "${name}" was never registered`);
  return prompt;
}

/**
 * Pulls the single text message out of a prompt result.
 *
 * The SDK's message content is a union (text | image | audio | resource), so it
 * has to be narrowed before `.text` can be read.
 */
function onlyMessageText(result: GetPromptResult): string {
  const [message, ...rest] = result.messages;
  if (!message) throw new Error("prompt returned no messages");
  if (rest.length > 0)
    throw new Error(`prompt returned ${result.messages.length} messages`);
  const { content } = message;
  if (content.type !== "text")
    throw new Error(`prompt message content was "${content.type}", not text`);
  return content.text;
}

// ── Disclosure contexts ─────────────────────────────────────────────────────

function contextFor(
  level: AgentDisclosureLevel,
  overrides: Partial<DisclosureContext> = {},
): DisclosureContext {
  return {
    level,
    info: levelInfo(level),
    blockedTerms: [],
    degraded: false,
    ...overrides,
  };
}

const SUMMARY = contextFor("summary");
const FULL = contextFor("full");
const DEGRADED = contextFor("summary", {
  degraded: true,
  degradedReason: "401 Unauthorized: token is missing profile:read",
});
const WITH_BLOCKED_TERMS = contextFor("detailed", {
  blockedTerms: ["Acme Corp", "Project Falcon"],
});

/** Registers everything and returns the host, for the common case. */
function registerWith(disclosure: DisclosureContext): FakeHost {
  const host = createFakeHost();
  registerAllPrompts(host.server, disclosure);
  return host;
}

/** Runs one prompt's handler and returns the rendered workflow text. */
function render(
  name: string,
  args: PromptArgs = {},
  disclosure: DisclosureContext = SUMMARY,
): string {
  return onlyMessageText(promptNamed(registerWith(disclosure), name).handler(args));
}

// ── Registration ────────────────────────────────────────────────────────────

describe("registerAllPrompts", () => {
  it("registers exactly two prompts, by the names a host agent binds to", () => {
    const host = registerWith(SUMMARY);

    expect(host.order).toEqual(["weekly_update", "since_last_post"]);
  });

  it("gives weekly_update its title and the three documented arguments", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "weekly_update");

    expect(prompt.config.title).toBe("Turn my commits into a LinkHub post");
    expect(Object.keys(prompt.config.argsSchema ?? {})).toEqual([
      "period",
      "repo",
      "status",
    ]);
    expect(prompt.config.description).toContain(
      "Arguments: period, repo, status.",
    );
  });

  it("gives since_last_post its title and only two arguments — no period", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "since_last_post");

    expect(prompt.config.title).toBe(
      "Post everything I've shipped since my last LinkHub update",
    );
    expect(Object.keys(prompt.config.argsSchema ?? {})).toEqual([
      "repo",
      "status",
    ]);
    expect(prompt.config.description).toContain("Arguments: repo, status.");
  });
});

// ── weekly_update: the result envelope ──────────────────────────────────────

describe("weekly_update result shape", () => {
  it("returns one user message carrying the whole workflow as text", () => {
    const result = promptNamed(registerWith(SUMMARY), "weekly_update").handler(
      {},
    );

    expect(result.messages).toHaveLength(1);
    const [message] = result.messages;
    expect(message?.role).toBe("user");
    expect(message?.content.type).toBe("text");
    expect(onlyMessageText(result)).toContain(
      "# Turn my commits into a LinkHub post",
    );
  });

  it("describes the run with the resolved window and the repository scope", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "weekly_update");

    expect(prompt.handler({}).description).toBe(
      "Turn the last 7 days of commits across every configured repository into a LinkHub post",
    );
    expect(prompt.handler({ repo: "linkhub-v.1" }).description).toBe(
      "Turn the last 7 days of commits in linkhub-v.1 into a LinkHub post",
    );
  });

  it("appends the post-quality guide verbatim, so the agent need not fetch it", () => {
    const text = render("weekly_update");

    expect(text.endsWith(POST_GUIDELINES)).toBe(true);
    expect(text).toContain(POST_GUIDELINES_URI);
  });
});

// ── weekly_update: the `period` argument ────────────────────────────────────

describe("weekly_update period resolution", () => {
  it("defaults to the last 7 days when period is omitted", () => {
    const text = render("weekly_update");

    expect(text).toContain("Target window: **the last 7 days**");
    expect(text).toContain(
      'The window is **the last 7 days**. Wherever `<START>` appears below, use `--since="7 days ago"`.',
    );
    expect(text).toContain('- `period` — `"weekly"`');
  });

  it.each([
    ["daily", "the last 24 hours", "1 day ago"],
    ["today", "today", "midnight"],
    ["weekly", "the last 7 days", "7 days ago"],
    ["week", "the last 7 days", "7 days ago"],
    ["monthly", "the last 30 days", "30 days ago"],
    ["month", "the last 30 days", "30 days ago"],
  ])("maps the %s preset to %s", (period, label, since) => {
    const text = render("weekly_update", { period });

    expect(text).toContain(`Target window: **${label}**`);
    expect(text).toContain(`use \`--since="${since}"\``);
    expect(text).toContain(`- \`period\` — \`"${period}"\``);
  });

  it("matches presets case-insensitively and forwards the lowercased value", () => {
    const text = render("weekly_update", { period: "  MONTHLY  " });

    expect(text).toContain("Target window: **the last 30 days**");
    expect(text).toContain('- `period` — `"monthly"`');
  });

  it("turns an explicit `a..b` range into a --since/--until pair", () => {
    const text = render("weekly_update", {
      period: "2026-07-14..2026-07-21",
    });

    expect(text).toContain("Target window: **2026-07-14 → 2026-07-21**");
    expect(text).toContain('--since="2026-07-14" --until="2026-07-21"');
    expect(text).toContain("If those look like git refs rather than dates");
    expect(text).toContain('- `period` — `"2026-07-14..2026-07-21"`');
  });

  it("treats anything else as a git date expression, forwarded verbatim", () => {
    const text = render("weekly_update", { period: "3 days ago" });

    expect(text).toContain("Target window: **3 days ago**");
    expect(text).toContain(
      "The user described the window as **3 days ago**. Treat it as a git date expression",
    );
    expect(text).toContain('- `period` — `"3 days ago"`');
  });

  it.each(["..", "a..", "..b", "a..b..c"])(
    "falls back to a date expression for the malformed range %s",
    (period) => {
      const text = render("weekly_update", { period });

      expect(text).toContain("Treat it as a git date expression");
      expect(text).not.toContain("--until=");
    },
  );
});

// ── The `repo` argument, shared by both prompts ─────────────────────────────

describe("repository scope", () => {
  it("without a repo, instructs the agent to resolve the configured set", () => {
    const text = render("weekly_update");

    expect(text).toContain(
      "The user did not name a repository, so this post covers **every repository they work in**",
    );
    expect(text).toContain("`~/.linkhub/repos.json`");
    expect(text).toContain("`~/.linkhub/extractor.json`");
    expect(text).toContain("**Never go looking for repositories yourself.**");
    expect(text).toContain("- `repo` — the scope marker from Step 5");
  });

  it("with a repo, narrows to that one and skips the resolution ladder", () => {
    const text = render("weekly_update", { repo: "  linkhub-v.1  " });

    expect(text).toContain(
      "The user named the repository **linkhub-v.1**, which NARROWS this run",
    );
    expect(text).toContain("so the set is exactly that one repository");
    expect(text).toContain("a set of one");
    expect(text).toContain('- `repo` — `"linkhub-v.1"`');
    expect(text).not.toContain("`~/.linkhub/repos.json`");
  });

  // CHARACTERIZATION: today's behaviour, suspected wrong — a whitespace-only
  // `repo` is trimmed away for the workflow body (correct) but NOT for the
  // prompt's `description`, which the host UI shows the user. The two then
  // disagree about what the run covers.
  it("renders a whitespace-only repo as no repo in the body, but keeps it in the description", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "weekly_update");
    const result = prompt.handler({ repo: "   " });

    expect(onlyMessageText(result)).toContain(
      "The user did not name a repository",
    );
    expect(result.description).toBe(
      "Turn the last 7 days of commits in     into a LinkHub post",
    );
  });
});

// ── The `status` argument ───────────────────────────────────────────────────

describe("status argument", () => {
  it("defaults to publishing, gated on the user having seen the text", () => {
    const text = render("weekly_update");

    expect(text).toContain('- `status` — Publish with `status: "published"`');
    expect(text).toContain("but only after the user has seen the final text");
  });

  it.each(["draft", "  DRAFT  "])("honours status=%s", (status) => {
    const text = render("weekly_update", { status });

    expect(text).toContain('- `status` — Publish with `status: "draft"`');
    expect(text).toContain("Tell the user where to review it.");
  });

  it("treats any unrecognised status as published", () => {
    const text = render("weekly_update", { status: "pending_review" });

    expect(text).toContain('Publish with `status: "published"`');
  });

  // CHARACTERIZATION: today's behaviour, suspected wrong — Step 0 of this very
  // prompt says it "is designed to be run unattended on a schedule", and the
  // post-quality guide appended to the same text says to use `pending_review`
  // whenever the run is unattended. Step 8 never offers `pending_review` at
  // all: an unattended run publishes straight to the public profile.
  it("never mentions pending_review in the workflow, only in the appended guide", () => {
    const text = render("weekly_update");
    const workflow = text.slice(0, text.length - POST_GUIDELINES.length);

    expect(text).toContain(
      "this prompt is designed to be run unattended on a\nschedule",
    );
    expect(workflow).not.toContain("pending_review");
    expect(POST_GUIDELINES).toContain(
      'Use `"pending_review"` whenever this runs unattended',
    );
  });
});

// ── The disclosure policy, embedded in every prompt ─────────────────────────

const PROMPT_NAMES = ["weekly_update", "since_last_post"] as const;

describe("disclosure policy embedding", () => {
  it.each(PROMPT_NAMES)(
    "%s renders the summary-level contract as Step 7b",
    (name) => {
      const text = render(name, {}, SUMMARY);

      expect(text).toContain("## Step 7b — What you may say about the job");
      expect(text).toContain(
        "The user's disclosure level is **`summary` (Summary)**:",
      );
      expect(text).toContain(
        "Share what you did and how you did it, never who you did it for.",
      );
      expect(text).toContain("**You may say:**");
      expect(text).toContain("- Role titles and seniority");
      expect(text).toContain("**You must not say:**");
      expect(text).toContain("- Employer and client names");
      expect(text).toContain("- Internal repository, service, project and codenames");
      expect(text).toContain("rejected\nwith HTTP 400 that names the offending term");
      expect(text).toContain(DISCLOSURE_POLICY_URI);
    },
  );

  it.each(PROMPT_NAMES)(
    "%s renders every allow and block of the active level as bullets",
    (name) => {
      const text = render(name, {}, SUMMARY);

      for (const allow of SUMMARY.info.allows) {
        expect(text).toContain(`- ${allow}`);
      }
      for (const block of SUMMARY.info.blocks) {
        expect(text).toContain(`- ${block}`);
      }
    },
  );

  it("renders the empty-blocks branch at the `full` level", () => {
    const text = render("weekly_update", {}, FULL);

    expect(FULL.info.blocks).toHaveLength(0);
    expect(text).toContain("The user's disclosure level is **`full` (Full)**:");
    expect(text).toContain(
      "- _Nothing at this level beyond the terms the user banned outright._",
    );
  });

  it("omits the banned-terms block when the user banned nothing", () => {
    const text = render("weekly_update", {}, SUMMARY);

    expect(text).not.toContain("**Terms the user banned outright**");
  });

  it("lists the user's own banned terms when there are any", () => {
    const text = render("weekly_update", {}, WITH_BLOCKED_TERMS);

    expect(text).toContain(
      "**Terms the user banned outright** (blocked at every level):",
    );
    expect(text).toContain("- Acme Corp");
    expect(text).toContain("- Project Falcon");
  });

  it.each(PROMPT_NAMES)(
    "%s warns loudly when the policy could not be read",
    (name) => {
      const text = render(name, {}, DEGRADED);

      expect(text).toContain(
        "> **The policy could not be read from LinkHub, so the STRICTEST level is\n> assumed.**",
      );
      expect(text).toContain("`profile:read` scope");
      // Failing closed: the strictest level's blocks are still rendered.
      expect(text).toContain("- Employer and client names");
    },
  );

  it("does not print the degraded warning when the policy was read", () => {
    const text = render("weekly_update", {}, SUMMARY);

    expect(text).not.toContain("The policy could not be read from LinkHub");
  });
});

// ── buildWorkflowText, called directly ──────────────────────────────────────

describe("buildWorkflowText", () => {
  const base = {
    windowLabel: "the last 7 days",
    establishWindow: "ESTABLISH",
    periodValue: "weekly",
    status: "published",
  } as const;

  it("drops Step 7b entirely when no disclosure context is supplied", () => {
    const text = buildWorkflowText(base);

    expect(text).not.toContain("Step 7b");
    expect(text).toContain("## Step 7 — Safety pass");
    expect(text).toContain("## Step 8 — Publish");
    // Step 7's last bullet runs straight into Step 8 with no section between.
    expect(text).toContain(
      "a path is not a fact about the work.\n\n\n## Step 8 — Publish",
    );
  });

  it("splices Step 7b between the safety pass and the publish step", () => {
    const text = buildWorkflowText({ ...base, disclosureLevel: SUMMARY });

    expect(text.indexOf("## Step 7 — Safety pass")).toBeLessThan(
      text.indexOf("## Step 7b — What you may say about the job"),
    );
    expect(text.indexOf("## Step 7b — What you may say about the job")).toBeLessThan(
      text.indexOf("## Step 8 — Publish"),
    );
  });

  it("interpolates the window label and the establish-window block verbatim", () => {
    const text = buildWorkflowText({
      ...base,
      windowLabel: "a fortnight of Tuesdays",
      establishWindow: "SENTINEL-ESTABLISH-BLOCK",
    });

    expect(text).toContain("Target window: **a fortnight of Tuesdays**");
    expect(text).toContain("SENTINEL-ESTABLISH-BLOCK");
  });

  it("keeps every workflow step, in order", () => {
    const text = buildWorkflowText({ ...base, disclosureLevel: SUMMARY });
    const headings = [
      "## Step 0 — Check this period is not already covered",
      "## Step 1 — Resolve which repositories this post covers",
      "## Step 2 — Establish the window and the author",
      "## Step 3 — Read the commits, repository by repository",
      "## Step 4 — Find out what actually changed",
      "## Step 5 — Aggregate the facts into ONE set before writing a word",
      "## Step 6 — Write the post",
      "## Step 7 — Safety pass",
      "## Step 7b — What you may say about the job",
      "## Step 8 — Publish",
    ];

    const positions = headings.map((heading) => text.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

// ── since_last_post ─────────────────────────────────────────────────────────

describe("since_last_post", () => {
  it("derives its window from LinkHub's own history rather than a period", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "since_last_post");
    const text = onlyMessageText(prompt.handler({}));

    expect(prompt.handler({}).description).toBe(
      "Summarize everything shipped across every configured repository since the last LinkHub commit summary",
    );
    expect(text).toContain(
      "Target window: **everything since the last LinkHub commit summary**",
    );
    expect(text).toContain("- `period` — `\"since-last-post\"`");
    expect(text).toContain("Call **`list_my_posts`** (`limit: 20`)");
    expect(text).toContain("Find the newest post with `source=commit`");
    expect(text).toContain('Fall back to `--since="14 days ago"`');
    expect(text).toContain(
      "do not publish anything. Tell the user their last summary is already up to date and stop.",
    );
  });

  it("takes repo and status the same way weekly_update does", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "since_last_post");
    const result = prompt.handler({ repo: "  linkhub-v.1  ", status: "DRAFT" });
    const text = onlyMessageText(result);

    expect(result.description).toBe(
      "Summarize everything shipped in   linkhub-v.1   since the last LinkHub commit summary",
    );
    expect(text).toContain("The user named the repository **linkhub-v.1**");
    expect(text).toContain('- `repo` — `"linkhub-v.1"`');
    expect(text).toContain('- `status` — Publish with `status: "draft"`');
  });

  it("ignores an unknown argument rather than leaking it into the text", () => {
    const prompt = promptNamed(registerWith(SUMMARY), "since_last_post");
    const text = onlyMessageText(prompt.handler({ period: "monthly" }));

    expect(text).toContain(
      "Target window: **everything since the last LinkHub commit summary**",
    );
    expect(text).not.toContain("the last 30 days");
  });
});

// ── What Step 7b claims LinkHub enforces ────────────────────────────────────

/**
 * BUG-20260827-mcp-overstates-redaction.
 *
 * Step 7b renders all seven `summary`-level blocks and then says "This is
 * **enforced**, not advised" over the whole list. The server enforces one of
 * them — employer and client names on the user's denylist. An agent that
 * believes the other six are caught server-side has no reason to check them
 * itself, and a post naming a ticket id or a customer is accepted and published.
 */
describe("Step 7b claims enforcement only where the server enforces", () => {
  it.each(PROMPT_NAMES)("%s does not call the whole blocks list enforced", (name) => {
    const text = render(name, {}, SUMMARY);

    expect(text).not.toContain("This is **enforced**, not advised.");
    expect(text).toContain(
      "**Employer and client names are enforced, not advised.**",
    );
  });

  it.each(PROMPT_NAMES)("%s makes the other blocks the agent's own job", (name) => {
    const text = render(name, {}, SUMMARY);

    expect(text).toContain("**Every other item above is yours to enforce.**");
    expect(text).toContain(
      "LinkHub does not scan for ticket ids, customer names, internal " +
        "codenames, unreleased products, architecture details or headcount " +
        "figures",
    );
  });

  it.each(PROMPT_NAMES)(
    "%s stops describing get_work_context as fully redacted",
    (name) => {
      const text = render(name, {}, SUMMARY);

      expect(text).not.toContain("returns their history already redacted");
      expect(text).toContain(
        "returns their history with those same employer and client names " +
          "stripped, and nothing else removed",
      );
    },
  );

  it.each(PROMPT_NAMES)("%s keeps the true HTTP 400 sentence", (name) => {
    const text = render(name, {}, SUMMARY);

    expect(text).toContain("rejected\nwith HTTP 400 that names the offending term");
  });
});
