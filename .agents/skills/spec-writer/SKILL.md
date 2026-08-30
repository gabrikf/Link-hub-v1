---
name: spec-writer
description: Use when WRITING a feature spec for CraftHub from product requirements (user stories, PRD, GitHub issue) plus a design (Claude/Figma HTML, screenshot). Runs a short interview, aligns with the monorepo architecture (apps/web, apps/api, @repo/schemas), and generates a complete, implementable spec with a verification harness in docs/specs/[feature-name]/. Supports --all-default.
---

## Spec Writer — From Idea to Implementable Spec

This skill **writes specs**; it does not implement. The goal: take product requirements plus a design, interview the dev to close the gaps, and produce a **complete, implementable spec** with a feedforward/feedback harness that `#spec-implement` can execute at maximum quality.

Output always lands in `docs/specs/[feature-name]/`.

Follow the phases below strictly.

---

### `--all-default` mode

If the user types `--all-default` at any point, ask:

> Are you sure you want to enter all-default mode?

If confirmed, keep it until the end. In this mode:
- **Ask no questions** — run every phase automatically.
- Always take the documented default; where there is no default, take the most sensible option given the context.
- Report every step (action + decision taken) without waiting for a reply.
- The interview (Phase 3) is **skipped** — the model makes every architecture call from the repo rules and general best practice.

**One exception that `--all-default` cannot skip:** the **G0 liveness probe** (§4.5). All-default may not assume an endpoint exists. If the probe cannot run, the spec is written with an **inferred** contract and a mock flow, never with a silent assumption.

---

### Phase 0: Collecting the Inputs

The user must supply:

1. **Product requirements** — user story, PRD, feature description, or a link (GitHub issue, doc)
2. **Design** — accepted through **four paths, in order of preference**:
   1. **Figma via MCP (Dev Mode)** — best path: gives code, tokens/variables, an image, and a mapping onto existing components
   2. **HTML exported from Claude / Figma Make** — analyse structure, components, states
   3. **Screenshot / image** — visual analysis
   4. **Plain text description** — last resort; record it as a **risk** in the spec (SPEC.md §10)
3. **(Optional) API contracts** — routes, the Swagger document at `http://localhost:3333/docs`, request/response types, or any endpoint definition the API already exposes

The user may send everything at once (requirements + design + contracts) in the same message that invokes the skill.

#### 0.0: The `refs/` folder — the canonical input drop

The dev normally leaves the raw inputs in `docs/specs/[feature-name]/refs/`. **Always look in this folder first**, before asking anything:

```
refs/
├── po-specs/   # product spec — user stories, PRD, GitHub issue exports
├── design/     # HTML from Claude/Figma Make, screenshots, or FIGMA.md with the prompt/link to pull the design via the Figma MCP
└── api/        # API contracts — there may be MORE THAN ONE file per endpoint (lifecycle below)
```

**Contract lifecycle in `refs/api/`** — the API surface moves while the feature is being built:
- `<endpoint>.draft.md` — the **first, mutable version**: corrected during development as the route firms up, adapted to what `apps/api` actually returns.
- `<endpoint>.final.md` — the **tested and validated** version, pasted (or captured from a live probe against `http://localhost:3333`) once the contract stabilises. This is the one that may be promoted into `packages/schemas/src/<module>/`.
- If a new version lands mid-implementation, produce a **delta table** (field → before → after → tasks affected). Reconciling two contract versions by hand, without a delta table, is how a "small" API change turns into a day of rework.

**Rule:** **the product spec and the design are mandatory** — if either is missing from `refs/` (and did not arrive in the message), it becomes a **mandatory interview question (Phase 3)**: ask for exactly what is missing. **An API contract may legitimately not exist yet**: in that case the question is about API readiness, and the spec proceeds with an **inferred contract plus an explicit mock flow** (the §4.5 flow), never blocked. What must never happen is inferring **silently** something the dev could have supplied.

Ask **only for what is missing** (if something mandatory was not supplied):

> To write the spec I need:
> 1. **Requirements** — paste the user story / PRD / feature description (or a GitHub issue link)
> 2. **Design** — attach the design HTML (Claude/Figma Make), screenshots, or describe the expected UI
>
> Optionally, if you already have it:
> 3. **API contracts** — routes, the `/docs` Swagger output, TypeScript types for the endpoints
>
> Send it all together or in separate messages.

