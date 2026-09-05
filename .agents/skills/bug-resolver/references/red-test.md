# Where the red test belongs

Pick the **cheapest layer that can actually fail** for this bug. A test one layer
too high is slow and vague; one layer too low passes while the bug ships.

The doctrine behind every row here is the `testing-boss` skill, and the api
specifics are in `apps/api/AGENTS.md`. This file only routes.

| The bug is…                                              | Write it as…                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| a business rule computing the wrong answer               | a use-case test in `apps/api`, no HTTP, no database                                                        |
| the wrong status, header, auth or payload on an endpoint | a `*.e2e.test.ts` built on `apps/api/src/infra/http/test-support/build-test-app.ts` — the real Fastify app |
| a payload crossing a boundary in the wrong shape         | a contract assertion in `packages/schemas` — fix the schema first, then rebuild, then the callers          |
| a component rendering or behaving wrongly                | `@testing-library/react` in `apps/web`                                                                     |
| something that only shows up on screen                   | a scenario through the `visual-check` skill, plus a unit test for whatever it proved                       |

## Rules that decide whether the test is worth writing

- **It must fail for the reason you believe.** Run it, read the failure, and say
  in one sentence why that failure is the bug and not a mistake in the setup.
- **It must fail before the fix and pass after** — with nothing else changed.
- **Never weaken an existing test to make room.** If an existing test has to
  change, the behaviour genuinely changed; say so and check the blast radius.

## Banned, because they pass for the wrong reason

- **Mirror assertions** — recomputing the expected value with the same code the
  test is checking.
- **Mock-existence assertions** — asserting a mock was called, when nothing
  asserts what it did.
- **Change detectors** — snapshots of implementation detail that fail on every
  refactor and never on a bug.
- **Partial mocks** missing fields the code under test actually reads. The test
  goes green; production throws.

## Running one file

```bash
npm run test --workspace=api -- <path>
npm run test --workspace=web -- <path>
```

Postgres-bound tests need docker: `bash db-manage.sh start` (on Windows: Git Bash
or WSL). `apps/api/AGENTS.md` lists exactly which files need docker, an
`OPENAI_API_KEY`, MinIO or Mailpit — read that list rather than guessing which
failure is environmental.
