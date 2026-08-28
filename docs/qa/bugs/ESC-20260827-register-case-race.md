# ESC-20260827-register-case-race: two concurrent registrations of one mailbox in two cases both succeed — check-then-insert with no transaction and no case-insensitive index

- **Status:** escalated (triaged at iteration 102 — **not** fixed tonight, by decision)
- **Impact (user-side):** One mailbox becomes two accounts. With `BUG-20260827-login-multi-row-heap-order` unfixed, one of the two owners is then locked out entirely
- **Severity:** Major · **Priority:** P1 — but it needs a migration and a production-data decision, so it is a human's call, not a nightly one
- **Persona Affected:** Nina, the arriving developer (a double-submitted signup form)
- **Journey Step:** J-auth-register
- **Theme:** both — server-side identity, not presentation
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** `.nightly/QUEUE.json` CAND-0127 (HUNT iteration 100, auth cohort), reproduced from scratch at triage

## Summary

`create-user.use-case.ts:25-36` is check-then-insert:

```ts
const [userWithSameEmail, userWithSameLogin] = await Promise.all([...]);
if (userWithSameEmail) throw new DuplicateResourceError(...);
…
await this.usersRepository.create(user);
```

There is no transaction and no locking read, so two requests can both pass the
check before either inserts. The only backstop is `users_email_unique`, a
**case-sensitive** btree on the raw `email` column — so it catches
`a@b.com` twice, but not `A@b.com` and `a@b.com`.

`BUG-20260823-email-case-splits-account` closed the *sequential* path (the
lookup now compares `lower(email)`); its triage note deliberately deferred the
`lower(email)` index. What is recorded nowhere is that the **concurrent** path is
still open.

## Reproduction

- **Environment:** dev stack api `http://localhost:3333`

```
Concurrent — the bug:
  Fire two POST /auth/register at once, same mailbox in two cases, different logins:
    T124.Lock.mtbot0md@linkhub.local  -> 201   (createdAt 15:38:10.487Z)
    t124.lock.mtbot0md@linkhub.local  -> 201   (createdAt 15:38:10.500Z)
  psql: two rows, ctid (17,30) and (18,7).

Sequential — correctly refused, the control:
    POST /auth/register T127.Seq.mtboteie@linkhub.local  -> 201
    POST /auth/register t127.seq.mtboteie@linkhub.local  -> 409
  psql count(*) WHERE lower(email)=… -> 1
```

**Expected:** one 201 and one 409, whatever the timing.

**Actual:** two 201s, 13 ms apart.

**Control:** the sequential pair proves the duplicate check itself is correct and
case-insensitive. The defect is purely the window between the check and the
insert.

## Evidence

- `.nightly/evidence/i102-triage/cand-0124-login-lockout.txt` — the same
  transcript carries both the race and the sequential control.
- `\d users` at HUNT: the only email constraint is
  `users_email_unique UNIQUE btree (email)`.

## Why this is escalated and not fixed tonight

A check-then-insert race cannot be closed in application code — the fix is a
`UNIQUE INDEX ON users (lower(email))` plus catching the violation as the
existing `DuplicateResourceError`. That migration needs a decision this loop is
not allowed to make:

1. **It will fail on existing data.** `linkhub_dev` already holds **six**
   colliding mailboxes. Production may hold more, all created by the pre-08-23
   code, which is exactly the population the index would reject.
2. **Choosing which of two real accounts survives is a product decision.** Both
   may have a profile, links, posts and an imported resume. Merging, renaming, or
   emailing the owners are all reasonable and none of them is a nightly call.
   `normalize-email.ts` says this in its own words: *"addresses that already
   collide are a decision for a human rather than a side effect of a login."*
3. **The residual harm after tonight is small.** Once
   `BUG-20260827-login-multi-row-heap-order` is fixed, both owners of a colliding
   pair can sign in to their own account. What is left is a duplicate account —
   annoying, recoverable, and not a blocked journey. The race itself needs a
   genuine double-submit or a deliberate attempt.

**Recommendation for the human:**

- Ship the login determinism fix (`BUG-20260827-login-multi-row-heap-order`)
  tonight. It removes the sharp edge without touching the schema.
- Then, as its own task with its own review: an audit query for colliding pairs,
  a decided merge/rename policy, the backfill, and only then
  `CREATE UNIQUE INDEX CONCURRENTLY users_email_lower_unique ON users (lower(email))`
  with `create-user.use-case.ts` catching the unique violation and re-throwing
  `DuplicateResourceError`.
- The same migration also restores an index for the login lookup, which the
  08-23 fix turned into a sequential scan (measured then: 454 users, 0.318 ms —
  fine now, not fine forever).

Audit query to start from:

```sql
SELECT lower(email) AS mailbox, count(*), array_agg(id) AS ids
FROM users GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;
```
