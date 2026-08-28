# Definition of Done — tabs v2: per-viewport, two add buttons, no pin switch

Second round on the optional-tabs feature. Round one shipped one profile-level
switch; using it exposed three problems. This file is the contract for fixing
them, and the final reviewer checks the tree against **these** statements.

Everything in round one's `DEFINITION-OF-DONE.md` §3 that is not contradicted
here still holds — in particular **no tab and no block may ever be deleted,
reassigned, or have its stored visibility changed by toggling this switch.**

---

## 0. Decisions (challenge these, do not re-derive them)

### D8 — `tabsEnabled` is per viewport, and lives in the layout

Tabs are already per-viewport: `profile_tabs.viewport` is `pc` or `mobile`, and
the layout API returns `{ pc: {...}, mobile: {...} }`. The real use case is
asymmetric — tabs on a wide desktop layout, one scrolling list on a phone — and
a single profile-level flag cannot express it. Worse, in round one flipping the
switch in one viewport silently flipped the other, which is the bug being fixed.

So the flag moves **out** of `profileSchema` and **into** `layoutSchema`, beside
the tabs and blocks it governs. `profileSchema.tabsEnabled`,
`updateProfileSchemaInput.tabsEnabled` and `updateProfileSchemaOutput.tabsEnabled`
are **removed** — this is a breaking contract change and every caller must move.

Database: `users.tabs_enabled` becomes `users.tabs_enabled_pc` and
`users.tabs_enabled_mobile`. Two explicit boolean columns rather than a jsonb
blob, so the values stay queryable and constrainable. The migration **must copy
the existing `tabs_enabled` value into both columns** — nobody's current setting
may change.

### D9 — Where a block is created decides whether it is always-visible

Two add buttons replace one: **"Add to always-visible"** creates
`pinnedAllTabs: true, tabId: null`; **"Add to tabs section"** creates
`pinnedAllTabs: false, tabId: <active tab>`. The per-block **"All tabs" switch is
removed** from `grid-block-card.tsx`.

Consequence, accepted deliberately by the user: an existing block can no longer
be moved between the two zones from the UI. A block created in the wrong section
is fixed by deleting it and re-adding it. The per-block **"Tab" selector stays** —
moving a block *between tabs* is a different operation and is unaffected.

### D10 — Turning tabs off renders less; it never writes

Confirmed explicitly by the user: **just stop rendering.** Toggling tabs off must
issue **no write to any block**, and in particular must not set `isVisible`.
Re-enabling restores the previous page exactly, with no per-block fixing up.

The user must be told the blocks are only hidden and that the switch brings them
back — that message is a requirement, not decoration, because silently dropping
content from a page is the failure mode this whole feature risks.

### D11 — There is no copy/move modal

Considered and **cut** by the user. Turning tabs off shows no dialog and offers
no copying. Someone who wants that content in the always-visible section adds it
there themselves with the new button.

---

## 1. Per-viewport switch

- [ ] `layoutSchema` carries `tabsEnabled: z.boolean()`; `fullLayoutSchema`
      therefore carries one per viewport.
- [ ] `profileSchema` / `updateProfileSchemaInput` / `updateProfileSchemaOutput`
      no longer mention `tabsEnabled` at all.
- [ ] `users.tabs_enabled_pc` and `users.tabs_enabled_mobile` exist, NOT NULL,
      default true, via a **generated** migration.
- [ ] The migration copies the old `tabs_enabled` into both columns, so no
      existing profile changes behaviour. Proven by reading a pre-existing row
      back after migrating.
- [ ] An endpoint accepts `setTabsEnabledSchemaInput` (`{ viewport, tabsEnabled }`)
      and writes only that viewport's column.
- [ ] **Switching one viewport does not change the other.** This is the reported
      bug; it needs an api test and a web test, not just a manual check.
- [ ] `GET /profile/:username` and the layout read both return the correct
      per-viewport `tabsEnabled`.

## 2. The mobile switch responds to the first click