#### 0.1: Processing the inputs

On receipt:
- **GitHub issue/PR link** → `gh issue view <n> --json title,body,comments` (or `gh pr view`) to pull the description, acceptance criteria and discussion
- **Figma link** → **check whether a Figma MCP server is connected in this session** (list the available MCPs; do not assume tool names). If it is, use its tools to extract layout/structure, design variables/tokens, a reference image (save it under `design/`), and a mapping onto existing components (this feeds Component Map FF-03 in the harness). If it is **not** connected, say so and ask for the exported HTML or a screenshot (paths 2-3).
- **Design HTML** → analyse structure, components, layout, states and interactions
- **Screenshots/images** → analyse elements, layout and flow visually
- **Plain text** → use as-is and record it as a risk in the spec
- **API contracts** (Swagger, types, routes) → use directly in the spec, do not infer

**Design tokens:** every token/colour/spacing pulled from the design (by any path) must be **cross-checked against `DESIGN.md` at the repo root** — the violet/zinc Tailwind design language, the `SURFACE*` class constants in `apps/web/src/shared-components/surface.ts`, the button hierarchy and the focus-ring rules. A divergence between the design and `DESIGN.md` is an **interview question** (Phase 3), never a silent decision.

Build a **structured summary** of the inputs for internal use in the next phases.

#### 0.2: API completeness assessment

After processing all inputs, judge whether the API contracts are complete:

- **Complete** (routes + request/response types supplied) → ask nothing about the API in the interview, but the endpoint still goes through the **G0 liveness probe**
- **Partial** (routes without types, or types without routes) → in the interview, ask only for the missing half
- **Absent** (no API information at all) → in the interview, ask whether the endpoint exists yet. If not → infer the contract and use a mock

---

### Phase 1: Aligning with the Repo

Before asking anything, **read and internalise** the project context:

1. **`AGENTS.md`** at the root, plus `apps/api/AGENTS.md` and `apps/web/AGENTS.md` — the agent rules and per-workspace depth
2. **`DESIGN.md`** at the root — the design language: violet/zinc Tailwind palette, `SURFACE` constants, button hierarchy, focus rings
3. **`README.md`** and **`DEVELOPMENT-GUIDE.md`** — orientation and the npm-script reference
4. **`packages/schemas/src/`** — the 16 zod modules. **This is the contract package.** Reuse a module before adding one.
5. **Existing feature layout** — `apps/web/src/features/<feature>/{pages,components,hooks,lib}/` — read a comparable feature end to end
6. **Shared primitives** — `apps/web/src/shared-components/` (`button.tsx`, `input.tsx`, `select.tsx`, `dialog.tsx`, `surface.ts`, `route-states.tsx`, `app-error-boundary.tsx`, `skeleton.tsx`) and cross-cutting helpers in `apps/web/src/lib/`
7. **Routes** — `apps/web/src/router.tsx`. TanStack Router here is **code-based**; there is no generated file route tree. A new route is a hand-written entry in that file.
8. **API layout (if the feature touches the backend)** — `apps/api/src/core/{entity,use-case,repositories,providers}/` (pure, framework-free) and `apps/api/src/infra/{http,database,queue,providers,di}/`. A use case is one folder: `<name>-use-case/<name>.use-case.ts` plus its test. New wiring goes through `apps/api/src/infra/di/container.ts`.

With that context, identify:
- Where the feature lands (`apps/web/src/features/<feature>/`, and/or which `apps/api` use cases)
- Which existing shared components cover the design
- Which components would have to be created (if any)
- Which comparable feature to follow as the reference pattern

---

### Phase 2: Design Analysis

Analyse the supplied design and map:

1. **Layout** — grid structure, responsiveness, breakpoints
2. **Components** — a 1:1 mapping onto `apps/web/src/shared-components/` and the Radix primitives already in use (dialog, alert-dialog, switch); icons come from `react-icons` (the Feather `fi` set)
3. **States** — loading, empty, error, success, interactions
4. **Data** — what the screen needs, where it comes from (API endpoints), and which `@repo/schemas` module types it
5. **Interactions** — forms, validation, user actions
6. **Navigation** — how the user reaches the screen, where it lives in `apps/web/src/router.tsx`
7. **Variants / modes** — if the feature renders a discriminated set (profile block kind via `blockKindSchema`, the `pc` / `mobile` viewport of `profileViewportSchema`, post status/source, an import step, a tabbed editor), **enumerate every member of that set** from the zod enum in `packages/schemas/src/`. If the dev has not said which members are in scope, this is an **interview question** — and one that **cannot be skipped** in `--all-default`: in that mode assume **all members of the enum** and record the assumption in `decisions.md`.

