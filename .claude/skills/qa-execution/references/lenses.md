# Experiential Lenses

Seven qualities a real user *feels* that no single feature owns: disclosure integrity, usability, accessibility, perceived performance, theme & compatibility, error recoverability, production parity. A dogfooder holds these lenses **during** journey walks, then runs one dedicated lens pass over the two widest journeys (Step 5) — never as a separate suite of cases.

This pass is intentionally lightweight — full audits (WCAG conformance, Lighthouse budgets) belong to dedicated tooling, indexed from the automation backlog when needed. The one lens that is *not* lightweight is the first: a disclosure failure is never "noted for later".

## Contents

- 1. Disclosure integrity
- 2. Usability (Nielsen short list)
- 3. Accessibility (quick check)
- 4. Perceived performance
- 5. Theme & compatibility
- 6. Error recoverability
- 7. Production parity
- Running the lens pass (45-minute box)
- Anti-patterns
- Sources

## 1. Disclosure integrity

**LinkHub's defining lens.** The product's promise is that a coding agent can write publicly about your work *without* saying who you work for beyond what you allowed. Every surface that renders agent-authored content — the posts list, the review queue, the public profile, the API payload behind it — is answerable to the policy set in `/dashboard/settings`.

Walk the surface and answer each, citing the journey step:

- [ ] **The policy is legible.** Can this persona tell, from the settings screen alone, what an agent may and may not say about them? Vague levels are a `Trust-Damage` finding on their own.
- [ ] **Enforcement is at storage, not at paint.** The redacted body is redacted *everywhere* — UI, `list_my_posts`, the public API payload. Compare at least two surfaces for the same post.
- [ ] **The default fails closed.** With the policy unset, unreadable, or the tool erroring, the agent publishes nothing rather than everything.
- [ ] **Blocked terms hold under real spellings.** Case, hyphens, camel-case identifiers, URLs, file paths, quoted commit text.
- [ ] **Tightening is retroactive, or the product says plainly that it isn't.** Silence here is the worst answer.
- [ ] **The human is genuinely in the loop.** A post reaching the public profile without passing review — including after an `update_post` on an approved post — defeats the queue.
- [ ] **Withdrawal works.** Delete removes it from every surface a reader can reach.
- [ ] **The agent's context is no richer than its permission.** `get_work_context` should not hand an agent facts the policy forbids it to use.

Severity defaults: a confirmed leak above the chosen level is **Data-Loss** at minimum, **Blocks-Completion** when there is no way to take it back. A policy the user cannot understand is `Trust-Damage`. Never `Cosmetic`, ever.

## 2. Usability — Nielsen short list

Walk the surface and answer each, citing the journey step:

- [ ] **Visibility of system status** — feedback within 1 second of every action?
- [ ] **Match with the real world** — copy in the user's language, not the system's? (No "Entity created", no "embedding job enqueued".)
- [ ] **User control and freedom** — undo, cancel, or back out of every committed action? Especially: unpublish a post, undo a layout rearrangement, re-run an import.
- [ ] **Consistency** — same noun for the same thing across dashboard and profile; same icon for the same action?
- [ ] **Error prevention** — confirmation on irreversible actions; inline validation before submit?
- [ ] **Recognition over recall** — nothing to remember from a previous screen? (Does the recruiter have to remember which candidate they were comparing?)
- [ ] **Flexibility for power users** — shortcuts for repeated actions?
- [ ] **Aesthetic and minimalist** — every word and button earning its place, per `DESIGN.md`?
- [ ] **Help users recover** — plain-language errors with a specific next step?
- [ ] **Explaining the number** — does the AI Match % tell the recruiter anything about *why*? An unexplained score is a usability failure with trust consequences.

Unmet heuristics are usually `Friction` or `Trust-Damage` findings.

## 3. Accessibility — quick check

Quick check, not a conformance audit.

**Keyboard:** every interactive element reachable with Tab; tab order matches visual order; visible focus indicator; Escape closes Radix dialogs; no keyboard trap. **The drag-and-drop layout editor is the sharp edge here** — if blocks can only be arranged by mouse, that is a real exclusion, not a nice-to-have.

**Screen reader** (VoiceOver / NVDA): logical heading hierarchy (one `<h1>` per page); form fields have labels, not just placeholders; buttons have accessible names; images have alt text or are marked decorative; toasts and dialogs announced; status messages use `aria-live`; the AI Match % announced with what it means, not as a bare number.

**Visual:** color is never the only signal; text contrast ≥ 4.5:1 (3:1 large text) **in both themes** — a token that clears contrast in light can fail in dark; UI holds at 200% zoom; reduce-motion respected.

Violations are `Trust-Damage` unless they block a core journey (then `Blocks-Completion`).

## 4. Perceived performance

Measure what the user feels, not what synthetic tools report:

