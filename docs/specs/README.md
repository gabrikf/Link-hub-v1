# Specs

One directory per feature: `docs/specs/<feature>/`.

Produced by the **`spec-writer`** skill and consumed by **`spec-implement`**.
Do not hand-write the structure — invoke the skill, which enforces the parts
that make a spec executable rather than decorative:

```
docs/specs/<feature>/
  spec.md                    the spec itself
  refs/                      the source material it was written FROM
    <name>.po-spec.draft.md  product spec        (mandatory)
    <name>.design.draft.md   design reference    (mandatory)
    <name>.api.draft.md      API contract        (may be pending → inferred + mock flow)
    <name>.*.final.md        the contract once settled
  decisions.md               decisions, including SUPERSEDED ones
  IMPLEMENTATION-STATUS.md   what is actually built, updated as you go
  qa-findings.md             Phase 6 output, from a fresh session on the same branch
```

The parts people are tempted to skip, and why they exist:

- **`refs/` with a draft → final lifecycle and a delta table.** A spec written
  against a draft that later changed is worse than no spec, because it reads
  authoritative. The delta table is what makes the change visible.
- **The G0 liveness probe.** Before writing tasks against an endpoint someone
  says exists, `curl` it. Remember this api registers every module twice — at
  the bare path *and* under `/api/v1` — and that the Vite dev server on 5173
  answers 200 with `index.html` for a path that does not exist, so "it returned
  200" proves nothing on its own.
- **Field tables in form tasks** (field → schema key → payload path). A form
  built without one ships a Save button wired to nothing.
- **A schema ⟷ UI sensor.** Parse a real captured payload through
  `@repo/schemas`, then render the UI from that same parsed fixture.

Specs are committed. QA session scratch under `docs/qa/sessions/` is not.
