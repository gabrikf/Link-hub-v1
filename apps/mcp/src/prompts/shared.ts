import { POST_GUIDELINES, POST_GUIDELINES_URI } from "../resources/index.js";
import { DISCLOSURE_POLICY_URI } from "../resources/disclosure-policy.js";
import type { DisclosureContext } from "../disclosure.js";

export interface WorkflowOptions {
  /** Human-readable description of the window being summarized. */
  readonly windowLabel: string;
  /**
   * How to establish the time window (workflow step 2). Differs between the
   * fixed-period prompt and the "since my last post" variant.
   */
  readonly establishWindow: string;
  /** Value to pass through as the tool's `period` argument. */
  readonly periodValue: string;
  /**
   * Repo the user named, if any. Naming one NARROWS the run to that single
   * repository; the default is every repository the user configured.
   */
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

/** Renders the policy as the workflow's step-7 safety rules. */
function buildDisclosureSection(context?: DisclosureContext): string {
  if (!context) return "";

  const allows = context.info.allows.map((item) => `- ${item}`).join("\n");
  const blocks =
    context.info.blocks.length > 0
      ? context.info.blocks.map((item) => `- ${item}`).join("\n")
      : "- _Nothing at this level beyond the terms the user banned outright._";

  const degraded = context.degraded
    ? `\n> **The policy could not be read from CraftHub, so the STRICTEST level is\n> assumed.** The token is probably missing the \`profile:read\` scope — tell the\n> user, and write as if nothing about the employer may be named.\n`
    : "";

  const terms =
    context.blockedTerms.length > 0
      ? `\n**Terms the user banned outright** (blocked at every level):\n\n${context.blockedTerms
          .map((term) => `- ${term}`)
          .join("\n")}\n`
      : "";

  return `

## Step 7b — What you may say about the job

The user's disclosure level is **\`${context.info.value}\` (${context.info.label})**:
${context.info.shortDescription}
${degraded}
**You may say:**

${allows}

**You must not say:**

${blocks}
${terms}
**Employer and client names are enforced, not advised.** CraftHub applies the
same denylist server-side when a post is created: a post naming one is rejected
with HTTP 400 that names the offending term. If that happens, rewrite the post
around the term — retrying the same text will fail again.

**Every other item above is yours to enforce.** A post carrying one of them is
accepted and published exactly as written — nothing catches it after you.
CraftHub does not scan for ticket ids, customer names, internal codenames, unreleased products, architecture details or headcount figures.

For anything about where the user has worked, call **\`get_work_context\`**.
It returns their history with those same employer and client names stripped, and nothing else removed.
Read what comes back against the list above. Do **not** infer the
employer from the git remote, the package name, the directory path of any
repository in the set, code comments or commit trailers — that is exactly the
leak this policy prevents. The
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
    ? `The user named the repository **${repo}**, which NARROWS this run to that one repository — if the current directory is a different repo, say so and stop rather than summarizing the wrong work.`
    : `The user did not name a repository, so this post covers **every repository they work in**, not just the one you happen to be standing in. Step 1 resolves that set.`;

  // The user naming a repo is an explicit narrowing, so the resolution ladder
  // is skipped entirely rather than merely reordered.
  const resolveRepoSet = repo
    ? `The user named **${repo}**, so the set is exactly that one repository. Resolve
it to an absolute path (\`git -C . rev-parse --show-toplevel\` if you are already
inside it) and call it \`<REPOS>\` — a set of one. Do not add the other
repositories they may have configured: they asked for this one.`
    : `A developer's week is spread across several checkouts on one machine — an API
here, a mobile app there, a side project — and one post should cover all of it.
Work out the repository set BEFORE anything else, taking the FIRST source below
that answers:

1. **\`~/.crafthub/repos.json\`** — written by the CraftHub setup wizard, and the
   answer whenever it exists:

   \`\`\`json
   { "repos": ["/abs/path/one", "/abs/path/two"] }
   \`\`\`

   Use exactly those paths, in that order. Check each one really is a git
   repository (\`git -C "<PATH>" rev-parse --show-toplevel\`) and drop the ones
   that are not — a moved or deleted checkout must not abort the whole run —
   then **name the skipped paths when you report back**, so the user can fix the
   file. If the file exists but is empty, unparseable, or lists no repository
   that survives that check, fall through to the next source and say so.

2. **\`~/.crafthub/extractor.json\`** — the local extractor's settings file, whose
   \`repos\` array holds absolute paths in the same shape. Read it only when
   \`repos.json\` is absent, so a user who already configured the extractor does
   not have to write the same list twice. Same git check, same reporting.

3. **The current working directory alone** — \`git rev-parse --show-toplevel\`.
   When you land here, tell the user plainly in your report: this post covers
   only that one repository, and listing every repository they work in under
   \`"repos"\` in \`~/.crafthub/repos.json\` makes the next run cover all of them.

**Never go looking for repositories yourself.** Do not scan the home directory,
do not walk \`~/code\` or \`~/projects\`, do not glob for \`.git\`. It is slow, and
it finds checkouts the user never meant to publish anything about — a client's
code, a colleague's clone, an experiment, a fork of someone else's project. The
repository set is what the user configured, never what happens to be on disk.

Call the surviving list \`<REPOS>\` and hold it for the rest of the workflow.`;

  const repoArgumentLine = repo
    ? `\`"${repo}"\``
    : `the scope marker from Step 5 — the repository name when \`<REPOS>\` turned out to be a single repo, otherwise the count (\`"4 repositories"\`). Never one repo's name when the post covers several: it is stored as post metadata, shown in the user's review queue and served with the post publicly, so naming one repository would claim the rest were not included`;

  const statusLine =
    status === "draft"
      ? `Publish with \`status: "draft"\`. Tell the user where to review it.`
      : `Publish with \`status: "published"\` — but only after the user has seen the final text. If you cannot show it to them first, or anything in it is uncertain or sensitive, publish as \`"draft"\` instead and say why.`;

  return `# Turn my commits into a CraftHub post

You are writing a CraftHub post for the developer whose profile this MCP server
is authenticated against. Target window: **${windowLabel}**.

${repoLine}

Do not skip steps and do not guess at facts. Every claim in the final post must
come from something you actually read in one of the repositories.

Step 0 is not optional: this prompt is designed to be run unattended on a
schedule, so it must be safe to fire twice.

---

## Step 0 — Check this period is not already covered

Call **\`list_my_posts\`** first, before resolving repositories or reading any git
history.

Look at the most recent post whose \`source\` is \`mcp\` or \`commit\`. If one of
them already covers the target window — as a rule of thumb, a weekly run finds
one created in the last 6 days, a two-weekly run one in the last 13, a monthly
run one in the last 27 — then **stop here**. Say which post already covers the
period and do not create another.

This step exists because this workflow is meant to be run on a schedule, and
every scheduler double-fires eventually: a catch-up run after the machine
wakes, a retried job, a user running it manually the same afternoon it fired.
Two posts describing overlapping work are worse than none — each one's numbers
are individually indefensible. Stopping is the correct, successful outcome.

## Step 1 — Resolve which repositories this post covers

${resolveRepoSet}

Every git command in the steps below is run **once per repository**, with
\`git -C "<REPO>"\`. Never \`cd\` between repositories and never assume the current
working directory is one of them — the agent may have been started anywhere.

## Step 2 — Establish the window and the author

${establishWindow}

Then find out who "the user" is, so you only summarize *their* commits. Identity
is per-repository: people commit to work repos under a work email and to their
own under a personal one, so collect it for each repo in \`<REPOS>\`:

\`\`\`bash
git -C "<REPO>" config user.email
git -C "<REPO>" config user.name
\`\`\`

Treat **every** email you find this way as the user's. Filter by the email
belonging to that repository when it has commits from several people; if the
user is its only author, filtering is optional.

## Step 3 — Read the commits, repository by repository

Run this block for each \`<REPO>\` in \`<REPOS>\`, keeping the results separate for
now — you need to know which facts came from where before you merge them.

\`\`\`bash
# One line per commit: hash, date, subject
git -C "<REPO>" log --since="<START>" --author="<EMAIL>" --no-merges \\
  --date=short --pretty=format:'%h %ad %s'

# Full messages — commit bodies often explain the "why" the subject omits
git -C "<REPO>" log --since="<START>" --author="<EMAIL>" --no-merges \\
  --pretty=format:'%h%n%B%n---'

# How many commits in THIS repo — the commitCount argument is the sum of these
git -C "<REPO>" log --since="<START>" --author="<EMAIL>" --no-merges --oneline | wc -l
\`\`\`

A repository with no commits in the window is simply not part of this post —
drop it and move on, do not mention it. Only if **no** repository in the set has
commits should you widen the window or drop the author filter, and if that still
finds nothing, tell the user what you looked at and stop. Never publish a post
about a period with no commits.

## Step 4 — Find out what actually changed

Commit subjects lie by omission. For each repository that had commits, look at
the diff shape before you write:

\`\`\`bash
# Which areas of the codebase moved, and by how much.
# <FIRST> is that repo's oldest commit hash in the window, from Step 3.
git -C "<REPO>" diff --stat "<FIRST>^..HEAD"

# Files touched most often — usually where the real work is
git -C "<REPO>" log --since="<START>" --author="<EMAIL>" --no-merges \\
  --name-only --pretty=format: | sort | uniq -c | sort -rn | head -30
\`\`\`

Then **read the interesting parts**. Spend the reading budget where the commits
are: open the 3–5 most-changed files in the one or two repositories that moved
most, and skim for anything that looks like a headline — a new user-facing
feature, a migration, a performance fix, a new endpoint or package. Check
\`README\`/\`CHANGELOG\` diffs and any new test files; they describe intent in
plain language. If a change mentions a benchmark, a bundle size, a coverage
number or a timing, note the exact figure. For the smaller repositories, the
commit messages plus \`--stat\` are usually enough.

## Step 5 — Aggregate the facts into ONE set before writing a word

The output is a single post about the user's week, not one section per project.
Merge everything you gathered into this one list. If a slot is genuinely empty,
leave it empty — do not fill it with a guess.

1. **Scope marker** — how many repositories actually contributed commits. One
   repo: its name (e.g. \`crafthub-v.1\`), never the path or remote URL. Several:
   the count, written as \`"4 repositories"\`. This is the \`repo\` argument. It is
   metadata rather than body text, but it ships with the post on the public
   profile too, so it may be a bare name or a count and nothing else — and for
   private or client work, nothing at all.
2. **commitCount** — the sum across every repository in the window. Counted, not
   estimated.
3. **What shipped** — 2–5 items, each a user-visible capability, drawn from all
   the repositories at once. Collapse the ten commits that built one feature
   into one item; collapse the same capability built across two repositories
   (an endpoint and the screen that calls it) into one item too. Drop \`wip\`,
   \`fixup\`, formatting and dependency-bump commits entirely unless the bump
   *was* the work.
4. **Who it helps and how** — for each item, the impact on a user, a teammate,
   or the system. This is the part recruiters read.
5. **Real numbers** — only ones you saw: latency, bundle size, coverage,
   endpoints added, rows migrated, build time, error rate. Never invent one, and
   never add up numbers from different repositories into a single figure that
   was never measured.
6. **Stack touched** — the actual languages, frameworks and services in the
   changed files across all repositories (\`package.json\` diffs, imports,
   migration files). Searchable names: "TypeScript, React 19, Fastify, Drizzle,
   PostgreSQL". Breadth across repositories is evidence — say it as a stack, not
   as a project list.
7. **Links** — a PR, release, deployed URL or demo, if one exists. Check
   \`git log\` bodies and the remote (\`git -C "<REPO>" remote get-url origin\`).
   Only include a link that is public.
8. **Architecture and one decision** — the pattern the work used and what it
   enables ("idempotent webhook ingestion, so replays can't double-count"), and
   one decision you can defend with its trade-off. Taken from the diffs you
   actually read, never invented.

## Step 6 — Write the post

Write it per the CraftHub post quality guide, reproduced in full below (also
available as the MCP resource \`${POST_GUIDELINES_URI}\`).

The short version: **outcome over mechanics**. 80–200 words, Markdown, first
person, past tense, 2–5 bullets, stack named, no hype. A bulleted list that
mirrors your commit log is a failed post — rewrite it into capabilities.

Write a title too (under 70 characters, specific). Do not let the tool derive one.

Write for search as well (guide section 2b): recruiter queries are matched with
semantic embeddings in which the **title and tags weigh double** and a long
body is clipped. So — without naming employer, repo or internal links — the
post must name what shipped in feature-domain terms, carry the stack both as
prose and as \`tags\`, state the architecture/pattern and what it enables, and
include the one decision-with-trade-off from Step 5. If any of the four is
missing, the post will not surface for the searches it deserves.

**One post, whatever the repository count.** The absolute rule stands: no
repository name, path or remote may appear in the text — which also means the
post is never a list of projects with a bullet each. Write the week as
capabilities and let the breadth show through them. Work spanning an API and a
mobile app becomes "shipped an availability endpoint and the booking screen that
consumes it", not "in project A… and in project B…". If two repositories were
two halves of one feature, that is one bullet. If they were genuinely unrelated,
group them by capability or by stack — never by which checkout they live in. A
reader must not be able to count the repositories, and does not care.

## Step 7 — Safety pass

Before publishing, re-read your draft and strip:

- commit SHAs, branch names, ticket ids (\`PROJ-123\`, \`#4471\`), file paths;
- any secret, token, key, connection string, internal hostname or \`.env\` value
  you saw in a diff — and tell the user it appeared there;
- client names, private repo names, and proprietary detail. For private or
  client work, describe the capability and omit the identifying detail, or ask
  the user first;
- repository names, directory paths and remotes of every repository in
  \`<REPOS>\`, including any you skipped. Reading several checkouts is what makes
  this easy to get wrong — a path is not a fact about the work.
${buildDisclosureSection(disclosureLevel)}

## Step 8 — Publish

Show the user the final title and body. Then call **\`create_commit_summary_post\`**:

- \`summary\` — the finished Markdown body (required; the tool publishes it verbatim and runs no AI of its own)
- \`title\` — your headline
- \`period\` — \`"${periodValue}"\`
- \`repo\` — ${repoArgumentLine}
- \`commitCount\` — the summed count from Step 5
- \`tags\` — 2–5 lowercase tags naming the technologies, e.g. \`["typescript", "fastify", "postgres"]\`. Never omit them: tags weigh double in recruiter search
- \`status\` — ${statusLine}

Report back the post id the tool returns, which repositories the post covered
(by count, and by name to the USER only — never in the post), and anything you
skipped in Step 1.

---

${POST_GUIDELINES}`;
}
