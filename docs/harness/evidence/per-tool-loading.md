# Per-tool loading — what is proven, and what is not

The split only pays off if each tool actually loads the file it is supposed to.
This records what was verified on 2026-09-04, by what method, and — just as
importantly — what was not.

Re-run the mechanical part any time:

```bash
node scripts/guardrails/harness-check.mjs
```

---

## Mechanically verified

These are checked by `harness-check.mjs` on every push, so they cannot rot:

| Precondition | Why it matters |
|---|---|
| `CLAUDE.md` → `AGENTS.md` at the root, and in `apps/api`, `apps/web`, `packages/schemas` | Claude Code loads nested memory files by the name `CLAUDE.md`, not `AGENTS.md`. Without the symlink the workspace file is never read. |
| Every root-to-file `AGENTS.md` chain ≤ 32 KiB | Codex truncates past `project_doc_max_bytes` silently. Largest chain today: root (~5.1 KB) + `apps/api` (~8.1 KB) ≈ 13.2 KB. |
| Every path cite in every harness file resolves | A pointer to a moved file sends the agent looking and it improvises instead. |
| Every skill's frontmatter `name` matches its folder, and has a `description` | The folder name is how every tool addresses the skill; the description is the only text a model reads when deciding to load it. |

Also confirmed by hand on 2026-09-04:

- `.agents/skills` is the single copy. `.claude/skills` and `.kiro/skills` are
  symlinks to it, and the duplicated `.cursor/skills/harness-eval` and
  `.windsurf/skills/harness-eval` trees installed by the `skills` CLI were
  deleted — Cursor reads `.agents/skills` natively, and a copy is a second
  harness that drifts.
- Reading this repo's root instructions in Claude Code works: this document was
  written in a Claude Code session whose loaded project instructions were the
  root `AGENTS.md`, through the `CLAUDE.md` symlink.

## NOT verified — needs a person at a keyboard

Nothing below could be checked from a non-interactive session. Each is one
command or one glance, and each should be done before this is relied on.

| Tool | What to do | What you should see |
|---|---|---|
| **Claude Code** | Start a session at the repo root, read any file under `apps/api/src`, then run `/context` | `apps/api/CLAUDE.md` appears under Memory files. Repeat for `apps/web` and `packages/schemas`. |
| **Cursor** | Open the repo, check the rules/skills pane | The root and nested `AGENTS.md` listed, and the eleven skills from `.agents/skills` |
| **Codex** | Start a session with the cwd inside `apps/api` | The root → `apps/api` chain in context, and the eleven skills |
| **Kiro** | Open the steering panel | Root and all nested `AGENTS.md`. Then check whether the skills appear — `.kiro/skills` is a **symlink** to `../.agents/skills`, and a known Kiro issue says symlinked *steering* files are not followed. If skills do not appear, record it here as a documented gap rather than copying the tree. |

Neither Codex nor `cursor-agent` is installed on the machine this ran on, and
Kiro was not opened. The Kiro symlink in particular is a **candidate fix, not a
confirmed one** — treat it as unproven until somebody sees the panel.

For the Claude Code check specifically, the plan's suggestion of an
`InstructionsLoaded` hook writing to a log is a good way to get a durable record
rather than a screenshot; add it, read a file in each workspace, then remove it.
