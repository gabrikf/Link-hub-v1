# The interview

**At most five questions. One per turn.** Then write the plan.

## The shape of one question

```
<A full interrogative sentence, ending in a question mark.>

Why it matters: <one line — what changes downstream depending on the answer.>

1. <option> — <consequence>
2. <option> — <consequence>
3. <option> — <consequence>

**Recommended:** 2 — <why, in one line>

Reply with the number, or say yes to take the recommendation.
```

Two to five options, **mutually exclusive** — if two could both be true, it is
one question badly split. Every option names its consequence, or the user is
guessing what they choose. The recommendation is always present and always has a
reason; "whichever you prefer" wastes the turn.

## What to ask about

Only where a different answer produces **materially different code**: a boundary
shape that would land in `@repo/schemas`; where state lives or work runs; the
error and empty cases; the scope edge; an existing behaviour this might break.

## What never to ask

- Anything the repo already answers. Read `AGENTS.md` and the nested files first —
  asking which test runner to use, when the rule says vitest, learns nothing.
- Anything with a conventional default and no real trade-off. Pick it, name it,
  move on.
- "Is this plan good?" `plan-reviewer` answers that, with evidence.

## When to stop

Whichever comes first: the critical ambiguity is gone, the user says they are
done, or five have been asked. Everything still unknown becomes an
`[ASSUMPTION]` line the user can veto — **never** a sixth question.

Under `--all-default`, show each question with its recommended answer already
taken and keep going: the user sees what was decided for them, just is not
stopped for it.
