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

---

## Review — APPROVED (iteration 65, REVIEW_FIX, 2026-08-23)

Reviewed independently of the agent that wrote the fix. Red `73cee34`, green
`82d090a`.

### Red-then-green, proved mechanically

Detached checkout at `73cee34`, both test files run from `apps/web`:
`4 failed | 19 passed (23)`. Every one of the four failures is the bug's own
symptom, not an import error, a bad selector or a missing fixture:

```
markdownExcerpt > keeps hyphens and underscores that are part of the prose
  expected "…front-end … 2023-2024 … snake_case…"  received "…frontend … 20232024 … snakecase…"
markdownExcerpt > strips leading bullets and quote markers without eating in-word hyphens
  expected "blue-green deploys ship it"             received "bluegreen deploys ship it"
markdownExcerpt > unwraps _emphasis_ but leaves an identifier's underscores alone
  expected "Shipped the user_id migration"          received "Shipped the userid migration"
PostsBlock > shows the grid excerpt with the author's hyphens intact
  rendered <p> read "Rebuilt the frontend of our checkout between 20232024."
```

Back on `nightly/qa-hardening`: `Test Files 2 passed (2) · Tests 23 passed (23)`.
The three pre-existing `markdownExcerpt` assertions pass at **both** commits —
the regression floor was never weakened. The red commit is `62 insertions, 0
deletions`: no existing test was edited to let the fix through.

### The fix itself

Root cause, not symptom. The defect was that `.replace(/[#>*_`~-]/g, "")` has no
notion of position; the fix replaces it with position-aware stripping
(`stripBlockMarkers` at line-start only, `stripInlineMarkup` on paired
delimiters) rather than special-casing the reported strings. None of the
`no-workarounds` signals are present: no type assertion, no `eslint-disable`, no
`.skip`, no widened schema, no swallowed error, no timing hack. No boundary
shape changed, so `@repo/schemas` is not involved. The commit touches exactly
one file and one function region — no reformatting, no renames, no drive-by
edits. TRIAGE's scope discipline ("do not rewrite `markdownToHtml`, do not touch
the `list` branch") was honoured.

Blast radius is two call sites, both found and both re-walked live:
`profile-blocks.tsx:755` (public, grid branch) and `posts-page.tsx:205` (owner
dashboard, unconditional grid). Both render the result as a React text child, so
there is no HTML sink. No class string changed, so `DESIGN.md`, the `SURFACE*`
constants, the `dark:` pairings and `--profile-accent-*` are untouched, and the
four-state handling of both screens is exactly as it was.

`npm run check-types` passes (8/8 tasks) and `lint-changed` reports clean over
42 changed files.

### Behaviour against the real data, old vs new

The four post bodies actually in the dev database were run through both the old
and the new implementation. The old one corrupted three of the four —
`fullstack`, `Serverenforced`, `codequality`, `assetmonitoring`,
`developerportfolio`, `zeroLLM`, `autoposting`, `5step`. The new one reproduces
all of them correctly and leaves **zero** stray markup characters
(`[*_~`#]`) in any of the four excerpts.

Performance: 200 excerpts of a 20,400-character body take 52 ms (0.26 ms each).
All the new patterns use bounded negated classes, so there is no backtracking
blow-up on a user-supplied body.

### User-visible re-walk — `.nightly/probes/i65-review-excerpt.mjs`

Written for this review rather than reusing the fix's own probe, and extended to
the half the FIX iteration did not drive in a browser. A post whose body carries
a heading, a bullet list, a code span, bold and a link with a hyphenated URL was
published through the API, then read back off four screens. The assertion is not
a keyword spot-check: the visible summary must be an **exact prefix** of the
expected plain text.

```
PASS  public profile (grid, signed out, light)      — exact prefix (160 chars)
PASS  public profile (grid, signed out, dark)       — exact prefix (160 chars)
PASS  /dashboard/posts (unconditional grid, light)  — exact prefix (140 chars)
PASS  /dashboard/posts (unconditional grid, dark)   — exact prefix (140 chars)
```

The dashboard was reached by signing in through the real form. Zero console
errors, zero page errors, zero 4xx/5xx across all four contexts. Evidence:
`.nightly/evidence/i65-review-excerpt/`. Cleanup was re-read from Postgres, not
trusted from the probe: `posts` is back to 4 rows, no `Q3 recap` row survives,
and no `profile_blocks` row of kind `posts` is off `layout: "list"`.

### Advisories — recorded, none blocking

None of these is a regression against the old behaviour and none meets the
real-user-impact bar; they are written down so a later iteration does not
rediscover them as findings.

1. The excerpt unwraps `_emphasis_` and `~~strike~~`, but `markdownToHtml`
   supports neither, so the rendered post shows `_Shipped_` where the grid
   summary shows `Shipped`. The old code also deleted those characters, so this
   is unchanged behaviour — but it is now encoded in a test.
2. Emphasis spanning a hard line break (`**bold\ncontinued**`) leaves a literal
   `**` in the excerpt, because the inline pass runs per line. The old code
   deleted it. None of the four real bodies hard-wraps inside a paragraph, so
   this is not reachable on today's data.
3. `stripInlineMarkup` unwraps code spans *first*, which exposes their contents
   to the emphasis rules — the opposite of the protect-then-restore order
   `renderInline` uses. Harmless today (`_` needs a word boundary, `*` inside a
   code span is rare) and no worse than the old blanket strip.
4. `#### h4` and `+ item` are stripped by the excerpt but rendered literally by
   `markdownToHtml`, which only handles `#{1,3}` and `[-*]` bullets.

### Not verified

One account, Chromium only, 1440×1000 only — no mobile width, since the change
alters text content and no class string. Bodies that are mostly code fences,
markdown tables, or nested/lazy blockquotes remain uncovered by any assertion,
as TRIAGE intended. `deep-review` was run as its rubric and linter lanes applied
by hand over the 40-line diff rather than as its full fan-out pipeline.
