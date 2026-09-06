#!/usr/bin/env node
/**
 * THE NO-LOSS PROOF.
 *
 * Restructuring a harness means moving ~1,400 sentences between files. The
 * failure that matters is not a typo, it is a rule that quietly stops existing:
 * somebody consolidates two paragraphs, the third one goes with them, and
 * nothing anywhere says a guardrail was dropped. "I was careful" is not a proof.
 *
 * So: snapshot every claim BEFORE the move, with the band the judges gave it,
 * and after the move ask of each one — is this sentence still somewhere in the
 * harness? Three outcomes, and only one of them is allowed to be silent:
 *
 *   RETAINED  found (fuzzy token overlap >= 0.6), with its new location
 *   CUT       not found — legitimate only with a report ID behind it
 *   NEW       exists now and did not before (index rows, sensor pointers)
 *
 * The gate: a CUT claim may not come from Track B `Review` (both judges said
 * keep) or from a surface Track C called `Keep-core`. Either intersection is a
 * regression, not a decision, and the exit code says so.
 *
 * Fuzzy rather than exact on purpose: a claim that moves usually gets rewrapped
 * or slightly reworded, and an exact-match ledger would report the entire move
 * as loss. 0.6 token overlap survives rewrapping.
 *
 * MATCHED AGAINST A WINDOW, NOT A FILE. The first version of this scored a
 * claim against the token set of an ENTIRE file and took the best-scoring file
 * anywhere in the corpus. That made "retained" mean "60% of these words appear
 * somewhere in some one file" — and a review caught it doing exactly that: a
 * root AGENTS.md pointer scored 0.57 against `deep-review/SKILL.md`, a file
 * that has nothing to do with it. A rule has to survive as a rule, in one
 * place, so the haystack is a sliding window of a few lines.
 *
 * Usage:
 *   node scripts/harness/claim-ledger.mjs --run-dir .harness-eval/runs/<id> \
 *       --out docs/harness/claim-ledger-baseline.json
 *   node scripts/harness/claim-ledger.mjs --diff docs/harness/claim-ledger-baseline.json \
 *       --against .   [--report docs/harness/claim-ledger-diff.md]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

/* ─────────────────────────── text normalisation ────────────────────────── */

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "that", "this",
  "for", "on", "with", "as", "at", "by", "be", "are", "not", "you", "your",
  "do", "does", "if", "so", "but", "from", "into", "than", "then", "when",
]);

/**
 * Content tokens only — casing, punctuation and markdown emphasis are noise.
 *
 * `.`, `/`, `:` and `-` stay INSIDE a token, because `apps/web`, `zod/v4` and
 * `db:seed` are single facts. They are stripped from the ENDS, because
 * "Redis." at the end of a sentence and "Redis," mid-list are the same word —
 * and not stripping them reported a rule as deleted when it had only been
 * rewrapped.
 */
