# BUG-20260823-excerpt-strips-hyphens: the post excerpt deletes hyphens and underscores from inside words, so a public profile shows different words — and different numbers — from the ones the developer wrote

- **Status:** confirmed (triaged at iteration 63, claimed for FIX)
- **Impact (user-side):** Wrong data shown — user-authored text is silently altered on the product's primary public surface
- **Severity:** Major · **Priority:** P2
- **Persona Affected:** Diego, the curating developer (his own words are misquoted) and Priya, the recruiter (she reads the misquote and cannot know)
- **Journey Step:** J-developer-publish → the post's summary as it appears on the public profile; and `/dashboard/posts`, the developer's own list of everything he has published
- **Theme:** both — the defect is text content, not colour
- **Scenarios:** none — `public-profile.scenario.mjs` does not cover the Posts block in `grid`
- **Found:** 2026-08-23 · **Report:** docs/qa/reports/2026-08-23-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0117 (HUNT iteration 62, lane `qa-execution`), reproduced from scratch and confirmed in run `2026-08-22T18:58:46.702Z`, iteration 63 (TRIAGE)

## Summary

`markdownExcerpt` builds the plain-text summary shown under a post's title. To
strip markdown markup it runs one character class over the **whole body**:

```ts
.replace(/[#>*_`~-]/g, "")   // apps/web/src/features/posts/lib/markdown.tsx:218
```

A `-` and a `_` are markdown markers only in specific positions — a leading list
bullet, a paired emphasis run. Everywhere else in technical prose they are
content. The regex does not care about position, so it deletes them from inside
words and from inside numbers:

```
published:  Rebuilt the front-end of our e-commerce checkout between 2023-2024.
            Moved the blue-green deploy to CI/CD and renamed every snake_case config key.

rendered:   Rebuilt the frontend of our ecommerce checkout between 20232024.
            Moved the bluegreen deploy to CI/CD and renamed every snakecase config key.
