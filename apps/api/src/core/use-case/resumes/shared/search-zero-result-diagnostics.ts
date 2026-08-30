import type { SearchSource } from "@repo/schemas";

/**
 * Why a recruiter search came back empty.
 *
 * `/resumes/search` answers 200 with `candidates: []` for six completely
 * different reasons, and until this existed all six looked identical from the
 * outside — to the recruiter, to support, and in the logs. That is how a
 * developer with a full resume stayed invisible: the open-to-work gate excluded
 * them, the API said "no matches", and nothing anywhere recorded the
 * difference.
 *
 * Three of those reasons are invisible in the product. `open_to_work` is the
 * authorization boundary for candidate discovery, the equality on
 * `embedding_model`/`embedding_version` stops two incomparable vector spaces
 * from being ranked against each other, and `SEARCH_MIN_SIMILARITY` keeps noise
 * off the page. All three are correct, none of them is wrong to have — they
 * were only unknowable, and this module is what makes them knowable.
 */

/**
 * Population counts taken at search time.
 *
 * Every count after `totalResumes` is measured over the candidates that passed
 * the recruiter's OWN filters, because the question being answered is "why did
 * *this* search return nothing" — not "what does the corpus look like". A count
 * over the whole table would report a floor or a gate that had already been
 * made irrelevant by a `seniorityLevels` facet.
 */
export interface SearchZeroResultCounts {
  /** Resumes that exist at all, ignoring every predicate. */
  totalResumes: number;
  /** Of those, how many satisfy the recruiter's explicit filters. */
  matchingRecruiterFilters: number;
  /** Of THOSE, how many belong to a user with `open_to_work = false`. */
  excludedByOpenToWork: number;
  /**
   * Of the open-to-work ones, how many have no vector in the CURRENT embedding
   * generation — never indexed, or indexed under a stale model/version. For a
   * `sources`-scoped search this counts candidates with no section vector for
   * any of the selected sources.
   */
  missingCurrentEmbedding: number;
  /**
   * Of the open-to-work ones that DO have a current vector, how many scored
   * below `SEARCH_MIN_SIMILARITY`.
   */
  belowSimilarityFloor: number;
}

/** The knobs that were in force for the search, for the log line. */
export interface SearchZeroResultContext {
  topK: number;
  minSimilarity: number;
  embeddingModel: string;
  embeddingVersion: string;
  /** Absent for the blended single-vector path. */
  sources?: SearchSource[];
  /**
   * The recruiter's filter KEYS — never their values. `nameContains` and
   * `profileTextContains` carry free text typed about a person, and a log line
   * is the wrong place for it.
   */
  filterKeys: string[];
}

export type SearchZeroResultCause =
  /** Nothing to search. Not a bug, an empty database. */
  | "no-resumes"
  /**
   * The recruiter's own explicit filters excluded everyone. The one cause that
   * is already visible in the UI — they can see the facets they picked.
   */
  | "recruiter-filters"
  /** Every remaining candidate has `open_to_work = false`. */
  | "open-to-work-gate"
  /** Nobody left has a vector in the current embedding generation. */
  | "missing-current-embedding"
  /** Candidates were scored, and none cleared `SEARCH_MIN_SIMILARITY`. */
  | "below-similarity-floor"
  /**
   * Candidates cleared every predicate on an exact scan, yet the query
   * returned nothing — so the approximate index never visited the clusters
   * they live in. This is ANN recall collapse (defect F19's failure mode), and
   * it is the one cause that no amount of staring at the data would reveal.
   */
  | "ann-recall";

export interface SearchZeroResultDiagnostics extends SearchZeroResultContext {
  counts: SearchZeroResultCounts;
  /**
   * How many resumes were still standing after each predicate. Reading these
   * four numbers left to right shows exactly where the population went.
   */
  survivors: {
    afterRecruiterFilters: number;
    afterOpenToWorkGate: number;
    afterEmbeddingGeneration: number;
    afterSimilarityFloor: number;
  };
  likelyCause: SearchZeroResultCause;
  /** Human-readable, safe to put in front of whoever is on call. */
  reason: string;
}

const REASONS: Record<SearchZeroResultCause, string> = {
  "no-resumes": "no resumes exist yet",
  "recruiter-filters":
    "the recruiter's own filters matched no resume; no implicit gate was reached",
  "open-to-work-gate":
    "every matching candidate is excluded by the open-to-work gate (users.open_to_work = false)",
  "missing-current-embedding":
    "no matching open-to-work candidate has a vector for the current embedding model/version",
  "below-similarity-floor":
    "candidates were scored but none reached SEARCH_MIN_SIMILARITY",
  "ann-recall":
    "candidates clear every predicate on an exact scan but the ANN index did not return them — recall collapse, raise ivfflat probes",
};

/**
 * Turns the counts into one cause.
 *
 * A ladder, not a max(): the predicates apply in order, and only the FIRST one
 * that empties the population is the thing worth acting on. Reporting "300
 * below the floor" when the open-to-work gate had already removed all 300
 * would send the next reader to tune a threshold that had nothing to do with
 * it.
 *
 * Pure and total — it never throws and never touches the database, so the
 * repository can call it inside a catch-all and a diagnostic failure can never
 * turn an empty result into a 500.
 */
export function buildSearchZeroResultDiagnostics(
  counts: SearchZeroResultCounts,
  context: SearchZeroResultContext,
): SearchZeroResultDiagnostics {
  const afterRecruiterFilters = Math.max(0, counts.matchingRecruiterFilters);
  const afterOpenToWorkGate = Math.max(
    0,
    afterRecruiterFilters - counts.excludedByOpenToWork,
  );
  const afterEmbeddingGeneration = Math.max(
    0,
    afterOpenToWorkGate - counts.missingCurrentEmbedding,
  );
  const afterSimilarityFloor = Math.max(
    0,
    afterEmbeddingGeneration - counts.belowSimilarityFloor,
  );

  let likelyCause: SearchZeroResultCause;

  if (counts.totalResumes === 0) {
    likelyCause = "no-resumes";
  } else if (afterRecruiterFilters === 0) {
    likelyCause = "recruiter-filters";
  } else if (afterOpenToWorkGate === 0) {
    likelyCause = "open-to-work-gate";
  } else if (afterEmbeddingGeneration === 0) {
    likelyCause = "missing-current-embedding";
  } else if (afterSimilarityFloor === 0) {
    likelyCause = "below-similarity-floor";
  } else {
    likelyCause = "ann-recall";
  }

  return {
    ...context,
    counts,
    survivors: {
      afterRecruiterFilters,
      afterOpenToWorkGate,
      afterEmbeddingGeneration,
      afterSimilarityFloor,
    },
    likelyCause,
    reason: REASONS[likelyCause],
  };
}
