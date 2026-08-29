# BUG-20260823-email-case-splits-account: email is matched as a raw string, so one mailbox typed in two cases becomes two accounts — and the first one is unreachable

- **Status:** confirmed (triaged at iteration 69, claimed for FIX)
- **Impact (user-side):** Sign-in refused for the account's own mailbox; the recovery path silently creates a second, empty account, so the profile the developer built looks gone
- **Severity:** Major · **Priority:** P1
- **Persona Affected:** Nina, the importing developer (she registers on a phone, whose keyboard capitalises the first letter by default) and every returning developer who types their address in lowercase
- **Journey Step:** J-auth-register → J-auth-sign-in; and the OAuth branch of sign-in
- **Theme:** both — the defect is server-side identity matching, not presentation
- **Scenarios:** none — no visual scenario covers auth
- **Found:** 2026-08-23 · **Report:** docs/qa/reports/2026-08-23-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0119 (HUNT iterations 67/68, lane `journey-probe`), reproduced from scratch against a mailbox of triage's own at iteration 69

## Summary

Nothing in the stack normalises an email address, at any layer:

| Layer | What it does | File |
|---|---|---|
| Shared contract | `email: z.string().email(...)` — validates, does not lower-case | `packages/schemas/src/auth/…` |
| Login lookup | `eq(users.email, login)` | `user.repository.ts:13` (`findByEmailOrLogin`) |
| Register's duplicate check | the same `findByEmailOrLogin` | `create-user.use-case.ts:26` |
| OAuth account lookup | `eq(users.email, email)` | `user.repository.ts:42` (`findByEmail`), called from `oauth-sign-in.use-case.ts:58` |
| Database | `users_email_unique` is a **plain btree on `email`** — not `lower(email)`, not `citext` | verified with `pg_indexes` |

So the case of the letters is part of the identity. `Gabriel@x.com` and
`gabriel@x.com` are two different users to every one of those call sites, and
the database will not catch the duplicate either.

The sharpest harm is the one nobody sees coming. A developer who registered
`Gabriel@x.com`, later clicks **Sign in with Google** — providers hand back the
address lowercased — `findByEmail` misses, and `oauth-sign-in.use-case.ts`
takes its "new user" branch: a brand-new empty account for a mailbox that
already has one. Their profile, links and resume appear to be wiped.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** nightly stack api `http://localhost:3344` (dev stack: 3333). Plain `curl`; no browser needed.

```
1. POST /auth/register  {name, email: "I69.Case.i6979696@crafthub.local",
                         login: "i69-case-i6979696", password: "Password123"}   -> 201
2. POST /auth/login     with that exact address, same password                  -> 200  (tokens issued)
3. POST /auth/login     with "i69.case.i6979696@crafthub.local"                  -> 401
                        {"error":"INVALIDCREDENTIALS","message":"Invalid email or password"}
4. POST /auth/register  the lowercase form, a different login                   -> 201  (duplicate check missed)
5. psql  SELECT id, email, login FROM users
         WHERE lower(email) = lower('I69.Case.i6979696@crafthub.local');
         1ebb7541-0cdc-4bd0-906a-289d262d8783 | I69.Case.… | i69-case-i6979696
         485add3e-b3e2-4dea-b4fe-e098d9f30b2b | i69.case.… | i69-case-dup-i6979696
```

**Expected:** an email address identifies one account whatever case it is typed
in — sign-in finds it, a second registration is refused with the existing
duplicate-email error, and an OAuth sign-in whose provider address differs only
by case links to the account that is already there.

**Actual:** step 3 is a 401 the user reads as "wrong password"; step 4 creates a
second account for the same mailbox.

**Control:** steps 2 and 3 differ **only** in the case of the address — the
password bytes are byte-identical. The 401 is the lookup missing, not the hash.

## Evidence

- Reproduced from scratch at triage (iteration 69) with a fresh mailbox, not
  taken from the queue on trust: the transcript above is triage's own run, and
  the two rows were read back from Postgres by `lower(email)`.
- `pg_indexes` read directly at triage: `users_email_unique` is
  `USING btree (email)`. The database is not a backstop.
