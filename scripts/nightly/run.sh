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
# Mechanical phases do not need the expensive model. On a Claude subscription
# the binding constraint is the PLAN's usage limit, not dollars, so spending
# Opus on "run these commands and write down the output" is how a night runs
# out of allowance before it runs out of bugs. Override with --model-cheap, or
# force one model everywhere with --model-all.
MODEL_CHEAP="sonnet"
MODEL_FORCED=""
# A single unit of work should never need an hour. A run that does is stuck, and
# a stuck iteration burns budget without producing state.
ITERATION_TIMEOUT_SECONDS=3600
# Wipe .nightly/ and start a genuinely new night rather than resuming.
FRESH=0
# Opt in to per-token USD billing. Off by default: this loop is meant to run on
# a Claude subscription, and an ANTHROPIC_API_KEY sitting in the environment
# would silently bill real money for an 8-hour unattended run.
ALLOW_API_BILLING=0
# Claude plans refill on a rolling ~5-hour window. Hitting that limit is not a
# failure of the code or the loop — it is a clock. So the loop WAITS for the
# reset and resumes the same phase, instead of burning its three-strikes guard
# on three instant retries and ending the night early.
RESUME_AFTER_LIMIT=1
# Total time the loop may spend waiting across the whole run. Past this it stops
# extending the deadline, so an exhausted account cannot keep a run alive forever.
MAX_LIMIT_WAIT_HOURS=6
# How long to wait when the limit message carries no reset timestamp.
LIMIT_WAIT_FALLBACK_SECONDS=1800
# Set by run_iteration when it returns 75, read by the main loop.
LAST_LIMIT_STDOUT=""
LAST_LIMIT_STDERR=""

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

# ──────────────────────────── plan usage limits ────────────────────────────

# Claude Code reports an exhausted plan window as a usage-limit error, often
# carrying the reset moment as a unix epoch after a pipe:
#   "Claude AI usage limit reached|1755901234"
# Echoes that epoch when present, nothing when not.
limit_reset_epoch() {
  grep -hoE 'usage limit reached\|[0-9]{10,}' "$@" 2>/dev/null | head -1 | cut -d'|' -f2
}

# Distinguishes "your allowance ran out" from "the iteration failed". Only the
# former should pause the loop; treating a genuine crash as a limit would make
# the loop sleep through a real problem.
looks_like_usage_limit() {
  grep -qiE 'usage limit|rate.?limit|too many requests|429|quota exceeded' "$@" 2>/dev/null
}

# Sleeps in one-minute slices so `run.sh stop` still takes effect during a
# multi-hour wait, and so the log shows the loop is alive rather than hung.
# Returns 1 if the run was stopped mid-wait.
wait_for_reset() {
  local seconds="$1" waited=0 chunk
  while [ "$waited" -lt "$seconds" ]; do
    if [ ! -f "$PIDFILE" ]; then
      log "stop requested during the usage-limit wait — exiting"
      return 1
    fi
    chunk=60
    [ $((seconds - waited)) -lt 60 ] && chunk=$((seconds - waited))
    sleep "$chunk"
    waited=$((waited + chunk))
    if [ $((waited % 900)) -eq 0 ]; then
      log "  still waiting for the plan window: $((waited / 60))/$((seconds / 60)) min"
    fi
  done
  return 0
}

