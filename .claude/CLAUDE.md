<!--
  Intentionally empty of rules. Do not add rules here — add them to AGENTS.md.

  The real content lives in the tool-neutral `.agents/`; `.claude/` is the
  Claude Code alias:

      AGENTS.md                real rules            <- CLAUDE.md
      .agents/skills/          real skills           <- .claude/skills
      .agents/settings.json    real settings+hooks   <- .claude/settings.json

  Edit the target, never the link.

  Per-workspace depth: apps/api/AGENTS.md, apps/web/AGENTS.md,
  packages/schemas/AGENTS.md — each with its own CLAUDE.md symlink so Claude
  Code loads it on demand.

  How the whole harness is wired, which tool reads what, and how to add a rule,
  a skill or a new agent tool: docs/harness/agent-harness.md.
-->
