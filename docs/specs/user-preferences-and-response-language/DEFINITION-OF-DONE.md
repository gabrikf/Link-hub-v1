# Definition of Done — persisted preferences, response language, optional tabs

Three changes ship together on `feat/i18n-web`. This file is the contract: a
final reviewer checks the tree against **these** statements, not against a
recollection of what was asked for. Every box is either demonstrably true or the
change is not done.

A box that cannot be ticked must be reported as untested — never quietly
dropped, never re-scoped to whatever happened to get built.

---

## 0. Design decisions, and why (a reviewer should challenge these, not re-derive them)

### D1 — Private preferences live in a new `user_preferences` table, not on `users`

`profileSchema` in `packages/schemas/src/profile/index.ts` is the response shape
for **both** `GET /me` **and** the fully public `GET /profile/:username`. The
`users` row is what feeds it. Putting `language` and `theme` on `users` means
the natural next edit — adding them beside `themePreset`, which already sits in
that schema — silently publishes a person's UI language and dark-mode setting to
every anonymous visitor of their profile.

A separate table makes that leak require deliberate effort instead of being the
path of least resistance. It also gives the preference set somewhere to grow
(notifications, email cadence) without widening the row that gets serialised
publicly.

`user_id` is the primary key **and** the foreign key: 1:1 is enforced by the
schema rather than by convention, the index comes free, and `ON DELETE CASCADE`
means deleting a user cannot orphan a preference row.

### D2 — `tabsEnabled` DOES go on `users`, and is public

The opposite call, for the opposite reason. The public profile renderer has to
know whether to draw the tab strip, so this flag **must** be in the public
payload. It is profile presentation, exactly like `openToWork` and
`themePreset`, and it belongs beside them.

### D3 — "Follow the device" is a real stored state, not the absence of one

`language` is nullable and `theme` defaults to `'system'`. Both mean "follow the
device/OS", which is what an untouched account gets — satisfying "start from the
user machine". The moment the user picks a value it is written to the database,
satisfying "save on db".

The rejected alternative was to detect the device value once and freeze it into
the row on first login. That reads as "saved" but is worse: a user who changes
their OS to dark mode would be stuck in light forever, with no UI to explain why.

### D4 — `localStorage` stays, demoted from source of truth to pre-paint cache

Theme and language are read **synchronously before first paint**
(`main.tsx` → `initializeTheme()`, `i18n/index.ts` → `getInitialLanguage()`).
A database value cannot arrive before paint — it needs an authenticated
round-trip. Removing the local read to "do it properly from the DB" would put a
flash of the wrong theme on every single page load.

So: local storage seeds the first paint, the database is authoritative and
cross-device, and every server value is mirrored back into local storage so the
*next* load's pre-paint read is already correct. A first load on a new device may
correct itself once; that is the honest cost of no SSR and it is accepted.

### D5 — Anonymous visitors keep working entirely on `localStorage`

Public profile pages are viewed logged-out and carry both toggles. Nothing in
this change may make those toggles 401, throw, or no-op for an anonymous user.

### D6 — The recruiter query-conversion prompt keeps its English labels

`openai-recruiter-query-conversion-provider.ts` emits a structured retrieval DSL
(`Role:`, `Seniority:`, `Core Skills:` …) that is embedded and matched against a
pgvector index built from English-labelled text. Translating those labels changes
retrieval behaviour and would degrade search quality for every user.

Language is still threaded to this provider, and the **values** stay in the
source language as they always have — but the labels are pinned to English on
purpose, and a test asserts it. This is a deliberate exclusion from "all LLM
responses in the user's language", stated here rather than discovered later.

### D7 — Explanation of the tabs switch is helper text, not a hover tooltip

There is no Tooltip primitive in `shared-components/`, and
`@radix-ui/react-tooltip` is not a dependency. The repo's existing pattern for
explaining a switch is a persistent helper line wired through `aria-describedby`
(`dashboard.openToWorkHelp`). A hover-only tooltip is invisible on touch devices
and to keyboard users, so the house pattern is both cheaper and better here.

---

## 1. Part 1 — Persisted language and theme

