# LinkHub Personas

LinkHub is a developer-profile platform: a developer imports a structured resume, arranges a drag-and-drop public profile, recruiters search it by job description using pgvector semantic search plus an in-browser TensorFlow.js re-rank shown as "AI Match %", and coding agents publish posts to that profile through an MCP server and a local extractor — behind a per-user disclosure policy limiting what an agent may reveal about the user's employers.

Its users are three distinct species, and one of them is not a person. These five are derived from the seed catalog in `.claude/skills/qa-report/references/personas.md`, adapted to the real seeded accounts (`bash db-manage.sh seed-all`, password `12345678` for every seeded account).

## Nina, the arriving developer — the first impression

```yaml
persona:
  name: Nina
  base: New User
  goal: turn a resume PDF into a public profile she is willing to put in her bio, in one sitting
  interface: browser
  device: laptop (checks the finished profile on phone before sharing)
  network: wifi-fast
  modality: mouse-keyboard
  theme: both
  patience_seconds: 60 (before the import shows something recognizable), high after
```

Signs up, imports the PDF, sees what the parser made of her career, fixes what it got wrong, and shares the link. What she reveals: onboarding copy that assumes context, an import that half-lands and leaves an unfixable profile, an LLM parse that silently drops a job, empty states with no next step, a public profile that looks wrong on a phone or in dark mode.

Where she lives: `/`, resume import, `/dashboard`, `/profile/<username>`.

## Diego, the curating developer — the daily owner

```yaml
persona:
  name: Diego
  base: Power User
  goal: keep the profile sharp and keep control of what is said about him
  interface: browser
  device: desktop, several tabs
  network: wifi-fast
  modality: mouse-keyboard
  theme: both (uses dark daily, notices immediately when a surface didn't get the memo)
  patience_seconds: 0 for lost work or an unapproved post going live
```

Rearranges blocks in `/dashboard/layout`, tunes the disclosure policy in `/dashboard/settings`, mints API tokens for his agent, and works the review queue. What he reveals: layout state that doesn't round-trip, desktop/mobile arrangements drifting out of sync, cross-tab lost updates, a review queue that lets an edited post through, a disclosure policy whose levels don't mean what the copy says, missing `dark:` variants everywhere.

Where he lives: `/dashboard/layout`, `/dashboard/posts`, `/dashboard/posts/review`, `/dashboard/settings`.

## Priya, the recruiter — the reason the data exists

```yaml
persona:
  name: Priya
  base: Casual User (frequent but goal-driven)
  goal: paste a job description, get a ranked shortlist, and decide who to contact
  interface: browser
  device: desktop, often corporate-managed
  network: wifi-fast
  modality: mouse-keyboard
  theme: light (default, as issued)
  patience_seconds: moderate for the search, 0 for an unexplained ranking
```

Reads the AI Match % as if it were a fact, because nothing on screen tells her it isn't. What she reveals: paste handling that mangles a JD before it is embedded, a re-rank that renders placeholder numbers as scores, results that disagree between two searches of the same JD, a match percentage with no explanation, profiles that render differently for her than for their owner, and — critically — anything a candidate's agent revealed that the candidate did not intend her to see.

Where she lives: `/dashboard/search`, `/profile/<username>`.

## Atlas, the coding agent — the non-human user

```yaml
persona:
  name: Atlas
  base: Autonomous Agent
  goal: publish an accurate account of what its human has been building without saying anything the disclosure policy forbids
  interface: mcp (stdio), plus the extractor CLI/hook
  device: none
  network: n/a
  modality: tool-calls
  theme: n/a
  patience_seconds: infinite (will retry a failing publish forever; no instinct that naming a client is a career event for its human)
```

Its entire world is `get_disclosure_policy`, `get_work_context`, `create_post`, `create_commit_summary_post`, `update_post`, `list_my_posts`, `delete_post`, and a personal API token. What it reveals: a policy that fails open when the tool errors or is unset; blocked-term matching defeated by casing, hyphens, camel-case identifiers or a URL; redaction applied at render instead of at storage; an approved post editable into something new without re-review; a work-context payload richer than the policy permits; token boundaries that let it post to the wrong profile.

**Fidelity note:** Atlas knows only what its tools returned. Feeding it facts read from the seed data manufactures leaks the product would never have produced, and hides the ones it would — see `.claude/skills/qa-execution/references/persona-fidelity.md`.

Where it lives: the MCP surface, `apps/extractor`, and — for its true end state — `/dashboard/posts/review` and the logged-out public profile.

## Sam, the reader who arrives cold — the audience the profile is for

```yaml
persona:
  name: Sam
  base: Mobile User, doubling as Accessibility-Reliant when the cycle needs one
  goal: someone sent them a link — find out, in thirty seconds and without signing in, whether this developer is worth a conversation
  interface: browser
  device: phone-small (or a screen reader on desktop)
  network: 4g
  modality: touch, or screen-reader
  theme: dark (phone default) / both when standing in for Accessibility-Reliant
  patience_seconds: lowest of anyone — no account, no investment
```

What they reveal: a public profile that requires a session it shouldn't, layout breakage at 375px, a dark-mode surface nobody checked because the owner tested in light, unlabelled controls, a match score or badge that reads as a bare number to a screen reader, and whatever an agent published that a stranger should not have been able to read.

Where they live: `/profile/<username>`, logged out.

## Notes

- **Accessibility-Reliant is not optional.** When a cycle folds it into Sam rather than running it separately, that is recorded in the cycle's report; a full skip is recorded there too, with reasoning. The layout editor's drag-and-drop (`/dashboard/layout`) is the surface most likely to have no keyboard path at all — CAND-0105 (dnd-kit keyboard sensor does not lift on the grip button) and BUG-20260822-layout-vertical-keyboard were both found this way.
- **Locale is not a persona axis here.** LinkHub has no i18n — `<html lang="en">`, every string hardcoded English. Do not plan a bilingual persona or a translation sweep.
- **Theme is a persona axis.** Diego and Sam live in dark mode; Nina and Priya arrive in whatever their OS gave them. Every browser charter names the themes it walks.
