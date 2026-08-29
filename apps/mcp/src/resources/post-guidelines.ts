import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Canonical URI of the post-quality guide. Referenced from the prompts too. */
export const POST_GUIDELINES_URI = "crafthub://guides/post-quality";

/**
 * The house style guide for CraftHub posts.
 *
 * This is the single source of truth for "what makes a post recruiter-worthy".
 * It is exposed as an MCP resource (so a host agent can read it unprompted) and
 * embedded into the workflow prompts (so an agent that never lists resources
 * still gets it). Keep it self-contained — an agent may read it with no other
 * context about CraftHub.
 */
export const POST_GUIDELINES = `# CraftHub post quality guide

You are writing on behalf of the developer who owns this CraftHub profile. Their
posts are read by **recruiters, hiring managers, and engineers who have never
seen this codebase**. Assume the reader has 20 seconds, no context, and no
patience for jargon they can't evaluate.

A CraftHub post is not a changelog. A changelog answers *"what changed?"*. A
CraftHub post answers *"what is this person able to build?"*.

---

## 1. The one rule: outcome over mechanics

For every sentence, ask: *does this tell the reader what the software can now
do, or only which files moved?* Keep the first kind.

| Mechanics (cut it) | Outcome (keep it) |
| --- | --- |
| "Refactored the auth middleware" | "Cut login latency from 800ms to 90ms by moving session checks to an in-memory cache" |
| "Added tests" | "Brought the payments module to 94% coverage, closing the last untested refund path" |
| "Fixed bug in parser" | "Fixed a parser crash on multi-byte characters that was breaking imports for non-English users" |
| "Updated deps" | "Migrated to React 19, dropping 40KB from the client bundle" |

Mechanics are still worth naming when they *are* the achievement — a migration,
a schema redesign, an architectural change. Name the reason and the payoff.

## 2. What a strong post contains

Four things, in roughly this order:

1. **The headline outcome.** One sentence. What shipped and who it helps.
2. **The 2–5 things that actually landed.** Grouped by user-visible capability,
   not by commit. Merge ten commits about one feature into one bullet.
3. **Concrete numbers wherever they exist.** Latency, bundle size, test
   coverage, rows migrated, endpoints added, error rate, build time, number of
   commits. A number the reader can picture beats an adjective every time.
   Never invent one — if you didn't measure it, don't claim it.
4. **The stack, named explicitly.** Recruiters search for these words. Say
   "TypeScript, Fastify, Drizzle, PostgreSQL", not "the backend". Only list
   what this work actually touched.

Close with a link when there is something to look at: a PR, a release, a demo,
a deployed URL, a repo. Pass it as \`externalUrl\` when using \`create_post\`,
or inline it in the body.

**A week spread across several repositories is still one post.** Most developers
move between an API, a front end, a mobile app and a side project in the same
week; the reader is hiring the person, not browsing their checkouts. Group the
bullets by capability, never one bullet per project, and never a "in project A…
in project B…" structure. Breadth belongs in the post as the stack and the range
of problems solved — "an availability endpoint and the booking screen that
consumes it" — never as a roll call of repositories, whose names may not appear
in a post at all (section 4).

## 2b. Write for search as well as for the reader

Recruiters do not scroll feeds; they search. CraftHub matches their queries
against every post with semantic embeddings, and the weighting is not even:
**the title and tags count double, the body counts once and is clipped when
long**. A capability buried in paragraph six barely registers; the same
capability named in the title and tags is what surfaces this profile at all.

So every post must contain — while still never naming the employer, a repo, or
an internal link — all four of these:

1. **What shipped, in feature-domain terms.** "Payment retry flow", "profile
   layout editor", "webhook ingestion pipeline" — the words a hiring manager
   would actually type. Not "various fixes", not a module name only this
   codebase knows.
2. **The tech stack, twice.** Once as prose in the body ("TypeScript, Fastify,
   Drizzle, PostgreSQL") and once more as \`tags\`. Tags are the
   highest-leverage searchable surface in the product; a post without them is
   invisible to a stack-filtered search however good its body is.
3. **The architecture or pattern, and what it enables.** "Event-driven
   ingestion with idempotent replays, so a flaky webhook can never
   double-count an event." "Clean architecture with in-memory test doubles, so
   the whole domain suite runs without a database." The pattern name alone is
   a buzzword; pattern plus the capability or scale it buys is evidence.
4. **One real decision and its trade-off.** "Chose a deterministic template
   over an LLM for digests — reproducible numbers, at the cost of prose
   variety." One is enough, and it is the sentence that reads as senior.

None of this loosens section 3 below: feature domains, stacks, patterns and
trade-offs are all sayable at every disclosure level precisely because none of
them identify an employer.

## 3. What you may say about your job

This is the section that makes a post genuinely useful to a recruiter while
keeping the user's employer safe. The user picks a **disclosure level** in
CraftHub settings; \`summary\` is the default and the strictest. Call
\`get_disclosure_policy\` for the live level, or read
\`crafthub://policy/disclosure\`.

**Always safe to say — at every level.** These are what actually demonstrate
capability, and none of them identify an employer:

- **Role and seniority.** "Senior backend engineer", "tech lead of a four-person
  team". The title is the user's, not the company's.
- **Duration.** "Three years on payments systems", "an 18-month platform
  migration". Longevity is evidence; the calendar is not a secret.
- **Team shape, in generic terms.** "A small platform team", "embedded in a
  squad with two designers". Never headcount for the company as a whole.
- **The tech stack, by searchable name.** "TypeScript, Fastify, Drizzle,
  PostgreSQL, Redis, AWS". This is the single most searchable thing in a post.
- **Engineering practices and strategies.** TDD, trunk-based development,
  event-driven architecture, CI/CD, pair programming, code review culture,
  domain-driven design, infrastructure as code, incident review. How someone
  works is often more telling than what they shipped.
- **The problem domain, generically.** "Payments", "logistics", "healthcare
  scheduling", "developer tooling". Not "the PIX reconciliation pipeline".
- **Scale in ORDERS OF MAGNITUDE, never exact figures.** "Hundreds of thousands
  of daily transactions", "single-digit millions of rows", "tens of services".
  An exact figure is a fingerprint: there is often exactly one company in a
  market processing precisely 4.1M events a day.
- **Outcome metrics that don't identify the employer.** "Cut p95 latency from
  800ms to 90ms", "halved build time", "brought coverage to 94%", "removed 40KB
  from the bundle". Relative improvements are safe; absolute business figures
  are not.
- **Public links.** An open-source repo, a public PR, a released product page, a
  conference talk, a published blog post.

**Never ships — regardless of how the sentence is phrased:**

- **Employer and client names at \`summary\` level.** This is enforced: CraftHub
  rejects the post with HTTP 400 naming the term. At \`detailed\` and \`full\` the
  employer may be named; the level tells you which.
- **Internal repository, service, project and codenames.** \`billing-svc-v2\`,
  "Project Falcon", \`acme-internal-sdk\`.
- **Ticket and issue ids.** \`PROJ-1234\`, \`#4471\`, Jira/Linear URLs.
- **Customer names.** Including the ones that appear in test fixtures and seed
  data — those are real accounts surprisingly often.
- **Unreleased products and unannounced features.**
- **Internal architecture specifics.** Topology diagrams, vendor contracts,
  cluster layout, queue names, region choices, security controls.
- **Headcount and revenue figures.** "We're a team of 12 with $4M ARR" is the
  employer's information to share, not the user's.
- **Anything inferred from the working tree.** Do not read the employer off a
  git remote, an npm scope (\`@acme/ui\`), a directory path
  (\`~/work/acme/api\`), a code comment, a \`CODEOWNERS\` file or a commit
  trailer. Use \`get_work_context\` — the only sanctioned source, and the one
  place the user's blocked employer and client names have already been stripped.
  Nothing else on this list is stripped anywhere; keeping it out is your job.

**Rewriting, not deleting.** A blocked term is not a dead post. "Rebuilt Acme
Corp's checkout" becomes "Rebuilt a high-traffic e-commerce checkout flow" —
same evidence of ability, no employer named. If a post is rejected, rewrite
around the term; publishing the same text again will fail the same way.

## 4. What to leave out — non-negotiable

- **Raw commit messages.** Never paste \`git log\` output, subject lines, or a
  bulleted list that mirrors commits 1:1. This is the single most common failure.
- **Commit SHAs, branch names, ticket ids** (\`PROJ-1234\`, \`#4471\`), internal
  code names, and file paths. They mean nothing to the reader.
- **Secrets and credentials.** API keys, tokens, connection strings, \`.env\`
  contents, private hostnames, customer names, internal URLs. If a diff exposed
  one, do not repeat it — and mention to the user that it appeared.
- **Private repository detail.** If the work is in a private or client repo,
  describe the *capability* and omit the client, the repo name, and anything
  proprietary. When in doubt, ask the user before publishing. When a post covers
  several repositories and only some are private, that is not a licence to name
  the public ones as the "real" scope — repository names stay out either way.
- **Filler.** "Excited to share", "hard work pays off", "game-changing",
  "leveraging synergies". Hype reads as noise; specifics read as competence.
- **Unearned credit.** Don't describe work the user didn't do. Vendored code,
  dependency bumps, and generated files are not achievements.

## 5. Length, tone, format

- **Length:** 80–200 words for a weekly update. Long enough to be concrete,
  short enough to finish. Never exceed 20,000 characters (the API limit).
- **Tone:** first person, past tense, plain, confident, no exclamation marks.
  "Shipped X. It does Y. Cut Z by 40%."
- **Format:** Markdown. An optional one-line intro, then 2–5 \`-\` bullets, then
  an optional closing line with the stack and links. Use \`##\` sparingly; most
  posts need no headings at all. No tables, no code blocks longer than a line.
- **Title:** under 70 characters, specific, no trailing punctuation. Prefer
  "Shipped a layout editor with live mobile preview" over "Weekly update".

## 6. Field mapping — \`create_commit_summary_post\`

| Field | Required | What to put in it |
| --- | --- | --- |
| \`summary\` | yes | The finished Markdown body, written per this guide. The tool publishes it verbatim; it runs no AI of its own. |
| \`title\` | no | The headline (< 70 chars). Omitted → derived from repo + period, which is worse. Always pass one. |
| \`period\` | no | What the summary covers: \`"weekly"\`, \`"daily"\`, or a range like \`"2026-07-14..2026-07-21"\`. |
| \`repo\` | no | The **scope** of the summary, not a project label. One repository: its name only, e.g. \`"crafthub-v.1"\` — not the full path, not the remote URL. Several repositories in one post: the count, e.g. \`"4 repositories"\`. Never one repo's name when the post covers more, and never a list of names. Omit for private/client work. |
| \`commitCount\` | no | Number of the user's own commits the summary is based on, summed across every repository covered. Count them; don't estimate. |
| \`tags\` | always pass it | 2–5 lowercase tags naming the technologies: \`["typescript", "fastify", "postgres"]\`. Tags are embedded at double weight for recruiter search (see 2b) — a post without them is invisible to a stack-filtered search. Real technology names, never \`["update"]\`. |
| \`status\` | no | \`"published"\` (default), \`"pending_review"\` or \`"draft"\`. Use \`"pending_review"\` whenever this runs unattended — the post stays private until the user approves it. Use \`"draft"\` when the user hasn't approved the text, or when anything in it might be sensitive. |

\`repo\`, \`commitCount\` and \`period\` are stored as post metadata with
\`source: "commit"\`. The prose a reader reads is \`title\` + \`summary\`, but the
metadata travels with the post — including on the public profile feed — so it is
publishable text too, held to the same rules: a scope marker, never a path, a
remote or a client's repository name.

For a post that isn't derived from commits, use \`create_post\` instead — it adds
\`coverImageUrl\`, \`images\`, and \`externalUrl\`.

## 7. Worked example

Same week of work, same commits.

**Weak — a commit log with bullets (do not do this):**

> ### Weekly update
> - feat: add layout editor
> - fix: mobile mirroring bug
> - chore: bump deps
> - feat(mcp): posts domain + MCP server
> - fix: PR #212 review comments
> - wip
>
> 14 commits this week in feat/posts-mcp-profile-epic.

Nothing here tells a reader what the software does, who it helps, or what the
author is good at. Branch names and \`wip\` are noise.

**Strong — the same week, rewritten:**

> ### Shipped a drag-and-drop profile editor with live mobile preview
>
> Spent the week making CraftHub profiles editable without touching code.
>
> - Built a drag-and-drop layout editor where the desktop and mobile canvases
>   stay mirrored, so a change in one is reflected in the other instantly.
> - Added direct file uploads for avatars and cover images, replacing the
>   paste-a-URL flow that was losing about a third of users at that step.
> - Opened the whole posts API to AI agents over MCP, so a coding assistant can
>   publish an update straight from a terminal.
>
> TypeScript, React 19, Fastify, Drizzle, PostgreSQL. 14 commits.
> Demo: https://example.com/crafthub

Same raw material. The second one is evidence of ability; the first is a diff.

---

## 8. Before you publish

Run this checklist. If any answer is "no", fix it first.

- [ ] Could a non-engineer read the first sentence and know what shipped?
- [ ] Is every bullet an outcome, not a file or a commit?
- [ ] Are there real numbers, and are they ones you actually verified?
- [ ] Is the stack named with searchable technology names — in the body AND as
      \`tags\`?
- [ ] Would this post match the searches it deserves: feature domain in the
      title, the pattern with its payoff, one decision with its trade-off?
- [ ] Zero SHAs, ticket ids, branch names, secrets, or client names?
- [ ] Does every employment claim come from \`get_work_context\` rather than
      from the git remote, the package scope or the directory name?
- [ ] Is every figure an order of magnitude or a relative improvement, rather
      than an exact business number that fingerprints the employer?
- [ ] Under 200 words?
- [ ] If anything is uncertain or sensitive, is it going out as a \`draft\`?

Show the user the final text before publishing. If they haven't approved it,
publish with \`status: "draft"\` and tell them where to review it.
`;

/**
 * Registers the post-quality guide as a readable MCP resource so the host agent
 * can pull the house style on its own, without the user pasting rules anywhere.
 */
export function registerPostGuidelines(server: McpServer): void {
  server.registerResource(
    "post_quality_guide",
    POST_GUIDELINES_URI,
    {
      title: "CraftHub post quality guide",
      description:
        "House style for CraftHub posts: what makes a post recruiter-worthy " +
        "(outcome over mechanics, real metrics, named stack, links to shipped " +
        "work), how recruiter search weighs it (title and tags count double — " +
        "name the feature domain, the stack, the pattern and one trade-off), " +
        "what must never appear (raw commit messages, ticket ids, secrets, " +
        "private repo detail), length/tone targets, a worked weak-vs-strong " +
        "example, and the exact field mapping for create_commit_summary_post. " +
        "Read this before writing any post.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: POST_GUIDELINES,
        },
      ],
    }),
  );
}
