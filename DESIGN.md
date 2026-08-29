# CraftHub Design Language

This is the prescriptive reference for anything visual in `apps/web`. It is not a
description of what the code happens to do — it is what the code is required to
do. When a screen and this document disagree, the screen is wrong.

There is no Figma, no design-system package and no component library here. The
design system is **Tailwind v4 plus a small set of class constants**, and the
constants are the contract.

---

## 0. The one rule that produces most review comments

> **Never write a surface, a badge or a focus ring by hand.**
> Import the constant from `apps/web/src/shared-components/surface.ts`.

Before those constants existed, the card class string had drifted into about ten
forks that differed only in dark-mode border (`zinc-700` vs `zinc-800`),
background opacity (`/30`, `/40`, `/60`, `/70`) and padding. On the public
profile that was visible as sibling blocks reading as different materials.
"Success" had three competing greens. That is the failure mode this document
exists to prevent, and it comes back the moment somebody types
`rounded-2xl border border-zinc-200 …` inline instead of importing `SURFACE`.

---

## 1. Tokens

Tailwind v4, CSS-first. The entry stylesheet is `apps/web/src/index.css`. There
is **no `tailwind.config.js`** and **no `@theme` block** — the palette is stock
Tailwind. Do not add a config file to introduce a custom colour; use the stock
scales below, or a CSS variable on `.profile-root` if it is profile-themed.

### Palette

| Role | Value | Where |
|---|---|---|
| Accent | `violet` (500/600/700/800) | Every interactive accent in the app chrome |
| Neutral | `zinc` (50 → 950) | All text, borders, surfaces, backgrounds |
| Brand gradient | `#7C3AED → #5B21B6` | `brand-logo.tsx`, favicon — logo only |
| Success | `emerald` | Badges, positive status |
| Warning | `amber` | Badges, caution status |
| Info | `cyan` | Badges, neutral-informational status |
| Danger | `red` | Badges, destructive buttons, validation |
| Magenta | `fuchsia` | Badges on a public profile only — see §4 |

Nothing else. No blue, no indigo, no slate, no gray. `slate` and `gray` next to
`zinc` are the kind of difference that is invisible in isolation and obvious
when two components sit side by side.

**No hardcoded hex in a component.** The only hex values in this codebase live
in `index.css` (the link-icon brand colours, which are third-party brand marks,
and the accent presets) and in `brand-logo.tsx`. If you need a colour, it is a
Tailwind scale token or a `--profile-accent-*` variable.

### Page background

`body` is `bg-zinc-100 text-zinc-900` in light and `dark:bg-zinc-950
dark:text-zinc-100` in dark, with a 200ms colour transition. Surfaces sit on
that: `bg-white` on `zinc-100` in light, `bg-zinc-900` on `zinc-950` in dark.
That one-step separation is the whole elevation system — do not reach for a
heavier shadow to make a card "pop".

---

## 2. Dark mode is not optional

The app uses the **class strategy**, declared in `index.css` as:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

`apps/web/src/lib/theme.ts` owns the toggle and persists the choice in
`localStorage` under `crafthub-theme`.

**Every colour utility you write needs a `dark:` counterpart.** A missing
`dark:` variant is the single most common visual bug in this repo, and it is
invisible to anyone developing in light mode — the element simply renders
white-on-white for half the users. This is why the visual-check scenarios
capture both themes, and why you should too.

Rules:

- `bg-*` without `dark:bg-*` is a bug. Same for `text-*`, `border-*`, `ring-*`.
- Never test contrast in one theme only. Every token in this document is
  verified at 4.5:1 or better in **both**.
- Do not use `dark:opacity-*` to fake a dark colour. Use the dark token.
- Never force the `.dark` class directly to test — set `crafthub-theme` and
  reload, so the real bootstrap path runs.

---

## 3. Surfaces — the card primitive

**There is no `<Card>` component, and adding one would be a mistake.** The
elements that need a surface vary too much (`section`, `aside`, `li`,
`article`, `a`, `div`) for a wrapper to be worth it. Only the *material* —
radius, border, background, shadow — is centralised. **Padding stays at the call
site.**

```ts
import { SURFACE, SURFACE_INSET } from "@/shared-components/surface";

<section className={`${SURFACE} p-6`}>…</section>
```

| Constant | Use it for |
|---|---|
| `SURFACE` | The default elevated card: dashboard, settings, editor panels |
| `SURFACE_PROFILE` | Public-profile blocks. Lighter border and a translucent background so the user's accent theme and cover image read through |
| `SURFACE_GLASS` | A frosted panel sitting over a background image or gradient |
| `SURFACE_INSET` | A recessed panel nested *inside* a card — form groups, detail rows |
| `SURFACE_EMPTY` | The dashed placeholder for an empty list |

Choosing the wrong one is a real finding: `SURFACE` inside `SURFACE` reads as a
floating card on a card, which is what `SURFACE_INSET` exists to avoid.

