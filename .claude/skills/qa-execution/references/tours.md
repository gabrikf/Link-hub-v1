# Tours

A **tour** is a thematic lens for exploration. It frames the session around a specific failure pattern users actually hit. Picking the right tour for a charter (charters are planned by the `qa-report` skill) is the single biggest predictor of whether the session finds real bugs.

This catalog is the canonical source — the only home of tour definitions across both QA skills.

## Contents

- How to use this file (one tour per charter)
- Tour catalog (Feature, Disclosure, Garbage, Back-Button, Multi-Tab, Network, Theme, Time & Formatting, Paste, Autofill, Interrupt)
- Picking the tour for a charter (surface-to-tour matrix)
- Anti-patterns
- Sources

## How to use this file

Every charter binds to **exactly one tour**. Pick by matching the surface to the tour's *"when to use"* clause. During the session, the tour is the lens — every interaction is asked: *"would this matter for this tour's theme?"*

The Theme tour is the one exception to "one tour per charter" in a narrow sense: **every** browser charter walks its surface in both light and dark regardless of its tour (a standing dimension, per the SKILL). A Theme *tour* charter goes further — it hunts theme bugs on purpose across a whole surface rather than noticing them in passing.

## Tour catalog

### Feature Tour

- **Theme:** does the headline functionality work end-to-end as advertised?
- **When to use:** new features, smoke after a deploy, sanity-checking a recent change.
- **Mission verbs:** "use", "complete", "achieve".
- **Off-script actions:** none — this is the closest tour to scripted testing. Walk the documented happy path; verify every promise the landing surface makes.
- **What to look for:** missing functionality, broken promises, mismatch between the README/UI copy and behavior.
- **Sample evidence:** screenshot of the goal-achieved state, with timestamp and theme.

### Disclosure Tour

- **Theme:** can an agent say something about this person that this person did not authorize?
- **When to use:** anything touching `/dashboard/settings` (the disclosure policy, API tokens, git connections), `/dashboard/posts`, `/dashboard/posts/review`, the MCP tools, the extractor, or the public profile. **This is LinkHub's highest-value tour** — a leak here publishes a real person's real employment context to the open internet.
- **Mission verbs:** "reveal", "redact", "publish", "escalate".
- **Off-script actions:**
  - Set the policy to its most restrictive level, then ask the agent (through `create_post` / `create_commit_summary_post`) to write about work that unavoidably touches the employer. Does it redact, refuse, or leak?
  - Add a blocked term, then feed the agent work context that contains it — verbatim, lowercased, hyphenated, inside a URL, inside a code identifier (`AcmeCorpClient`), inside a file path, inside a commit message quoted in the body.
  - Publish under a permissive policy, then tighten the policy. **Does the already-published post retroactively comply, or is the old post still naming the employer on the public profile?** Check the public profile logged out, which is where a stranger reads it.
  - Approve a post in the review queue, then edit it with `update_post` from the agent side. Does the edit re-enter review, or does it go live unreviewed?
  - Ask for a post while the policy tool is failing or the policy is unset. Does the agent default to *silent* or to *chatty*? Defaulting open is a leak.
  - Read `get_work_context` as the agent and compare it, field by field, against what the policy claims to allow. A context payload richer than the policy is a leak waiting for a prompt.
  - Have the agent post; then read the same post through `list_my_posts`, the review queue, the public profile and (if the API exposes it) the public JSON. **Redaction must hold on every surface** — a body redacted in the UI but intact in the API payload is a leak.
- **What to look for:** an employer name, client name, repository name, internal project codename or blocked term appearing above the chosen disclosure level, on any surface; redaction applied at render time instead of at storage time; policy changes that don't reach already-published content; the review queue showing a redacted preview of a post that is stored unredacted.
- **Severity default:** a confirmed leak is **Data-Loss** at minimum — the user's private context escaped without consent — and **Blocks-Completion** if the product offers no way to take it back.
- **Sample evidence:** the policy screen at the level set, the agent's exact tool call and response, the post as rendered on the logged-out public profile, and the raw API payload for the same post.

### Garbage Tour

- **Theme:** can the product survive being mistreated?
- **When to use:** any input-heavy surface — the resume PDF import, the job-description box in recruiter search, post bodies, blocked-term lists, profile block content.
- **Mission verbs:** "abuse", "stress", "corrupt".
- **Off-script actions:** paste a 10,000-character job description; paste one word; upload a 0-byte PDF, a 60-page PDF, a password-protected PDF, a `.docx` renamed to `.pdf`, an image-only scanned PDF with no text layer; rapidly double-click submit; type emoji, RTL text, null chars and SQL keywords (not as a security test — as a *realistic copy-paste from another app* test); spam undo/redo in the layout editor until state breaks; drag a profile block onto itself; drag every block into one column.
- **What to look for:** silent data loss, partial writes, a frozen editor, 500s with no user feedback, an import that half-lands and leaves a profile in a state the user can't fix, an embedding request fired for empty input.
- **Sample evidence:** screenshot of the corrupted/missing state, plus the input that triggered it.

### Back-Button Tour

