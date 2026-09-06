# Quick Reference

Internal reference for `#spec-implement` — parameters and formatting looked up
rather than followed step by step.

---

## Parameters

| Parameter | Value |
|-----------|-------|
| Input | `docs/specs/[feature-name]/` (from `#spec-writer`) |
| Branch pattern | `feat/[feature-name]` from `main` |
| Commits | Conventional Commits in English, one per task or group |
| Verification | The harness (`harness.md`) after every task |
| One-shot gate | `node scripts/guardrails/pre-push.mjs` |
| Contract package | `@repo/schemas` — build it first with `npm run build:schemas` |
| Design language | `DESIGN.md` + `apps/web/src/shared-components/surface.ts` |
| i18n | react-i18next, three locales in `apps/web/src/i18n/locales/`; every string through `t()`; `npm run i18n:check` |
| Visual gate | `node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs` |
| API / Web | `http://localhost:3333` (`/docs`, `/health`) / `http://localhost:5173` |
| Delivery | `gh pr create --base main` |
| Max parallel worktrees | 3 |
| Max subagents | 3 |

---

## Clickable Links

Format every resource this way when it appears in a message to the dev:

| Resource | Format |
|---------|---------|
| Spec | `[SPEC.md](docs/specs/[feature]/SPEC.md)` |
| GitHub issue/PR | `[#123](https://github.com/<owner>/<repo>/pull/123)` — read `git remote -v` |
| Swagger | `[/docs](http://localhost:3333/docs)` |
| Local screen | `[http://localhost:5173/route](http://localhost:5173/route)` |
