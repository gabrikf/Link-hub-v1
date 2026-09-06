#!/usr/bin/env python3
"""Track A — high-precision deterministic correctness. Lives inside harness-eval skill."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

BACKTICK_PATH_RE = re.compile(r"`([^`]+)`|(?<!!)\[[^\]]*\]\(([^)]+)\)")
README_RE = re.compile(r"(^|/)README[^/]*$", re.I)
EXAMPLE_PATH_RE = re.compile(r"(^|/)path/to(/|$)", re.I)
PLACEHOLDER_SEG_RE = re.compile(
    r"^(SPEC_FOLDER|FEATURE_FOLDER|YOUR_\w+|PATH_TO_\w+|EXAMPLE_\w+|"
    r"packageName|projectName|featureName)$"
    r"|\{[^}]+\}|\[[^\]]+\]|^path$|^to$",
    re.I,
)
CONCRETE_PREFIXES = (
    "docs/",
    ".agents/",
    ".cursor/",
    ".harness-eval/",
    ".tlc/",
    "references/",
    "package/",
    "app/",
    "apps/",
    "scripts/",
    "bin/",
    "config/",
    "lib/",
    "src/",
    "cmd/",
    "internal/",
    "spec/",
    "test/",
    "tests/",
)
# invariant: PM builtins alone never BROKEN
PM_BUILTINS = {
    "install",
    "uninstall",
    "add",
    "remove",
    "init",
    "link",
    "unlink",
    "publish",
    "pack",
    "login",
    "logout",
    "cache",
    "config",
    "info",
    "list",
    "outdated",
    "audit",
    "why",
    "dlx",
    "exec",
    "create",
    "global",
    "workspace",
    "workspaces",
    "update",
    "exec",
    "check",
    "require",
    "dump-autoload",
    "dumpautoload",
    "validate",
}
# invariant: lifecycle verbs are not project-script names
RUNNER_BUILTINS = {
    "nx",
    "run",
    "run-many",
    "affected",
    "test",
    "build",
    "run",
    "mod",
    "generate",
    "vet",
    "fmt",
    "get",
    "install",
    "tidy",
    "clean",
    "compile",
    "package",
    "verify",
    "deploy",
    "site",
    "validate",
    "integration-test",
    "pre-integration-test",
    "post-integration-test",
    "assemble",
    "check",
    "bootRun",
    "bootJar",
    "dependencies",
    "wrapper",
    "server",
    "console",
    "generate",
    "routes",
    "runner",
    "new",
    "list",
    "help",
}

COMMAND_CITE_RES = (
    re.compile(
        r"`(?:yarn|npm|pnpm|bun)(?:\s+run)?\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"
    ),
    re.compile(r"`make\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"),
    re.compile(r"`task\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"),
    re.compile(
        r"`(?:bundle\s+exec\s+)?(?:bin/)?rake\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"
    ),
    re.compile(
        r"`(?:bundle\s+exec\s+)?(?:bin/)?rails\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"
    ),
    re.compile(r"`bin/([A-Za-z0-9_-]+)(?:\s+([A-Za-z0-9:_./-]+))?[^`]*`"),
    re.compile(r"`(?:\./)?mvnw?\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"),
    re.compile(r"`(?:\./)?gradlew?\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"),
    # why: go run ./... is covered by RUNNER_BUILTINS; only custom tokens remain
    re.compile(r"`go\s+([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"),
    re.compile(
        r"`(?:php\s+)?(?:\.?/)?artisan\s+([A-Za-z0-9:_./:-]+)(?:\s+[^`]*)?`"
    ),
    re.compile(
        r"`(?:php\s+)?(?:bin/)?console\s+([A-Za-z0-9:_./:-]+)(?:\s+[^`]*)?`"
    ),
    re.compile(r"`composer\s+(?:run(?:-script)?\s+)?([A-Za-z0-9:_./-]+)(?:\s+[^`]*)?`"),
)


@dataclass
class Finding:
    id: str
    severity: str
    source: str
    claim: str
    reality: str
    evidence: str


def default_out(root: Path, run_id: str) -> Path:
    return root / ".harness-eval" / "runs" / run_id


def rel(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def is_readme(path: str) -> bool:
    return bool(README_RE.search(path.replace("\\", "/")))


def normalize_cite(cite: str) -> str:
    c = cite.strip().strip("\"'")
    while c.startswith("./"):
        c = c[2:]
    return c


def strip_fenced_code(text: str) -> str:
    """Remove fenced code blocks so example paths inside fences are not cites."""
    return re.sub(r"```.*?```", "\n", text, flags=re.S)


# why: skill prose often says load `dev` then read references/… — resolve against that skill
SKILL_MENTION_RE = re.compile(
    r"[`']([a-z][a-z0-9_-]*)[`']\s+skill"
    r"|\b(?:the|load(?:ing)?|use|using)\s+([a-z][a-z0-9_-]*)\s+skill\b",
    re.I,
)
# why: pedagogical app/lib examples must not force BROKEN; only mandate language does
# hazard: bare "read"/"write" matches doc intros ("Read before…") far from the cite
PATH_MANDATE_RE = re.compile(
    r"\b(load|open|must|required|touch|modify|edit|delete|restore)\b"
    r"|\bread\s+(?:the\s+)?(?:file|path|this\s+file)"
    r"|\bread\s+[`'][^`']+[`']",
    re.I,
)
CODE_TREE_PREFIXES = (
    "app/",
    "apps/",
    "lib/",
    "src/",
    "cmd/",
    "internal/",
    "spec/",
    "test/",
    "tests/",
)


_SKILL_MENTION_STOP = frozenset({"the", "a", "an", "this", "that", "each", "any", "our"})


def mentioned_skill_names(text: str) -> list[str]:
    names: list[str] = []
    for m in SKILL_MENTION_RE.finditer(text):
        name = (m.group(1) or m.group(2) or "").strip().lower()
        if name and name not in _SKILL_MENTION_STOP and name not in names:
            names.append(name)
    return names


def has_mandate_near_cite(text: str, cite: str) -> bool:
    """True when mandate language shares the cite's paragraph (blank-line bounded)."""
    for m in re.finditer(re.escape(cite), text):
        before = text.rfind("\n\n", 0, m.start())
        after = text.find("\n\n", m.end())
        start = 0 if before < 0 else before + 2
        end = len(text) if after < 0 else after
        if PATH_MANDATE_RE.search(text[start:end]):
            return True
    return False


