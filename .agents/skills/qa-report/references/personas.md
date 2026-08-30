# Personas

A persona is the answer to *"who am I being right now?"* QA without a persona drifts into developer mindset — testing what the system can do instead of what a user would actually try. This reference is the **methodology and seed catalog**; a project's actual personas are instance data living in `<qa-docs-path>/personas.md`, derived once and evolved as the audience changes.

## Contents

- Why personas
- Deriving project personas (instance data)
- Seed catalog (New / Power / Casual / Mobile / Accessibility-Reliant / Recovering / Autonomous Agent)
- Persona attributes (YAML schema)
- Picking the right persona for a charter
- CraftHub seed personas — the real audience
- Anti-patterns

## Why personas

- A session run as "anyone" optimizes for the tester's reflexes, not the user's needs.
- Different personas surface different defects: a first-time developer finds onboarding friction; a recruiter finds a match score nobody explained; an agent finds a disclosure policy that fails open.
- The persona is the leash: when you catch yourself working around a problem instead of recording it, the persona pulls you back into role.

## Deriving project personas

Write 4-6 personas to `<qa-docs-path>/personas.md`, each grounded in the product's **real audience** — not copied verbatim from the seed catalog:

1. Start from the product's value proposition: who curates, who searches, who publishes, who arrives cold from a shared link, who comes back after something went wrong.
2. Map each to the closest seed persona and adapt: give it a name, the product-specific goal it pursues, its device/network reality, its theme preference, and its patience threshold.
3. Keep the seed persona's `name` in a `base:` field so charters and bug reports can be read across projects.
4. Include at least one Mobile-based persona (a shared profile link is opened on a phone more often than not) and one Accessibility-Reliant persona unless explicitly out of scope (record the skip reasoning in the file).
5. **Include the Autonomous Agent persona whenever the cycle touches posts, the MCP server or the extractor.** It is a real user of this product, and it is the only one whose interface is not a browser.

Personas are durable: update them when the audience changes, not per cycle.

## Seed catalog

### New User (first-time visitor)
- **Familiarity:** zero. Has not seen the product before.
- **Motivation:** evaluating; will leave if confused within 60 seconds.
- **Device:** whatever they happened to be on — often mobile.
- **Patience:** very low. A spinner over 3 seconds feels broken; an unclear error sends them elsewhere.
- **What they reveal:** onboarding gaps, missing empty-state guidance, confusing copy, unclear primary action, broken first impressions.

### Power User (returning expert)
- **Familiarity:** daily use. Knows the shortcuts and how to "abuse" the UI.
- **Motivation:** ship work fast. Tolerates ugly UI if it's efficient.
- **Device:** desktop, keyboard-driven, many tabs open.
- **Patience:** zero for speed regressions; high for visual rough edges.
- **What they reveal:** shortcut breakage, bulk-operation regressions, performance degradation, cross-tab state loss, undo/redo bugs.

### Casual User (returning, infrequent)
- **Familiarity:** a few visits. Remembers the goal, not the steps.
- **Motivation:** complete one task and leave.
- **Device:** mixed; often switches phone ↔ laptop mid-task.
- **Patience:** moderate, while the goal is in sight.
- **What they reveal:** discoverability, cross-device continuity, save-and-resume bugs.

### Mobile User (touch-first)
- **Familiarity:** any. Defined by device.
- **Motivation:** quick action — often in transit, often one-handed.
- **Device:** small viewport, touch, possibly slow network.
- **Patience:** low. Closes the tab on a layout shift.
- **What they reveal:** touch-target size, 375px layout breaks, sticky elements covering content, drag-and-drop that assumes a mouse, network-failure handling.

### Accessibility-Reliant User (assistive tech)
- **Familiarity:** any. Defined by interaction modality.
- **Motivation:** use the product on equal terms.
- **Device:** screen reader (VoiceOver / NVDA / TalkBack), keyboard-only, magnifier, voice control, or high-contrast mode.
- **Patience:** task-bounded. Abandons when announcements are incomprehensible.
- **What they reveal:** missing labels, focus traps, broken tab order, color-only signaling, modals that don't escape, unannounced dynamic content, drag-and-drop with no keyboard path.

### Recovering User (returning after a problem)
- **Familiarity:** any. Defined by emotional context — the last visit ended badly.
- **Motivation:** check if it's fixed; trust is fragile.
- **Device:** often the same device that saw the failure.
- **Patience:** very low. Any sign of the previous failure triggers abandonment.
- **What they reveal:** stale error states, cached failure screens, half-applied fixes, no path to undo damage that was already published.

