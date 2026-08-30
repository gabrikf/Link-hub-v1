# Visual-check scenarios

One file = one check.

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
npm run visual:run -- <file> --headed     # watch it happen
```

The runner launches a headless browser **once** and walks every state of a screen
in a single process. That is the entire reason this folder exists: driving the
browser one agent tool call per action costs a model round-trip per click, and a
four-state check of one screen is 15-30 actions. See the `visual-check` skill.

## Rules

- **`public-profile.scenario.mjs` is the reference.** Copy it to start a new check.
- Ad-hoc scenarios are **gitignored**, exactly like `.visual/` — they are scratch
  for the task you are on. When one is worth keeping, un-ignore it by name in
  `.gitignore` next to the `public-profile` line, or graduate the flow into a
  real test (`apps/web/src/**/*.test.tsx`, or an api e2e suite).
- **Never put credentials here.** An authed scenario declares
  `export const requiresAuth = true` and the session comes from
  `npm run visual:login`, which reads `VISUAL_EMAIL` / `VISUAL_PASSWORD` from the
  environment and defaults to the seeded local accounts.
- **A public page must be captured signed out.** The runner drops the
  storageState for any scenario that does not set `requiresAuth`. Reusing your
  own session on `/:username` is how "it looks fine" gets reported for a
  page that is broken for every stranger.

## Prerequisites

```bash
bash db-manage.sh start && bash db-manage.sh seed-all   # database + fixtures
npm run dev                                            # web :5173, api :3333
npm run visual:login                                   # only for requiresAuth scenarios
```