Produce, internally, a **design component → repo component map**, calling out the gaps.

**Rule: the design never draws the error.** Designers hand over the happy path. The spec **must** specify all four states (loading, empty, error with a retry affordance, filled) even when the design shows only one — following the `RoutePending` / `RouteErrorState` / `RouteNotFound` helpers in `apps/web/src/shared-components/route-states.tsx`, the `skeleton.tsx` primitive, and `DESIGN.md`. This is **not** an interview question, it is the repo standard. Record it in `definitions.md` §States.

---

### Phase 3: Focused Interview

The interview is **short and surgical** — only questions the model cannot answer for itself. The goal is to close gaps that change implementation decisions.

**Rule:** at most **5-8 questions**, all in one go. Each question ships with a **recommendation** from the model (grounded in the repo context). The dev can accept it or answer differently.

**Suppression rule:** do NOT ask about topics the user already supplied in Phase 0. If API contracts arrived, do not ask about the backend. If the scope is clear in the PRD, do not ask about scope. If the analysis leaves no relevant gaps, **skip the interview entirely** and go to Phase 4.

See [references/interview-questions.md](references/interview-questions.md) for the question catalogue by category. Pick only the ones relevant to the feature in hand.

**Interview format:**

> **Interview — [feature name]**
>
> I have read the requirements, the design and the repo architecture. A few questions to close the remaining gaps. Each carries my recommendation — accept it or answer differently.
>
> Answer by number. If you agree with a recommendation, just type the number (e.g. `1, 2, 3` = I accept all three).
>
> ---
>
> **1. [Category] — [Question]**
> Recommendation: [suggested answer + rationale]
>
> **2. [Category] — [Question]**
> Recommendation: [suggested answer + rationale]
>
> *(max 5-8 questions)*

**Question categories (select by relevance):**
- **Data/API** — existing or new endpoint? Contract/types? Is the route live?
- **State** — local vs the Zustand store? TanStack Query cache strategy?
- **Permissions** — who sees/edits? Session required, or is this a public route like `/$username`?
- **Navigation** — new route in `router.tsx`? URL params?
- **Edge cases** — empty lists? API errors? Long-running jobs (BullMQ)?
- **Scope** — what is explicitly OUT of this delivery?
- **Dependencies** — does it depend on another feature, a schema change, or a migration?
- **Performance** — pagination? Virtualisation? Lazy loading?

**`--all-default` mode:** skip the whole interview — treat the recommendations as final decisions. Except the variant/mode enumeration and the G0 probe, which still run.

---

### Phase 4: Writing the Spec

With all answers in hand (or the automatic decisions in all-default mode), generate the spec artefacts under `docs/specs/[feature-name]/`.

Use the template and structure defined in [references/spec-template.md](references/spec-template.md).

**Generated files:**

```
docs/specs/[feature-name]/
├── SPEC.md              # Main spec — requirements, design, implementation plan
├── definitions.md       # Feature dictionary — entities, states, business rules, permissions
├── contracts/           # EXECUTABLE API contracts (zod schemas + real captured fixtures)
│   ├── README.md        # Provenance of each contract + how to use it
│   ├── <endpoint>.schema.ts
│   └── fixtures/
│       └── <endpoint>.example.json
├── variants.md          # Variant/mode matrix (MANDATORY if the feature renders a discriminated set)
├── tasks.md             # Atomic, ordered, execution-ready tasks
├── harness.md           # Feedforward guides + feedback sensors (verification)
├── design/              # Reference designs (copied or linked)
│   ├── README.md        # Description of the designs + how to read them
│   └── *.html|*.png     # Design files (if supplied as files)
├── refs/                # The dev's original inputs (Phase 0.0) — do NOT generate, only preserve
│   ├── po-specs/  design/  api/
└── decisions.md         # Record of interview decisions (lightweight ADR)
```

#### 4.1: SPEC.md

The main file. Structure defined in [references/spec-template.md](references/spec-template.md). It must be:
- **Self-contained** — any agent can read it and implement without extra context
- **Concrete** — no ambiguity, with examples and schemas
- **Verifiable** — every requirement has a testable acceptance criterion

