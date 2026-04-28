/**
 * E2E tests for the recruiter search API.
 *
 * Uses Fastify's built-in `server.inject()` — the idiomatic Fastify-native
 * approach, replacing supertest. No HTTP port is used; requests run through
 * the same middleware, validation, and error-handling pipeline as production.
 *
 * Test coverage:
 *  1. Basic JD text search (chatPrompt) — fullstack React/Node.js JD
 *  2. Semantic skills + titles (no text) — filter-only path
 *  3. Structural whereQuery filters (seniority, workModel, skills)
 *  4. topK pagination
 *  5. Combined chatPrompt + whereQuery filters
 *  6. PDF attachment via multipart upload
 *  7. A different role JD (iOS/mobile) returns irrelevant candidates
 *  8. Result quality — similarity scores in descending order
 *  9. Semantic query content validation
 * 10. Response shape validation (all fields needed by the front-end model)
 * 11. Model reranking — top results score well in the TF reranker
 * 12. Error cases — unauthenticated, empty body
 *
 * Prerequisites:
 *   - PostgreSQL running with 300 seed candidates (OpenAI embeddings)
 *   - OPENAI_API_KEY configured
 *
 * JD fixtures (apps/api/src/infra/http/controllers/resume/test/):
 *   - RTR- Full Stack Engineer #2476 (1).pdf
 *   - Karina_Estrella-Senior Full Stack Engineer.pdf
 *   - Lead Fullstack Engineer (EN).pdf
 */

import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  toQueryCandidateFeatureVector,
  preprocessingConfigSchema,
  type PreprocessingConfig,
  type CandidateFeaturesInput,
} from "@repo/schemas";
import { server } from "../../../server.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// test/ → resume/ → controllers/ → http/ → infra/ → src/ → api/ → apps/ → root
const rootDir = path.resolve(__dirname, "../../../../../../../..");
const modelsDir = path.join(rootDir, "apps/web/public/ai-models");
const fixturesDir = __dirname;

// ---------------------------------------------------------------------------
// Auth helper — login as the recruiter seed user
// ---------------------------------------------------------------------------

async function loginAsRecruiter(): Promise<string> {
  const response = await server.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "recruiter.seed@linkhub.local",
      password: "12345678",
    }),
  });

  expect(response.statusCode, "Login should succeed").toBe(200);
  const body = response.json<{ accessToken: string }>();
  return body.accessToken;
}

// ---------------------------------------------------------------------------
// Multipart body builder — mirrors what the browser sends for PDF uploads
// ---------------------------------------------------------------------------

interface MultipartFile {
  fieldname: string;
  filename: string;
  mimetype: string;
  content: Buffer;
}

function buildMultipartBody(
  fields: Record<string, string>,
  files: MultipartFile[] = [],
): { boundary: string; body: Buffer } {
  const boundary = `----TestBoundary${Date.now()}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`,
      ),
    );
  }

  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.mimetype}\r\n\r\n`,
      ),
    );
    parts.push(file.content);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(parts) };
}

// ---------------------------------------------------------------------------
// TF model helpers — mirrors train-model.test.ts
// ---------------------------------------------------------------------------

async function resolveModelVersion(): Promise<string> {
  const raw = await readFile(path.join(modelsDir, "latest.json"), "utf-8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? "v1";
}

async function loadTfModel(): Promise<tf.LayersModel> {
  const version = await resolveModelVersion();
  return tf.loadLayersModel(`file://${modelsDir}/${version}/model.json`);
}

async function loadPreprocessing(): Promise<PreprocessingConfig> {
  const version = await resolveModelVersion();
  const raw = await readFile(
    path.join(modelsDir, `${version}/preprocessing.json`),
    "utf-8",
  );
  return preprocessingConfigSchema.parse(JSON.parse(raw));
}

