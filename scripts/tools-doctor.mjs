#!/usr/bin/env node
/**
 * tools:doctor — is this machine set up to run the workflow skills?
 *
 * Every check prints `OK <name>` or `FIX <name>: <exact command>`. It never
 * prints a secret value, only whether a variable is set. It **always exits 0**,
 * so it stays something you run casually rather than a gate you learn to skip.
 *
 * The fixes it names are collected in one place:
 * docs/harness/agent-harness.md, under "Set up once".
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (name, note = "") => results.push(["OK", name, note]);
const fix = (name, command) => results.push(["FIX", name, command]);
const skip = (name, why) => results.push(["--", name, why]);

/** Never throws, never inherits stdio: a doctor that crashes diagnoses nothing. */
function tryRun(command, args) {
  const r = spawnSync(command, args, { encoding: "utf8", shell: false });
  if (r.error) return { ok: false, out: String(r.error.message) };
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function onPath(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  return tryRun(probe, [command]).ok;
}

const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok("node", `v${process.versions.node}`);
else fix("node", "install Node 22 (nvm install 22 && nvm use 22)");

const npm = tryRun("npm", ["--version"]);
if (npm.ok) ok("npm", `v${npm.out.trim()}`);
else fix("npm", "install npm (it ships with Node)");

if (existsSync(join(ROOT, "node_modules"))) ok("node_modules", "installed");
else fix("node_modules", "npm ci");

const schemasDist = join(ROOT, "packages/schemas/dist");
if (existsSync(schemasDist)) ok("@repo/schemas", "built");
else fix("@repo/schemas", "npm run build:schemas");

for (const hook of ["pre-commit", "pre-push"]) {
  if (existsSync(join(ROOT, ".husky", hook))) ok(`husky ${hook}`, "installed");
  else fix(`husky ${hook}`, "npm run prepare");
}

if (!onPath("gh")) fix("gh", "install the GitHub CLI, then: gh auth login");
else if (tryRun("gh", ["auth", "status"]).ok) ok("gh", "authenticated");
else fix("gh", "gh auth login");

if (!onPath("coderabbit"))
  skip("coderabbit", "not installed — the review step will skip");
else if (tryRun("coderabbit", ["auth", "status"]).ok)
  ok("coderabbit", "authenticated");
else fix("coderabbit", "coderabbit auth login");

// By name only: whether it is set, never what it is.
const named = ["LINEAR_API_KEY", "CODERABBIT_API_KEY", "OPENAI_API_KEY"];
for (const name of named) {
  if (process.env[name]) ok(name, "set");
  else skip(name, "not set — the steps that need it will say so and skip");
}

const mcpPath = join(ROOT, ".mcp.json");
if (existsSync(mcpPath)) {
  const raw = readFileSync(mcpPath, "utf8");
  const servers = Object.keys(JSON.parse(raw).mcpServers ?? {});
  ok(".mcp.json", `${servers.length} server(s): ${servers.join(", ")}`);
  for (const varName of new Set(
    [...raw.matchAll(/\$\{([A-Z0-9_]+)/g)].map((m) => m[1]),
  )) {
    if (process.env[varName]) ok(`  ${varName}`, "set");
    else
      skip(
        `  ${varName}`,
        ".mcp.json expects it; unset, so that server will fail",
      );
  }
} else skip(".mcp.json", "absent");

if (process.platform === "win32" && !onPath("bash")) {
  skip("db services", "db-manage.sh needs bash — use Git Bash or WSL");
} else if (!onPath("bash")) {
  skip("db services", "bash not found; run db-manage.sh yourself");
} else if (tryRun("bash", [join(ROOT, "db-manage.sh"), "status"]).ok) {
  ok("db services", "db-manage.sh status answered");
} else {
  fix("db services", "bash db-manage.sh start");
}

// A port that answers is not proof this app answers — see the nightly run that
// produced eight hours of signal about somebody else's code.
const PORT_PROBE =
  'const s=require("net").connect(P,"127.0.0.1");s.setTimeout(700);' +
  's.on("connect",()=>{s.destroy();process.exit(0)});' +
  's.on("error",()=>process.exit(1));s.on("timeout",()=>{s.destroy();process.exit(1)});';

for (const [port, what] of [
  [3333, "api"],
  [5173, "web"],
]) {
  const probe = spawnSync(process.execPath, [
    "-e",
    PORT_PROBE.replaceAll("P,", `${port},`),
  ]);
  if (probe.status !== 0) ok(`port ${port}`, `free (${what})`);
  else
    fix(
      `port ${port}`,
      `something already answers — confirm it is CraftHub's ${what} before ` +
        `trusting any browser, e2e or API result`,
    );
}

const width = Math.max(...results.map(([, name]) => name.length));
console.log("");
for (const [status, name, note] of results) {
  console.log(`${status.padEnd(3)} ${name.padEnd(width)}  ${note}`);
}
const broken = results.filter(([s]) => s === "FIX").length;
console.log("");
console.log(
  broken === 0
    ? "tools:doctor — nothing to fix."
    : `tools:doctor — ${broken} to fix. Each FIX line is the exact command.\n` +
        `   Context: docs/harness/agent-harness.md, "Set up once".`,
);
process.exit(0);
