# BUG-20260822-open-to-work-switch-name: the "Open to work" switch has no accessible name

- **Status:** verified
- **Impact (user-side):** Friction
- **Severity:** Low · **Priority:** P3
- **Persona Affected:** Diego, the curating developer — Accessibility-Reliant axis
- **Journey Step:** J-profile-setup, the step where the developer edits their dashboard profile panel
- **Theme:** both (the defect is semantic, not visual)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0106, confirmed in run `2026-08-22T18:58:46.702Z`, iteration 4 (TRIAGE)

## Summary

A screen-reader user moving through the dashboard profile form reaches a control
that announces itself as "switch, not checked" — and nothing else. No name, no
hint of what it governs.

What it governs is whether the profile publicly advertises that they are looking
for work. That is precisely the setting someone wants to be certain about before
flipping it, particularly if their current employer might be reading. They can
work it out from the paragraph immediately before it in reading order, so they are
not blocked — but nothing ties that label to the control, and it cannot be found
at all through a rotor or a forms list, which is how screen-reader users actually
navigate a settings form.

## Reproduction

- **Charter:** none yet · **Tour:** the-keyboard-only tour
- **Environment:** any browser + screen reader, or DOM inspection · web http://localhost:5273 · api http://localhost:3344 · any seeded developer (`bash db-manage.sh seed-all`)

1. Sign in as a developer and open `/dashboard`.
2. Open the **"Edit profile" dialog** — the toggle lives inside that dialog, not on the profile panel itself. (The original entry said "the profile panel"; corrected at triage 36 after reaching it in a browser.)
3. Inspect it: `<button type="button" role="switch" aria-checked={…}>` whose only child is a decorative `<span>` (the knob).
4. There is no `aria-label`, no `aria-labelledby`, no `<label for>`. The visible text "Open to work" is a sibling `<p>` inside a different `<div>`.

**Expected:** the switch exposes an accessible name — `aria-label="Open to work"`,
or `aria-labelledby` pointing at the paragraph that already exists, with
`aria-describedby` for the "Show a recruiter-friendly badge on your profile."
helper line.
**Actual:** the accessible-name computation has nothing to work with, so the name
is empty.

## Evidence

- `apps/web/src/features/dashboard/components/dashboard-profile-form.tsx:272-292` — the markup, read at triage.
- **Re-reproduced in a real browser** at run `2026-08-22T18:58:46.702Z`, iteration 36 (TRIAGE), through Playwright's role engine — which uses Chromium's own accessible-name computation rather than a source grep. Inside the open "Edit profile" dialog: `getByRole("switch")` → **1**, `getByRole("switch", { name: /open to work/i })` → **0**. The switch exists and has no name. Transcript and probe: `.nightly/evidence/BUG-20260822-open-to-work-switch-name/`.
- **Re-reproduced again, independently**, at iteration 50 (TRIAGE) — the queue was not taken on trust. Same method, fresh probe `.nightly/evidence/BUG-20260822-open-to-work-switch-name/i50-probe-switch-name.mjs`: `getByRole("switch")` → **1**, `getByRole("switch", { name: /open to work/i })` → **0**, `aria-label` / `aria-labelledby` / `aria-describedby` all `null`, `aria-checked="true"`, zero console errors. The live `outerHTML` pulled out of the browser matches the source read at triage exactly. A repo-wide grep finds **one** `role="switch"` in `apps/web`, so the fix is scoped to this single element.
- **Not verified with a real screen reader this round.** The finding is from the accessible-name computation inputs (no content, no label, no labelling attribute), which is deterministic; the announcement string quoted in the Summary is the expected output, not a recording.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — the switch announces with no name. *Cause* — `apps/web/src/features/dashboard/components/dashboard-profile-form.tsx:272` renders the `role="switch"` button with only a decorative span child and no labelling attribute.
- **Root Cause (taxonomy):** null-data
- **Fix commit:** `1b2451052359cca4d7ca0ce8a3823760ecb0f02d` — the two paragraphs that already carry the text get ids (`profile-open-to-work-label`, `profile-open-to-work-hint`) and the button points at them with `aria-labelledby` / `aria-describedby`. Deliberately not a duplicated `aria-label`: the name now comes from the visible text, so it cannot drift from it. Red test: `d7d5603be46884433b67a23ff914d40b3989f6f6`.
- **Regression test:** `@testing-library/react` beside the component (`dashboard-profile-form.test.tsx`): `expect(screen.getByRole("switch", { name: /open to work/i })).toBeInTheDocument()`. Seen failing first — today the query finds nothing while a bare `getByRole("switch")` passes, which is exactly the trap this test closes.
- **Gate:** `guardrails PASS` at fix time (iteration 51). Re-run independently at review (iteration 52): `npm run build:schemas` ok, `npm run check-types` 8/8, `scripts/guardrails/lint-changed.mjs` clean (1 known recorded finding ignored).

## Verification

**Reviewed and approved at iteration 52 (REVIEW_FIX), by an agent that did not write the fix.**

- **Red proved, then green proved** — the commit message was not taken on trust.
  At `d7d5603` the bug's own test fails **2 of 6** for the right reason:
  `getByRole("switch", { name: /open to work/i })` finds nothing while the roles
  dump lists the switch itself, unnamed, and `toHaveAccessibleDescription`
  receives empty. Back on `nightly/qa-hardening` at `1b24510`: **6 passed**.
- **Run the test from `apps/web`, not the repo root.** `npx vitest related <path>`
  at the root resolves a config without jsdom and fails all six with
  `document is not defined` — a red that proves nothing. Use
  `npm run test --workspace apps/web -- related src/features/dashboard/components/dashboard-profile-form.test.tsx`.
- **Re-walked in a real browser, both themes**, with a probe written from scratch
  at review (`.nightly/evidence/BUG-20260822-open-to-work-switch-name/i52-review-probe.mjs`)
  that reads the name from Chromium's **ARIA snapshot** rather than only from a
  `getByRole` selector that could pass for the wrong reason. In light and in dark
  the snapshot line is `- switch "Open to work" [checked]`; named switch count 1;
  `aria-labelledby` / `aria-describedby` resolved; zero console errors; zero
  4xx/5xx.
- **The control still works, and its visual state still tracks its a11y state.**
  Clicking flips `aria-checked` `true → false`, the switch stays named after the
  toggle, and the background follows (`emerald oklch(0.696 0.17 162.48) → zinc
  oklch(0.871 0.006 286.286)`) — both read the same `watched.openToWork`, so they
  cannot diverge.
- **Duplicate-id hazard checked live, not assumed:** each id occurs exactly once
  in the DOM, `DashboardProfileForm` has one call site
  (`dashboard-page.tsx:788`), and static `profile-*` ids are already this
  component's convention.
- **Not verified:** no real screen reader was run — the announcement string is
  expected output, not a recording. Not checked at 390px. The switch was never
  exercised through a real save (no POST, no row read back), so persistence of
  `openToWork` remains uncovered by any test. That gap is real and is not this
  fix's job.
