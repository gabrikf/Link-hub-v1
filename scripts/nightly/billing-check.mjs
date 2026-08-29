#!/usr/bin/env node
/**
 * WHICH ACCOUNT PAYS FOR THE NIGHT.
 *
 * `claude` bills one of two ways: a Claude subscription via OAuth, or per-token
 * USD via ANTHROPIC_API_KEY / Bedrock / Vertex. An 8-hour unattended loop is
 * exactly the wrong time to discover a stray API key was charging per token, so
 * the orchestrator reports the route before it spends anything.
 *
 * Exit codes: 0 = subscription auth confirmed, 1 = could not confirm.
 * The orchestrator treats 1 as a warning, not a stop — this file reports, it
 * does not decide. Stripping the API-billing variables is run.sh's job.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG = join(homedir(), ".claude.json");

if (!existsSync(CONFIG)) {
  console.log("  billing: no ~/.claude.json — cannot confirm the auth route");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch {
  console.log("  billing: ~/.claude.json is unreadable — cannot confirm the auth route");
  process.exit(1);
}

const account = config.oauthAccount;
if (!account) {
  console.log(
    "  billing: no OAuth account found — `claude` may fall back to per-token USD billing.",
  );
  console.log("           Run `claude` once interactively and sign in, then retry.");
  process.exit(1);
}

const subscription = account.billingType === "stripe_subscription";
console.log(`  billing: OAuth as ${account.emailAddress} (billingType=${account.billingType})`);

/**
 * The load-bearing field. With extra usage disabled, hitting the plan limit
 * REFUSES the request; with it enabled, the overage is charged in real dollars —
 * which for an unattended overnight fan-out is a genuinely different risk.
 */
if (account.hasExtraUsageEnabled) {
  console.log("  billing: extra usage ENABLED — overage past the plan limit IS charged in USD");
} else {
  console.log("  billing: extra usage disabled — plan limits refuse rather than bill");
}

if (!subscription) {
  console.log("  billing: WARNING this is not a subscription billing type");
  process.exit(1);
}
process.exit(0);
