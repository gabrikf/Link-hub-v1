/**
 * Local fixtures only. Every account here is created by
 * `bash db-manage.sh seed-all` against the docker database and exists nowhere
 * but a developer laptop — see apps/api/src/infra/database/drizzle/seed-realistic.ts.
 * Never point these at a real account: the storage states are plaintext JWTs.
 */
export const SEED_PASSWORD = "12345678";

export const ACCOUNTS = {
  recruiter: {
    email: "recruiter.seed@crafthub.local",
    password: SEED_PASSWORD,
    login: "recruiter-seed",
  },
  developer: {
    email: "seed.react-frontend.003@crafthub.local",
    password: SEED_PASSWORD,
    login: "seed-react-frontend-003",
  },
} as const;

export type Role = keyof typeof ACCOUNTS;

export const STORAGE_STATE: Record<Role, string> = {
  recruiter: ".playwright/e2e-recruiter.json",
  developer: ".playwright/e2e-developer.json",
};

/** Must match AUTH_TOKENS_STORAGE_KEY in apps/web/src/lib/auth-tokens.ts. */
export const TOKENS_KEY = "crafthub.auth.tokens";

/**
 * Must match USER_INFO_STORAGE_KEY in apps/web/src/lib/user-info-store.ts.
 *
 * SEEDING TOKENS ALONE IS NOT A SESSION. Every dashboard route gates on
 * `Boolean(getAuthTokens() && userInfo)` where `userInfo` comes from this
 * persisted zustand store, which only the sign-in page writes. A token-only
 * state therefore redirects to `/` — and a test that asserts `toHaveURL(/dashboard/)`
 * passes anyway, because it matches on the first poll before the redirect
 * effect runs. That is a suite that reports green while reaching nothing.
 */
export const USER_INFO_KEY = "crafthub.auth.user-info";

export const WEB_URL = process.env.E2E_WEB_URL || "http://localhost:5173";
export const API_URL = process.env.E2E_API_URL || "http://localhost:3333";

/**
 * A registration journey must not collide with a previous run's row, and the
 * database is not reset between nightly iterations.
 */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Journeys that MUTATE data each get their own seeded account. The nightly loop
 * runs journeys back to back against one database that is never reset between
 * iterations, so two journeys editing the same profile would make each other
 * flaky in a way that looks like a product bug.
 */
export const JOURNEY_ACCOUNTS = {
  posts: { email: "seed.node-backend.040@crafthub.local", password: SEED_PASSWORD, login: "seed-node-backend-040" },
  links: { email: "seed.go-sre.026@crafthub.local", password: SEED_PASSWORD, login: "seed-go-sre-026" },
  appearance: { email: "seed.python-data.042@crafthub.local", password: SEED_PASSWORD, login: "seed-python-data-042" },
} as const;
