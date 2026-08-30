<!--
  Intentionally empty of rules.

  The agent rules live in AGENTS.md at the repo root. The root CLAUDE.md is a
  SYMLINK to it, so every tool that reads either name gets the same bytes and
  there is no second copy to drift.

  Layout, since 2026-08-29 — the real content sits in the tool-neutral `.agents/`
  and `.claude/` is the Claude Code alias:

      .agents/skills/          real skills          <- .claude/skills
      .agents/settings.json    real settings+hooks  <- .claude/settings.json
      AGENTS.md                real rules           <- CLAUDE.md

  Edit the target, never the link. Paths written as `.claude/skills/...`
  elsewhere in the docs still resolve, through the symlink.

  Per-workspace depth: apps/api/AGENTS.md, apps/web/AGENTS.md.
  Do not add rules here. Add them to AGENTS.md.
-->
