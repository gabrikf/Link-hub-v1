#!/usr/bin/env node
/**
 * PROVE THE ESLINT SENSORS STILL BITE.
 *
 * WHY THIS EXISTS, precisely. Two rules were written as checks — the
 * `src/core/` layer rule and the one-icon-family rule — and both were verified
 * firing at the time. Then the workspace `eslint.config.js` files were
 * regenerated wholesale during the repo-wide lint rollout, both blocks went
 * with them, and NOTHING said so. `npm run lint` stayed green because a rule
 * that does not exist reports nothing. `docs/harness/known-debt.md` went on
 * citing the layer sensor as the thing that found four violations, and the
 * command it told you to re-derive them with returned nothing at all.
 *
 * That is the failure mode a lint config has and a test does not: deleting a
 * test turns a suite red, deleting a rule turns a lint green. So the rules that
 * encode a written rule get a test.
 *
 * Each case below writes a file that MUST produce a named rule, and one that
 * must not, then deletes both. If a sensor stops firing this exits 1 and says
 * which one — instead of the repo quietly losing a guardrail again.
 *
 * Usage: node scripts/guardrails/lint-sensors-self-test.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

/**
 * `probe` must produce `rule`; `control` must not. The control matters as much
 * as the probe: a rule configured to fire on everything would pass the first
 * half and be useless.
 */
const CASES = [
  {
    name: "src/core must not import src/infra",
    workspace: "apps/api",
    rule: "no-restricted-imports",
    file: "src/core/zz-sensor-probe.ts",
    probe:
      'import { drizzle } from "drizzle-orm";\nexport const p = drizzle;\n',
    controlFile: "src/core/zz-sensor-control.ts",
    control: "export const p = 1;\n",
  },
  {
    name: "icons are react-icons/fi only",
    workspace: "apps/web",
    rule: "no-restricted-imports",
    file: "src/zz-sensor-probe.tsx",
    probe:
      'import { FaBeer } from "react-icons/fa6";\nexport const P = FaBeer;\n',
    controlFile: "src/zz-sensor-control.tsx",
    control:
      'import { FiUser } from "react-icons/fi";\nexport const P = FiUser;\n',
  },
  {
    name: "no explicit any",
    workspace: "apps/api",
    rule: "@typescript-eslint/no-explicit-any",
    file: "src/core/zz-any-probe.ts",
    probe: "export function p(x: any) {\n  return x;\n}\n",
    controlFile: "src/core/zz-any-control.ts",
    control: "export function p(x: unknown) {\n  return x;\n}\n",
  },
  {
    name: "sonarjs finds a real bug shape",
    workspace: "apps/mcp",
    rule: "sonarjs/no-all-duplicated-branches",
    file: "src/zz-sonar-probe.ts",
    probe:
      "export function p(flag: boolean) {\n" +
      '  if (flag) {\n    return "same";\n  } else {\n    return "same";\n  }\n}\n',
    controlFile: "src/zz-sonar-control.ts",
    control:
      'export function p(flag: boolean) {\n  return flag ? "a" : "b";\n}\n',
  },
];

function rulesFor(workspace, relativeFile) {
  const result = spawnSync(
    "npx",
    ["eslint", "--format", "json", relativeFile],
    {
      cwd: resolve(ROOT, workspace),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  try {
    return JSON.parse(String(result.stdout ?? ""))
      .flatMap((entry) => entry.messages)
      .filter((message) => message.severity === 2)
      .map((message) => message.ruleId);
  } catch {
    return null; // eslint could not run at all
  }
}

function write(workspace, relativeFile, contents) {
  const full = resolve(ROOT, workspace, relativeFile);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

function main() {
  let failures = 0;

  for (const testCase of CASES) {
    const probePath = write(testCase.workspace, testCase.file, testCase.probe);
    const controlPath = write(
      testCase.workspace,
      testCase.controlFile,
      testCase.control,
    );
    try {
      const onProbe = rulesFor(testCase.workspace, testCase.file);
      const onControl = rulesFor(testCase.workspace, testCase.controlFile);

      if (onProbe === null || onControl === null) {
        failures += 1;
        console.log(
          `  ✗ ${testCase.name} — eslint could not run in ${testCase.workspace}`,
        );
      } else if (!onProbe.includes(testCase.rule)) {
        failures += 1;
        console.log(`  ✗ ${testCase.name}`);
        console.log(
          `      expected ${testCase.rule} on the probe, got ${JSON.stringify(onProbe)}`,
        );
        console.log(
          "      the rule is not configured — it was probably lost in a config rewrite",
        );
      } else if (onControl.includes(testCase.rule)) {
        failures += 1;
        console.log(
          `  ✗ ${testCase.name} — ${testCase.rule} also fired on the CONTROL file`,
        );
        console.log(
          "      a rule that fires on correct code is worse than no rule",
        );
      } else {
        console.log(`  ✓ ${testCase.name}`);
      }
    } finally {
      rmSync(probePath, { force: true });
      rmSync(controlPath, { force: true });
    }
  }

  console.log(
    failures === 0
      ? "lint-sensors: every rule that encodes a written rule still fires."
      : `lint-sensors: ${failures} sensor(s) FAILED — a guardrail has gone silent.`,
  );
  return failures === 0 ? 0 : 1;
}

process.exit(main());