### Database
- [ ] `user_preferences` table exists with `user_id` (uuid, PK, FK → `users.id`,
      `ON DELETE CASCADE`), `language` (text, nullable), `theme` (text, NOT NULL,
      default `'system'`), `created_at`, `updated_at`.
- [ ] `CHECK` constraints reject any `language` outside the three shipped locales
      and any `theme` outside `light|dark|system`. Proven by a test that attempts
      a bad write and expects it to fail.
- [ ] A generated migration file exists in `apps/api/drizzle/` and
      `meta/_journal.json` is updated. The migration was **generated**, not
      hand-written.
- [ ] The migration backfills a row for every existing user, so no account is
      left without preferences.
- [ ] Migration applies cleanly against the running dev database.

### API
- [ ] `GET /preferences` returns the caller's preferences; auto-provisions a
      default row if one is missing (a user created before this migration, or by
      a code path that forgot).
- [ ] `PUT /preferences` accepts a partial update and returns the full new state.
- [ ] Both routes require auth and return 401 without a token.
- [ ] Both are registered at the bare path **and** under `/api/v1`, per repo
      convention.
- [ ] Validation rejects an unknown locale and an unknown theme with 400 — not a
      500, and not a silent coercion to the default.
- [ ] Preferences are **absent** from `profileSchema`, so `GET /profile/:username`
      cannot expose them. Proven by an assertion on a real public payload.
- [ ] Layering respected: `core/` declares the repository interface and holds the
      use cases; `infra/` holds the Drizzle implementation; DI registers the
      interface token. `core/` imports nothing from `infra/`.

### Web
- [ ] On login/session start the app fetches preferences and applies them.
- [ ] Changing theme persists to the database for an authenticated user.
- [ ] Changing language persists to the database for an authenticated user.
- [ ] Both changes are mirrored into `localStorage` so the next pre-paint read is
      already correct (D4).
- [ ] `theme: 'system'` follows the OS live — a user on `system` who flips their
      OS to dark gets dark **without** a reload.
- [ ] An anonymous visitor can still toggle both, with no network call and no
      console error (D5).
- [ ] A failed preferences request degrades to local behaviour and never blanks
      the screen or blocks render.
- [ ] Signing out and back in on a *different* stored local value ends with the
      **database** value winning.

---

## 2. Part 2 — LLM responses in the user's language

- [ ] A `detectLanguage` helper lives in `apps/api/src/core/`, is pure, and
      returns `null` when it is not confident rather than guessing.
- [ ] Resolution order is implemented and tested exactly as:
      **language detected from the user's own text** → **stored preference** →
      **`Accept-Language`** → **`en-US`**.
- [ ] The web client sends `Accept-Language` on API requests, taken from the
      active i18n language.
- [ ] Resume parsing (`openai-resume-parsing-provider.ts`) instructs the model to
      write every free-text field (`summary`, `profileDescription`,
      `headlineTitle`, work-experience `description`) in the resolved language.
- [ ] Structured/enum values in that response are **not** translated — they are
      wire values that must keep matching the schema. A test proves a non-English
      run still returns valid enum values.
- [ ] Recruiter query conversion receives the language but keeps English labels,
      with a test asserting the labels (D6).
- [ ] `userId` is actually plumbed controller → use case → provider on both
      paths; today it is dropped at the use-case boundary on both.
- [ ] Nothing in the language path can throw into a request: an unresolvable
      language falls back to `en-US`.
- [ ] `openai-resume-parsing-provider.ts` gains the unit test file it never had.

---

## 3. Part 3 — Optional tabs section

- [ ] `users.tabs_enabled` (boolean, NOT NULL, default `true`) exists, with a
      migration. Every existing profile therefore keeps its current behaviour.
- [ ] `tabsEnabled` is present in `profileSchema`, `updateProfileSchemaInput` and
      `updateProfileSchemaOutput`.
- [ ] A switch in the layout editor — where the user can actually see the tab
      strip — toggles it, and it persists.
- [ ] The switch has a persistent explanation wired via `aria-describedby` (D7),
      translated in all three locales.
- [ ] **When disabled, the public profile renders no tab strip and shows only the
      first tab's blocks plus pinned blocks.**