### Autonomous Agent (non-human client)
- **Familiarity:** exactly what its tools told it, and nothing else.
- **Motivation:** complete the task it was given — publish, summarize, update — with no sense of social consequence.
- **Device:** none. A stdio MCP client, a CLI, a hook.
- **Patience:** infinite; it will retry, and it will not notice that it is embarrassing its user.
- **What they reveal:** boundaries that were only enforced in the UI, defaults that fail open, tool responses that promise more than the product delivers, contract drift between the tool layer and the API.

## Persona attributes (YAML schema)

Record the persona row alongside every charter and bug:

```yaml
persona:
  name: <project persona name>
  base: <New User | Power User | Casual User | Mobile User | Accessibility-Reliant | Recovering User | Autonomous Agent>
  goal: <the product-specific outcome this persona pursues>
  interface: <browser | mcp | cli>
  device: <desktop | laptop | tablet | phone-small | phone-large | none>
  network: <wifi-fast | wifi-slow | 4g | 3g | flaky>
  modality: <mouse-keyboard | touch | screen-reader | keyboard-only | voice | tool-calls>
  theme: <light | dark | both>
  patience_seconds: <how long before abandoning>
```

The bug template's `Persona Affected:` field uses `name`.

## Picking the right persona for a charter

| Surface | Mandatory persona (base) | Recommended additional |
|---|---|---|
| Sign up / sign in (`/`) | New User | Mobile User |
| Resume PDF import | New User | Recovering User |
| Profile layout editor (`/dashboard/layout`) | Power User | Accessibility-Reliant |
| Public profile (`/<username>`) | New User (arriving cold) | Mobile User |
| Recruiter search (`/dashboard/search`) | Casual User | Power User |
| Posts list / review queue | Power User | Recovering User |
| Settings — disclosure policy | Power User | Recovering User |
| Settings — API tokens / git connections | Casual User | Autonomous Agent |
| Anything published through MCP or the extractor | **Autonomous Agent** | Power User (the human reviewing it) |
| Recovery after a disclosure leak | Recovering User | Autonomous Agent |

When in doubt: *"who is most likely to be hurt by this surface failing?"* — that's the mandatory persona. For disclosure surfaces the answer is always the human whose employer got named, never the agent that named them.

## CraftHub seed personas — the real audience

CraftHub is a **developer-profile platform**: a developer imports a structured resume, arranges a drag-and-drop public profile, recruiters search it by job description using pgvector semantic search plus an in-browser TensorFlow.js re-rank shown as "AI Match %", and coding agents publish posts to that profile through an MCP server and a local extractor — behind a per-user **disclosure policy** limiting what an agent may reveal about the user's employers.

Its users are three distinct species, and one of them is not a person. Derive `<qa-docs-path>/personas.md` from these five, adapting names and patience to the accounts you actually seed (`bash db-manage.sh seed-all`).

### Nina, the arriving developer — *the first impression*
- **Base:** New User. **Interface:** browser.
- **Goal:** turn a resume PDF into a public profile she is willing to put in her bio, in one sitting. Signs up, imports the PDF, sees what the parser made of her career, fixes what it got wrong, and shares the link.
- **Device:** laptop, but she opens the finished profile on her phone before sharing it — because that is where the person she sends it to will open it.
- **Patience:** very low up to the point where the import shows her something recognizable; high after.
- **What she reveals:** onboarding copy that assumes context, an import that half-lands and leaves an unfixable profile, an LLM parse that silently drops a job, empty states with no next step, a public profile that looks wrong on a phone or in dark mode.
- **Where she lives:** `/`, resume import, `/dashboard`, `/<username>`.