function modelScore(
  model: tf.LayersModel,
  preprocessing: PreprocessingConfig,
  queryText: string,
  candidate: CandidateFeaturesInput,
): number {
  const vector = toQueryCandidateFeatureVector(
    { queryText, candidate },
    preprocessing,
  );
  const tensor = tf.tensor2d([vector]);
  const output = model.predict(tensor) as tf.Tensor;
  const score = (output.dataSync() as Float32Array)[0] ?? 0;
  tensor.dispose();
  output.dispose();
  return score;
}

// ---------------------------------------------------------------------------
// Search response types
// ---------------------------------------------------------------------------

interface SearchCandidate {
  userId: string;
  resumeId: string;
  username: string;
  name: string;
  email: string;
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  location: string | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  skills: string[];
  titles: string[];
  similarity: number;
  combinedText: string;
}

interface SearchResponse {
  input: {
    semanticQuery: string;
    filters: Record<string, unknown>;
    semanticSkills?: string[];
    semanticTitles?: string[];
  };
  candidates: SearchCandidate[];
}

// ---------------------------------------------------------------------------
// JD fixtures
// ---------------------------------------------------------------------------

/**
 * Inline JD text for the "Lead Fullstack Engineer" role —
 * used when testing JSON body (chatPrompt field).
 */
const LEAD_FULLSTACK_JD = `
Lead Fullstack Engineer

We are looking for an experienced Lead Fullstack Engineer to join our remote team.

Requirements:
- 6+ years of experience in full-stack development
- Strong expertise in React, TypeScript, and Node.js
- Experience with PostgreSQL and REST API design
- Familiarity with Docker, CI/CD pipelines, and cloud platforms (AWS or similar)
- Experience leading small engineering teams is a plus
- Excellent communication skills

Nice to have:
- Experience with Next.js or similar SSR frameworks
- Knowledge of microservices and event-driven architecture
- Background in agile/scrum methodologies
`.trim();

/**
 * Inline JD text mirroring RTR-2476 Full Stack Engineer role.
 */
const RTR_FULLSTACK_JD = `
Position: Full Stack Engineer #2476

We need a Mid/Senior Full Stack Engineer for a product team.

Technical Requirements:
- React.js (functional components, hooks, Context API)
- Node.js REST API development with Express or Fastify
- TypeScript proficiency
- PostgreSQL database design and optimization
- Git workflow (pull requests, code review)

Desired:
- Redis caching experience
- Experience with cloud infrastructure (AWS preferred)
- GraphQL knowledge a plus

Contract: Full-time, remote friendly
Seniority: Mid to Senior (4-7 years experience)
`.trim();

/**
 * iOS/Mobile JD — results should NOT overlap with React/Node.js fullstack results.
 */
