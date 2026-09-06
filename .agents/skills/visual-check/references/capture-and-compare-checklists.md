# Capture and comparison checklists

Read the first table while writing REACH + CAPTURE (SKILL.md §2.2) to decide which states a scenario
needs to visit. Read the second while doing COMPARE (SKILL.md §2.4) — fill it in against the target
and the screenshots rather than concluding "looks fine" from a glance.

---

## States to capture (§2.2)

Capture **one screenshot per state that can render differently**, not one per screen — and put all of
them in the same scenario file:

| Capture | When |
|---|---|
| loading | screen fetches data (`RoutePending`, `Skeleton`) |
| empty | API returns an empty list |
| error | API returns 500 (`RouteErrorState` + "Try again") |
| filled | happy path with real data |
| **dark** | **always — see §3** |
| logged-out | any page reachable without a session (`/$username`) |
| each variant/prop | component renders differently per prop (§5) |
| 1024px wide | any new layout, to prove it does not overflow |
| dialog / drawer open | screen opens a Radix dialog or alert-dialog |
| hover / focus / disabled | interactive elements whose style changes |
| mid-drag | `features/profile-layout` — dnd-kit / react-grid-layout have their own visual states |

---

## Comparison dimensions (§2.4)

Read the target and the screenshots side by side and fill this table. Vague conclusions hide bugs; a
table forces you to look at each dimension.

| Dimension | What to check |
|---|---|
| Layout | element order, alignment, column widths, nothing overflowing or clipped |
| Spacing | gaps/padding on the Tailwind scale, not eyeballed px |
| Typography | size, weight, line-height, truncation with ellipsis instead of overflow |
| Color | tokens and the palette `DESIGN.md` defines — no stray hardcoded hex |
| Surfaces | the shared constants in `apps/web/src/shared-components/surface.ts` (`SURFACE`, `SURFACE_PROFILE`, `SURFACE_GLASS`, …), not a fresh fork of the border/background literal. Sibling blocks reading as different materials is exactly the drift those constants exist to stop |
| Components | the primitives in `apps/web/src/shared-components/` (`Button`, `Dialog`, `Input`, `Select`, `Skeleton`, `Avatar`, …) where one fits, not a hand-rolled div |
| **Dark mode** | **every surface, border, text color and icon has a `dark:` variant and is legible (§3)** |
| States | the 4 states exist and are styled; buttons show loading/disabled correctly |
| Content | no raw placeholder text on screen, and no untranslated string: CraftHub ships three locales, so a key rendered as its own name (`profile.emptyState`) is a missing translation, not a copy bug |
| Empty data | nothing shows `undefined`, `NaN`, `null`, `Invalid Date`, or an empty box |

---

## Console/network gate — two supplementary notes (§2.5)

SKILL.md §2.5 keeps the pass/fail rules for the gate. These two edge cases are notes, not rules that
change pass/fail on their own — read them when a run's output looks confusing:

- Telemetry hosts are blocked on purpose and the collectors filter them out. `ERR_BLOCKED_BY_CLIENT`
  for a blocked analytics host is expected and is **not** a finding.
- A request duplicated on every render is a bug even when the pixels match. It shows up in the run as
  a pile of identical entries — worth watching on `/dashboard/search`, where a re-render storm is
  cheap to introduce and invisible in a screenshot.

---

## Why `scrollIntoViewIfNeeded()` matters before a screenshot (§2.2)

`isVisible()` means "in the DOM with a non-empty box", not "in the viewport" — an element 900px below
the fold passes it. This is a real failure mode, not a hypothetical: the first version of the
reference scenario asserted the "Try again" button and screenshotted a page that did not contain it.
Scroll the subject into view before the shot, every time.
