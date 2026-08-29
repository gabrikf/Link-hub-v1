# AB-20260823 — journey 5's two "renders all four states" tests fail on a product that is correct

**Status:** open — spec fix needed, no product change
**Spec:** `e2e/journeys/05-profile-appearance.spec.ts` (tests at `:822` and `:893`)
**Raised by:** nightly QA loop, triage of `CAND-0116` (iteration 61, 2026-08-23)

## Why this is here and not in `bugs/`

Both tests fail on `nightly/qa-hardening`, and both failures are the spec's,
not the app's. Measured first-hand with a real browser, a real session and a
real `500`:

| Screen | Error copy reached | `GET` attempts | Fabricated blocks |
|---|---|---|---|
| `/dashboard` profile panel, `GET /me` → 500 | **7.7 s** — "Couldn’t load your profile" | 4 (1 + 3 retries) | — |
| `/dashboard/layout`, `GET /me/layout` → 500 | **~8 s** — "Couldn’t load your layout" | 4 (1 + 3 retries) | **0** |

Probes: `.nightly/probes/i61-me-500-dashboard.mjs`,
`.nightly/probes/i61-me-500-test-sequence.mjs` (the second one walks the spec's
own loading → filled → empty → error sequence, so the result is not an
artefact of a simpler setup). No retry storm, no console errors beyond the four
expected 500s, error state stable for the full 40 s watch.

## Defect 1 — the layout spec asserts a bug that was fixed on this branch

`05-profile-appearance.spec.ts:875-879`:

```ts
// Observed behaviour: the editor falls back to `buildDefaultLayout()` and
// renders block cards the user never created, as if they were saved work.
await expect(
  page.getByRole("group", { name: /^Profile header block\./ }),
).toHaveCount(1);
```

That was true when the spec was written (commit `a5af9d0`, before the run).
`BUG-20260822-layout-error-fabricated` removed the fabricated fallback —
`profile-layout-page.tsx:841` now returns `<LayoutLoadFailed>` when
`layoutQuery.isError && !full`. The editor renders **0** block cards, so the
assertion fails at `toHaveCount(1)` and the test never reaches its own error
assertion two lines below.

**Fix:** invert it — assert `toHaveCount(0)`, i.e. no fabricated blocks, and
keep the error-copy assertion as the real check.

## Defect 2 — the dashboard spec's loading gate is vacuous, and its error timeout is too short

`05-profile-appearance.spec.ts:930-939`:

```ts
await page.goto("/dashboard");
await expect(page.getByText("Loading profile")).toHaveCount(0, { timeout: 30_000 });
await expect(
  page.getByText(/couldn.?t|could not|unable|try again|failed/i).first(),
).toBeVisible({ timeout: 5000 });
```

The gate is satisfied at **t ≈ 0.1 s** — the frame right after `goto`, before
React has mounted and the skeleton exists at all. It is meant to wait for the
skeleton to *go away*; it actually matches the moment before it *arrives*. The
5 s error timeout then expires at t ≈ 5 s, while the error state legitimately
lands at t ≈ 7.7 s: TanStack Query's default `retry: 3` with exponential
backoff (~1 s + 2 s + 4 s). The screenshot the failure leaves behind therefore
shows a skeleton, which reads as "stuck loading" and is what made this look
like a product bug.

**Fix:** wait for the skeleton to appear before waiting for it to leave (or
drop the gate entirely), and give the error assertion a timeout above the retry
backoff — 15 s, with a comment naming the backoff so nobody trims it back.

## Same trap elsewhere

Any four-state spec in this repo that asserts an error state through a
TanStack query needs > 8 s, because nothing overrides the default retry policy
(`apps/web/src/lib/query-client.ts` sets only `staleTime` and
`refetchOnWindowFocus`). Worth a sweep when someone picks this up.