#### 4.2: tasks.md

Atomic implementation tasks, ordered by dependency. Every task:
- Has a clear scope (1-3 files max)
- Is implementable in a single session
- Has a verifiable "done" criterion
- Names the files it will create/modify

**Any task that builds a form carries the complete field table** — `field → schema key → payload path → tab/mode where it renders` — generated from the zod schema. A prose list of fields in SPEC.md **does not survive** the trip into the task. This is the single most reliable way a form ships with a dead Save button: the prose listed the field, the task did not, the input was never mounted, and the required key never validated.

See [references/spec-template.md](references/spec-template.md) for the detailed format.

#### 4.3: harness.md

The verification harness — **what makes this spec different**. It defines the feedforward mechanisms (guidance before execution) and feedback sensors (detection after execution) that hold quality.

See [references/harness.md](references/harness.md) for the full model.

#### 4.4: decisions.md

A lightweight ADR — one record per interview decision with context and rationale. Useful for later review, and so `#spec-implement` understands the "why" behind each choice. When reality later contradicts a decision, it gets re-stamped **SUPERSEDED** rather than edited away (see `#spec-implement` Phase 5.1).

#### 4.5: `contracts/` — executable API contracts

A contract **is not prose in SPEC.md** — prose validates nothing and rots. Each endpoint in the feature produces `contracts/<endpoint>.schema.ts` with a **real zod schema**, written so it can be promoted into `packages/schemas/src/<module>/` — the repo's contract package, consumed by api, web, mcp, extractor and training alike:

```ts
// contracts/get-profile-blocks.schema.ts
// Provenance: supplied by the API (GET /api/v1/profile-blocks, /docs)  |  Status: validated
// (or) Provenance: INFERRED from the design                            |  Status: PENDING API validation
import { z } from "zod";

export const profileBlockSchema = z.object({
  id: z.string().uuid(),
  kind: blockKindSchema,
  position: z.number().int(),
  publishedAt: z.string().datetime().nullable(),
});
export type ProfileBlock = z.infer<typeof profileBlockSchema>;
```