| Observable | Target | When it fails |
|---|---|---|
| First meaningful paint | <2s wifi, <4s 3G | Blank screen; layout shifts after 2s |
| Time to interactive | <3s wifi, <6s 3G | Click during load is ignored |
| Spinner threshold | Appears within 100ms for actions >300ms | Action looks dead before the spinner shows |
| Button feedback | State change within 50ms of click | User double-clicks because nothing happened |
| Search → first result | Feels immediate or is honestly narrated | Recruiter assumes the search failed |
| In-browser re-rank | Never renders a placeholder number as if it were a score | `0%` or `NaN%` before the model loads reads as a real ranking |
| Resume import | Progress or an honest "this takes a minute" | User reloads mid-LLM-call and loses the upload |
| Optimistic UI | Must reconcile correctly on failure | "Saved" followed by silent loss |

Failures are `Friction`, promoted to `Blocks-Completion` when the perceived stall causes abandonment.

## 5. Theme & compatibility

Smoke the changed surface across the minimum matrix:

| Layer | Minimum |
|---|---|
| **Theme** | **Light AND dark — mandatory on every browser leg, every state** |
| Browser | Latest Chrome + Safari + Firefox |
| Mobile | Safari on iPhone (latest), Chrome on Android (latest) |
| Viewport | 1280, 768, 375 |
| Reduced motion | On AND off |

Theme is listed first on purpose. LinkHub themes through a `.dark` class (`@custom-variant dark` in `apps/web/src/index.css`); a surface authored without its `dark:` variants renders unreadable rather than merely off-brand, and it is the cheapest bug in this repo to ship and the easiest to catch. Every state counts — empty, loading, error, disabled, focused, hovered — not just the happy one. `DESIGN.md` is the arbiter.

Layout/CSS changes make viewport coverage mandatory; form changes make mobile Safari mandatory (autofill diverges). Severity by user impact, not by which browser.

## 6. Error recoverability

For every failure path met during execution, the recovery experience must:

- [ ] Explain in plain language (no stack traces, no bare error codes, no raw zod issue arrays).
- [ ] Offer a specific next step (retry, go back, contact support).
- [ ] Preserve user input (no "paste the whole job description again").
- [ ] Say whether the failure is transient or permanent.
- [ ] For data-loss situations, name what was lost.
- [ ] For a failed import, leave the profile in the state it was in before — not half-imported.

A failure path without recoverable UX is `Trust-Damage` at minimum, often `Data-Loss`.

## 7. Production parity

The session itself must resemble reality, or its verdicts don't generalize:

- [ ] Real API on http://localhost:3333 with the real database — **no MSW handlers, no stubbed search**.
- [ ] Real seeded data from `bash db-manage.sh seed-all`, not hand-written records.
- [ ] The docker stack actually up (`bash db-manage.sh status`) — pgvector search against a dead database fails in ways production never would.
- [ ] Third-party cookies enabled (the real default).
- [ ] Normal browser profile, NOT incognito (cache, autofill, extensions differ).
- [ ] The real auth path (password or Google OAuth), not a test bypass.
- [ ] The agent driven through the real MCP tools with its own token.
- [ ] Worst-case realistic network tested (Slow 3G), not just office wifi.
- [ ] If a leg needed a funded `OPENAI_API_KEY` and there wasn't one, that leg is **blocked**, not passed — a search or import walked without real embeddings measured nothing.

Any deviation is recorded in the report — parity gaps qualify every verdict in the run.

## Running the lens pass

After journey walks and tours (Steps 3-4):

1. Pick **2 journeys** that exercise the largest changed surface.
2. Re-walk them as a lens audit, not a journey verification.
3. At each step, ask the seven lenses; mark `pass` / `friction` / `fail` per lens. **Lens 1 is asked on every journey that touched agent-authored content, even if it wasn't one of the two picked.**
4. File one finding per failure via the registry; record the pass in the report's lens section.
5. **45 minutes total.** Anything unfinished becomes a follow-up charter — fatigue produces false positives.

## Anti-patterns

- **Full conformance audit in the QA window** — the deep audit is dedicated tooling; queue it, don't improvise it.
- **Skipping lenses because "the feature works"** — working and feeling right are different claims.
- **Lens pass before journey walks** — lenses are a re-read of real flows; without a flow they produce shallow findings.
- **Lens cases in the tracker** — lenses qualify journey scenarios; they don't get their own scenario rows per category.
- **Downgrading a disclosure finding to fit the schedule** — the one lens where "we'll look at it next cycle" is not available.
- **Checking contrast in one theme** — a token can clear 4.5:1 in light and fail in dark. Both, or neither counts.
- **Treating this as security testing** — security is its own discipline; the lens concern is user trust perception, not vulnerability scanning. (A disclosure leak is a *product-behavior* failure, which is why it lives here rather than in a security review.)

## Sources

- Nielsen Norman Group — *10 Usability Heuristics for User Interface Design*.
- W3C — *WCAG 2.1 Quick Reference* (AA quick-check items).
- Thoughtworks — *10 tips for an Agile QA mindset*, Tips 7-9 (CFRs, incognito/cache, production parity).
