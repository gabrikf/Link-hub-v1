import { describe, expect, it } from "vitest";
import {
  EXCLUDED_PATH_PATTERNS,
  inferTechnologies,
  isGeneratedOrVendored,
  MAX_TECHNOLOGIES_PER_EVENT,
  technologyForPath,
} from "./technologies.js";

/**
 * The regression these tests guard is a real one from this market: CodersRank
 * put people in the top few percent of languages they had never written,
 * because it measured the bytes in a repository instead of the lines a person
 * changed. Every case below is a file that would produce exactly that lie.
 */
describe("excluding generated and vendored content", () => {
  const mustBeExcluded = [
    // Vendored dependency trees
    "node_modules/left-pad/index.js",
    "apps/web/node_modules/react/index.js",
    "vendor/github.com/aws/aws-sdk-go/service.go",
    "third_party/protobuf/message.cc",
    "Pods/Alamofire/Source/Request.swift",
    ".venv/lib/python3.11/site-packages/requests/api.py",
    "bower_components/jquery/jquery.js",
    // Lockfiles
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "Cargo.lock",
    "Gemfile.lock",
    "poetry.lock",
    "go.sum",
    "composer.lock",
    "apps/api/package-lock.json",
    // Build output
    "dist/index.js",
    "build/main.css",
    "target/debug/thing.rs",
    "apps/web/.next/static/chunk.js",
    "coverage/lcov-report/index.html",
    // Minified / bundled
    "public/js/app.min.js",
    "public/css/site.min.css",
    "static/main.bundle.js",
    "dist/index.js.map",
    // Generated code
    "api/service.pb.go",
    "gen/proto/service_pb2.py",
    "src/schema.generated.ts",
    "lib/models.g.dart",
    "lib/models.freezed.dart",
    "Forms/MainWindow.designer.cs",
    "src/__generated__/graphql.ts",
    "src/__snapshots__/App.test.tsx.snap",
    "apps/api/drizzle/meta/0001_snapshot.json",
  ];

  it.each(mustBeExcluded)("excludes %s", (path) => {
    expect(isGeneratedOrVendored(path)).toBe(true);
    expect(technologyForPath(path)).toBeNull();
  });

  it("does not exclude ordinary source files that merely resemble the patterns", () => {
    const mustBeKept: Array<[string, string]> = [
      ["src/vendors/PaymentVendorClient.ts", "typescript"],
      ["src/distribution/router.go", "go"],
      ["src/build-tools/compile.py", "python"],
      ["app/models/user.rb", "ruby"],
      ["src/generator/template.ts", "typescript"],
      ["packages/ui/src/Button.tsx", "typescript"],
      ["Dockerfile", "docker"],
      ["Dockerfile.production", "docker"],
      ["Makefile", "make"],
      ["infra/main.tf", "terraform"],
      ["db/migrations/001_init.sql", "sql"],
    ];
    for (const [path, expected] of mustBeKept) {
      expect(isGeneratedOrVendored(path), path).toBe(false);
      expect(technologyForPath(path), path).toBe(expected);
    }
  });

  it("catches directory patterns written with Windows separators", () => {
    expect(isGeneratedOrVendored("apps\\web\\node_modules\\react\\index.js")).toBe(true);
  });

  it("gives a reason for every exclusion, so the list stays auditable", () => {
    for (const entry of EXCLUDED_PATH_PATTERNS) {
      expect(entry.why.length).toBeGreaterThan(10);
    }
  });
});

describe("inferring technologies from a changeset", () => {
  it("credits only the files the person actually wrote", () => {
    // The realistic shape of a dependency bump that also touches one source
    // file: thousands of vendored Go lines, one line of TypeScript.
    const tags = inferTechnologies([
      "package-lock.json",
      "node_modules/typescript/lib/tsc.js",
      "vendor/github.com/pkg/errors/errors.go",
      "third_party/grpc/server.py",
      "dist/bundle.min.js",
      "src/checkout.ts",
    ]);
    expect(tags).toEqual(["typescript"]);
    expect(tags).not.toContain("go");
    expect(tags).not.toContain("python");
    expect(tags).not.toContain("javascript");
  });

  it("returns nothing when a changeset is entirely generated", () => {
    expect(
      inferTechnologies(["package-lock.json", "dist/app.js", "api/x.pb.go"]),
    ).toEqual([]);
  });

  it("credits nothing for file types that say nothing about skill", () => {
    expect(inferTechnologies(["README.md", "logo.png", "data.csv", "LICENSE"])).toEqual(
      [],
    );
  });

  it("is deduplicated, sorted and capped at the schema's limit", () => {
    const tags = inferTechnologies([
      "b.py",
      "a.ts",
      "c.tsx",
      "a.py",
      "z.go",
    ]);
    expect(tags).toEqual(["go", "python", "typescript"]);

    const many = Array.from({ length: 60 }, (_, i) => `f${i}.ts`).concat(
      Object.keys({ py: 1, go: 1, rs: 1 }).map((ext) => `f.${ext}`),
    );
    expect(inferTechnologies(many).length).toBeLessThanOrEqual(
      MAX_TECHNOLOGIES_PER_EVENT,
    );
  });
});