const IOS_ENGINEER_JD = `
Senior iOS Engineer

We need an experienced iOS developer to join our native mobile team.

Requirements:
- 5+ years building native iOS applications
- Swift and SwiftUI expertise
- Xcode, Core Data, and CocoaPods
- Experience with UIKit and AppKit
- Knowledge of App Store submission and review processes
- REST API integration from iOS

Nice to have:
- Objective-C maintenance experience
- SwiftUI animations
- MVVM architecture pattern
`.trim();

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe(
  "Recruiter Search API — POST /resumes/search",
  { timeout: 60_000 },
  () => {
    let token: string;
    let tfModel: tf.LayersModel;
    let preprocessing: PreprocessingConfig;

    beforeAll(async () => {
      await server.ready();

      [token, tfModel, preprocessing] = await Promise.all([
        loginAsRecruiter(),
        loadTfModel(),
        loadPreprocessing(),
      ]);
    }, 90_000);

    afterAll(async () => {
      await server.close();
      tf.dispose(tfModel);
    });

    // -------------------------------------------------------------------------
    // 1. Basic fullstack JD search via chatPrompt
    // -------------------------------------------------------------------------

    it("returns relevant React/Node.js candidates for a fullstack chatPrompt JD", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: LEAD_FULLSTACK_JD,
          topK: 10,
        }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<SearchResponse>();

      // Response shape
      expect(body.input.semanticQuery).toBeTruthy();
      expect(body.input.filters).toBeDefined();
      expect(Array.isArray(body.candidates)).toBe(true);

      // At least some results
      expect(body.candidates.length).toBeGreaterThan(0);
      expect(body.candidates.length).toBeLessThanOrEqual(10);

      // All similarity scores must be positive (above our 0.1 threshold)
      for (const candidate of body.candidates) {
        expect(candidate.similarity).toBeGreaterThan(0);
      }

      // Scores should be in descending order
      for (let i = 1; i < body.candidates.length; i++) {
        expect(body.candidates[i - 1]!.similarity).toBeGreaterThanOrEqual(
          body.candidates[i]!.similarity,
        );
      }

      // Top results should contain fullstack-related skills or titles
      const topThree = body.candidates.slice(
        0,
        Math.min(3, body.candidates.length),
      );
      const fullstackKeywords = [
        "react",
        "node",
        "typescript",
        "javascript",
        "fullstack",
        "full stack",
        "software engineer",
        "postgresql",
      ];

      const hasRelevantMatch = topThree.some((c) => {
        const candidateText = [
          c.headlineTitle ?? "",
          c.summary ?? "",
          ...c.skills,
          ...c.titles,
        ]
          .join(" ")
          .toLowerCase();
        return fullstackKeywords.some((kw) => candidateText.includes(kw));
      });

      expect(
        hasRelevantMatch,
        `Top 3 candidates should contain at least one fullstack keyword. Got: ${topThree.map((c) => c.headlineTitle).join(", ")}`,
      ).toBe(true);
    });

    // -------------------------------------------------------------------------
    // 2. Semantic skills + titles only (no text)
    // -------------------------------------------------------------------------

    it("returns candidates when searching by semanticSkills and semanticTitles only", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          semanticSkills: ["React", "Node.js", "TypeScript"],
          semanticTitles: ["Fullstack Engineer", "Software Engineer"],
          topK: 10,
        }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<SearchResponse>();

      expect(body.input.semanticQuery).toBeTruthy();
      // The semantic query should reference the skills/titles we provided
      const lowerQuery = body.input.semanticQuery.toLowerCase();
      expect(
        lowerQuery.includes("react") ||
          lowerQuery.includes("node") ||
          lowerQuery.includes("typescript") ||
          lowerQuery.includes("skills") ||
          lowerQuery.includes("titles"),
      ).toBe(true);

      expect(body.candidates.length).toBeGreaterThan(0);

      // Candidates must have at least one skill overlap with our semantic skills
      const requestedSkills = new Set(
        ["React", "Node.js", "TypeScript"].map((s) => s.toLowerCase()),
      );
      const hasSkillOverlap = body.candidates.some((c) =>
        c.skills.some((s) => requestedSkills.has(s.toLowerCase())),
      );
      expect(
        hasSkillOverlap,
        "At least one candidate should have React, Node.js, or TypeScript",
      ).toBe(true);
    });

    // -------------------------------------------------------------------------
    // 3. whereQuery structural filters
    // -------------------------------------------------------------------------

    it("returns only senior remote candidates when whereQuery filters are applied", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: "Fullstack engineer with Node.js experience",
          topK: 20,
          whereQuery: {
            seniorityLevels: ["senior"],
            workModels: ["remote"],
          },
        }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<SearchResponse>();

      // All returned candidates must match active filters
      for (const candidate of body.candidates) {
        expect(
          candidate.seniorityLevel,
          `${candidate.name} should be senior`,
        ).toBe("senior");
        expect(candidate.workModel, `${candidate.name} should be remote`).toBe(
          "remote",
        );
      }
    });

    it("returns only candidates with required skills when skills filter is applied", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: "Backend engineer",
          topK: 15,
          whereQuery: {
            skills: ["TypeScript"],
          },
        }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<SearchResponse>();

      // Every returned candidate must have TypeScript in their skills
      for (const candidate of body.candidates) {
        const normalizedSkills = candidate.skills.map((s) => s.toLowerCase());
        expect(
          normalizedSkills.some((s) => s.includes("typescript")),
          `${candidate.name} should have TypeScript. Has: ${candidate.skills.join(", ")}`,
        ).toBe(true);
      }
    });

    it("returns candidates with minimum years of experience when filter is applied", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: "Senior backend engineer",
          topK: 10,
          whereQuery: {
            minYearsExperience: 7,
          },
        }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<SearchResponse>();

      for (const candidate of body.candidates) {
        if (candidate.totalYearsExperience !== null) {
          expect(
            candidate.totalYearsExperience,
            `${candidate.name} should have ≥7 years`,
          ).toBeGreaterThanOrEqual(7);
        }
      }
    });

    // -------------------------------------------------------------------------
    // 4. topK pagination
    // -------------------------------------------------------------------------

    it("respects the topK parameter — returns at most N candidates", async () => {
      for (const topK of [1, 3, 5]) {
        const response = await server.inject({
          method: "POST",
          url: "/resumes/search",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            chatPrompt: "Fullstack engineer React Node.js",
            topK,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<SearchResponse>();
        expect(body.candidates.length).toBeLessThanOrEqual(topK);
      }
    });

    // -------------------------------------------------------------------------
    // 5. Combined chatPrompt + whereQuery filters
    // -------------------------------------------------------------------------

    it("combines semantic search with structural filters correctly", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: RTR_FULLSTACK_JD,
          topK: 10,
          whereQuery: {
            seniorityLevels: ["mid", "senior"],
            workModels: ["remote", "hybrid"],
          },
        }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<SearchResponse>();

      expect(body.candidates.length).toBeGreaterThan(0);

      // All candidates must satisfy the hard filters
      for (const candidate of body.candidates) {
        expect(
          ["mid", "senior"].includes(candidate.seniorityLevel ?? ""),
          `${candidate.name} seniority ${candidate.seniorityLevel} should be mid or senior`,
        ).toBe(true);
        expect(
          ["remote", "hybrid"].includes(candidate.workModel ?? ""),
          `${candidate.name} workModel ${candidate.workModel} should be remote or hybrid`,
        ).toBe(true);
      }
    });

    // -------------------------------------------------------------------------
    // 6. PDF attachment multipart upload
    // -------------------------------------------------------------------------

    it("searches with a PDF job description uploaded as a multipart attachment", async () => {
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await readFile(
          path.join(fixturesDir, "Lead Fullstack Engineer (EN).pdf"),
        );
      } catch {
        console.warn("PDF fixture not found — skipping PDF attachment test");
        return;
      }

      const { boundary, body } = buildMultipartBody({ topK: "5" }, [
        {
          fieldname: "attachment",
          filename: "Lead Fullstack Engineer (EN).pdf",
          mimetype: "application/pdf",
          content: pdfBuffer,
        },
      ]);

      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);

      const result = response.json<SearchResponse>();

      // The semantic query should be non-empty (derived from PDF text)
      expect(result.input.semanticQuery.length).toBeGreaterThan(0);
      // PDF might parse to short/empty text if image-based; only assert candidates if query was substantial
      if (result.input.semanticQuery.length > 20) {
        expect(result.candidates.length).toBeGreaterThan(0);
      }
    });

    it("searches using the RTR PDF attachment", async () => {
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await readFile(
          path.join(fixturesDir, "RTR- Full Stack Engineer #2476 (1).pdf"),
        );
      } catch {
        console.warn("RTR PDF fixture not found — skipping");
        return;
      }

      const { boundary, body } = buildMultipartBody({ topK: "10" }, [
        {
          fieldname: "attachment",
          filename: "RTR- Full Stack Engineer #2476 (1).pdf",
          mimetype: "application/pdf",
          content: pdfBuffer,
        },
      ]);

      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);

      const result = response.json<SearchResponse>();
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.length).toBeLessThanOrEqual(10);

      console.log(
        `  RTR PDF search returned ${result.candidates.length} candidates`,
      );
      result.candidates.slice(0, 3).forEach((c, i) => {
        console.log(
          `  ${i + 1}. ${c.headlineTitle} — sim=${c.similarity.toFixed(4)} — ${c.skills.slice(0, 4).join(", ")}`,
        );
      });
    });

    // -------------------------------------------------------------------------
    // 7. Different role — iOS search should NOT return fullstack candidates
    // -------------------------------------------------------------------------

    it("iOS JD search returns mobile candidates, not fullstack candidates", async () => {
      const [iosResponse, fullstackResponse] = await Promise.all([
        server.inject({
          method: "POST",
          url: "/resumes/search",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ chatPrompt: IOS_ENGINEER_JD, topK: 5 }),
        }),
        server.inject({
          method: "POST",
          url: "/resumes/search",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ chatPrompt: LEAD_FULLSTACK_JD, topK: 5 }),
        }),
      ]);

      expect(iosResponse.statusCode).toBe(200);
      expect(fullstackResponse.statusCode).toBe(200);

      const iosBody = iosResponse.json<SearchResponse>();
      const fullstackBody = fullstackResponse.json<SearchResponse>();

      if (
        iosBody.candidates.length === 0 ||
        fullstackBody.candidates.length === 0
      ) {
        console.warn(
          "Skipping iOS vs fullstack overlap check — insufficient candidates",
        );
        return;
      }

      // The two result sets should not be identical (different queries → different ordering)
      const iosIds = new Set(iosBody.candidates.map((c) => c.userId));
      const fullstackIds = new Set(
        fullstackBody.candidates.map((c) => c.userId),
      );

      const overlapSize = [...iosIds].filter((id) =>
        fullstackIds.has(id),
      ).length;
      const overlapRatio =
        overlapSize / Math.max(iosIds.size, fullstackIds.size);

      // Results from iOS and fullstack queries should differ significantly
      expect(
        overlapRatio,
        `iOS and fullstack searches should have <80% candidate overlap but got ${(overlapRatio * 100).toFixed(0)}%`,
      ).toBeLessThan(0.8);

      // iOS top result should contain iOS-related keywords
      const iosKeywords = [
        "swift",
        "ios",
        "mobile",
        "xcode",
        "swiftui",
        "objective",
        "apple",
      ];
      const topIosCandidate = iosBody.candidates[0];
      if (topIosCandidate) {
        const candidateText = [
          topIosCandidate.headlineTitle ?? "",
          topIosCandidate.summary ?? "",
          ...topIosCandidate.skills,
          ...topIosCandidate.titles,
        ]
          .join(" ")
          .toLowerCase();

        const hasIosKeyword = iosKeywords.some((kw) =>
          candidateText.includes(kw),
        );
        expect(
          hasIosKeyword,
          `Top iOS candidate should have iOS-related keywords. Got: ${topIosCandidate.headlineTitle} | skills: ${topIosCandidate.skills.slice(0, 5).join(", ")}`,
        ).toBe(true);
      }
    });

    // -------------------------------------------------------------------------
    // 8. Result ordering — similarity scores in descending order
    // -------------------------------------------------------------------------

    it("returns all candidates with similarity scores in descending order", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: "Senior backend Node.js engineer with PostgreSQL",
          topK: 20,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      const scores = body.candidates.map((c) => c.similarity);

      for (let i = 1; i < scores.length; i++) {
        expect(
          scores[i - 1]!,
          `Score at position ${i - 1} (${scores[i - 1]?.toFixed(4)}) should be ≥ position ${i} (${scores[i]?.toFixed(4)})`,
        ).toBeGreaterThanOrEqual(scores[i]! - 0.00001); // tiny epsilon for float precision
      }
    });

    // -------------------------------------------------------------------------
    // 9. Semantic query content validation
    // -------------------------------------------------------------------------

    it("generates a semantic query containing relevant terms for a fullstack search", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: LEAD_FULLSTACK_JD,
          topK: 1,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      const lowerQuery = body.input.semanticQuery.toLowerCase();

      // The semantic query must be meaningful, not just a passthrough of the raw prompt
      expect(lowerQuery.length).toBeGreaterThan(10);

      // Should reference core fullstack technologies
      const expectedTerms = [
        "react",
        "node",
        "typescript",
        "fullstack",
        "engineer",
      ];
      const foundTerms = expectedTerms.filter((term) =>
        lowerQuery.includes(term),
      );
      expect(
        foundTerms.length,
        `Semantic query should contain at least 2 of: ${expectedTerms.join(", ")}. Found: ${foundTerms.join(", ")}. Query: "${body.input.semanticQuery.slice(0, 200)}"`,
      ).toBeGreaterThanOrEqual(2);
    });

    it("generates a semantic query from semanticSkills + semanticTitles without text input", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          semanticSkills: ["Python", "FastAPI", "PostgreSQL"],
          semanticTitles: ["Backend Engineer"],
          topK: 1,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      const lowerQuery = body.input.semanticQuery.toLowerCase();
      expect(
        lowerQuery.includes("python") ||
          lowerQuery.includes("fastapi") ||
          lowerQuery.includes("postgresql") ||
          lowerQuery.includes("backend") ||
          lowerQuery.includes("skills") ||
          lowerQuery.includes("titles"),
      ).toBe(true);
    });

    // -------------------------------------------------------------------------
    // 10. Response shape — all fields needed by front-end model are present
    // -------------------------------------------------------------------------

    it("returns all fields required by the front-end reranker model", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: "React developer TypeScript",
          topK: 5,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      expect(body.input.semanticQuery).toBeTypeOf("string");
      expect(body.input.filters).toBeTypeOf("object");

      for (const c of body.candidates) {
        // Identity fields
        expect(c.userId).toBeTypeOf("string");
        expect(c.resumeId).toBeTypeOf("string");
        expect(c.username).toBeTypeOf("string");
        expect(c.email).toBeTypeOf("string");

        // Fields used by toQueryCandidateFeatureVector
        expect(c.skills).toBeInstanceOf(Array);
        expect(c.titles).toBeInstanceOf(Array);
        expect(c.spokenLanguages).toBeInstanceOf(Array);
        expect(c.openToRelocation).toBeTypeOf("boolean");
        expect(c.similarity).toBeTypeOf("number");

        // combinedText field (used for query token coverage)
        expect(c.combinedText).toBeTypeOf("string");
        expect(c.combinedText.length).toBeGreaterThan(0);
      }
    });

    // -------------------------------------------------------------------------
    // 11. Model reranking — TF reranker scores top candidates well
    // -------------------------------------------------------------------------

    it("top candidates for a fullstack search score ≥ 0.2 in the TF reranker", async () => {
      // Use the same query structure that train-model.test.ts uses
      const query = [
        "Role: Fullstack Engineer",
        "Seniority: Mid, 4+ years",
        "Core Skills: React, Node.js, TypeScript, PostgreSQL",
        "Titles: Fullstack Engineer, Software Engineer",
        "Work Model: Remote",
      ].join("\n");

      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatPrompt: query, topK: 10 }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      if (body.candidates.length === 0) {
        console.warn("No candidates returned — skipping model reranking test");
        return;
      }

      const scores: number[] = [];

      for (const c of body.candidates) {
        const candidateInput: CandidateFeaturesInput = {
          headlineTitle: c.headlineTitle,
          summary: c.summary,
          totalYearsExperience: c.totalYearsExperience,
          seniorityLevel: c.seniorityLevel,
          workModel: c.workModel,
          contractType: c.contractType,
          location: c.location,
          spokenLanguages: c.spokenLanguages,
          noticePeriod: c.noticePeriod,
          openToRelocation: c.openToRelocation,
          salaryExpectationMin: c.salaryExpectationMin,
          salaryExpectationMax: c.salaryExpectationMax,
          skills: c.skills,
          titles: c.titles,
        };

        const score = modelScore(tfModel, preprocessing, query, candidateInput);
        scores.push(score);
        console.log(
          `  ${c.headlineTitle?.slice(0, 40).padEnd(40)} sim=${c.similarity.toFixed(3)} model=${(score * 100).toFixed(1)}%`,
        );
      }

      // The best model score among top vector-search results should be reasonable
      const maxScore = Math.max(...scores);
      expect(
        maxScore,
        `Best model score among ${body.candidates.length} candidates should be ≥ 0.2. Got max: ${maxScore.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(0.2);
    });

    it("re-ranks candidates — model score of React/Node.js expert exceeds unrelated candidates", async () => {
      const query = "React Node.js TypeScript fullstack engineer";

      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatPrompt: query, topK: 10 }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      if (body.candidates.length < 2) {
        console.warn("Fewer than 2 candidates — skipping re-rank comparison");
        return;
      }

      const scoredCandidates = body.candidates.map((c) => {
        const candidateInput: CandidateFeaturesInput = {
          headlineTitle: c.headlineTitle,
          summary: c.summary,
          totalYearsExperience: c.totalYearsExperience,
          seniorityLevel: c.seniorityLevel,
          workModel: c.workModel,
          contractType: c.contractType,
          location: c.location,
          spokenLanguages: c.spokenLanguages,
          noticePeriod: c.noticePeriod,
          openToRelocation: c.openToRelocation,
          salaryExpectationMin: c.salaryExpectationMin,
          salaryExpectationMax: c.salaryExpectationMax,
          skills: c.skills,
          titles: c.titles,
        };
        return {
          ...c,
          modelScore: modelScore(tfModel, preprocessing, query, candidateInput),
        };
      });

      // Candidates with React or Node.js should score higher than those without
      const withReactNode = scoredCandidates.filter((c) =>
        c.skills.some((s) =>
          ["react", "node.js", "nodejs"].includes(s.toLowerCase()),
        ),
      );
      const withoutReactNode = scoredCandidates.filter(
        (c) =>
          !c.skills.some((s) =>
            ["react", "node.js", "nodejs"].includes(s.toLowerCase()),
          ),
      );

      if (withReactNode.length > 0 && withoutReactNode.length > 0) {
        const avgWithReactNode =
          withReactNode.reduce((sum, c) => sum + c.modelScore, 0) /
          withReactNode.length;
        const avgWithoutReactNode =
          withoutReactNode.reduce((sum, c) => sum + c.modelScore, 0) /
          withoutReactNode.length;

        console.log(
          `  Avg model score — with React/Node: ${(avgWithReactNode * 100).toFixed(1)}% | without: ${(avgWithoutReactNode * 100).toFixed(1)}%`,
        );

        expect(
          avgWithReactNode,
          "Candidates with React/Node.js should score higher on average than those without",
        ).toBeGreaterThan(avgWithoutReactNode);
      }
    });

    // -------------------------------------------------------------------------
    // 12. Error cases
    // -------------------------------------------------------------------------

    it("returns 401 when the Authorization header is missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatPrompt: "React developer" }),
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 when body is completely empty (no search input)", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when chatPrompt is whitespace-only (empty after trim)", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatPrompt: "   " }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when filter year range is invalid (min > max)", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: "React developer",
          whereQuery: {
            minYearsExperience: 10,
            maxYearsExperience: 3,
          },
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    // -------------------------------------------------------------------------
    // 13. Minimum similarity threshold filter (no low-quality noise)
    // -------------------------------------------------------------------------

    it("does not return candidates with very low similarity (below threshold)", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/resumes/search",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatPrompt: LEAD_FULLSTACK_JD,
          topK: 50,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SearchResponse>();

      const minSimilarity = Number(process.env.SEARCH_MIN_SIMILARITY ?? "0.1");

      for (const c of body.candidates) {
        expect(
          c.similarity,
          `Candidate ${c.name} has similarity ${c.similarity} which is below threshold ${minSimilarity}`,
        ).toBeGreaterThanOrEqual(minSimilarity - 0.001); // small epsilon for float rounding
      }
    });
  },
);
