#!/usr/bin/env bash
#
# THE NIGHTLY LOOP.
#
# One unit of work per iteration, one FRESH `claude -p` process per unit.
#
# WHY A PROCESS PER ITERATION: the alternative is one long-lived agent that
# keeps the whole night in a single context. That agent degrades as its context
# fills, and it has to remember to hand off. Here the context reset is
# structural — every iteration starts empty and rebuilds what it needs from
# .nightly/STATE.json, .nightly/QUEUE.json and .nightly/MEMORY.md. A crashed
# iteration costs one unit of work, not the night.
#
# Usage:
#   bash scripts/nightly/run.sh start [--hours 8] [--budget-usd 60] [--model opus]
#   bash scripts/nightly/run.sh status
#   bash scripts/nightly/run.sh stop
#
# `start` runs in the foreground so you can watch it. To detach:
#   nohup bash scripts/nightly/run.sh start --hours 8 > .nightly/logs/run.log 2>&1 &
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

NIGHTLY="$ROOT/.nightly"
LOGS="$NIGHTLY/logs"
STATE_CLI="node $ROOT/scripts/nightly/state.mjs"
PROMPTS="$ROOT/scripts/nightly/prompts"
PIDFILE="$NIGHTLY/run.pid"

HOURS=8
BUDGET_USD=0
PER_ITERATION_USD=8
MODEL="opus"
# A single unit of work should never need an hour. A run that does is stuck, and
# a stuck iteration burns budget without producing state.
ITERATION_TIMEOUT_SECONDS=3600
# Wipe .nightly/ and start a genuinely new night rather than resuming.
FRESH=0

API_URL="http://localhost:3333"
WEB_URL="http://localhost:5173"

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "FATAL: $*"; exit 1; }

# ─────────────────────────────── services ──────────────────────────────────

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- ; }

wait_for_url() {
  local url="$1" name="$2" tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -o /dev/null --max-time 3 "$url"; then return 0; fi
    sleep 2
  done
  log "WARN: $name did not answer at $url"
  return 1
}

ensure_stack() {
  log "checking docker stack…"
  if ! docker ps --format '{{.Names}}' | grep -q linkhub-postgres-dev; then
    log "postgres is down — starting it"
    bash "$ROOT/db-manage.sh" start >>"$LOGS/stack.log" 2>&1
  fi
  # Everything type-checks against packages/schemas/dist. A tree where that is
  # stale produces errors pointing at consumers and saying nothing about the
  # real cause — the single most confusing failure in this repo.
  log "building @repo/schemas…"
  npm run build:schemas >>"$LOGS/stack.log" 2>&1 || log "WARN: build:schemas failed — see logs/stack.log"

  if ! port_open 3333; then
    log "starting api…"
    nohup npm run dev:api >>"$LOGS/api.log" 2>&1 &
    echo $! > "$NIGHTLY/api.pid"
  fi
  if ! port_open 5173; then
    log "starting web…"
    nohup npm run dev:web >>"$LOGS/web.log" 2>&1 &
    echo $! > "$NIGHTLY/web.pid"
  fi
  wait_for_url "$API_URL/docs" "api"
  wait_for_url "$WEB_URL" "web"
}

# ───────────────────────────── the iteration ───────────────────────────────