- Call sites re-read at triage — `findByEmail` / `findByEmailOrLogin` have
  exactly three product callers (`login.use-case.ts:24`,
  `create-user.use-case.ts:26-27`, `oauth-sign-in.use-case.ts:58,68`), plus the
  seed script and the in-memory repository.
- Earlier evidence, kept: `.nightly/evidence/i68-journey-auth-verify/email-case.txt`
  (i68's independent curl + psql transcript) and `i67-original-run.log` (i67
  found it first through the real sign-in form in a browser).
- **Dev-database state, measured at triage:** 3 mailboxes now hold a colliding
  pair and 3 rows have a non-lowercase address — **all six created by the hunt
  itself**. No seeded or human account has an uppercase address.

## Judgement at triage

- **Who is hurt, doing what:** a developer signing back in to the account they
  built. Auto-capitalisation on a phone keyboard is the default, so the
  capitalised address is not an exotic input.
- **Would they notice?** Yes, and they will misdiagnose it — the message says
  "Invalid email or password". The two recovery paths a person actually takes
  (register again, or Sign in with Google) both make it worse by silently
  producing a second empty account.
- **Recorded debt?** No.
- **Harness problem?** No — reproduced end to end through the api's own
  endpoints and confirmed in the database.
- **Is the fix riskier than the symptom?** No, provided it stays at the
  application layer. Normalising on write plus a case-insensitive lookup is a
  contained change in one repository and the register path. **Do not add a
  `lower(email)` unique index tonight:** the dev database already holds three
  colliding pairs, the migration would fail on them, and choosing what happens
  to colliding rows is a production-data decision, not a nightly one. Record it
  as a follow-up.

## Test plan agreed at triage

Business rules, so they belong next to the use cases with the in-memory
repository (`apps/api/src/core/repositories/user/in-memory-users-repository.ts`).
For those tests to be honest, the normalisation must happen **at or above** the
repository interface — if the fix lives only in the Drizzle SQL, the in-memory
repository will not exercise it, and the tests will pass for the wrong reason.

1. **`login.use-case.spec.ts`** — a user registered as `A@b.com` signs in with
   `a@b.com` and succeeds. Fails today.
2. **`create-user.use-case.spec.ts`** — with `A@b.com` already present,
   registering `a@b.com` throws the existing duplicate-email error. Fails today.
3. **`oauth-sign-in.use-case.spec.ts`** — a provider email of `a@b.com` against
   an existing `A@b.com` user returns `isNewUser: false` and the **same user
   id**. Fails today.
4. **Mixed-case rows that already exist must still be findable.** Whatever the
   fix does on write, the lookup has to match a stored `I69.Case.…` row when the
   user types lowercase. Cover it with a use-case test that seeds the repository
   with a non-normalised address, and re-check it live against the real Drizzle
   path with the account left in the dev database (ids in Evidence).

**Scope discipline for FIX:** normalise the email; do not touch `login`
matching (logins are a separate identifier and are not part of this bug), do not
change the error messages, and do not write a migration.

---

# Review — APPROVED (iteration 71)

Independent review of `c566114` (red) / `5560cb3` (fix). Verdict: **approved**,
moved to `fixed[]`.

## Red is red, and for the right reason

Detached checkout of `c566114`, the bug's own three files only:

```
FAIL login.use-case.test.ts       > should sign in a stored capitalised address typed back in lowercase
     InvalidCredentialsError  thrown at login.use-case.ts:27   <- the lookup missed, not the hash
FAIL create-user.use-case.test.ts > should throw DuplicateResourceError when the same mailbox is registered in a different case
     promise RESOLVED instead of rejecting, with login "case-split-again"  <- a second account
FAIL oauth-sign-in.use-case.test.ts > links existing user when the provider email differs only by case
     expected true to be false  (isNewUser)

Test Files  3 failed (3)     Tests  3 failed | 19 passed (22)
```

Each failure prints the bug's own symptom — no import error, no missing fixture,
no bad selector. Back on `nightly/qa-hardening`: **22 passed (22)**.

The red commit is **84 insertions / 0 deletions**: no existing test was edited to
let the fix through. The fix commit is **3 files / 37 insertions** with no
reformatting, no renames and no drive-by changes.

