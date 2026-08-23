# BUG-20260822-open-to-work-switch-name: the "Open to work" switch has no accessible name

- **Status:** open
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
- **Not verified with a real screen reader this round.** The finding is from the accessible-name computation inputs (no content, no label, no labelling attribute), which is deterministic; the announcement string quoted in the Summary is the expected output, not a recording.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — the switch announces with no name. *Cause* — `apps/web/src/features/dashboard/components/dashboard-profile-form.tsx:272` renders the `role="switch"` button with only a decorative span child and no labelling attribute.
- **Root Cause (taxonomy):** null-data
- **Fix commit:** —
- **Regression test:** `@testing-library/react` beside the component (`dashboard-profile-form.test.tsx`): `expect(screen.getByRole("switch", { name: /open to work/i })).toBeInTheDocument()`. Seen failing first — today the query finds nothing while a bare `getByRole("switch")` passes, which is exactly the trap this test closes.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