# invariant: workspace discovery is presence-based; no stack assumed at runtime
WORKSPACE_MANIFESTS = (
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile",
    "Makefile",
)
WORKSPACE_SKIP_DIRS = frozenset(
    {"node_modules", ".git", "dist", "build", "target", "vendor", ".venv", ".turbo"}
)
# why: a cite whose top segment is one of these, with no such directory anywhere,
# is stack-example text (`bin/console` in a list of PHP entry points), not a cite.
GENERIC_ROOT_SEGMENTS = frozenset(
    {"bin", "lib", "src", "app", "test", "tests", "spec", "cmd", "internal", "config"}
)
EXAMPLE_MARKER_RE = re.compile(r"\b(e\.g\.|eg\.|for example|such as|for instance)", re.I)

_WORKSPACE_CACHE: dict[str, tuple[str, ...]] = {}


def workspace_dirs(root: Path) -> tuple[str, ...]:
    """Directories that carry a manifest — the roots a cite may be relative to.

    A monorepo surface says `src/router.tsx` and means `apps/web/src/router.tsx`;
    resolving from the repo root alone reports a false BROKEN for every one.
    """
    key = str(root.resolve())
    cached = _WORKSPACE_CACHE.get(key)
    if cached is not None:
        return cached
    found: list[str] = []

    def walk(directory: Path, depth: int) -> None:
        if depth > 3:
            return
        try:
            children = sorted(directory.iterdir())
        except OSError:
            return
        for child in children:
            if not child.is_dir() or child.is_symlink():
                continue
            if child.name in WORKSPACE_SKIP_DIRS or child.name.startswith("."):
                continue
            if any((child / m).is_file() for m in WORKSPACE_MANIFESTS):
                found.append(rel(root, child))
            walk(child, depth + 1)

    walk(root, 1)
    result = tuple(found)
    _WORKSPACE_CACHE[key] = result
    return result


