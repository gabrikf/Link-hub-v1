---
name: ai-match-pipeline
description: How the recruiter "AI Match %" is computed end-to-end and where to change it
metadata:
  type: project
---

The recruiter-search "AI Match %" is NOT a single model — it's a pipeline across 4 packages:

1. **Feature encoding** — `packages/schemas/src/ai/preprocessing.ts`. `toQueryCandidateFeatureVector` turns (recruiter query + candidate) into a numeric vector. `MATCH_WEIGHTS` here is the single source of truth: skills 4×, titles 2×, work history 2×, base 1×. Work history (stack + roles held) reinforces declared skills/titles (+2 each). Bump `PREPROCESSING_VERSION` on shape changes.
2. **Training** — `apps/training/src/scripts/train-model.ts` (run `npm run train:initial --workspace=training`, needs `DATABASE_URL` + dev Postgres). Trains a tiny TF.js MLP to reproduce the weighted-overlap target, writes `apps/web/public/ai-models/<v>/` + bumps `latest.json`. Synthetic blueprints (`SYNTHETIC_STACKS`) + DB rows are the "training table". Smoke test: `apps/training/src/scripts/train-model.test.ts` (perfect ≥0.90 / medium 0.35–0.75 / bad ≤0.10).
3. **Search response** — `recruiterSearchResultSchema` (schemas) + `DrizzleResumeSearchRepository` now include `workExperiences` so the worker can compare against real history.
4. **Runtime scoring** — `apps/web/src/workers/reranker.worker.ts`. Loads the model from `latest.json`, blends model score 0.5 + transparent weighted `computeAlignmentScore` 0.5 (same weights). Only scores buckets the recruiter actually expressed (no neutral-1 inflation).

**Why:** the old version had no work-history features, inconsistent weights, and an alignment score that averaged neutral 1s → everyone looked ~60%. After the rework v2 gives realistic spread (95% / 56% / 0%).

**How to apply:** change weights in ONE place (`MATCH_WEIGHTS`), then retrain so the model and display agree. After editing schemas, run `npm run build:schemas` (consumers import `dist`).