# Everything an iteration needs to rebuild its context from scratch, prepended
# to the phase prompt. Deliberately small: the phase prompt tells it what to do,
# the state files tell it what has happened, and it reads the repo for the rest.
build_preamble() {
  cat <<PREAMBLE
You are ONE ITERATION of LinkHub's autonomous nightly QA loop. You are a fresh
process with no memory of previous iterations.

REBUILD YOUR CONTEXT FIRST, in this order:
  1. cat .nightly/STATE.json      — phase, iteration, guards, counters
  2. cat .nightly/QUEUE.json      — candidates, confirmed, fixed, escalated, rejected
  3. cat .nightly/MEMORY.md       — what previous iterations learned (prose)
  4. cat AGENTS.md                — the project law. It overrides your defaults.

CURRENT STATE
$($STATE_CLI summary)

NON-NEGOTIABLE RULES FOR EVERY ITERATION
  - Do ONE unit of work, write your results to the state files, then STOP.
    Do not try to finish the whole night. The loop will start a fresh agent.
  - You are on branch nightly/qa-hardening. Never checkout, merge, rebase, or
    push. Never touch main or develop. Commit only what this iteration changed.
  - Dev servers are ALREADY RUNNING (api :3333, web :5173). Do not restart them.
  - The bar for a bug is REAL USER IMPACT. If a real user would not be hurt, it
    is not a bug — do not file it, do not fix it. Cosmetic nitpicks, style
    preferences, and refactors that risk new bugs are explicitly out of scope.
    Performance, cost, responsive breakage, request storms and needless
    re-renders DO count when they are measurable and user-visible.
  - The recorded debt in AGENTS.md ("Known debt — do not fix it as a side
    quest") is NOT a finding. Leave it.
  - There is NO i18n in this repo. Never invent t() calls or report a missing
    translation.

THE STOP HOOK
  This repo runs \`scripts/guardrails/pre-push.mjs\` on the Claude Code Stop hook,
  so the gate fires when you try to finish. That is correct for FIX, which must
  leave the tree green. For every other phase it can be WRONG: BOOTSTRAP, HUNT
  and TRIAGE deliberately leave failing tests on disk as evidence.

  If the hook blocks you over a failure your iteration did NOT cause:
    - do NOT fix it to get past the hook,
    - record it as a candidate in QUEUE.json if it is not already there,
    - write it to MEMORY.md, and stop again.
  The gate lets the third consecutive stop through with a warning. Burning those
  three attempts is the intended cost of keeping the phases honest.

BEFORE YOU STOP, you MUST:
  a. Append what you LEARNED to .nightly/MEMORY.md (append; never rewrite it).
  b. Update .nightly/QUEUE.json with any queue changes.
  c. Set the next phase:
       node scripts/nightly/state.mjs set next_phase '"<PHASE>"'
     Legal next phases are listed in your phase prompt. An illegal value is
     refused and your iteration is counted as failed.

PREAMBLE
}

run_iteration() {
  local phase="$1" iteration="$2"
  local prompt_file="$PROMPTS/${phase}.md"
  [ -f "$prompt_file" ] || { log "no prompt for phase $phase"; return 1; }

  local out="$LOGS/iter-$(printf '%04d' "$iteration")-${phase}.json"
  local prompt
  prompt="$(build_preamble)$(cat "$prompt_file")"

  log "iteration $iteration — phase $phase (model=$MODEL, cap=\$$PER_ITERATION_USD)"

  timeout "$ITERATION_TIMEOUT_SECONDS" claude -p "$prompt" \
    --model "$MODEL" \
    --permission-mode bypassPermissions \
    --output-format json \
    --max-budget-usd "$PER_ITERATION_USD" \
    --effort high \
    >"$out" 2>>"$LOGS/claude-stderr.log"
  local code=$?

  # `claude -p --output-format json` reports its own spend. Parse defensively:
  # a killed process leaves a truncated file and we still have to close the
  # iteration cleanly rather than wedging the loop.
  local cost outcome
  cost="$(node -e '
    const fs = require("node:fs");
    try {
      const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(String(payload.total_cost_usd ?? 0));
    } catch { process.stdout.write("0"); }
  ' "$out" 2>/dev/null || echo 0)"

  if [ "$code" -eq 0 ]; then outcome=ok; else outcome=fail; fi
  if [ "$code" -eq 124 ]; then log "iteration $iteration TIMED OUT after ${ITERATION_TIMEOUT_SECONDS}s"; fi

  log "iteration $iteration finished (exit=$code cost=\$$cost)"
  $STATE_CLI end-iteration --cost "$cost" --outcome "$outcome"
}

# ─────────────────────────────── preflight ─────────────────────────────────

# The failure mode this exists to kill: you start the loop at 22:00, every
# `claude -p` fails instantly for a boring reason (not logged in, a bad flag, a
# missing prompt file), the loop burns its three-strikes guard in ten seconds
# and you wake up to an empty report. Fail loudly here instead.
preflight() {
  mkdir -p "$LOGS"
  log "preflight…"

  local phase
  for phase in BOOTSTRAP HUNT TRIAGE FIX REVIEW_FIX REGRESSION REPORT; do
    [ -f "$PROMPTS/${phase}.md" ] || die "missing prompt: $PROMPTS/${phase}.md"
  done
  log "  prompts: all 7 present"

  local probe
  probe="$(timeout 180 claude -p 'Reply with exactly: READY. Do not use any tools.' \
    --model "$MODEL" \
    --permission-mode bypassPermissions \
    --output-format json \
    --max-budget-usd 1 2>>"$LOGS/claude-stderr.log")" || die \
    "the \`claude\` CLI could not complete a trivial prompt. Are you logged in? See $LOGS/claude-stderr.log"

  echo "$probe" | grep -q READY || die \
    "the \`claude\` CLI answered but not as expected — check $LOGS/claude-stderr.log. Raw: $(printf '%.200s' "$probe")"
  log "  claude CLI: responding, permissions accepted"

  # `state.mjs init` is idempotent so an interrupted run can be resumed by just
  # starting again. The trap is a STALE state: its deadline was stamped when it
  # was created, so reusing yesterday's file starts the loop already past
  # deadline and it routes straight to REPORT having done nothing.
  if [ -f "$NIGHTLY/STATE.json" ]; then
    local prior_phase prior_deadline
    prior_phase="$($STATE_CLI get phase)"
    prior_deadline="$($STATE_CLI get deadline_at)"
    if [ "$prior_phase" = "DONE" ] || [ "$(date -u +%s)" -gt "$(date -u -d "$prior_deadline" +%s)" ]; then
      die "$(printf '%s\n' \
        ".nightly/STATE.json is from a finished or expired run (phase=$prior_phase, deadline=$prior_deadline)." \
        "Resuming it would start already past deadline. Start a fresh night with:" \
        "    bash scripts/nightly/run.sh start --fresh --hours $HOURS" \
        "or keep the old run's records first:  mv .nightly .nightly-$(date +%Y%m%d-%H%M)")"
    fi
    log "  resuming an in-flight run: phase=$prior_phase deadline=$prior_deadline"
  fi

  local branch; branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "nightly/qa-hardening" ] || die \
    "expected branch nightly/qa-hardening, found '$branch'. The loop commits — refusing to run on the wrong branch."
  log "  branch: $branch"

  if [ -n "$(git status --porcelain)" ]; then
    log "  WARN: the working tree is dirty. The loop commits per fix; uncommitted work will be mixed in."
  fi
}

# ────────────────────────────── the loop ───────────────────────────────────

cmd_start() {
  mkdir -p "$LOGS"
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    die "a nightly run is already going (pid $(cat "$PIDFILE")). Stop it first."
  fi
  echo $$ > "$PIDFILE"
  trap 'log "shutting down"; rm -f "$PIDFILE"; exit 0' INT TERM

  command -v claude >/dev/null || die "the \`claude\` CLI is not on PATH"
  if [ "$FRESH" -eq 1 ] && [ -d "$NIGHTLY" ]; then
    local archive="$ROOT/.nightly-$(date +%Y%m%d-%H%M%S)"
    mv "$NIGHTLY" "$archive"
    mkdir -p "$LOGS"
    log "archived the previous run to $(basename "$archive")"
  fi
  preflight

  $STATE_CLI init --hours "$HOURS" --budget-usd "$BUDGET_USD" --per-iteration-usd "$PER_ITERATION_USD"
  ensure_stack

  log "=== nightly loop starting: ${HOURS}h, budget \$${BUDGET_USD:-unlimited}, model $MODEL ==="

  while true; do
    local verdict
    verdict="$($STATE_CLI should-continue)"
    log "$verdict"
    case "$verdict" in STOP*) break ;; esac

    # The dev servers die surprisingly often across an 8-hour run (a tsx watch
    # restart that fails to bind, an OOM). An iteration that walks a dead app
    # reports the whole product as broken, which is worse than not running.
    port_open 3333 || { log "api died — restarting"; ensure_stack; }
    port_open 5173 || { log "web died — restarting"; ensure_stack; }

    local phase iteration
    phase="$($STATE_CLI get phase)"
    iteration="$($STATE_CLI begin-iteration)"
    run_iteration "$phase" "$iteration"
  done

  log "=== nightly loop finished ==="
  $STATE_CLI summary
  rm -f "$PIDFILE"
}

cmd_status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "running (pid $(cat "$PIDFILE"))"
  else
    echo "not running"
  fi
  $STATE_CLI summary 2>/dev/null || echo "no state yet"
}

cmd_stop() {
  [ -f "$PIDFILE" ] || { echo "not running"; return 0; }
  local pid; pid="$(cat "$PIDFILE")"
  kill "$pid" 2>/dev/null && echo "signalled $pid" || echo "pid $pid was already gone"
  rm -f "$PIDFILE"
}

COMMAND="${1:-start}"; shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --hours) HOURS="$2"; shift 2 ;;
    --budget-usd) BUDGET_USD="$2"; shift 2 ;;
    --per-iteration-usd) PER_ITERATION_USD="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --iteration-timeout) ITERATION_TIMEOUT_SECONDS="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    *) die "unknown option: $1" ;;
  esac
done

case "$COMMAND" in
  start) cmd_start ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  *) die "usage: run.sh start|status|stop" ;;
esac