def owning_workspace(root: Path, source: Path) -> str | None:
    """The workspace the citing file itself lives in, if any."""
    try:
        rel_source = rel(root, source)
    except (ValueError, OSError):
        return None
    matches = [ws for ws in workspace_dirs(root) if rel_source.startswith(ws + "/")]
    # deepest wins: apps/web beats apps
    return max(matches, key=len) if matches else None


def named_workspace_bases(root: Path, text: str, source: Path | None = None) -> list[str]:
    """Workspaces this surface may legitimately mean, most specific first.

    A file that LIVES in a workspace means that one. `apps/api/AGENTS.md` saying
    "read `src/router.tsx`" is wrong even though `apps/web/src/router.tsx`
    exists — trying every workspace made that dead cite resolve and report clean.
    A file outside any workspace (a skill, the root) may mean any workspace it
    names, because that is how those documents are written.
    """
    if source is not None:
        owner = owning_workspace(root, source)
        if owner is not None:
            return [owner]
    return [ws for ws in workspace_dirs(root) if ws in text]


def generic_root_absent(root: Path, cite: str, bases: list[str]) -> bool:
    """True when the cite's whole top-level tree is missing from this repo.

    Two shapes land here and both are convention text rather than a claim about
    this repo: stack examples (`bin/console` in a list of PHP entry points) and
    tool-convention roots (`.cursor/skills` named beside `.agents/skills` by a
    stack-agnostic skill). A repo that does not use the tool has no such
    directory, and flagging it says "your harness is wrong" about a sentence
    that is right.

    A missing file inside a tree that DOES exist is still BROKEN — that is the
    case worth catching, and it is untouched by this guard.
    """
    top = normalize_cite(cite).split("/")[0]
    if not top or "/" not in normalize_cite(cite):
        return False
    if (root / top).exists():
        return False
    return not any((root / base / top).exists() for base in bases)


def only_in_example_context(text: str, cite: str) -> bool:
    """True when every occurrence sits behind `e.g.` / `such as` on its own line."""
    seen = False
    for m in re.finditer(re.escape(cite), text):
        seen = True
        line_start = text.rfind("\n", 0, m.start()) + 1
        if not EXAMPLE_MARKER_RE.search(text[line_start : m.start()]):
            return False
    return seen


def is_code_tree_cite(cite: str) -> bool:
    return normalize_cite(cite).startswith(CODE_TREE_PREFIXES)


def is_placeholder_cite(cite: str) -> bool:
    if "*" in cite or "<" in cite or cite.endswith("/"):
        return True
    # why: `lib/...` and `.agents/…` are elisions in teaching text, never cites.
    # Both spellings occur: ASCII "..." and U+2026 "…".
    if "\u2026" in cite or "..." in cite:
        return True
    if EXAMPLE_PATH_RE.search(cite) or "{" in cite or "}" in cite:
        return True
    if re.search(r"\[[^\]]+\]", cite):
        return True
    for part in Path(normalize_cite(cite)).parts:
        if PLACEHOLDER_SEG_RE.match(part):
            return True
        if "_" in part and part.isupper():
            return True
    return False


def is_concrete_checkable_cite(cite: str) -> bool:
    c = normalize_cite(cite)
    if c.startswith("../"):
        return ".agents/" in c or ".cursor/" in c or c.startswith("../.agents/")
    if c.startswith(CONCRETE_PREFIXES):
        return True
    return c.startswith("references/") and c.endswith((".md", ".mdc", ".json"))


