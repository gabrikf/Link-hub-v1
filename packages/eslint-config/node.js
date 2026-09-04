import globals from "globals";
import nodePlugin from "eslint-plugin-n";
import { config as baseConfig } from "./base.js";

/**
 * For the workspaces that run on Node: api, mcp, extractor, training, schemas.
 *
 * `eslint-plugin-n` catches the Node-specific mistakes a type-checker does not:
 * importing a builtin that does not exist on the declared engine, a deprecated
 * API, a `require` in an ESM file. This repo is Node 22 ESM throughout, and the
 * engine is read from each workspace's own `package.json`.
 *
 * `n/no-missing-import` is OFF: it does not resolve TypeScript path aliases or
 * the `.js`-extension-on-`.ts`-source convention NodeNext requires, so it fires
 * on every correct import in the repo. `tsc` already proves imports resolve.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  nodePlugin.configs["flat/recommended-module"],
  {
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2023,
      sourceType: "module",
    },
    /**
     * Declared once here rather than per workspace. Without it the plugin
     * assumes a very old Node and reports 30 "unsupported feature" errors for
     * things this repo has used since day one — `node:` builtins, top-level
     * await, `structuredClone`. The repo is Node 22 (`.nvmrc`, the CI matrix,
     * and every Dockerfile agree).
     */
    settings: { n: { version: ">=22.0.0" } },
    rules: {
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",
      /**
       * OFF because it is wrong here. It reports the global `crypto` as
       * "experimental until Node 23"; `crypto.randomUUID()` has been stable
       * since Node 19 and works on the Node 22 this repo pins — verified by
       * running it. The rule's other checks are worth little once its loudest
       * one is a false positive, and `tsc` with @types/node covers the rest.
       */
      "n/no-unsupported-features/node-builtins": "off",
      /**
       * A `process.exit()` in a request path kills the server mid-response.
       * Legitimate in a CLI entry point, which is why the scripts and bin
       * globs turn it back off.
       */
      "n/no-process-exit": "error",
    },
  },
  {
    files: [
      "**/bin/**",
      "**/scripts/**",
      "**/*.cli.ts",
      "**/run-*.ts",
      "**/main.ts",
      "**/index.ts",
    ],
    rules: { "n/no-process-exit": "off" },
  },
];