---

## 4. Badges

```ts
import { BADGE, BADGE_STRONG, type BadgeTone } from "@/shared-components/surface";
```

`BADGE` tones: `neutral`, `success`, `warning`, `accent`, `info`, `danger`,
`magenta`.

- **`accent` (violet) is banned on the public profile.** Violet is the default
  `--profile-accent`, so an accent badge on a themed profile collides with the
  user's own colour instead of reading as a category. Use `magenta` there.
- **`BADGE_STRONG`** is for the one place a badge is the primary signal rather
  than a label — the recruiter match-strength chip ("AI Match %"). Do not spread
  it around; if everything is emphasised, nothing is.
- A badge is a **label**, not a button. If it is clickable it is a button styled
  as a chip, and it needs a focus ring.

---

## 5. Focus rings

Keyboard focus was once invisible on `Button`, `Input` and `TextArea` — the
three most-used primitives in the app. It is now a house style, and it is
non-negotiable: **every interactive element shows a violet `ring-2` on
`:focus-visible`.**

| Constant | Use it on |
|---|---|
| `FOCUS_RING` | Controls sitting on a card (offset resolves against `white` / `zinc-900`) |
| `FOCUS_RING_PAGE` | Controls sitting directly on the page background (offset resolves against `zinc-100` / `zinc-950`) |
| `FOCUS_RING_FIELD` | Inputs, which carry their own border and need no offset |

Picking the wrong one produces a halo in the wrong colour around the ring — the
offset has to match what is actually behind the control.

Never `outline-none` without a replacement ring. Never remove a ring to "clean
up" a design.

---

## 6. Buttons

`apps/web/src/shared-components/button.tsx`. Six variants, four sizes.

| Variant | Meaning |
|---|---|
| `primary` | The one affirmative action on the screen. **At most one per view.** |
| `outline` | Secondary action of equal weight |
| `soft` | Tertiary / accent-tinted action inside a dense surface |
| `ghost` | Low-emphasis action, usually in a toolbar or list row |
| `icon` | Bordered square icon button |
| `danger` | Destructive. Pair with `shouldHaveConfirmation`. |

Sizes: `sm` (h-9) · `md` (h-10, default) · `lg` (h-11) · `icon` (h-9 w-9).
Radius is `rounded-md` on every button — buttons are the one place the app does
**not** use a large radius.

### Two behaviours that are already built in — do not reimplement them

1. **`fullWidth` defaults to `true`.** This surprises people. A button in a row
   of controls almost always needs `fullWidth={false}`. Forgetting it is the
   most common button bug in this codebase.
2. **`shouldHaveConfirmation`** renders a Radix alert-dialog with
   `confirmationTitle` / `confirmationDescription`. Never hand-roll a "are you
   sure?" modal, and never call a destructive mutation without one.
3. **`isLoading`** shows a spinner, sets `aria-busy`, blocks interaction, and
   swaps in `loadingLabel`. Never disable a button manually during a mutation
   and never render your own spinner beside it.

---

## 7. Typography

Stock Tailwind scale, system font stack, `antialiased` on `body`.

- **`text-sm` is body text.** `text-xs` is metadata, labels, badge text, helper
  text. These two carry the overwhelming majority of the UI.
- `text-base` is for `lg` buttons and occasional lead paragraphs.
- Headings step through `text-lg` / `text-xl` / `text-2xl` / `text-3xl`. There is
  no `text-4xl`+ outside a marketing hero.
- Weight: `font-medium` for emphasis, `font-semibold` for headings. `font-bold`
  is rare and deliberate.
- Muted text is `text-zinc-500 dark:text-zinc-400`. Do not invent a third muted
  level.

---

## 8. Radius, shadow, spacing

- **Radius:** `rounded-full` (avatars, pills, icon chips) > `rounded-2xl`
  (surfaces) > `rounded-xl` (inset surfaces) > `rounded-md` (buttons, inputs).
  Nothing else. Never `rounded-lg` next to a `rounded-xl` sibling.
- **Shadow:** `shadow-sm` and nothing heavier. Elevation in this app comes from
  the background/surface contrast step, not from shadow. `shadow-lg` on a card
  is a finding.
- **Page shell:** `mx-auto max-w-{3,5,6,7}xl p-4 lg:p-8`. Pick the width by
  content density — `max-w-3xl` for a single reading column, `max-w-7xl` for a
  dashboard grid — and keep the same padding rhythm.
- **Grid editor:** `GRID_ROW_HEIGHT = 40`, `GRID_GAP = 12` in
  `features/profile-layout`. Layout maths uses those constants; never a literal.

---

## 9. Icons

**`react-icons` Feather set only** — every icon import is `react-icons/fi`.

```ts
import { FiLoader, FiTrash2 } from "react-icons/fi";
```