The reported symptom: on the mobile view the switch needed **three clicks**.

- [ ] Root cause identified and stated in the report — not worked around by
      forcing a refetch, adding a delay, or keying the component to remount.
- [ ] One click flips the switch and the tab chrome, in **both** viewports.
- [ ] A test that fails against the old behaviour. A test that only asserts the
      end state after three clicks does not count.
- [ ] Switching editor viewport (pc ⇄ mobile) shows that viewport's own value
      immediately, with no stale flash of the other one's.

## 3. Two add buttons, no pin switch

- [ ] "Add to always-visible" creates `pinnedAllTabs: true`, `tabId: null`.
- [ ] "Add to tabs section" creates `pinnedAllTabs: false`, `tabId: <active tab>`.
- [ ] Each button places the block in the zone it names, and a test proves a
      block added to one zone does **not** land in the other.
- [ ] The per-block "All tabs" switch is gone from `grid-block-card.tsx`.
- [ ] The per-block "Tab" selector still works.
- [ ] With tabs off, only the always-visible add button is offered — adding to a
      tabs section that is not rendered is a trap.
- [ ] `layout.noPinnedBlocks` no longer tells the user to use a switch that no
      longer exists. (Already updated in the catalogue — do not re-word it.)

## 4. Tabs off: hidden, not destroyed

- [ ] Toggling tabs off issues **zero** block writes. Assert on the requests
      made, not just on the resulting layout.
- [ ] No block's `isVisible` changes. Off → on returns a byte-identical layout.
- [ ] The user sees `layout.tabsHiddenBlocks` (pluralised, with the real count)
      saying the blocks are only hidden and the switch brings them back.
- [ ] That message does not appear when the tabs section holds nothing.
- [ ] The count still excludes pinned blocks and already-hidden blocks.
- [ ] No modal, no dialog, no copy prompt anywhere in this flow (D11).

## 5. Gates — non-negotiable

- [ ] `node scripts/guardrails/pre-push.mjs` prints `guardrails PASS`.
- [ ] `npm run i18n:check` passes; catalogue at 1135 keys, full parity.
- [ ] api and web suites both green, and **no lower** than the pre-change
      baselines: api 116 files / 1081 tests, web 57 files / 532 tests.
- [ ] No new `any`, `eslint-disable`, `.skip`, type assertion, widened schema, or
      `--no-verify`. `apps/api` targets **es2020** — no `Array.prototype.at`.
- [ ] `@repo/schemas` rebuilt before dependent work (already done).
- [ ] No pre-existing test edited to pass. Fixture updates forced by the removal
      of `profileSchema.tabsEnabled` are expected — list them explicitly.
- [ ] Design contract held: constants from `surface.ts`, a `dark:` on every
      colour utility, `react-icons/fi` only, `fullWidth={false}` in a row.

## 6. Tests that would catch a real bug

| # | The bug | Where |
|---|---|---|
| 1 | Toggling pc also toggles mobile — the reported bug | api + web |
| 2 | The migration silently turns tabs on for someone who had them off | api, read a pre-existing row after migrating |
| 3 | First click ignored on mobile | web, one click → asserted state |
| 4 | Switching viewport shows the other viewport's flag | web |
| 5 | "Add to tabs" block lands in the always-visible zone, or vice versa | web |
| 6 | Toggling tabs off writes to blocks | web, assert on requests issued |
| 7 | Off → on loses a block or a tab | api, deep-equal layout |
| 8 | The hidden-blocks message appears with an empty tabs section | web |
| 9 | Pin switch still rendered somewhere | web |
| 10 | Public profile ignores the per-viewport flag | api contract test on both viewports |

## 7. The reviewer's job

An independent agent, given this file and the diff, ticks or fails **every** box
by reading code and running commands — never by trusting an implementation
summary. It re-runs the gate itself, verifies the migration against the real
database by reading a row back, and reports every box it could not verify and
why. A review that omits its own gaps is worse than no review.