## The fix repairs the cause

The defect was never "the login handler forgot to lowercase" — the address was
compared as a raw string at the repository, which is why one missing rule
produced three symptoms. `normalizeEmail` is applied to **both sides** of the
comparison in **both** implementations, so the accounts already stored with
capitals — the people actually hurt — are found too. Normalising on write would
have left exactly those accounts split forever, and would have risked rewriting a
legacy address into a unique violation on an unrelated profile save.

No `no-workarounds` signal: no type assertion, no `eslint-disable`, no `.skip`,
no swallowed error, no timing hack. `@repo/schemas` was not touched at all, so no
boundary shape changed and nothing was widened. TRIAGE's scope discipline was
honoured: `login` matching is untouched, error messages are unchanged, and no
migration was written.

**Blast radius searched and closed.** Every email lookup in the repository funnels
through `IUsersRepository.findByEmailOrLogin` / `findByEmail` — callers are
`login.use-case.ts:24`, `create-user.use-case.ts:26-27`,
`oauth-sign-in.use-case.ts:58` and `:68`, and `seed-realistic.ts:1375`. Both
implementations were changed together, so the in-memory suite and production
cannot drift apart. That is the precise failure mode triage warned about.

## Drizzle proved directly, not through the dev server

The hermetic suite cannot reach `DrizzleUserRepository`, so the branch's own
repository was constructed in-process against `crafthub_dev`
(`.nightly/probes/i71-drizzle-email-case.ts`), with a row inserted by psql holding
capitals:

```
findByEmailOrLogin(lowercase)     caf30a3f… I71.Probe.i71p30726@crafthub.local
findByEmailOrLogin(UPPERCASE)     caf30a3f… I71.Probe.i71p30726@crafthub.local
findByEmailOrLogin(exact)         caf30a3f… I71.Probe.i71p30726@crafthub.local
findByEmailOrLogin(login handle)  caf30a3f… probe-i71p30726
findByEmail(lowercase)            caf30a3f… I71.Probe.i71p30726@crafthub.local
findByEmail(absent)               null
findByEmailOrLogin(absent login)  null
```

A second probe pushed `' OR '1'='1`, `x' OR lower(email) LIKE '%` and
`%@crafthub.local` through `findByEmail`: **all null**. The ``sql`` `` template
binds parameters and does not over-match.

## The user-visible harm is gone

Re-walked from the bug's own entry point on a **verified fresh** api process:

```
1 register capitalised   201
2 login exact            200
3 login lowercase        200   (was 401)
4 register lowercase     409   DUPLICATE_RESOURCE  (was 201)
5 login UPPERCASE        200
6 wrong password         401
7 unknown mailbox        401
psql lower(email)=…      exactly 1 row
```

Mailbox `I71.Ok.i71ok10506018@crafthub.local`; every success returns the same user
id `e541370b-c118-44c3-af70-b2fe2d65c85c`. The negative cases still reject, so the
lookup was widened by case only.

**Method note for future reviews:** checking out the red commit restarts the
`tsx watch` api, and after checking back out the watcher is deaf (git replaces
the file inode), so the server keeps serving the RED code. The first walk of this
reproduction "reproduced" the bug against a stale server. Touch a file the
checkout did not rewrite (`apps/api/src/index.ts`), wait for the listener pid to
change, and only then believe a curl result.

Design, dark mode and the four-state rule are not applicable — this is an api-only
change and nothing user-visible changed shape.

## Accepted with the fix, not a blocker

`lower(email)` cannot use `users_email_unique`, so sign-in is now a sequential
scan. Measured rather than assumed: **454 users, 0.318 ms execution**. The
follow-up is a **non-unique** functional index on `users (lower(email))` — a
migration, and its own task. It is recorded in the queue entry's
`left_for_a_human`.

## Not verified

The OAuth path is covered by a use-case test and by reading
`oauth-sign-in.use-case.ts:58`, but has still never been driven through a real
Google provider — the caveat i68, i69 and i70 each carried. `npm run check-types`
reported 8/8 **cached**, so it re-proved nothing beyond the cache key; the fix
commit's own `guardrails PASS` is what stands.
