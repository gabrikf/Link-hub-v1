import { POST_GUIDELINES, POST_GUIDELINES_URI } from "../resources/index.js";
import { DISCLOSURE_POLICY_URI } from "../resources/disclosure-policy.js";
import type { DisclosureContext } from "../disclosure.js";

export interface WorkflowOptions {
  /** Human-readable description of the window being summarized. */
  readonly windowLabel: string;
  /**
   * Step 1 of the workflow — how to establish the time window. Differs between
   * the fixed-period prompt and the "since my last post" variant.
   */
  readonly establishWindow: string;
  /** Value to pass through as the tool's `period` argument. */
  readonly periodValue: string;
  /** Repo the user named, if any. */
  readonly repo?: string;
  /** Publish status the user asked for. */
  readonly status: string;
  /**
   * The active disclosure contract. Inlined into the workflow so the agent
   * knows what it may say about the employer BEFORE it starts writing, rather
   * than discovering it from a rejected publish.
   */
  readonly disclosureLevel?: DisclosureContext;
}

/** Renders the policy as the workflow's step-6 safety rules. */
function buildDisclosureSection(context?: DisclosureContext): string {
  if (!context) return "";

  const allows = context.info.allows.map((item) => `- ${item}`).join("\n");
  const blocks =
    context.info.blocks.length > 0
      ? context.info.blocks.map((item) => `- ${item}`).join("\n")
      : "- _Nothing at this level beyond the terms the user banned outright._";

  const degraded = context.degraded
    ? `\n> **The policy could not be read from LinkHub, so the STRICTEST level is\n> assumed.** The token is probably missing the \`profile:read\` scope — tell the\n> user, and write as if nothing about the employer may be named.\n`
    : "";

  const terms =
    context.blockedTerms.length > 0
      ? `\n**Terms the user banned outright** (blocked at every level):\n\n${context.blockedTerms
          .map((term) => `- ${term}`)
          .join("\n")}\n`
      : "";

  return `

## Step 6b — What you may say about the job

The user's disclosure level is **\`${context.info.value}\` (${context.info.label})**:
${context.info.shortDescription}
${degraded}
**You may say:**

${allows}

**You must not say:**

${blocks}
${terms}
This is **enforced**, not advised. LinkHub applies the same denylist server-side
when the post is created: a post naming a blocked employer or client is rejected
with HTTP 400 that names the offending term. If that happens, rewrite the post
around the term — retrying the same text will fail again.

For anything about where the user has worked, call **\`get_work_context\`**. It
returns their history already redacted to this level. Do **not** infer the
employer from the git remote, the package name, the directory path, code
comments or commit trailers — that is exactly the leak this policy prevents. The
full contract is also the resource \`${DISCLOSURE_POLICY_URI}\`.`;
}

/**
 * Builds the full workflow instruction text handed to the host agent.
 *
 * The whole point of these prompts is that the user should not have to paste
 * rules anywhere: everything the agent needs to turn commits into a good post
 * — the git commands, the facts to extract, the house style, the field mapping
 * and the safety pass — is inlined here, with the style guide appended verbatim
 * so the agent does not have to fetch the resource separately.
 */