# Decides how long to wait, waits, and records it. Returns 1 to end the run.
handle_usage_limit() {
  local stdout_file="$1" stderr_file="$2"

  # REPORT needs allowance too. If we are ALREADY in REPORT and still limited,
  # routing to REPORT again would spin forever against an empty plan — so end the
  # run and leave the state files, which already hold every finding, on disk.
  local current_phase; current_phase="$($STATE_CLI get phase)"

  if [ "$RESUME_AFTER_LIMIT" -ne 1 ]; then
    if [ "$current_phase" = "REPORT" ]; then
      log "plan usage limit hit during REPORT with resume disabled — ending the run."
      return 1
    fi
    log "plan usage limit hit and --no-resume-after-limit was passed — routing to REPORT"
    $STATE_CLI set phase '"REPORT"'
    return 0
  fi

  local budget_left; budget_left="$($STATE_CLI limit-wait-budget-left)"
  if [ "${budget_left:-0}" -le 0 ]; then
    if [ "$current_phase" = "REPORT" ]; then
      log "plan usage limit hit during REPORT and the wait budget is spent — ending the run."
      log "  Everything found is already in .nightly/QUEUE.json; re-run REPORT tomorrow with:"
      log "    bash scripts/nightly/run.sh start --hours 1"
      return 1
    fi
    log "plan usage limit hit, but the ${MAX_LIMIT_WAIT_HOURS}h wait budget is spent — routing to REPORT"
    $STATE_CLI set phase '"REPORT"'
    return 0
  fi

  local epoch seconds
  epoch="$(limit_reset_epoch "$stdout_file" "$stderr_file")"
  if [ -n "$epoch" ]; then
    seconds=$(( epoch - $(date -u +%s) + 60 ))   # +60s so we do not race the reset
    log "plan usage limit hit. Reset reported for $(date -u -d "@$epoch" +%H:%M:%S)Z."
  else
    seconds="$LIMIT_WAIT_FALLBACK_SECONDS"
    log "plan usage limit hit, no reset timestamp in the response."
  fi
  [ "$seconds" -lt 60 ] && seconds=60
  # Never sleep past the remaining wait budget in one go.
  [ "$seconds" -gt "$budget_left" ] && seconds="$budget_left"

  log "waiting $((seconds / 60)) min for the plan window, then resuming phase $($STATE_CLI get phase)."
  log "  This is NOT counted as a failure and the deadline is extended by the wait."
  wait_for_reset "$seconds" || return 1
  $STATE_CLI note-limit-wait --seconds "$seconds"
  log "resuming."
  return 0
}

# ───────────────────────────── the iteration ───────────────────────────────
#
# TWO FLAGS THAT ARE NOT OPTIONAL HERE:
#
#   --strict-mcp-config  The repo's .mcp.json declares a `postgres` server run
#     via `uvx`. In print mode `claude` answers in ~2s but its stdio MCP child
#     keeps the parent process ALIVE INDEFINITELY — the API call succeeds,
#     `is_error` is false, and the process still never exits. Unbounded, that
#     turns every iteration into a full --iteration-timeout stall recorded as a
#     failure, and three of those end the night. Loading no MCP servers is the
#     price of a loop that terminates. Iterations query the database through
#     `docker exec linkhub-postgres-dev psql` instead, which is what the
#     preamble tells them to do.
#
#   </dev/null  Without it `claude` waits ~3s for stdin that a detached nohup
#     run never sends, and logs a warning on every single iteration.

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
  - NO MCP SERVERS ARE LOADED for you (--strict-mcp-config), because the repo's
    postgres MCP server keeps a print-mode process alive forever and would stall
    every iteration. AGENTS.md tells you to verify database writes through the
    postgres MCP; do it with psql instead, which is equivalent for reading:
      docker exec linkhub-postgres-dev psql -U linkhub_user -d linkhub_dev -c "SELECT ..."
    The rule behind that instruction still stands: "the endpoint returned 201"
    is not evidence. Query the row back by a correlation id you control.
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

# Reasoning phases get the strong model; bookkeeping phases get the cheap one.
# BOOTSTRAP and REGRESSION run commands and record output. HUNT, TRIAGE, FIX,
# REVIEW_FIX and REPORT are judgment.
model_for_phase() {
  if [ -n "$MODEL_FORCED" ]; then printf '%s' "$MODEL_FORCED"; return; fi
  case "$1" in
    BOOTSTRAP|REGRESSION) printf '%s' "$MODEL_CHEAP" ;;
    *) printf '%s' "$MODEL" ;;
  esac
}