### Diego, the curating developer — *the daily owner*
- **Base:** Power User. **Interface:** browser.
- **Goal:** keep the profile sharp and keep control of what is said about him. Rearranges blocks in `/dashboard/layout`, tunes the disclosure policy in `/dashboard/settings`, mints API tokens for his agent, and works the review queue.
- **Device:** desktop, several tabs, both themes (he uses dark and notices immediately when a surface didn't get the memo).
- **Patience:** zero for lost work — an arrangement that doesn't survive a reload is unforgivable — and zero for a post going live he didn't approve.
- **What he reveals:** layout state that doesn't round-trip, desktop/mobile arrangements drifting out of sync, cross-tab lost updates, a review queue that lets an edited post through, a disclosure policy whose levels don't mean what the copy says, missing `dark:` variants everywhere.
- **Where he lives:** `/dashboard/layout`, `/dashboard/posts`, `/dashboard/posts/review`, `/dashboard/settings`.

### Priya, the recruiter — *the reason the data exists*
- **Base:** Casual User (frequent but goal-driven). **Interface:** browser.
- **Goal:** paste a job description, get a ranked shortlist, and decide who to contact. Reads the AI Match % as if it were a fact, because nothing on screen tells her it isn't.
- **Device:** desktop, often a corporate-managed one; pastes the JD out of an ATS or a Google Doc with all its formatting attached.
- **Patience:** moderate for the search, zero for a ranking that reshuffles under her cursor or a number she can't explain to a hiring manager.
- **What she reveals:** paste handling that mangles a JD before it is embedded, a re-rank that renders placeholder numbers as scores, results that disagree between two searches of the same JD, a match percentage with no explanation, profiles that render differently for her than for their owner, and — critically — **anything a candidate's agent revealed that the candidate did not intend her to see.**
- **Where she lives:** `/dashboard/search`, `/<username>`.

### Atlas, the coding agent — *the non-human user*
- **Base:** Autonomous Agent. **Interface:** MCP (stdio), plus the extractor CLI/hook.
- **Goal:** publish an accurate account of what its human has been building — a commit summary, a project note — without saying anything the disclosure policy forbids.
- **Device:** none. Its entire world is `get_disclosure_policy`, `get_work_context`, `create_post`, `create_commit_summary_post`, `update_post`, `list_my_posts`, `delete_post`, and a personal API token.
- **Patience:** infinite, which is the problem. It will retry a failing publish, and it has no instinct that naming a client is a career event for its human.
- **What it reveals:** a policy that fails open when the tool errors or is unset; blocked-term matching defeated by casing, hyphens, camel-case identifiers or a URL; redaction applied at render instead of at storage; an approved post editable into something new without re-review; a work-context payload richer than the policy permits; token boundaries that let it post to the wrong profile.
- **Fidelity note:** Atlas knows **only** what its tools returned. Feeding it facts the session runner read from the seed data manufactures leaks the product would never have produced, and hides the ones it would (`../qa-execution/references/persona-fidelity.md`).
- **Where it lives:** the MCP surface, `apps/extractor`, and — for its true end state — `/dashboard/posts/review` and the logged-out public profile.

### Sam, the reader who arrives cold — *the audience the profile is for*
- **Base:** Mobile User, doubling as the Accessibility-Reliant persona when the cycle needs one.
- **Goal:** someone sent them a link. Find out, in thirty seconds and without signing in, whether this developer is worth a conversation.
- **Device:** phone-small, on 4G, often in dark mode because the phone is; or a screen reader on a desktop.
- **Patience:** the lowest of anyone. There is no account, no investment, and one back-swipe away is everything else.
- **What they reveal:** a public profile that requires a session it shouldn't, layout breakage at 375px, a dark-mode surface nobody checked because the owner tested in light, unlabelled controls, a match score or badge that reads as a bare number to a screen reader, and whatever an agent published that a stranger should not have been able to read.
- **Where they live:** `/<username>`, logged out.

**Accessibility-Reliant is not optional.** If a cycle folds it into Sam rather than running it separately, record that; if it skips it entirely, record the skip and its reasoning in `<qa-docs-path>/personas.md` — per the derivation rules above. The layout editor's drag-and-drop is the surface most likely to have no keyboard path at all, and only this persona will find that.

**Locale is not a persona axis here.** CraftHub has no i18n — `<html lang="en">`, every string hardcoded English. Do not plan a bilingual persona or a translation sweep; the `i18n` skill describes a *planned* setup, not existing code. Time, timezone and number formatting are still real risks; they belong to the Time & Formatting tour.

**Theme is a persona axis.** Diego and Sam live in dark mode; Nina and Priya arrive in whatever their OS gave them. Every browser persona's charter names the themes it walks.

## Anti-patterns

- **"Just a user"** — generic personas produce generic sessions. Pick one.
- **Borrowed personas from another product's domain** — a retail "shopper abandons cart" archetype, or anything lifted from a previous project's catalog, walks nothing here. The five above hold this product's real risk.
- **Dropping the agent persona because "it's not a person"** — it is the persona that finds the disclosure bugs, which are the bugs that matter most in this product.
- **Letting the agent persona know things its tools didn't tell it** — the fastest way to produce a disclosure verdict that means nothing.
- **Persona-of-convenience** — choosing the persona that matches what you already wanted to test. Invert it: pick the persona, let it pick the test.
- **Single-persona cycles** — a full cycle covers at least 3 personas across its sessions, or large user segments go unverified.
- **Mixing personas mid-charter** — run one persona to completion; record any switch in the debrief.
- **Copying the seed catalog verbatim as project personas** — the seed is a scaffold; personas that don't name the product's real goals produce sessions that don't walk real journeys.