def looks_like_path(raw: str) -> bool:
    if raw.startswith(("http://", "https://", "#", "mailto:")):
        return False
    if " " in raw and not raw.endswith((".md", ".ts", ".js")):
        return False
    return (
        "/" in raw
        or raw.endswith((".md", ".mdc", ".ts", ".js", ".py", ".json", ".yml", ".yaml"))
        or raw.startswith(("docs/", ".agents/", ".cursor/", "references/"))
    )


def extract_cites(text: str) -> list[str]:
    out = []
    for m in BACKTICK_PATH_RE.finditer(text):
        raw = (m.group(1) or m.group(2) or "").strip()
        if not raw:
            continue
        parts = raw.split()
        if not parts:
            continue
        raw = parts[0].split("#")[0].strip("\"'")
        if raw and looks_like_path(raw) and not is_readme(raw):
            out.append(raw)
    return out


def extract_surface_cites(text: str) -> list[str]:
    """Cites from prose only — fenced examples are out of scope for Track A."""
    return extract_cites(strip_fenced_code(text))


def resolve_cite(
    root: Path, source: Path, cite: str, *, text: str | None = None
) -> tuple[Path | None, list[str]]:
    cite_norm = normalize_cite(cite)
    tried: list[str] = []
    candidates = [root / cite_norm, source.parent / cite_norm, (source.parent / cite_norm).resolve()]
    if cite_norm.startswith("../"):
        candidates.append((source.parent / cite_norm).resolve())
    if "skills" in source.parts:
        try:
            skills_idx = list(source.parts).index("skills")
            skill_root = Path(*source.parts[: skills_idx + 2])
            candidates.append(skill_root / cite_norm)
        except ValueError:
            pass
    # why: "load the `dev` skill and read `references/view.md`" (also from AGENTS.md)
    if cite_norm.startswith("references/") and text:
        for skill_name in mentioned_skill_names(text):
            for base in (
                root / ".agents" / "skills" / skill_name,
                root / ".cursor" / "skills" / skill_name,
                root / ".claude" / "skills" / skill_name,
            ):
                candidates.append(base / cite_norm)
    # why: monorepo surfaces write workspace-relative cites (`src/router.tsx` in a
    # file about `apps/web`). Try the workspaces the surface names, and their
    # `src/` — second attempt only, so a genuinely dead cite is still BROKEN.
    if text:
        for base in named_workspace_bases(root, text, source):
            candidates.append(root / base / cite_norm)
            candidates.append(root / base / "src" / cite_norm)
    seen: set[str] = set()
    for c in candidates:
        key = str(c)
        if key in seen:
            continue
        seen.add(key)
        tried.append(key)
        try:
            # why: `apps/web` and `.agents/skills` are directory cites. Checking
            # is_file() only turned every one of them into a false BROKEN.
            if c.is_file() or c.is_dir():
                return c.resolve(), tried
        except OSError:
            continue
    name = Path(cite_norm).name
    for parent in [(root / Path(cite_norm).parent), (source.parent / Path(cite_norm).parent)]:
        try:
            if parent.is_dir():
                for child in parent.iterdir():
                    if child.name.lower() == name.lower():
                        return None, tried + [f"case-mismatch:{child}"]
        except OSError:
            continue
    return None, tried