run_iteration() {
  local phase="$1" iteration="$2"
  local prompt_file="$PROMPTS/${phase}.md"
  [ -f "$prompt_file" ] || { log "no prompt for phase $phase"; return 1; }

  local out="$LOGS/iter-$(printf '%04d' "$iteration")-${phase}.json"
  # Per-iteration stderr, so limit detection looks at THIS attempt rather than
  # at a shared log that still holds an earlier iteration's limit message.
  local errfile="$LOGS/iter-$(printf '%04d' "$iteration")-${phase}.stderr"
  local prompt
  prompt="$(build_preamble)$(cat "$prompt_file")"

  local phase_model; phase_model="$(model_for_phase "$phase")"
  log "iteration $iteration — phase $phase (model=$phase_model, cap=$PER_ITERATION_USD notional)"

  timeout "$ITERATION_TIMEOUT_SECONDS" "${CLAUDE_ENV[@]}" claude -p "$prompt" \
    --model "$phase_model" \
    --permission-mode bypassPermissions \
    --output-format json \
    --max-budget-usd "$PER_ITERATION_USD" \
    --effort high \
    --strict-mcp-config \
    >"$out" 2>"$errfile" </dev/null
  local code=$?
  cat "$errfile" >> "$LOGS/claude-stderr.log" 2>/dev/null || true

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
  # A usage limit is a clock, not a defect. Signal the main loop to pause and
  # retry this same phase WITHOUT closing the iteration as a failure — closing it
  # would increment consecutive_failures and end the night three retries later.
  if [ "$code" -ne 0 ] && looks_like_usage_limit "$out" "$errfile"; then
    log "iteration $iteration stopped on a PLAN USAGE LIMIT, not a code failure."
    LAST_LIMIT_STDOUT="$out"
    LAST_LIMIT_STDERR="$errfile"
    return 75
  fi

  log "iteration $iteration finished (exit=$code cost=\$$cost)"
  $STATE_CLI end-iteration --cost "$cost" --outcome "$outcome"
}

# ────────────────────────────── billing route ──────────────────────────────

# The API-billing variables are stripped from the child environment in exactly
# one place. `env -u` removes them for the child only; your shell is untouched.
#
# This is an argv PREFIX, not a shell function, and that is load-bearing:
# `timeout` is a coreutils binary and can only exec a real command, so a shell
# function between them fails with "failed to run command". `env` is a real
# binary, so `timeout N env -u FOO claude ...` works. The array is never empty —
# even when billing is permitted it degrades to a bare `env` — because under
# `set -u` an empty array expansion is itself an error on older bash.
CLAUDE_ENV=(env)

build_claude_env() {
  if [ "$ALLOW_API_BILLING" -eq 1 ]; then
    CLAUDE_ENV=(env)
  else
    CLAUDE_ENV=(env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u AWS_BEARER_TOKEN_BEDROCK)
  fi
}