```

`2023-2024 → 20232024` is the part that decides the severity: a date range
becomes an eight-digit number on a page whose entire purpose is to state a
developer's history accurately. The rest is a steady drip of merged words
(`front-end`, `blue-green`, `snake_case`, `CI/CD` survives only because `/` is
not in the class) through prose where hyphens are ordinary.

The developer has **no way to see it from where he writes.** The composer shows
his text, and the `list` layout renders the body through `<Markdown>` verbatim.
Only the two grid surfaces mangle it.

**Two consumers, and only one of them is opt-in:**

| Surface | Who sees it | Opt-in? |
|---|---|---|
| `profile-blocks.tsx:755` — public profile, Posts block `layout: "grid"` | anyone visiting the profile, signed out | yes — `posts-block-dialog.tsx:95` offers `list`/`grid` |
| `posts-page.tsx:205` — the owner's `/dashboard/posts` | every developer with at least one post | **no** — `posts-page.tsx:201` is an unconditional `<ul className="grid …">`, there is no list variant |

So the owner-facing half is not a niche configuration: it is what every
developer sees of their own writing, every time they open their posts page.

**Blast radius is exactly those two call sites.** The recruiter search excerpt
does **not** share the bug — `build-candidate-search-projection.ts:62` only
collapses whitespace. The character-stripping regex is web-only.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** Chromium 1440×1000 · nightly stack web http://localhost:5273 · api http://localhost:3344 (dev stack: 5173 / 3333) · `bash db-manage.sh seed-all`, `seed.react-frontend.003@linkhub.local` / `12345678`

1. Sign in as the seeded developer and publish a post whose body is ordinary
   hyphenated technical prose:
   `Rebuilt the front-end of our e-commerce checkout between 2023-2024. Moved the blue-green deploy to CI/CD and renamed every snake_case config key.`
2. Open `/dashboard/posts`. Read the card's summary. **It is already wrong** — no
   layout setting was touched.
3. Open `/dashboard/layout`, open the Posts block's settings, set **Layout** to
   **Grid**, save.
4. Open the public profile signed out: `/profile/seed-react-frontend-003`.

**Expected:** the summary strips markdown *markup* and leaves prose alone. A
hyphen inside a word, an underscore inside an identifier and a digit range are
content.
**Actual:** `Rebuilt the frontend of our ecommerce checkout between 20232024. Moved the bluegreen deploy to CI/CD and renamed every snakecase config key.`
**Control:** set the same block back to **List** and reload — the body renders
through `<Markdown>` with every hyphen intact. The corruption is the grid branch
only.

## Evidence

- **Reproduced from scratch at triage (iteration 63)**, not taken from the queue
  on trust. `node .nightly/probes/i62-excerpt-grid.mjs` re-run on this head:
  the probe publishes the post, flips the block through the layout editor's own
  `PATCH /me/layout/blocks/:id` (HTTP 200), reads the **signed-out** public page,
  and prints `identical: false` with both strings side by side. Output matches
  the transcript in the Summary verbatim.
- Screenshot: `.nightly/evidence/i62-qa-execution/22-public-grid-excerpt.png`
  (public profile, grid) and `04-posts-page-banner.png` (owner dashboard, where
  a body reading `i62-CHARLIE … double-click on` is shown as
  `i62CHARLIE … doubleclick on`).
- The pure function was re-run in isolation at triage against the source at
  `markdown.tsx:218`, confirming the regex and not merely the rendered page.
- **Call sites re-read at triage, not inherited:** `grep markdownExcerpt` over
  `apps/web/src` returns exactly the two consumers above plus the test file.
  `posts-page.tsx:201` was read directly to confirm the owner grid is
  unconditional — that fact is new at triage and is what moves this off the
  "niche layout option" reading the candidate had.
- **Cleanup verified**, not assumed: the probe's own `DELETE` leaves the row
  behind (it sends a JSON content-type — see `ESC-20260822-delete-empty-json-body`),
  so the post was deleted again without that header and
  `GET /profile/seed-react-frontend-003/posts` re-read as `[]`. The Posts block
  is back on `layout: "list"`.

## Judgement at triage

- **Who is hurt, doing what:** a developer curating a profile, and the recruiter
  reading it. The recruiter takes the harm without being able to detect it — she
  has nothing to compare against.
- **Would they notice?** The developer, yes, on his own posts page — and he
  cannot fix it, because his source text is correct. Whether the recruiter
  notices `20232024` or silently reads a garbled sentence, both outcomes are bad
  for the person the profile represents.
- **Recorded debt?** No. Not in the AGENTS.md debt list.
- **Harness problem?** No — reproduced through the product's own UI, signed out,
  in a real browser.
- **Is the fix riskier than the symptom?** No, and this is the deciding factor
  the night before a deploy. `markdownExcerpt` is a pure `string → string`
  function with two display-only consumers and an existing unit test file. The
  fix is position-aware markup stripping inside that one function. Nothing
  crosses a schema boundary, no stored data changes, no server code moves.

## Test plan agreed at triage

The bug lives entirely in a pure function, so the honest primary layer is the
unit test that already exists and does not cover this.

1. **`apps/web/src/features/posts/lib/markdown.test.tsx`** — beside the function.
   Add cases that fail today:
   - prose hyphens and underscores survive: `front-end`, `e-commerce`,
     `snake_case`, and the digit range `2023-2024` come out unchanged;
   - the existing guarantees still hold — `# Hello **world**` → `Hello world`,
     a leading `- ` bullet is still removed, link labels still survive without
     the url, and the length cap is unchanged.
   The three tests at `markdown.test.tsx:83-97` are the regression floor: do not
   weaken them to let a new implementation through.
2. **`apps/web/src/features/profile/components/posts-block.test.tsx`** — the
   component layer, so the public-profile grid branch is nailed down and not
   just the helper. It already mocks `usePublicPosts` and renders `ProfileBlocks`
   with a posts block; add a `config: { layout: "grid" }` case asserting the
   rendered summary contains `front-end` verbatim. Without this, a later
   refactor could re-introduce the mangling at the call site.

A visual scenario is **not** required here — this is text content, fully
observable in jsdom. Do not spend the night's remaining time on one.

**Scope discipline for FIX:** fix `markdownExcerpt`. Do not rewrite
`markdownToHtml`, do not touch the `list` branch (it is correct), and do not
"improve" the excerpt into a markdown parser. Position-aware stripping of the
markers the current class already targets is the whole job.
