# Definition of Done — tabs v3: tabs-off hides ALL tab blocks, buttons live in their own sections

Two defects found by the user against the v2 build. Both are in `apps/web` only.
This file supersedes the parts of `DEFINITION-OF-DONE.md` §3 and `DOD-TABS-V2.md`
that it contradicts; everything else in those files still stands — in particular
**toggling the switch must never delete, reassign, or rewrite a block.**

---

## 0. Decisions

### D12 — With tabs off, the page is the always-visible section. Nothing else.

Round one specified "no tab strip, first tab's blocks plus pinned". That was
carried into v2 unchanged, and it is **wrong**: the user's v2 brief said "when
disabling tabs view, only always visible section will be on". The current build
still renders the first tab's blocks, which is the reported bug — a visitor sees
content the owner believes is hidden.

Corrected rule, everywhere the layout is rendered:

| tabsEnabled | What renders |
|---|---|
| `true` | always-visible zone, tab strip (when >1 tab), active tab's blocks |
| `false` | **always-visible zone only** |

This applies to all three renderers: the public profile, the editor's live
preview, and the editor grid itself.

### D13 — Still no writes. Hiding stays a render decision.

The user offered `isVisible = false` on every tab block as an acceptable fix "if
it is easy". It is **not** taken, and the reason is worth stating: it is a
destructive write triggered by a toggle, it makes re-enabling tabs a manual
repair job across every block, and it can be lost halfway through if the request
fails. Not rendering achieves exactly the outcome the user asked for — the blocks
do not show — with none of that. Off → on remains a clean, instant undo.

Consequence the user must see: the existing `layout.tabsHiddenBlocks` message
already says the blocks are only hidden and the switch brings them back. That
message becomes more important now, not less, because **all** tab blocks are
hidden rather than only those past the first tab.

### D14 — Each add button belongs to the section it fills

"Add to always-visible" moves into the always-visible section. "Add to tabs
section" stays in the tab-manager section. A button that fills zone A while
sitting inside zone B is the reported confusion, and it is the reason the user
could not tell which button did what.

---

## 1. Tabs off renders only the always-visible zone

- [ ] `ProfileBlocks` with `tabsEnabled: false` renders **no** tab blocks at all —
      not the first tab's, not any tab's.
- [ ] Pinned / always-visible blocks still render, and still respect `isVisible`.
- [ ] No `role="tablist"`, no `role="tab"`, no `role="tabpanel"` in the output.
- [ ] The public profile at `/profile/:username` shows the same.
- [ ] The editor's **live preview** shows the same (it shares `ProfileBlocks`).
- [ ] The editor grid shows only the always-visible zone; the active tab's grid is
      not rendered.
- [ ] `tabsEnabled: true` is completely unchanged — no regression to the tab strip,
      the active tab, or the pinned zone.

## 2. The hidden-block count now means "all tab blocks"

- [ ] `countBlocksHiddenWithoutTabs` counts every **visible, non-pinned** block,
      on **any** tab — not just blocks past the first tab. With the new rule the
      first tab's blocks are hidden too, and a count that excludes them
      under-reports what the user is about to hide.
- [ ] It still excludes pinned blocks and blocks the owner had already hidden.
- [ ] Its doc comment is updated; the current one describes the old rule.
- [ ] The existing tests for it are updated to the new meaning, and a test covers
      "a block on the FIRST tab is counted".

## 3. Buttons live in their own sections

- [ ] "Add to always-visible" renders inside the always-visible section, near its
      blocks / its empty state.
- [ ] "Add to tabs section" renders inside the tab-manager section.
- [ ] With tabs OFF, "Add to tabs section" is not rendered at all, and
      "Add to always-visible" still is.
- [ ] Both still open the block-kind menu and create into the right zone —
      `tabId: null` vs `tabId: <active tab>`. Do not regress the v2 tests.
- [ ] Design contract: constants from `surface.ts`, `dark:` on every colour
      utility, `react-icons/fi` only, `fullWidth={false}` in a row.

## 4. Gates

- [ ] `node scripts/guardrails/pre-push.mjs` prints `guardrails PASS`.
- [ ] `npm run i18n:check` passes. **No locale key may be added, removed or
      re-worded** — the catalogue is correct at 1135 keys and its wording already
      matches this behaviour.
- [ ] web suite green and no lower than 57 files / 540 tests.
- [ ] No new `any`, `eslint-disable`, `.skip`, type assertion, or `--no-verify`.
- [ ] No pre-existing test weakened. Tests that encoded the OLD "first tab still
      shows" rule must be **updated to the new rule**, not deleted — and each
      such change listed explicitly in the report.

## 5. Tests that would catch these exact bugs

| # | The bug | Where |
|---|---|---|
| 1 | Tabs off still renders the first tab's blocks — **the reported bug** | `ProfileBlocks` with `tabsEnabled: false` + a block on tab 1: assert it is absent |
| 2 | Tabs off hides the pinned blocks too | assert pinned blocks still render |
| 3 | The editor still renders the active tab's grid with tabs off | editor test |
| 4 | The live preview disagrees with the public page | preview test |
| 5 | The count under-reports because it skips the first tab | `countBlocksHiddenWithoutTabs` unit test |
| 6 | "Add to always-visible" ends up in the tabs section again | assert DOM containment, not just presence |
| 7 | "Add to tabs section" is offered while tabs are off | editor test |
| 8 | Tabs-on regressed | the whole v2 suite must still pass unchanged |

## 6. Reviewer

An independent agent ticks every box by reading code and running commands, re-runs
the gate itself, and reports every box it could not verify. It must specifically
confirm D13: that turning tabs off still issues **zero** block writes.