# An 8-hour unattended run is exactly when you do NOT want to discover that a
# stray API key was billing per token. Refuse rather than warn.
check_billing_route() {
  if [ "$ALLOW_API_BILLING" -eq 1 ]; then
    log "  billing: --allow-api-billing passed; per-token USD billing is PERMITTED"
    return 0
  fi

  local offenders=""
  [ -n "${ANTHROPIC_API_KEY:-}" ] && offenders="$offenders ANTHROPIC_API_KEY"
  [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ] && offenders="$offenders ANTHROPIC_AUTH_TOKEN"
  [ -n "${AWS_BEARER_TOKEN_BEDROCK:-}" ] && offenders="$offenders AWS_BEARER_TOKEN_BEDROCK"
  [ -n "${CLAUDE_CODE_USE_BEDROCK:-}" ] && offenders="$offenders CLAUDE_CODE_USE_BEDROCK"
  [ -n "${CLAUDE_CODE_USE_VERTEX:-}" ] && offenders="$offenders CLAUDE_CODE_USE_VERTEX"

  if [ -n "$offenders" ]; then
    log "  billing: found$offenders in the environment — stripping them for the child process."
    log "           If you actually WANT per-token USD billing, pass --allow-api-billing."
  fi

  # A non-default base URL can route requests through a gateway that bills
  # separately, so say so rather than assuming.
  if [ -n "${ANTHROPIC_BASE_URL:-}" ] && [ "${ANTHROPIC_BASE_URL%/}" != "https://api.anthropic.com" ]; then
    log "  billing: WARNING ANTHROPIC_BASE_URL is ${ANTHROPIC_BASE_URL} — not the default endpoint."
  fi

  node "$ROOT/scripts/nightly/billing-check.mjs" || true
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

  check_billing_route

  # Probe on the cheap model: this checks auth, permissions and the billing
  # route, none of which differ by model, so there is no reason to spend the
  # expensive one on a one-word answer before the run has started.
  local probe
  probe="$(timeout 180 "${CLAUDE_ENV[@]}" claude -p 'Reply with exactly: READY. Do not use any tools.' \
    --model "$MODEL_CHEAP" \
    --permission-mode bypassPermissions \
    --output-format json \
    --max-budget-usd 1 --strict-mcp-config \
    2>>"$LOGS/claude-stderr.log" </dev/null)" || die \
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
    # A run that ran out of clock or allowance while still owing its write-up is
    # the one case worth resuming automatically: the findings are on disk and the
    # report is the deliverable. `--fresh` would archive the queue and lose them.
    if [ "$prior_phase" = "REPORT" ]; then
      log "  resuming a run that still owes its REPORT — extending the deadline by ${HOURS}h"
      $STATE_CLI set deadline_at "\"$(date -u -d "+${HOURS} hours" +%Y-%m-%dT%H:%M:%S.000Z)\""
      $STATE_CLI set guards.consecutive_failures 0
      local branch_r; branch_r="$(git rev-parse --abbrev-ref HEAD)"
      [ "$branch_r" = "nightly/qa-hardening" ] || die "expected branch nightly/qa-hardening, found '$branch_r'"
      return 0
    fi

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
  build_claude_env
  if [ "$FRESH" -eq 1 ] && [ -d "$NIGHTLY" ]; then
    local archive="$ROOT/.nightly-$(date +%Y%m%d-%H%M%S)"
    mv "$NIGHTLY" "$archive"
    mkdir -p "$LOGS"
    log "archived the previous run to $(basename "$archive")"
  fi
  preflight

  $STATE_CLI init --hours "$HOURS" --budget-usd "$BUDGET_USD" \
    --per-iteration-usd "$PER_ITERATION_USD" --max-limit-wait-hours "$MAX_LIMIT_WAIT_HOURS"
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

    local phase iteration rc
    phase="$($STATE_CLI get phase)"
    iteration="$($STATE_CLI begin-iteration)"
    run_iteration "$phase" "$iteration"
    rc=$?

    # 75 means "the plan window is empty" — wait it out and retry the SAME phase.
    # The iteration was never closed, so no failure was recorded against it.
    if [ "$rc" -eq 75 ]; then
      handle_usage_limit "$LAST_LIMIT_STDOUT" "$LAST_LIMIT_STDERR" || break
      continue
    fi
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
    --model-cheap) MODEL_CHEAP="$2"; shift 2 ;;
    --model-all) MODEL_FORCED="$2"; shift 2 ;;
    --iteration-timeout) ITERATION_TIMEOUT_SECONDS="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    --allow-api-billing) ALLOW_API_BILLING=1; shift ;;
    --no-resume-after-limit) RESUME_AFTER_LIMIT=0; shift ;;
    --max-limit-wait-hours) MAX_LIMIT_WAIT_HOURS="$2"; shift 2 ;;
    *) die "unknown option: $1" ;;
  esac
done

case "$COMMAND" in
  start) cmd_start ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  *) die "usage: run.sh start|status|stop" ;;
esac