Mandatory rules:
- **A provenance/status header on every file**: `Provenance:` (API/Swagger or **INFERRED**) + `Status:` (`validated` or `PENDING API validation`).
- **A field that may be absent → an explicit `.nullable()`**, never a silent `.optional()`. `optional` says "sometimes the key is not there"; `nullable` says "the key is there and may be null". Conflating them is a direct source of bugs.
- Every schema ships with an example fixture in `contracts/fixtures/`, with **three cases: full, empty, and missing-field**. The full case must be a **real captured payload**, not hand-written.
- If the contract was **inferred**, the header says so in capitals, `tasks.md` carries an explicit **API validation task**, and the query hook runs against a local mock (an MSW handler or a typed stub in the feature's `lib/`) until then. Do not invent a `createMockEndpoint` helper — check what the feature's neighbours already do before adding a mocking mechanism.
- Prefer **reusing or extending an existing `packages/schemas/src/<module>/` export** over writing a parallel schema. A duplicated contract is a contract that will drift.
- Types are **always** derived with `z.infer` — **never** a hand-written interface kept in parallel.

##### The G0 liveness probe — a BLOCKING task in `tasks.md`

For every endpoint the dev says already **exists** (`Status: validated`, or a route was supplied), `tasks.md` opens with a **blocking G0 task**. Before any UI task that depends on that endpoint may start, the endpoint must have answered **real JSON** and a real payload must be frozen into `contracts/fixtures/`.

Do not skip this because the route "obviously" exists. Two traps make a dead route look alive here:
- **Dual registration.** Every module in `apps/api` is registered **twice** — at the bare path and under `/api/v1`. A route can be live at one and 404 at the other, and the spec must record which one the web app will call.
- **The web dev server proxy.** A request routed through the Vite dev server at `http://localhost:5173` can come back as the SPA's `index.html` with HTTP 200. A 200 is not proof of an endpoint. **Probe the API directly on port 3333.**

Probe it for real. Start the API with `npm run dev:api` (and `bash db-manage.sh start` if it needs Postgres), then:

```bash
# 0. Is the API even up?
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3333/health

# 1. What does the Swagger document actually declare? (authoritative route list)
curl -sS http://localhost:3333/docs/json | jq -r '.paths | keys[]' | grep -i '<resource>'

# 2. Probe BOTH registrations and demand real JSON, not an HTML page
for base in "http://localhost:3333" "http://localhost:3333/api/v1"; do
  echo "--- $base/<resource>"
  curl -sS -D- -o /tmp/probe-body.json \
       -H 'Accept: application/json' \
       -H "Authorization: Bearer $TOKEN" \
       "$base/<resource>" \
    | grep -iE '^(HTTP/|content-type:)'
  jq -e . /tmp/probe-body.json >/dev/null \
    && echo "OK: body is valid JSON" \
    || echo "BLOCKED: body is not JSON — this route is not live"
done

# 3. Freeze the real payload as the fixture
cp /tmp/probe-body.json docs/specs/[feature-name]/contracts/fixtures/<endpoint>.example.json
```

The probe **passes** only when: HTTP status is 2xx, `content-type` is `application/json`, the body parses as JSON, and the captured payload `.parse()`s cleanly through the schema in `contracts/`. Anything else and G0 **blocks** — the spec says so, and no dependent UI task starts.

An endpoint whose contract is **INFERRED** (the route does not exist yet) does not block: it follows the mock flow with a pending validation task, and the probe runs when the route ships.

If the API **is** ready and supplied routes/Swagger: generate the schemas straight from the contract (`Status: validated`), and note in `tasks.md` that the hook calls the real endpoint through the feature's TanStack Query hook.

#### 4.6: `definitions.md` — the feature dictionary

A short file that defines, unambiguously:

| Section | Content |
|---|---|
| **Entities** | what each domain noun means in this feature (e.g. "block", "post", "match", "disclosure policy") and which type in `packages/schemas/src/` it corresponds to |
| **States** | every possible state of each entity and what the UI shows in each — **including the ones the design did not draw** |
| **Business rules** | numbered (BR-01, BR-02…), each testable, each referenced by an acceptance criterion |
| **Permissions** | who sees, who edits, what happens to someone who cannot — including whether the route is public (`/$username`) or session-gated |
| **Copy** | the user-visible strings this feature introduces. **CraftHub has no i18n yet** — user-visible strings are hardcoded English. The `i18n` skill documents the planned setup; **a spec must not invent `t()` calls.** Listing the copy here still matters: it is what makes the strings reviewable and, later, extractable. |

**Why it exists:** ambiguity of definition is what makes an agent (and a junior dev) invent. If "published block" is not defined, each screen implements it differently — and that is an inconsistency bug.

#### 4.7: `variants.md` — the variant/mode matrix

**Mandatory whenever the feature renders a discriminated set** — a zod enum or discriminated union from `packages/schemas/src/`. Without it the spec is not complete.

The canonical examples in this repo: `blockKindSchema` (profile block kinds), `profileViewportSchema` (`pc` / `mobile` — the same screen in two modes), `postStatusSchema` and `postSourceSchema`. Enumerate the members **from the schema**, not from memory.

```markdown
# Variant matrix — [feature]

Source of truth: `packages/schemas/src/<module>/index.ts` → `<enumName>`

| Variant | Appears on this screen? | Fields used | Expected behaviour |
|---|---|---|---|
| links | yes | title, items[] | renders the list block |
| video | yes | provider, url | renders the embed; unsupported provider → inline notice |
| gallery | no | — | must not reach this screen; if it does, show "unsupported block type" |
| ... (every member of the enum) | | | |

## Modes
| Mode | Which fields render | Which are required |
|---|---|---|
| pc | ... | ... |
| mobile | ... | ... |

## Unknown variant
Required behaviour: an unrecognised discriminant renders "unsupported block type" —
**never** a crash, **never** a blank screen. Assert it with an explicit test.
```

The matrix is what the **schema ⟷ UI sensor** (harness FB-01) iterates over: one row, one parse test, one render test, **per applicable mode/tab**.

In `--all-default` mode, if the variants were not stated: assume **every member of the enum** and record the assumption in `decisions.md`.

---

### Phase 5: Presentation and Review

Present to the dev:

> **Spec written — [feature-name]**
>
> Files created under `docs/specs/[feature-name]/`:
> - `SPEC.md` — the full spec (requirements, design, plan)
> - `definitions.md` — feature dictionary (entities, states, business rules, permissions, copy)
> - `contracts/` — executable zod schemas + real fixtures (provenance/status per contract)
> - `variants.md` — variant/mode matrix *(only if the feature renders a discriminated set)*
> - `tasks.md` — N implementation tasks
> - `harness.md` — verification harness (feedforward + feedback)
> - `design/` — visual references
> - `decisions.md` — decision record
>
> **Summary:**
> - Capabilities: [list]
> - Tasks: [N] tasks in [M] groups
> - G0 liveness probe: [passed / BLOCKING on <endpoint> / not applicable — contract inferred]
> - Suggested strategy: [sequential | parallel-worktrees]
> - Estimate: [estimate]
>
> **Next steps:**
> 1. Review the spec (especially `tasks.md` and `harness.md`)
> 2. Adjust whatever needs adjusting
> 3. Run `#spec-implement`
>
> Anything you want changed?

If the dev asks for adjustments, apply them and present again.

---

### Rule: Feature Naming

`[feature-name]` is `kebab-case` **in English**, derived from the feature name:
- "Recruiter search filters" → `recruiter-search-filters`
- "Profile block editor" → `profile-block-editor`
- "Agent disclosure settings" → `agent-disclosure-settings`

Every file, variable, component, hook, type and test name is in **English** — the whole repo is English, including user-visible copy, because there is no i18n layer. File naming is `kebab-case` throughout, in both `apps/web` and `apps/api`.

Examples:
- Component file: `profile-block-editor.tsx`
- Hook: `use-profile-blocks.ts`
- Feature folder: `apps/web/src/features/profile-block-editor/`
- Branch: `feat/profile-block-editor`
- Spec folder: `docs/specs/profile-block-editor/`

If the name is not obvious, ask the dev.

---

### Rule: Spec Only the New Feature

The supplied design often shows the **whole application shell** — top bar, nav, layout wrapper, and other components that **already exist**.

**Do not touch existing components.** Spec only what is new to this feature:
- Design shows the top bar (`top-bar-nav.tsx`) → it already exists, ignore it
- Design shows the dashboard layout wrapper → already exists, ignore it
- Design shows the avatar / button / input primitives → already in `shared-components/`, reuse, do not restyle

**Focus exclusively** on the new content inside the page's main content area. Compare against other pages in `apps/web/src/features/` to see where the "feature content" starts and the "app shell" ends.

**Pixel-perfect applies ONLY to the new feature** — the rest of the design is visual context for position and proportion.

If the feature genuinely does need a change to a shared component, the spec says so explicitly and `#spec-implement` runs its shared-code impact check (Phase 4.3.1 there).

---

### Rule: Design is Reference, Not Creation

This skill **does not create** design. The design arrives finished. The work here is to:
- Analyse the supplied design
- Map it onto `shared-components/` and the Radix primitives
- Identify gaps (components that do not exist)
- Document in the spec how to implement it pixel-perfect with Tailwind 4 and the `DESIGN.md` language — the violet/zinc palette, the `SURFACE*` constants, the button hierarchy, the focus rings. **No hardcoded hex.**

---

### Rule: Clickable Links

Whenever a resource has a browser URL, present it as a clickable markdown link:

| Resource | Format |
|---------|--------|
| GitHub issue | `[#123](https://github.com/<owner>/<repo>/issues/123)` — read `git remote -v` rather than hardcoding the owner/repo |
| Swagger | `[/docs](http://localhost:3333/docs)` |
| Generated spec | `[docs/specs/feature/SPEC.md](docs/specs/feature/SPEC.md)` |
| Local screen | `[http://localhost:5173/dashboard](http://localhost:5173/dashboard)` |

---

### Quick reference

| Parameter | Value |
|-----------|-------|
| Spec output | `docs/specs/[feature-name]/` |
| Contract package | `@repo/schemas` — `packages/schemas/src/<module>/` |
| API dev server | `npm run dev:api` → `http://localhost:3333` (Swagger `/docs`, health `/health`) |
| Web dev server | `npm run dev:web` → `http://localhost:5173` |
| Local infra | `bash db-manage.sh start` (Postgres 5432, Redis 6379) |
| Design language | `DESIGN.md` at the repo root + `apps/web/src/shared-components/surface.ts` |
| i18n | none — hardcoded English; see the `i18n` skill for the plan; do not invent `t()` |
| Default branch | `main`; PRs via the `gh` CLI |
| Execution skill | `#spec-implement` |
