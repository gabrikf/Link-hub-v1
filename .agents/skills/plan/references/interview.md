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

- Two to five options, **mutually exclusive**. If two options could both be true,
  they are one question badly split.
- Every option names its consequence. An option list without consequences makes
  the user guess what they are choosing.
- The recommendation is always there, and always has a reason. "Whichever you
  prefer" wastes the turn.

## What to ask about

Ask only where a different answer produces **materially different code**:

- a boundary shape that would land in `@repo/schemas`;
- where the state lives, or where the work runs;
- what happens in the error and empty cases;
- the scope edge — is X in or out;
- an existing behaviour the change might break.

## What never to ask

- Anything the repo already answers. Read `AGENTS.md` and the nested files first;
  asking which test runner to use, when the rule says vitest, spends a turn to
  learn nothing.
- Anything with a conventional default and no real trade-off. Pick it, name it in
  one line, and move on.
- "Is this plan good?" The `plan-reviewer` subagent answers that, with evidence.

## When to stop

Stop at whichever comes first:

- the critical ambiguity is gone;
- the user says they are done;
- five questions have been asked.

Everything still unknown becomes an `[ASSUMPTION]` line in the plan — a claim the
user can read and veto — **never** a sixth question.

## Under `--all-default`

Show each question with its recommended answer already taken, and keep going. The
user still sees what was decided on their behalf; they just are not stopped for
it.
