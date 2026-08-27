# BUG-20260827-login-multi-row-heap-order: when one mailbox exists twice in different cases, login returns a heap-order row — the other owner is locked out with correct credentials

- **Status:** confirmed (triaged at iteration 102, claimed for FIX)
- **Impact (user-side):** Total sign-in lockout. The developer types their own exact address and their own password and gets `INVALIDCREDENTIALS`, forever, with no recovery path
- **Severity:** Blocker · **Priority:** P0
- **Persona Affected:** Nina and Diego — any developer whose mailbox is duplicated in the database, which is exactly the population the pre-fix code created
- **Journey Step:** J-auth-sign-in
- **Theme:** both — server-side identity matching, not presentation
- **Scenarios:** none — no visual scenario covers auth
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** `.nightly/QUEUE.json` CAND-0124 (HUNT iteration 100, deep-review lane), reproduced from scratch at triage with a mailbox of triage's own
- **Regression of:** BUG-20260823-email-case-splits-account — introduced by that bug's own fix on this branch

## Summary

`BUG-20260823-email-case-splits-account` widened the email lookup from
`eq(users.email, x)` — which can match **at most one row**, because
`users_email_unique` is a unique btree on the raw column — to
`` sql`lower(email) = ${normalizeEmail(email)}` ``, which can match **many**.

The row-taking code was not widened with it:

| File | Line | What it does |
|---|---|---|
| `apps/api/src/infra/database/drizzle/repositories/user.repository.ts` | 20-23 | `const [user] = await db.select()…` — **no `ORDER BY`, no `LIMIT`** |
| `apps/api/src/infra/database/drizzle/repositories/user.repository.ts` | 52 | same shape in `findByEmail` |
| `apps/api/src/core/repositories/user/in-memory-users-repository.ts` | 23-27 | `.find(…)` — first-match-wins, the same defect in the twin |

With two rows for one mailbox, Postgres returns them in physical (heap) order and
`const [user] =` silently takes whichever came first. The loser's password is
never checked against their own row, so the login is a 401 — and because heap
order changes after any unrelated `UPDATE` to either row (a profile save moves
the tuple), **which of the two accounts is reachable can flip on its own.**

There is no test on the branch that seeds a colliding pair, which is why the
whole suite is green.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** dev stack api `http://localhost:3333`. Plain `curl` + `psql`; no browser needed.

```
1. ID=mtbot0md
2. Two CONCURRENT POST /auth/register (see ESC-20260827-register-case-race — the
   race is what still produces the pair today):
     T124.Lock.$ID@linkhub.local  login t124up$ID  password PassUPPER111  -> 201
     t124.lock.$ID@linkhub.local  login t124lo$ID  password PassLOWER111  -> 201
3. psql: SELECT ctid,id,email,login FROM users WHERE lower(email)=lower('T124.Lock.'||$ID||'@linkhub.local');
     (17,30) | 8105414c-5e38-42d9-b432-57fbd44f55ec | T124.Lock.… | t124upmtbot0md
     (18,7)  | 96798ea2-d84a-49eb-9126-327253de44f2 | t124.lock.… | t124lomtbot0md
4. POST /auth/login  UPPERCASE address + PassUPPER111  -> 200, user 8105414c…
5. POST /auth/login  lowercase address + PassLOWER111  -> 401 INVALIDCREDENTIALS   <-- THE BUG
6. POST /auth/login  UPPERCASE address + PassLOWER111  -> 401 (control: right row, wrong password)
7. POST /auth/login  lowercase address + PassUPPER111  -> 200, user 8105414c…      <-- the other row wins regardless of which case was typed
```

**Expected:** each owner signs in to **their own** account with their own address
and their own password. A stored mixed-case address stays findable (the point of
the 08-23 fix).

**Actual:** row `(17,30)` answers for both addresses. The owner of `(18,7)` is
locked out permanently; `POST /auth/login` never evaluates their password hash.