- **Theme:** the browser back button is a user expectation, not a developer feature.
- **When to use:** multi-step flows (sign-up, resume import), the review queue, modal-heavy surfaces, anything under `/dashboard`. TanStack Router is code-based here, so route state is exactly as good as someone made it.
- **Mission verbs:** "go back", "return", "undo navigation".
- **Off-script actions:** at every step, press back. Then forward. Then back again. Open the previous step in a new tab. Refresh during the back transition. Press back from a modal (Radix dialog). Press back from the "profile published" screen. Press back after approving a post. Bookmark `/dashboard/posts/review` and open it tomorrow.
- **What to look for:** state loss, ghost state ("you already imported this" when you didn't), a Radix dialog stuck open with the page behind it inert, form fields cleared, an approval re-fired, a layout arrangement reverted, broken auth redirects.
- **Sample evidence:** screenshot of state-after-back, with the URL bar visible and the previous step URL also captured.

### Multi-Tab Tour

- **Theme:** real users keep many tabs open and switch between them constantly.
- **When to use:** any surface where state is shared across sessions or tabs — the layout editor, the review queue, settings, and anything an agent can change underneath a human.
- **Mission verbs:** "open another tab", "duplicate session", "race".
- **Off-script actions:** open `/dashboard/layout` in two tabs, rearrange differently in each, save both; open the review queue in two tabs and approve the same post in both; have the agent publish through MCP while the review queue sits open — does it ever notice; log out in tab A while tab B has an unsaved arrangement; sign in as the recruiter in tab B and return to tab A as the candidate.
- **What to look for:** stale state, lost-update bugs (the second save silently winning), double-approval, session leak between tabs, a Zustand store and a TanStack Query cache disagreeing about the same object.
- **Sample evidence:** screenshots of both tabs side by side at the moment of divergence.

### Network Tour

- **Theme:** real users don't have wifi-fast.
- **When to use:** anything that does I/O — which is anything user-facing. Especially the resume import (LLM round trip), recruiter search (embedding + pgvector + an in-browser TF.js re-rank), and any MCP publish.
- **Mission verbs:** "stall", "drop", "throttle".
- **Off-script actions:** throttle to Slow 3G; cut the network mid-import; restore it — does the request retry, succeed, or silently fail; refresh during a long search; submit a search twice when the first looks stuck; watch what the AI Match % column does while the model is still loading.
- **What to look for:** infinite spinners with no timeout, optimistic UI showing success when the request failed, double submits, an import that lost the uploaded file on a blip, no offline indicator, a re-rank that renders `NaN%` or `0%` before the model is ready.
- **Sample evidence:** network panel screenshot showing the throttle profile + UI screenshot at failure.

### Theme Tour

- **Theme:** the app has two skins and only one of them gets built by default.
- **When to use:** any surface with new or restyled UI; any change to `apps/web/src/index.css`; any new `shared-components/` primitive. Given how cheap the bug is to introduce (one forgotten `dark:` variant) and how visible it is to a user, this tour earns a charter on every cycle that touched UI.
- **Mission verbs:** "switch", "re-read", "contrast".
- **Off-script actions:** walk the whole surface in light, then flip to dark and walk it again — same steps, same order. Flip mid-flow: open a modal in light, toggle to dark with the modal open. Reload while dark and confirm the theme survived. Check every state the surface has, not just the happy one: empty states, error banners, skeletons, toasts, disabled buttons, focus rings, chart and badge colors, the AI Match % pill, and anything drawn on a hardcoded white or `zinc-100` background.
- **What to look for:** dark text on a dark surface (or the reverse), a card that stayed white, a border that vanished, an icon that disappeared, a placeholder that dropped below readable contrast, a hardcoded hex where a token belongs, a theme that resets on reload or flashes light before dark.
- **Reference:** `DESIGN.md` at the repo root is the arbiter of what a surface *should* look like in each theme.
- **Sample evidence:** the same viewport in both themes, side by side, with the failing element in frame.

### Time & Formatting Tour

- **Theme:** dates, ranges and numbers are where a profile quietly lies about someone's career.
- **When to use:** work-history date ranges, post timestamps, the review queue's "waiting since", the AI Match % number itself, anything aggregated over a period.
- **Mission verbs:** "format", "span", "round".
- **Off-script actions:** set the device to a non-default timezone (Sydney, Anchorage) and re-read every timestamp; enter a work-history range ending today, ending "present", starting and ending the same month, and inverted (end before start); post something at 23:59 local and read the date it shows; cross a daylight-saving boundary; read a match percentage of exactly 0, exactly 100, and something that rounds at .5.
- **What to look for:** off-by-one days, a "present" role rendered as ending in 1970, a range that excludes its own edge, a duration computed in the server's timezone and displayed in the browser's, a percentage rendered with false precision or as a raw float.
- **Note:** LinkHub has **no i18n** — `<html lang="en">`, all strings hardcoded English. There is no translation coverage to check and no `t()` calls to add. This tour is about time and number handling only.
- **Sample evidence:** screenshot with the device timezone visible alongside the rendered value.

### Paste Tour

- **Theme:** real users paste from somewhere else, usually with formatting they didn't see.
- **When to use:** the job-description box in recruiter search (a recruiter pastes a JD out of an ATS or a Google Doc, every time), post bodies, profile block content, blocked-term lists.
- **Mission verbs:** "paste", "import", "transfer".
- **Off-script actions:** paste from Word (smart quotes, em-dashes, hidden styles); paste from a PDF (soft hyphens, ligatures, broken line wrapping); paste from a markdown editor (code fences, links); paste a bulleted JD with 40 lines of requirements; paste an image into a text field; paste with autofill firing simultaneously.
- **What to look for:** smart quotes rendering as entities, line-break loss that fuses two requirements into one, hidden formatting reaching the embedding call and skewing the match, a blocked term pasted with a non-breaking space that then fails to block.
- **Sample evidence:** screenshot of the visible pasted state + the stored value via a user-reachable read path (re-open, public profile, the API payload the product itself serves).

### Autofill Tour

- **Theme:** browsers auto-fill in ways developers don't see locally.
- **When to use:** sign-in and sign-up at `/`, and `/dashboard/settings`.
- **Mission verbs:** "let the browser do it", "save credentials", "auto-suggest".
- **Off-script actions:** save a password in the browser; visit `/` fresh; let autofill populate; submit. Let a password manager fill. Sign in with Google in one tab while the email form is autofilled in another. Let autofill populate the username field on the sign-up form and check what the resulting public profile URL becomes.
- **What to look for:** autofill into the wrong field; double-fill; submit-before-validation race; a username claimed from an autofilled value the user never read; an OAuth path and a password path both half-completing.
- **Sample evidence:** screenshot of the form post-autofill, before submit.

### Interrupt Tour

- **Theme:** real life interrupts users.
- **When to use:** long flows — the resume PDF import, a long layout-editing session, a recruiter working through a result list. Mobile especially.
- **Mission verbs:** "interrupt", "background", "abandon-and-resume".
- **Off-script actions:** start the resume import; lock the phone for 5 minutes; unlock and continue. Start rearranging blocks; switch apps; return — is the arrangement still there. Start a search; take a call; come back to the results. Leave the review queue open for an hour with pending posts and then approve one.
- **What to look for:** session expiry mid-flow with no recovery, lost layout state on app switch, an upload that silently failed when the app was backgrounded, an approval that acts on a post the agent has since edited, "resume from here" that resumes from the wrong place.
- **Sample evidence:** before-interrupt screenshot + after-interrupt screenshot + the interrupt cause noted in the debrief.

## Picking the tour for a charter

| Surface | First-choice tour | Second-choice tour |
|---|---|---|
| Sign up / sign in (`/`) | Feature Tour | Autofill Tour |
| Resume PDF import | Network Tour | Garbage Tour |
| Profile layout editor (`/dashboard/layout`) | Multi-Tab Tour | Back-Button Tour |
| Public profile (`/profile/<username>`) | Theme Tour | Disclosure Tour |
| Recruiter search (`/dashboard/search`) | Paste Tour | Network Tour |
| AI Match % / re-rank | Time & Formatting Tour | Network Tour |
| Posts list (`/dashboard/posts`) | Theme Tour | Back-Button Tour |
| Post review queue (`/dashboard/posts/review`) | **Disclosure Tour** | Multi-Tab Tour |
| Settings — disclosure policy | **Disclosure Tour** | Back-Button Tour |
| Settings — API tokens / git connections | Feature Tour | Multi-Tab Tour |
| Agent publishing via MCP | **Disclosure Tour** | Interrupt Tour |
| Any new or restyled UI | Theme Tour | Feature Tour |
| Dashboard overview | Feature Tour | Theme Tour |

## Anti-patterns

- **Sampling all tours in one charter** — dilutes everything. One tour per box.
- **Tour-without-persona** — a tour is the *what*, a persona is the *who*. Charters need both.
- **Inventing a tour mid-session** — note the new pattern in the debrief and propose it for the catalog; don't pivot mid-box.
- **Treating a tour as a checklist** — the bullets are prompts, not requirements. The mission is to *find bugs in the theme*, not to execute every bullet.
- **Running the Disclosure Tour only on the settings screen** — the policy is set in settings but enforced everywhere. The tour follows the data to the public profile and the API payload, or it proves nothing.
- **Skipping dark mode because the tour isn't the Theme Tour** — it is a standing dimension on every browser charter.

## Sources

- Testlio — *Exploratory Testing 101: Going Off-Script* (rapid double-clicks, back/refresh mid-workflow, long strings, special chars, large files).
- Sahipro — *Types of Exploratory Testing*: scenario-based, strategy-based, freestyle.
- Thoughtworks — *10 tips for an Agile QA mindset, Tip 3 (corner cases)*: concurrent users, multiple uploads, background processes — the seed material for Multi-Tab, Garbage, and Interrupt tours.
- James Whittaker — *Exploratory Software Testing*: the original "tour" framing. This catalog modernizes that taxonomy for current web QA and adds the Disclosure and Theme tours, which are specific to this product.