def check_file(root: Path, source: Path, commands: set[str], finding_id: list[int]) -> list[Finding]:
    findings: list[Finding] = []
    text = source.read_text(encoding="utf-8", errors="replace")
    src = rel(root, source)

    for cite in extract_surface_cites(text):
        if is_placeholder_cite(cite):
            continue
        if cite.count("/") == 0 and not cite.endswith((".md", ".mdc", ".ts", ".js", ".json")):
            skill = root / ".agents" / "skills" / cite / "SKILL.md"
            alt = root / ".cursor" / "skills" / cite / "SKILL.md"
            if skill.is_file() or alt.is_file():
                continue
            if re.search(rf"(?:use|see|skill)\s+[`']?{re.escape(cite)}[`']?", text, re.I):
                finding_id[0] += 1
                findings.append(
                    Finding(
                        id=f"A{finding_id[0]:03d}",
                        severity="BROKEN",
                        source=src,
                        claim=f"References skill `{cite}`",
                        reality="No matching SKILL.md under .agents/skills or .cursor/skills",
                        evidence=f"missing:{cite}",
                    )
                )
            continue
        if not is_concrete_checkable_cite(cite):
            continue
        resolved, tried = resolve_cite(root, source, cite, text=text)
        if resolved:
            continue
        # invariant: missing app/lib/test paths are BROKEN only with mandate language nearby
        if is_code_tree_cite(cite) and not has_mandate_near_cite(text, cite):
            continue
        if generic_root_absent(root, cite, named_workspace_bases(root, text, source)):
            continue
        if only_in_example_context(text, cite):
            continue
        case_hit = next((t for t in tried if t.startswith("case-mismatch:")), None)
        finding_id[0] += 1
        findings.append(
            Finding(
                id=f"A{finding_id[0]:03d}",
                severity="BROKEN",
                source=src,
                claim=f"Path cite `{cite}`",
                reality=(
                    f"Case mismatch; found {case_hit.split(':', 1)[1]}"
                    if case_hit
                    else "File does not exist (case-sensitive check)"
                ),
                evidence="; ".join(tried[:4]),
            )
        )

    findings.extend(
        _command_findings(text, src, commands, finding_id)
    )
    return findings


def _runner_kind(cite: str) -> str:
    c = cite.lower()
    if re.search(r"\b(yarn|npm|pnpm|bun)\b", c):
        return "node"
    if re.search(r"\brake\b", c):
        return "rake"
    if re.search(r"\brails\b", c):
        return "rails"
    if re.search(r"\bartisan\b", c):
        return "artisan"
    if re.search(r"\bconsole\b", c):
        return "console"
    if re.search(r"\b(mvn|mvnw)\b", c):
        return "maven"
    if re.search(r"\b(gradle|gradlew)\b", c):
        return "gradle"
    if re.search(r"\bgo\b", c):
        return "go"
    if re.search(r"\bcomposer\b", c):
        return "composer"
    if re.search(r"\bmake\b", c):
        return "make"
    if re.search(r"\btask\b", c):
        return "task"
    if re.search(r"\bbin/", c):
        return "bin"
    return "other"


def _command_ok(token: str, kind: str, commands: set[str]) -> bool:
    if not token or is_placeholder_cite(token) or "<" in token:
        return True
    if token in {"docker", "compose"}:
        return True
    if token in PM_BUILTINS or token in RUNNER_BUILTINS:
        return True
    if token in commands:
        return True
    # why: framework CLIs expose many subcommands absent from manifests; only flag discovered project scripts
    if kind in {"rails", "artisan", "console", "go", "maven"}:
        return True
    if not commands:
        return True
    if "package" in token.lower():
        return True
    return False


def _command_findings(
    text: str,
    src: str,
    commands: set[str] | list[str],
    finding_id: list[int],
) -> list[Finding]:
    findings: list[Finding] = []
    cmd_set = set(commands)
    seen_claims: set[str] = set()
    for cre in COMMAND_CITE_RES:
        for m in cre.finditer(text):
            cite = m.group(0)
            if cite in seen_claims:
                continue
            if "<" in cite:
                continue
            kind = _runner_kind(cite)
            tokens = [g for g in m.groups() if g]
            if not tokens:
                continue
            bad = None
            if kind == "bin" and tokens:
                bin_name = tokens[0]
                if bin_name not in cmd_set and bin_name not in RUNNER_BUILTINS:
                    if cmd_set:
                        bad = bin_name
                elif len(tokens) > 1 and not _command_ok(tokens[1], "rails", cmd_set):
                    # why: only rake-like namespaced tasks are checkable against discovered tasks
                    if ":" in tokens[1] and tokens[1] not in cmd_set:
                        bad = tokens[1]
            else:
                token = tokens[-1]
                if not _command_ok(token, kind, cmd_set):
                    bad = token
            if not bad:
                continue
            seen_claims.add(cite)
            finding_id[0] += 1
            findings.append(
                Finding(
                    id=f"A{finding_id[0]:03d}",
                    severity="BROKEN",
                    source=src,
                    claim=f"Command cite `{cite}`",
                    reality=f"Script/task `{bad}` not in discovered manifest scripts",
                    evidence=f"manifest_commands missing `{bad}`",
                )
            )
    return findings