- [ ] When disabled, the editor hides the tab-manager row and the per-block
      "all tabs" / "Tab" controls that only make sense with tabs on.
- [ ] Turning tabs off and back on **loses no data** — tabs and their block
      assignments survive untouched. Proven by a test, not by inspection.
- [ ] The user is warned, before or while disabling, that blocks living on other
      tabs will stop being visible. Silently hiding a user's content is the
      failure mode this box exists to prevent.
- [ ] `tabsEnabled` is *not* per-viewport — one profile-level flag covering pc and
      mobile.

---

## 4. Quality gates — non-negotiable

- [ ] `node scripts/guardrails/pre-push.mjs` prints `guardrails PASS`.
- [ ] The gate ran with Postgres up and `OPENAI_API_KEY` present, so it did
      **not** narrow the suite. If it did narrow, the skipped files are named in
      the final summary.
- [ ] `npm run i18n:check` passes — key parity across `pt-BR`, `en-US`, `es-ES`,
      no empty values, no raw strings, every `t()` key resolves.
- [ ] Every new user-visible string exists in **all three** locale files.
- [ ] No new `any`, no `eslint-disable`, no `.skip`, no widened zod schema, no
      `--no-verify`.
- [ ] `@repo/schemas` was changed first and rebuilt before dependent work.
- [ ] No pre-existing test was edited to make new code pass.
- [ ] Design contract held: constants imported from `surface.ts`, a `dark:`
      counterpart on every colour utility, `react-icons/fi` only, no new hex.
- [ ] All four states (loading / empty / error / filled) still hold on every
      screen touched.
- [ ] A visual scenario run covers the new tabs-off public profile in **both**
      themes.

---

## 5. Test plan — what would actually catch a bug here

Tests that only restate the implementation are not evidence. Each of these
targets a specific way this feature can be wrong:

| # | The bug it catches | Where the test lives |
|---|---|---|
| 1 | Preferences leak into the public profile payload | contract test: `profileSchema.parse()` on a real `/profile/:username` response, asserting the keys are absent |
| 2 | A user with no preferences row 500s instead of getting defaults | api test: `GET /preferences` for a user whose row was deleted |
| 3 | An invalid locale is silently coerced instead of rejected | api test: `PUT /preferences` with `"xx-XX"` expects 400 |
| 4 | The DB value loses to a stale `localStorage` value on login | web test: local says `dark`, server says `light` → ends `light` |
| 5 | `system` stops following the OS after a manual toggle elsewhere | web test: `matchMedia` change event flips the applied theme |
| 6 | An anonymous toggle fires an authenticated request | web test: asserts no network call for a logged-out toggle |
| 7 | LLM answers English to a Portuguese resume | api test: pt resume text → resolved language `pt-BR` |
| 8 | Detection overrides an explicit preference when it should not, or vice versa | api tests: the full precedence matrix from §2 |
| 9 | Forcing a language corrupts enum wire values | api test: non-English parse still yields schema-valid enums |
| 10 | Retrieval quality silently regresses | api test: query-conversion labels stay English |
| 11 | Disabling tabs destroys tab/block data | api test: toggle off → on, layout is byte-identical |
| 12 | Tabs-off still renders the tab strip publicly | web test on `ProfileBlocks` with `tabsEnabled: false` and 3 tabs |
| 13 | Tabs-off hides pinned blocks too (it must not) | web test: pinned blocks still render |
| 14 | A migration that works forward but breaks an existing account | run the migration against the seeded dev DB and read a pre-existing user's preferences back |

---

## 6. Final review — the last subagent's job

An independent reviewer, given this file and the diff, must:

1. Tick or fail **every** box above, by reading code and running commands — not
   by trusting the implementation summary.
2. Re-run the gate and `i18n:check` itself.
3. Verify with the postgres MCP server that a real `PUT /preferences` produced a
   real row change, queried by user id. A 200 is not evidence.
4. Confirm no pre-existing test was weakened and no debt from the root
   `AGENTS.md` "Known debt" list grew.
5. Report every box it could **not** verify, and why. A review that omits its own
   gaps is worse than no review.
