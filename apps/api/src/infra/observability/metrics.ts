import { metrics } from "@opentelemetry/api";

/**
 * Every metric instrument in the API, defined in one place.
 *
 * WHY ONE FILE: the Grafana Cloud free tier caps us at 10,000 active series.
 * Instruments scattered across the codebase make that budget impossible to
 * reason about. Keeping them together means the cardinality of the whole system
 * can be read off a single screen — see the estimate at the bottom.
 *
 * COST WHEN TELEMETRY IS OFF: `metrics.getMeter()` returns a no-op meter until
 * a MeterProvider is registered, and no provider is registered unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set. Every `add()`/`record()` below is then a
 * function call that returns immediately. Nothing here needs an env guard.
 */

const meter = metrics.getMeter("crafthub-api");

// ---------------------------------------------------------------- RED (16) --

/**
 * Explicit buckets, chosen small on purpose. The default OTel boundaries have
 * ~15 buckets; every extra bucket is one more series per (route, method,
 * status) triple, multiplied across ~67 routes.
 */
const LATENCY_BUCKETS_SECONDS = [
  0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 10,
];

export const httpRequestDuration = meter.createHistogram(
  "http_server_request_duration_seconds",
  {
    description: "HTTP request duration by route, method and status code",
    unit: "s",
    advice: { explicitBucketBoundaries: LATENCY_BUCKETS_SECONDS },
  },
);

export const httpRequestsTotal = meter.createCounter("http_server_requests_total", {
  description: "HTTP request throughput by route, method and status code",
});

export const httpServerErrorsTotal = meter.createCounter(
  "http_server_errors_total",
  { description: "HTTP responses with a 5xx status code" },
);

// -------------------------------------------------- Embedding cache (17.b) --

export const embeddingCacheEventsTotal = meter.createCounter(
  "embedding_cache_events_total",
  {
    description:
      "Embedding cache lookups, labelled result=hit|miss. Hit ratio = hit / (hit + miss).",
  },
);

export function recordEmbeddingCacheHit(): void {
  embeddingCacheEventsTotal.add(1, { result: "hit" });
}

export function recordEmbeddingCacheMiss(): void {
  embeddingCacheEventsTotal.add(1, { result: "miss" });
}

// ------------------------------------------------------ OpenAI spend (17.c) --

export type AiOperation =
  | "resume_parse"
  | "query_conversion"
  | "embedding";

export const openAiTokensTotal = meter.createCounter("openai_tokens_total", {
  description:
    "OpenAI tokens consumed, labelled by model, operation and direction (input|output). Multiply by the per-model price to get spend.",
});

export const openAiRequestsTotal = meter.createCounter("openai_requests_total", {
  description: "OpenAI API calls by model, operation and outcome",
});

/**
 * `usage` is optional on the OpenAI response types and absent on some streaming
 * shapes, so a missing field records nothing rather than recording a zero that
 * would drag a spend dashboard's average down.
 */
export function recordOpenAiUsage(params: {
  model: string;
  operation: AiOperation;
  promptTokens?: number | null;
  completionTokens?: number | null;
}): void {
  const labels = { model: params.model, operation: params.operation };

  if (typeof params.promptTokens === "number") {
    openAiTokensTotal.add(params.promptTokens, {
      ...labels,
      direction: "input",
    });
  }

  if (typeof params.completionTokens === "number") {
    openAiTokensTotal.add(params.completionTokens, {
      ...labels,
      direction: "output",
    });
  }
}

export function recordOpenAiRequest(params: {
  model: string;
  operation: AiOperation;
  outcome: "success" | "error";
}): void {
  openAiRequestsTotal.add(1, {
    model: params.model,
    operation: params.operation,
    outcome: params.outcome,
  });
}

// ------------------------------------------------------- BullMQ jobs (17.d) --

const JOB_DURATION_BUCKETS_SECONDS = [0.1, 0.5, 1, 5, 15, 60, 300];

export const queueJobDuration = meter.createHistogram(
  "queue_job_duration_seconds",
  {
    description: "Time spent processing a job, by queue",
    unit: "s",
    advice: { explicitBucketBoundaries: JOB_DURATION_BUCKETS_SECONDS },
  },
);

export const queueJobWaitDuration = meter.createHistogram(
  "queue_job_wait_seconds",
  {
    description: "Time a job spent waiting before a worker picked it up",
    unit: "s",
    advice: { explicitBucketBoundaries: JOB_DURATION_BUCKETS_SECONDS },
  },
);

export const queueJobsTotal = meter.createCounter("queue_jobs_total", {
  description: "Jobs finished, labelled queue and outcome=completed|failed",
});

/**
 * Queue depth is a point-in-time reading of shared Redis state, so exactly one
 * process must report it or the same number arrives three times under three
 * different service.instance.id values. Registered only by the api role — see
 * `observable-metrics.ts`.
 */
export const queueDepth = meter.createObservableGauge("queue_depth", {
  description: "Jobs currently in a queue, labelled queue and state",
});

// --------------------------------------------------- Product funnel (17.e) --

export const signupsTotal = meter.createCounter("crafthub_signups_total", {
  description: "Completed registrations, labelled by method",
});

export const resumesSubmittedTotal = meter.createCounter(
  "crafthub_resumes_submitted_total",
  { description: "Resumes successfully submitted for AI parsing" },
);

export const profilesPublishedTotal = meter.createCounter(
  "crafthub_profiles_published_total",
  { description: "Successful profile publish/update operations" },
);

export const searchesTotal = meter.createCounter("crafthub_searches_total", {
  description: "Recruiter searches executed",
});

export const postsCreatedTotal = meter.createCounter(
  "crafthub_posts_created_total",
  {
    description:
      "Posts created, labelled source=human|agent so automatic posts can be split out",
  },
);

export const aiQuotaRejectionsTotal = meter.createCounter(
  "ai_quota_rejections_total",
  { description: "Requests rejected with 429 by the per-user daily AI quota" },
);

// ------------------------------------------------------------ DAU (17.a) --

/**
 * Daily active users, backed by a Redis HyperLogLog (PFCOUNT), NOT by one
 * series per user. Registered with a callback in `observable-metrics.ts`.
 */
export const dailyActiveUsers = meter.createObservableGauge(
  "crafthub_daily_active_users",
  { description: "Distinct authenticated users seen today (HyperLogLog estimate)" },
);

// ------------------------------------------------------- CARDINALITY RULE --

/**
 * NEVER pass a high-cardinality value as a metric attribute: userId, username,
 * email, profile slug, repository name, post id, job id, raw URL. The free tier
 * ceiling is 10,000 active series and any one of those would blow through it
 * from a single user's traffic. Identifiers belong in a log line or a span
 * attribute, where they cost nothing per-series.
 *
 * Current budget, roughly:
 *   RED     ~67 route templates x ~3 status codes x 10 series  ~= 2,000
 *   OpenAI  2 models x 3 operations x 2 directions             ~=    12
 *   Queues  2 queues x (2 histograms x 9 + counters + depth)   ~=    50
 *   Funnel  ~8 counters with <=3 label values each             ~=    20
 *   Runtime node process metrics                               ~=   100
 * Total well under 3,000, leaving headroom for growth.
 *
 * Every attribute passed to an instrument in this codebase is a literal from
 * a closed vocabulary — there is no dynamic-key path to sanitise, so there is
 * no runtime guard here on purpose. A dead `sanitizeAttributes()` that nothing
 * called was worse than none: it read as protection that did not exist.
 */
