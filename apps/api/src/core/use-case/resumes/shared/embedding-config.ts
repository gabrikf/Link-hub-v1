/**
 * Where the embedding "space" identity is resolved from the environment.
 *
 * Model and version together define which vectors are comparable: cosine
 * distance between a `text-embedding-3-small` vector and a
 * `text-embedding-3-large` one is a number, but it is a meaningless one. Every
 * writer and every reader has to agree on this, so it is resolved in one place.
 */

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_VERSION = 1;

export function resolveEmbeddingModel(): string {
  const configured = process.env.EMBEDDING_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_EMBEDDING_MODEL;
}

/**
 * `Number(process.env.EMBEDDING_VERSION ?? "1")` was silently catastrophic
 * (defect F13): a typo like `EMBEDDING_VERSION=v2` produced `NaN`, and because
 * `NaN === NaN` is false the content-hash cache could never hit — every job
 * re-embedded every resume, at cost, forever. The `NaN` was then written into
 * an integer column. Anything that is not a finite integer falls back to the
 * default and the process is left in a defined state.
 */
export function resolveEmbeddingVersion(): number {
  const raw = process.env.EMBEDDING_VERSION;

  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_EMBEDDING_VERSION;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return DEFAULT_EMBEDDING_VERSION;
  }

  return parsed;
}

/**
 * `resume_section_embeddings.embedding_version` is a text column while
 * `resume_embeddings.embedding_version` is an integer. Same value, two column
 * types — normalise here so the two tables can never disagree about which
 * generation a candidate's vectors belong to.
 */
export function resolveEmbeddingVersionText(): string {
  return String(resolveEmbeddingVersion());
}

/**
 * Reads a numeric tunable from the environment, falling back when the value is
 * missing or not a finite number.
 *
 * Every `Number(process.env.X)` that reaches SQL is a potential production
 * outage: `IVFFLAT_PROBES=abc` interpolated into `SET LOCAL ivfflat.probes =
 * NaN` aborts the transaction and turns every single search into a 500
 * (defect F20).
 */
export function readNumericEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