function tokens(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[`*_~#>|]/g, " ")
      .replace(/[^a-z0-9./:-]+/g, " ")
      .split(" ")
      .map((word) => word.replace(/^[./:-]+/, "").replace(/[./:-]+$/, ""))
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
}

/** Overlap measured against the CLAIM, so extra prose around it costs nothing. */
function overlap(claimTokens, haystackTokens) {
  if (claimTokens.size === 0) return 1;
  let hits = 0;
  for (const token of claimTokens) if (haystackTokens.has(token)) hits += 1;
  return hits / claimTokens.size;
}

const MATCH_THRESHOLD = 0.6;

/**
 * Lines per window. Big enough that a rule which got rewrapped from three lines
 * to five still lands inside one; small enough that unrelated paragraphs cannot
 * pool their vocabulary into a match.
 */
const WINDOW_LINES = 12;
const WINDOW_STEP = 4;

/* ───────────────────────────── harness corpus ──────────────────────────── */

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".turbo",
  ".harness-eval", ".nightly", ".deep-review", ".visual", ".playwright",
]);

function harnessFiles(root) {
  const found = [];
  const skipPaths = [join(root, ".claude/worktrees")];

  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || skipPaths.includes(full)) continue;
        walk(full, depth + 1);
      }
    }
  }

  // Nested AGENTS.md, wherever they are.
  function collectAgents(dir, depth) {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || skipPaths.includes(full)) continue;
        collectAgents(full, depth + 1);
      } else if (entry.name === "AGENTS.md") {
        found.push(full);
      }
    }
  }
  collectAgents(root, 0);
  walk(root, 0);

  for (const extra of [".claude/CLAUDE.md", "DESIGN.md", "docs/mcp-servers.md"]) {
    const full = join(root, extra);
    if (existsSync(full)) found.push(full);
  }

  const skills = join(root, ".agents/skills");
  if (existsSync(skills)) {
    const collect = (dir, depth) => {
      if (depth > 5) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) collect(full, depth + 1);
        else if (entry.name.endsWith(".md")) found.push(full);
      }
    };
    collect(skills, 0);
  }

  // docs/harness is where moved rationale legitimately lands — but NOT this
  // tool's own output. `claim-ledger-diff.md` prints the quote of every cut
  // claim, so leaving it in the corpus lets a deleted rule match its own
  // obituary and come back RETAINED. Same for the eval log, which quotes claims
  // while explaining why they were corrected.
  const SELF_OUTPUT = /^(claim-ledger-|eval-log\.md$)/;
  const harnessDocs = join(root, "docs/harness");
  if (existsSync(harnessDocs)) {
    for (const entry of readdirSync(harnessDocs)) {
      if (entry.endsWith(".md") && !SELF_OUTPUT.test(entry)) {
        found.push(join(harnessDocs, entry));
      }
    }
  }

  return [...new Set(found)].filter((file) => statSync(file).isFile()).sort();
}

/* ──────────────────────────────── snapshot ─────────────────────────────── */

function snapshot(runDir, outPath) {
  const claims = readFileSync(join(runDir, "claims.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((claim) => !claim.is_plant);

  const bandsPath = join(runDir, "07-agreement.json");
  const claimBands = existsSync(bandsPath)
    ? JSON.parse(readFileSync(bandsPath, "utf8")).bands
    : {};

  const surfacePath = join(runDir, "10-usefulness-agreement.json");
  const surfaceBands = existsSync(surfacePath)
    ? JSON.parse(readFileSync(surfacePath, "utf8")).bands
    : {};
  const bandBySurface = {};
  for (const entry of Object.values(surfaceBands)) {
    if (entry.path) bandBySurface[entry.path] = entry.band;
  }

  const ledger = {
    run_dir: runDir,
    generated_at: new Date().toISOString(),
    threshold: MATCH_THRESHOLD,
    tracks_present: {
      redundancy: existsSync(bandsPath),
      usefulness: existsSync(surfacePath),
    },
    claims: claims.map((claim) => ({
      id: claim.id,
      tier: claim.tier,
      source: claim.source,
      section: claim.section ?? "",
      quote: claim.quote,
      redundancy_band: claimBands[claim.id] ?? "unscored",
      usefulness_band: bandBySurface[claim.source] ?? "unscored",
    })),
  };

  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        out: outPath,
        claims: ledger.claims.length,
        redundancy_scored: ledger.tracks_present.redundancy,
        usefulness_scored: ledger.tracks_present.usefulness,
      },
      null,
      2,
    ),
  );
  return 0;
}

/* ────────────────────────────────── diff ───────────────────────────────── */

function diff(ledgerPath, root, reportPath) {
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const files = harnessFiles(root);
  const corpus = files.map((file) => {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const windows = [];
    for (let start = 0; start < Math.max(lines.length, 1); start += WINDOW_STEP) {
      windows.push({
        line: start + 1,
        tokens: tokens(lines.slice(start, start + WINDOW_LINES).join("\n")),
      });
    }
    return { path: relative(root, file), windows };
  });

  const retained = [];
  const cut = [];

  /**
   * The deck emits one templated claim per reference file — "Harness-referenced
   * document `X` is an on-demand load target…". That is a claim about a PATH,
   * not about prose, and token-matching a boilerplate sentence against the
   * file's own contents is meaningless: it reported thirty perfectly healthy
   * reference files as deleted. Verify it the only way that means anything.
   */
  const ROUTING_CLAIM_RE = /^Harness-referenced document `([^`]+)` is an on-demand load target/;

  for (const claim of ledger.claims) {
    const routing = claim.quote.match(ROUTING_CLAIM_RE);
    if (routing) {
      const target = join(root, routing[1]);
      if (existsSync(target)) {
        retained.push({ ...claim, found_in: routing[1], score: 1, by: "path" });
      } else {
        cut.push({ ...claim, best_match: null, score: 0, by: "path" });
      }
      continue;
    }
    const claimTokens = tokens(claim.quote);
    let best = { score: 0, path: null, line: 0 };
    for (const file of corpus) {
      for (const window of file.windows) {
        const score = overlap(claimTokens, window.tokens);
        if (score > best.score) best = { score, path: file.path, line: window.line };
        if (best.score >= 0.999) break;
      }
      if (best.score >= 0.999) break;
    }
    const where = best.path ? `${best.path}:${best.line}` : null;
    if (best.score >= MATCH_THRESHOLD) {
      retained.push({ ...claim, found_in: where, score: Number(best.score.toFixed(2)) });
    } else {
      cut.push({ ...claim, best_match: where, score: Number(best.score.toFixed(2)) });
    }
  }

  /*
   * Two escape hatches, both of which VERIFY rather than assert.
   *
   * A rule that moved and was reworded can fail a window match while being
   * perfectly present, and a claim deleted because it was FALSE is a fix, not a
   * loss. `docs/harness/claim-resolutions.json` answers both — but an entry only
   * counts if it holds up: a `relocated` row must name a file that really
   * contains the text it claims, and a `corrected` row must name evidence that
   * really exists. A row that does not hold up is dropped here and the claim
   * goes back to being a cut, so padding the file cannot buy a green gate.
   */
  const resolutionsPath = join(root, "docs/harness/claim-resolutions.json");
  const relocated = new Map();
  const corrected = new Map();
  const bogusResolutions = [];
  if (existsSync(resolutionsPath)) {
    const resolutions = JSON.parse(readFileSync(resolutionsPath, "utf8"));
    for (const entry of resolutions.relocated ?? []) {
      const target = join(root, entry.to);
      const holds = existsSync(target) && readFileSync(target, "utf8").includes(entry.contains);
      if (holds) relocated.set(entry.id, entry);
      else bogusResolutions.push(`relocated ${entry.id}: ${entry.to} does not contain "${entry.contains}"`);
    }
    for (const entry of resolutions.corrected ?? []) {
      if (existsSync(join(root, entry.evidence))) corrected.set(entry.id, entry);
      else bogusResolutions.push(`corrected ${entry.id}: evidence ${entry.evidence} does not exist`);
    }
  }

  const stillCut = cut.filter((claim) => !relocated.has(claim.id) && !corrected.has(claim.id));
  const relocatedCuts = cut.filter((claim) => relocated.has(claim.id));
  const correctedCuts = cut.filter((claim) => corrected.has(claim.id));

  /*
   * The gate. A cut is a decision only when a report backed it.
   *
   * `Review` (both judges said keep) and `Keep-core` / `Hold` surfaces are
   * protected. The one exception is a surface Track C called `Mixed`: those
   * carry `11-mixed-apply.md`, a per-section KEEP/CUT list that two judges
   * produced and a second model family confirmed. That file IS the report ID,
   * so a cut inside a Mixed surface is authorised — but it is reported
   * separately rather than silently, because "authorised" is not "reviewed".
   */
  const isMixedSurface = (claim) => claim.usefulness_band === "Mixed";
  const protectedCuts = stillCut.filter(
    (claim) =>
      !isMixedSurface(claim) &&
      (claim.redundancy_band === "Review" ||
        claim.usefulness_band === "Keep-core" ||
        String(claim.usefulness_band).startsWith("Hold:")),
  );
  const mixedApplyCuts = stillCut.filter(isMixedSurface);

  const summary = {
    ledger: ledgerPath,
    root,
    claims: ledger.claims.length,
    retained: retained.length,
    relocated_verified: relocatedCuts.length,
    corrected: correctedCuts.length,
    cut: stillCut.length,
    cut_under_mixed_apply: mixedApplyCuts.length,
    protected_cuts: protectedCuts.length,
    bogus_resolutions: bogusResolutions.length,
    gate: protectedCuts.length === 0 && bogusResolutions.length === 0 ? "PASS" : "FAIL",
  };

  if (reportPath) {
    const lines = [
      "# Claim ledger diff",
      "",
      `> baseline: \`${ledgerPath}\``,
      `> against: \`${root}\``,
      `> match threshold: ${MATCH_THRESHOLD} token overlap against the claim`,
      "",
      "## What these words mean",
      "",
      "| Word | Meaning |",
      "|------|---------|",
      "| **RETAINED** | The sentence is still somewhere in the harness, possibly in a different file |",
      "| **CUT** | It is not. Legitimate only with a report ID behind it |",
      "| **Relocated** | Moved and reworded, so the window match missed it — `docs/harness/claim-resolutions.json` names where it went, and that claim is re-checked here |",
      "| **Corrected** | Deleted because it was FALSE. The entry names the evidence, and that evidence is re-checked here |",
      "| **Protected cut** | A CUT that both judges said to keep, or that sat in a Keep-core / Hold surface. A regression, not a decision |",
      "| **Mixed-apply cut** | A CUT inside a surface Track C called Mixed, where `11-mixed-apply.md` names what to remove. Authorised — but read the diff |",
      "",
      "## Summary",
      "",
      `- Claims in the baseline: **${summary.claims}**`,
      `- Retained, matched in place: **${summary.retained}**`,
      `- Relocated, each verified against a named destination: **${summary.relocated_verified}**`,
      `- Deleted as factually false, each with evidence: **${summary.corrected}**`,
      `- Cut: **${summary.cut}**`,
      `- Of those, cut under a \`11-mixed-apply.md\` plan: **${summary.cut_under_mixed_apply}**`,
      `- Protected cuts: **${summary.protected_cuts}** — gate **${summary.gate}**`,
      "",
      "## Protected cuts (restore these)",
      "",
    ];
    if (protectedCuts.length === 0) {
      lines.push("_None._", "");
    } else {
      lines.push(
        "| ID | Tier | Was in | Redundancy | Usefulness | Quote |",
        "|----|------|--------|------------|------------|-------|",
        ...protectedCuts.map(
          (c) =>
            `| ${c.id} | ${c.tier} | \`${c.source}\` | ${c.redundancy_band} | ${c.usefulness_band} | ${c.quote.slice(0, 110).replace(/\|/g, "\\|")} |`,
        ),
        "",
      );
    }
    if (bogusResolutions.length > 0) {
      lines.push(
        "## Resolutions that did not hold up",
        "",
        "Each of these claimed a destination or a piece of evidence that is not there.",
        "The claim it covered has gone back to being a cut.",
        "",
        ...bogusResolutions.map((problem) => `- ${problem}`),
        "",
      );
    }
    lines.push(
      "## Relocated (verified)",
      "",
      relocatedCuts.length === 0
        ? "_None._"
        : [
            "| ID | Was in | Now in | Verified by |",
            "|----|--------|--------|-------------|",
            ...relocatedCuts.map((c) => {
              const entry = relocated.get(c.id);
              return `| ${c.id} | \`${c.source}\` | \`${entry.to}\` | "${entry.contains}" |`;
            }),
          ].join("\n"),
      "",
      "## Corrected (deleted because false)",
      "",
      correctedCuts.length === 0
        ? "_None._"
        : [
            "| ID | Was in | Why | Evidence |",
            "|----|--------|-----|----------|",
            ...correctedCuts.map((c) => {
              const entry = corrected.get(c.id);
              return `| ${c.id} | \`${c.source}\` | ${entry.why} | \`${entry.evidence}\` |`;
            }),
          ].join("\n"),
      "",
    );
    lines.push("## All cuts", "");
    if (stillCut.length === 0) {
      lines.push("_None._", "");
    } else {
      lines.push(
        "| ID | Tier | Was in | Redundancy | Usefulness | Best match | Quote |",
        "|----|------|--------|------------|------------|-----------|-------|",
        ...stillCut.map(
          (c) =>
            `| ${c.id} | ${c.tier} | \`${c.source}\` | ${c.redundancy_band} | ${c.usefulness_band} | \`${c.best_match ?? "—"}\` (${c.score}) | ${c.quote.slice(0, 110).replace(/\|/g, "\\|")} |`,
        ),
        "",
      );
    }
    writeFileSync(reportPath, `${lines.join("\n")}\n`);
    summary.report = reportPath;
  }

  console.log(JSON.stringify(summary, null, 2));
  for (const problem of bogusResolutions) console.log(`  bogus resolution — ${problem}`);
  return summary.gate === "PASS" ? 0 : 1;
}

/* ───────────────────────────────── the run ─────────────────────────────── */

const runDir = flag("--run-dir");
const diffLedger = flag("--diff");

if (diffLedger) {
  process.exit(diff(resolve(diffLedger), resolve(flag("--against", ".")), flag("--report")));
} else if (runDir) {
  process.exit(snapshot(resolve(runDir), resolve(flag("--out", "claim-ledger.json"))));
} else {
  console.error(
    "usage:\n" +
      "  claim-ledger.mjs --run-dir <run> --out <ledger.json>\n" +
      "  claim-ledger.mjs --diff <ledger.json> --against <repo> [--report <diff.md>]",
  );
  process.exit(2);
}
