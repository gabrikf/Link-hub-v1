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
1. POST /auth/register  {name, email: "I69.Case.i6979696@linkhub.local",
                         login: "i69-case-i6979696", password: "Password123"}   -> 201
2. POST /auth/login     with that exact address, same password                  -> 200  (tokens issued)
3. POST /auth/login     with "i69.case.i6979696@linkhub.local"                  -> 401
                        {"error":"INVALIDCREDENTIALS","message":"Invalid email or password"}
4. POST /auth/register  the lowercase form, a different login                   -> 201  (duplicate check missed)
5. psql  SELECT id, email, login FROM users
         WHERE lower(email) = lower('I69.Case.i6979696@linkhub.local');
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