Do not mix in `fa`, `md`, `hi`, `lu` or an inline SVG. Feather's stroke weight
and 24px grid are what make the icons look like one family; a single Material
icon in a Feather row is immediately visible. Default size in a button row is
`h-4 w-4`; standalone icon buttons use `h-5 w-5`.

---

## 10. The profile accent system

A public profile is themed by its owner. `.profile-root` declares one base
variable and derives the rest with `color-mix()`:

```css
--profile-accent: #8b5cf6;          /* the base the user picked */
--profile-accent-fg                 /* accent tuned for TEXT on the block surface */
--profile-accent-weak               /* translucent tint for chip / badge backgrounds */
--profile-accent-border             /* hover outlines and rings */
--profile-accent-glow               /* hover box-shadow glows */
--profile-accent-solid              /* solid fill, e.g. the active tab */
--profile-accent-contrast           /* foreground on a solid accent fill */
```

The derivation is contrast-aware and differs by theme: light mode darkens the
base 30% so accent text clears 4.5:1 on white; dark mode lightens it 35% and
strengthens the tint so it clears 4.5:1 on `zinc-900`.

### Presets

| Preset class | Base |
|---|---|
| `.profile-theme-violet` | `#8b5cf6` (default) |
| `.profile-theme-ocean` | `#0ea5e9` |
| `.profile-theme-sunset` | `#f97316` |
| `.profile-theme-forest` | `#16a34a` |
| `.profile-theme-mono` | `#52525b` |

Every base is a mid-tone chosen to read on both light and dark surfaces.

### Rules

- Inside `.profile-root`, **anything accent-coloured reads a variable**, never a
  violet utility class. A hardcoded `text-violet-600` on a profile block stays
  violet when the user picks "sunset", which is the bug this system exists to
  prevent.
- **Neutral zinc text and borders stay untouched.** The accent recolours accent
  elements — links, active tab, avatar ring, tag chips, hover glows — not the
  whole page. Do not repaint light-mode backgrounds with the accent.
- `:hover` cannot be expressed inline, so the handful of hover treatments live
  as scoped classes in `index.css`: `.accent-card`, `.accent-glow`,
  `.accent-tab`, `.accent-text-hover`. Use those rather than adding new scoped
  CSS.
- Never use `!important` utility overrides to force an accent.

---

## 11. Motion

`index.css` ships a dependency-free animation toolkit: `.anim-fade-up`,
`.anim-fade-in`, `.anim-scale-in`, `.anim-blur-in` (entrances);
`.anim-float`, `.anim-glow-pulse`, `.anim-spin-slow`, `.anim-gradient`,
`.anim-sheen`, `.anim-grid-bg` (ambient).

- **Stagger with inline `style={{ animationDelay }}`.** There are deliberately no
  `.anim-delay-*` utilities — the ones that existed had two call sites between
  them.
- **Every animation must be covered by the `prefers-reduced-motion` guard** at
  the bottom of `index.css`. If you add a keyframe, add it to that block. An
  animation that ignores the guard is an accessibility defect, not a flourish.
- Ambient animation belongs on heroes and empty states, not on data.

---

## 12. The four states — a design requirement, not just an engineering one

Every screen that reads from the network renders four states, and each one is
designed:

| State | What it must be |
|---|---|
| **Loading** | A skeleton or the route-level pending component. Never a bare spinner on an empty page, never a layout that jumps when data lands. |
| **Empty** | `SURFACE_EMPTY`, an explanation of *why* it is empty, and the action that fills it. Never a blank card. |
| **Error** | An explanation and a retry affordance. Never a white screen, never a raw error message. |
| **Filled** | The happy path. |

`apps/web/src/shared-components/route-states.tsx` provides `RoutePending`,
`RouteErrorState` and `RouteNotFound` at the router level. Use them rather than
inventing per-page equivalents.

A pull request that ships only the filled state is incomplete.

---

## 13. Review checklist

Read a diff against this list:

- [ ] No hand-written surface / badge / focus-ring class strings — constants imported
- [ ] Every colour utility has a `dark:` counterpart
- [ ] No hardcoded hex outside `index.css` and `brand-logo.tsx`
- [ ] Only `zinc` + the seven semantic colours; no `slate` / `gray` / `blue` / `indigo`
- [ ] At most one `primary` button per view
- [ ] `fullWidth={false}` on any button in a row
- [ ] Destructive actions use `shouldHaveConfirmation`, not a bespoke dialog
- [ ] Mutations use `isLoading`, not a manual `disabled` + spinner
- [ ] Icons are all `react-icons/fi`
- [ ] Radius from the four allowed steps; shadow no heavier than `shadow-sm`
- [ ] Inside `.profile-root`, accent colours come from variables, never utilities
- [ ] Any new keyframe is listed in the `prefers-reduced-motion` block
- [ ] All four states exist and were actually looked at (`npm run visual:run`)
