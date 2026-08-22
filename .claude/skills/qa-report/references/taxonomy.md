# Coverage Taxonomy

Six dimensions every cycle must consider when deriving scenarios from flows. The taxonomy is a completeness *lens*, not a case generator: it answers "what kind of coverage did walking the flowcharts not give us?" — it never mandates a scenario per cell.

## Contents

- 1. Journeys
- 2. Functional checks
- 3. Disclosure & agent-authored content
- 4. Experiential checks
- 5. Edge, error, and empty states
- 6. Cross-cutting
- Using the taxonomy in planning
- Anti-patterns

## 1. Journeys

Complete value paths, walked end to end: **Entry → Action → Result → Destination → Aftermath.**

- Entry: the user arrives the way real users arrive — the auth screen, a nav item, a link a friend pasted, an MCP tool call, a git hook — not by pasting an internal URL.
- Result: the immediate observable of each action.
- Destination: where the flow actually lands the user, including what a logged-out reader sees on the public profile.
- Aftermath: the true end state — the record exists on fresh load, the side effect landed correctly, the journey survives refresh and deep-link.

This dimension is the primary one; the other five qualify it.

## 2. Functional checks

Do the mechanics hold along the journey?

- Forms validate and preserve input on error.
- Links and buttons resolve to where they claim.
- Data round-trips: what was saved is what reloads — the layout arrangement being the sharpest case.
- The console and network surface is clean during the walk: no errors, no React warnings, no un-mocked 4xx/5xx, no request firing in a loop. (The visual scenario runner enforces exactly this, which is why a journey worth re-walking is worth writing as a scenario.)
- Auth boundaries hold: signed-out access, wrong-user access, and API-token scope behave correctly.
- Responses match their `@repo/schemas` contract — drift here is invisible to a screenshot and obvious to a `.parse()`.

Functional checks live *inside* journey scenarios — they're what "expected observable" means at each step, not a separate suite.

## 3. Disclosure & agent-authored content

**The dimension unique to this product, and the one a generic QA plan will not think of.** Anywhere an agent can put words on a human's public profile, ask:

- Does the enforcement hold on **every** surface the content reaches — the posts list, the review queue, the logged-out public profile, and the API payload behind it?
- Does the policy **fail closed** when it is unset, unreadable, or its tool errors?
- Do blocked terms survive realistic spellings — case, hyphens, camel-case identifiers, URLs, file paths, quoted commit text?
- Is a policy change **retroactive** to already-published content, or does the product say plainly that it isn't?
- Is the human genuinely in the loop — including after an approved post is edited?
- Can the user **take it back**, and does deleting actually remove it everywhere?
- Is the agent's `get_work_context` payload no richer than the policy permits?

A cycle touching posts, settings, MCP, the extractor or the public profile that records nothing under this dimension has a planning gap, not a clean bill. The tour is in `../qa-execution/references/tours.md`, the edges in `../qa-execution/references/edge-cases.md`, the lens in `../qa-execution/references/lenses.md`, and the severity floor in `references/bug-registry.md`.

## 4. Experiential checks

Would a real person *enjoy* — or at least not resent — this walk?

- Does the surface match the product's intent and voice (`DESIGN.md`)? Copy in user language?
- Loading, transition, and skeleton states: does the product feel alive or stalled? The resume import and the in-browser re-rank are the two places where "alive" has to be designed rather than assumed.
- Does a number the user will act on — the AI Match % above all — explain itself?
- Persona paper cuts: friction too small to fail a functional check but real enough to degrade the experience (defined in the `qa-execution` skill's session protocol).
- The seven experiential lenses (`../qa-execution/references/lenses.md`): disclosure integrity, usability, accessibility, perceived performance, theme & compatibility, error recoverability, production parity.

## 5. Edge, error, and empty states

The realistic ways a walk goes sideways:

- Error branches from the flowchart (validation, permission, policy refusal, conflict) — each with recoverable UX.
- Empty states: a brand-new profile with no blocks, a search with zero matches, a review queue with nothing waiting, an agent with no work context.
- User-behavior edges (`../qa-execution/references/edge-cases.md`): refresh mid-submit, back after success, double-click, autofill, expired session, flaky network, a PDF that isn't really a PDF.
- Abandon-and-resume paths from the journey map — including the post that sits in the review queue and is never reviewed.

## 6. Cross-cutting

Qualities no single journey owns:

- **Theme:** the journey in light and in dark, in every state — empty, loading, error, disabled, focused. Standing, not optional.
- **Responsiveness:** the journey at 375 / 768 / 1280 viewports when layout was touched; plus the layout editor's own desktop/mobile arrangement mirroring, which is a product feature and not just a viewport concern.
- **Regression:** adjacent journeys that share components or use cases with the change — the canary walks. A `packages/schemas` change makes this dimension mandatory across every consumer.
- **Consistency:** same nouns, same icons, same patterns across dashboard, profile and agent-authored surfaces.
- **Continuity:** cross-device and cross-session (arrange on a laptop, read on a phone) where the product promises it.

## Using the taxonomy in planning

After deriving scenarios from flows (routed at Step 3 of the SKILL):

1. Sweep the six dimensions per journey in scope.
2. For each dimension either (a) point at the scenario/charter that covers it, or (b) record a deliberate skip with reasoning in the cycle's notes.
3. A dimension that is neither covered nor consciously skipped is a planning gap — fix the plan, don't pad the tracker.
4. Dimension 3 is not skippable by silence: if no agent-authored surface is in scope, write that sentence down. It is a one-line claim that the reader can check.

## Anti-patterns

- **Cell-filling** — generating a scenario per dimension per journey mechanically. The taxonomy qualifies coverage; it doesn't manufacture it.
- **Dimension suites** — splitting the six dimensions into six separate test suites recreates the technical-case model. Dimensions ride along journeys.
- **Silent skips** — a skipped dimension without recorded reasoning reads as covered. It isn't.
- **Treating theme as a viewport** — dark mode is not a screen size; it is a second rendering of every state, and it fails independently of layout.