**Control:** steps 4 and 7 differ **only** in the case of the typed address and
return the **same user id** — the lookup is not discriminating between the rows
at all. Step 6 proves the 401 in step 5 is the wrong-row selection and not a
broken hash: the same password succeeds in step 7.

## Evidence

- Reproduced from scratch at triage, not taken from the queue on trust:
  `.nightly/evidence/i102-triage/cand-0124-login-lockout.txt`
- The colliding pair `t124.lock.mtbot0md@linkhub.local` is **deliberately left in
  `linkhub_dev`** so FIX can verify against the real Drizzle path. Six mailboxes
  in the dev database now hold a pair; all six were created by this loop.
- Sequential registration is correctly refused (`409`, one row) — verified at
  triage with mailbox `t127.seq.mtboteie@linkhub.local`. The pair requires either
  the concurrency race or a row that predates the 08-23 fix.

## Judgement at triage

- **Who is hurt, doing what:** a developer signing back in. Two populations reach
  this state: anyone whose duplicate pair predates the 08-23 fix (in production
  that fix normalised the *comparison*, deliberately not the stored rows — see
  `normalize-email.ts`, "addresses that already collide are a decision for a
  human"), and anyone who double-submits registration.
- **Would they notice?** They are stopped dead. The message says "Invalid email or
  password", so they will misdiagnose it and try a password reset that cannot
  help. This is a blocker by the plain definition: the journey cannot be completed.
- **Recorded debt?** No. It is a regression this branch shipped four days ago.
- **Harness problem?** No — walked end to end through the api's own endpoints and
  read back from Postgres by `ctid`.
- **Is the fix riskier than the symptom?** No, provided it stays at the
  application layer. Making the multi-row case **deterministic and correct** —
  prefer the row whose stored address matches byte-for-byte what the user typed,
  then fall back to the case-insensitive match — is a contained change to two
  repository methods and their in-memory twin. It restores every pre-fix user's
  ability to sign in (they type their own address) without narrowing the 08-23
  fix (a lone mixed-case row is still found from any casing).

**Scope discipline for FIX:**
- Do **not** write a migration and do **not** add a `lower(email)` unique index —
  the dev database already holds six colliding pairs, the migration would fail on
  them, and choosing which of two real accounts survives is a production-data
  decision. That is `ESC-20260827-register-case-race`, escalated to a human.
- Do not touch `login`-handle matching, and do not change any error message.
- Fix **both** implementations together. If the ordering lives only in the
  Drizzle SQL, the in-memory suite will not exercise it and the tests pass for
  the wrong reason — the exact failure mode the 08-23 review flagged.
- `findByEmailOrLogin` is also the register duplicate check; it must still return
  *some* row for a colliding mailbox so registration keeps 409-ing.

## Test plan agreed at triage

Business rules, so they belong next to the use cases with the in-memory
repository — and the ordering rule must sit **at or above** the repository
interface for those tests to be honest.

1. **`login.use-case.test.ts`** — seed the repository with **two** users for one
   mailbox (`A@b.com` / `a@b.com`, different password hashes). Each signs in with
   their own address and own password and gets **their own user id** back. Fails
   today: the second assertion throws `InvalidCredentialsError`.
2. **`login.use-case.test.ts`** — with the same pair seeded in the **reverse**
   insertion order, the same two assertions hold. This is the test that pins
   "not first-match-wins"; a fix that only reverses the order passes (1) and
   fails (2).
3. **`login.use-case.test.ts`** — regression guard for 08-23: a **single** stored
   `I69.Case.…` row is still found when the user types it lowercase.
4. **`create-user.use-case.test.ts`** — regression guard: with a colliding pair
   already present, registering that mailbox again still throws
   `DuplicateResourceError`.
5. **Drizzle path, out of band** — the hermetic suite cannot reach
   `DrizzleUserRepository`. Construct it in-process against `linkhub_dev` (the
   `.nightly/probes/i71-drizzle-email-case.ts` pattern) against the pair left in
   the database, and re-walk steps 4-7 above live. Heed the 08-23 review's method
   note: after any checkout, `tsx watch` serves stale code until the listener pid
   changes.