export function buildWorkflowText(options: WorkflowOptions): string {
  const {
    windowLabel,
    establishWindow,
    periodValue,
    repo,
    status,
    disclosureLevel,
  } = options;

  const repoLine = repo
    ? `The user named the repository **${repo}**. Work in that repository — if the current directory is a different repo, say so and stop rather than summarizing the wrong work.`
    : `The user did not name a repository. Use the git repository in the current working directory, and confirm which one it is (\`git rev-parse --show-toplevel\`) before you start.`;

  const statusLine =
    status === "draft"
      ? `Publish with \`status: "draft"\`. Tell the user where to review it.`
      : `Publish with \`status: "published"\` — but only after the user has seen the final text. If you cannot show it to them first, or anything in it is uncertain or sensitive, publish as \`"draft"\` instead and say why.`;

  return `# Turn my commits into a LinkHub post

You are writing a LinkHub post for the developer whose profile this MCP server
is authenticated against. Target window: **${windowLabel}**.

${repoLine}

Do not skip steps and do not guess at facts. Every claim in the final post must
come from something you actually read in the repository.

---

## Step 1 — Establish the window and the author

${establishWindow}

Then find out who "the user" is, so you only summarize *their* commits:

\`\`\`bash
git config user.email
git config user.name
\`\`\`

If the repo has commits from several people, filter by that email. If the user
is the only author, filtering is optional.

## Step 2 — Read the commits

\`\`\`bash
# One line per commit: hash, date, subject
git log --since="<START>" --author="<EMAIL>" --no-merges \\
  --date=short --pretty=format:'%h %ad %s'

# Full messages — commit bodies often explain the "why" the subject omits
git log --since="<START>" --author="<EMAIL>" --no-merges --pretty=format:'%h%n%B%n---'

# How many commits (this is the commitCount argument)
git log --since="<START>" --author="<EMAIL>" --no-merges --oneline | wc -l
\`\`\`

If that returns nothing, widen the window or drop the author filter before
concluding there was no work — then tell the user what you found and stop.
Never publish a post about a period with no commits.

## Step 3 — Find out what actually changed

Commit subjects lie by omission. Look at the diff shape before you write:

\`\`\`bash
# Which areas of the codebase moved, and by how much.
# <FIRST> is the oldest commit hash in the window, from Step 2.
git diff --stat "<FIRST>^..HEAD"

# Files touched most often — usually where the real work is
git log --since="<START>" --author="<EMAIL>" --no-merges --name-only --pretty=format: \\
  | sort | uniq -c | sort -rn | head -30
\`\`\`

Then **read the interesting parts**. Open the 3–5 files that changed most, and
skim the diff for anything that looks like a headline: a new user-facing
feature, a migration, a performance fix, a new endpoint or package. Check
\`README\`/\`CHANGELOG\` diffs and any new test files — they describe intent in
plain language. If a change mentions a benchmark, a bundle size, a coverage
number or a timing, note the exact figure.

## Step 4 — Extract the facts before writing a word

Assemble this list explicitly. If a slot is genuinely empty, leave it empty —
do not fill it with a guess.

1. **repo** — the repository name only (e.g. \`linkhub-v.1\`), not the path or remote URL.
2. **commitCount** — the number from Step 2. Counted, not estimated.
3. **What shipped** — 2–5 items, each a user-visible capability. Collapse the
   ten commits that built one feature into one item. Drop \`wip\`, \`fixup\`,
   formatting, and dependency-bump commits entirely unless the bump *was* the work.
4. **Who it helps and how** — for each item, the impact on a user, a teammate,
   or the system. This is the part recruiters read.
5. **Real numbers** — only ones you saw: latency, bundle size, coverage,
   endpoints added, rows migrated, build time, error rate. Never invent one.
6. **Stack touched** — the actual languages, frameworks and services in the
   changed files (\`package.json\` diffs, imports, migration files). Searchable
   names: "TypeScript, React 19, Fastify, Drizzle, PostgreSQL".
7. **Links** — a PR, release, deployed URL or demo, if one exists. Check
   \`git log\` bodies and the remote (\`git remote get-url origin\`). Only include
   a link that is public.

## Step 5 — Write the post

Write it per the LinkHub post quality guide, reproduced in full below (also
available as the MCP resource \`${POST_GUIDELINES_URI}\`).

The short version: **outcome over mechanics**. 80–200 words, Markdown, first
person, past tense, 2–5 bullets, stack named, no hype. A bulleted list that
mirrors your commit log is a failed post — rewrite it into capabilities.

Write a title too (under 70 characters, specific). Do not let the tool derive one.

## Step 6 — Safety pass

Before publishing, re-read your draft and strip:

- commit SHAs, branch names, ticket ids (\`PROJ-123\`, \`#4471\`), file paths;
- any secret, token, key, connection string, internal hostname or \`.env\` value
  you saw in a diff — and tell the user it appeared there;
- client names, private repo names, and proprietary detail. For private or
  client work, describe the capability and omit the identifying detail, or ask
  the user first.
${buildDisclosureSection(disclosureLevel)}

## Step 7 — Publish

Show the user the final title and body. Then call **\`create_commit_summary_post\`**:

- \`summary\` — the finished Markdown body (required; the tool publishes it verbatim and runs no AI of its own)
- \`title\` — your headline
- \`period\` — \`"${periodValue}"\`
- \`repo\` — ${repo ? `\`"${repo}"\`` : "the repository name from Step 4"}
- \`commitCount\` — the count from Step 2
- \`tags\` — 2–5 lowercase, stack-first tags, e.g. \`["typescript", "fastify", "postgres"]\`
- \`status\` — ${statusLine}

Report back the post id the tool returns.

---

${POST_GUIDELINES}`;
}