def render_report(
    out_path: Path,
    inventory: dict,
    findings: list[Finding],
    ok_count: int,
    root: Path,
) -> None:
    broken = sum(1 for f in findings if f.severity == "BROKEN")
    t0 = inventory.get("t0", [])
    t1 = inventory.get("t1", [])
    t2 = inventory.get("t2", [])
    manifests = list(inventory.get("manifests") or [])

    lines = [
        "# Harness Eval: Correctness (Track A)",
        "",
        f"> Generated: {datetime.now(timezone.utc).isoformat()}",
        "> Method: deterministic path/command checks (no README)",
        "",
        "## What these words mean",
        "",
        "| Word | Meaning | You should |",
        "|------|---------|------------|",
        "| **BROKEN** | A cited path or command does not exist (high-precision check) | Fix the cite or restore the file |",
        "| **OK path-cites** | Concrete path cites that resolved | No action |",
        "| **T0 / T1 / T2** | Always-on rules / skills / cited harness refs | Fix T0 cites first (always loaded) |",
        "",
        "This track answers: *is the harness factually wrong about paths/commands?* "
        "Not redundancy (`07`) or usefulness (`10`).",
        "",
        "## Executive summary",
        "",
        f"- T0: {len(t0)} · T1: {len(t1)} · T2: {len(t2)}",
        f"- Manifests: {', '.join(manifests) or '(none)'}",
        f"- Findings: **{broken} broken** · {ok_count} path-cites ok",
        "",
        "## Inventory",
        "",
        "### T0",
        "",
        "Always-on rules (always loaded).",
        "",
    ]
    if not t0:
        lines.append("_(none)_")
    else:
        for p in t0:
            lines.append(f"- `{p}`")
    lines += ["", "### T1", "", "Skills.", ""]
    if not t1:
        lines.append("_(none)_")
    else:
        for p in t1:
            lines.append(f"- `{p}`")
    lines += ["", "### T2", "", "Cited harness refs.", ""]
    if not t2:
        lines.append("_(none)_")
    else:
        for p in t2:
            lines.append(f"- `{p}`")
    lines += ["", "## Findings", ""]
    if not findings:
        lines.append("_No BROKEN path/command findings._")
    for f in findings:
        claim_lower = f.claim.lower()
        claim_matches = re.findall(r"`([^`]+)`", f.claim)
        cite = claim_matches[-1] if claim_matches else ""
        cited = f"`{cite}`" if cite else f"`{f.source}`"

        if claim_lower.startswith("command cite"):
            kind = "command"
            title = "missing command"
        elif claim_lower.startswith("references skill"):
            kind = "skill"
            title = "missing skill"
        elif "inventory lists" in claim_lower:
            kind = "inventory"
            title = "missing harness file"
        elif "case mismatch" in f.reality.lower():
            kind = "casing"
            title = "wrong file casing"
        else:
            kind = "path"
            title = "missing file"

        if kind == "command":
            if manifests:
                listed = ", ".join(f"`{m}`" for m in manifests)
                looked = f"- **Looked in:** {listed} scripts"
            else:
                looked = "- **Looked in:** discovered manifest scripts"
        elif kind == "skill":
            looked = (
                f"- **Looked for:** `.agents/skills/{cite}/SKILL.md` or "
                f"`.cursor/skills/{cite}/SKILL.md`"
            )
        elif kind == "inventory":
            ev = f.evidence
            if ev.startswith("case-mismatch:"):
                ev = ev.split(":", 1)[1]
            try:
                p = Path(ev)
                if p.is_absolute():
                    ev = p.resolve().relative_to(root.resolve()).as_posix()
            except (ValueError, OSError):
                ev = ev.replace("\\", "/")
            else:
                ev = ev.replace("\\", "/")
            looked = f"- **Looked for:** `{ev}`"
        else:
            looked = f"- **Looked for:** `{cite}` at the repo root (case-sensitive)"

        manifest_ref = f"`{manifests[0]}`" if manifests else "the nearest manifest"
        if kind == "command":
            m = re.search(r"missing `([^`]+)`", f.evidence)
            script = m.group(1) if m else cite
            fix = (
                f"Add a `{script}` script to {manifest_ref}, "
                "or change the cite to a command that exists there."
            )
        elif kind == "skill":
            fix = (
                f"Create `.agents/skills/{cite}/SKILL.md` or "
                f"`.cursor/skills/{cite}/SKILL.md`, or fix the skill name in `{f.source}`."
            )
        elif kind == "inventory":
            fix = f"Restore `{f.source}` or re-run inventory after moving harness files."
        elif kind == "casing":
            fix = "Fix the cite so the casing matches the file on disk."
        else:
            fix = "Point the cite at a path that exists, or restore the missing file."

        lines += [
            f"### [{f.id}] BROKEN — {title}",
            "",
            f"- **In:** `{f.source}`",
            f"- **The instruction cites:** {cited}",
            looked,
            f"- **Fix:** {fix}",
            "",
        ]
    lines += [
        "## Notes",
        "",
        "- Path normalization preserves `.agents` (never `str.lstrip('./')`).",
        "- Placeholders and bare example filenames are skipped.",
        "- Fenced code blocks are not scanned for path cites.",
        "- `references/` may resolve under a skill named in the same surface (e.g. load `dev`).",
        "- Missing `app/`/`lib/`/`test/` cites are BROKEN only when mandate language is nearby.",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, default=Path("."))
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--out-base", type=Path, default=None)
    args = ap.parse_args()
    root = args.root.resolve()
    out = args.out_base or default_out(root, args.run_id)
    inv_path = out / "inventory.json"
    if not inv_path.is_file():
        print(f"Missing {inv_path}; run inventory_extract.py first", file=sys.stderr)
        return 1
    inventory = json.loads(inv_path.read_text(encoding="utf-8"))
    commands = set(inventory.get("manifest_commands") or [])

    finding_id = [0]
    findings: list[Finding] = []
    ok_cites = 0
    for rel_s in inventory.get("t0", []) + inventory.get("t1", []) + inventory.get("t2", []):
        p = root / rel_s
        if not p.is_file():
            finding_id[0] += 1
            findings.append(
                Finding(
                    id=f"A{finding_id[0]:03d}",
                    severity="BROKEN",
                    source=rel_s,
                    claim="Inventory lists this file",
                    reality="Missing on disk",
                    evidence=str(p),
                )
            )
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        for cite in extract_surface_cites(text):
            if is_placeholder_cite(cite) or not is_concrete_checkable_cite(cite):
                continue
            resolved, _ = resolve_cite(root, p, cite, text=text)
            if resolved:
                ok_cites += 1
            elif is_code_tree_cite(cite) and not has_mandate_near_cite(text, cite):
                # why: unmandated code-tree cites are pedagogical examples, not BROKEN
                pass
        findings.extend(check_file(root, p, commands, finding_id))

    seen = set()
    uniq: list[Finding] = []
    for f in findings:
        key = (f.source, f.claim, f.severity)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(f)

    render_report(out / "04-correctness.md", inventory, uniq, ok_cites, root)
    (out / "04-correctness.json").write_text(json.dumps([asdict(f) for f in uniq], indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"run_id": args.run_id, "findings": len(uniq), "broken": sum(1 for f in uniq if f.severity == "BROKEN"), "report": str(out / "04-correctness.md")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
