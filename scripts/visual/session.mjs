#!/usr/bin/env node
/**
 * The authenticated session for `visual-check`.
 *
 * Everything under `/dashboard` is behind login, so a capture without a session
 * shows the auth page — and an agent that does not notice reports "the screen
 * is empty" or, worse, calls the work done while looking at the wrong screen.
 * This script is the only place that produces and validates that session.
 *
 * HOW IT WORKS: LinkHub keeps its JWTs in `localStorage` under
 * `linkhub.auth.tokens` (see apps/web/src/lib/auth-tokens.ts), so the session is
 * a Playwright storageState with two `origins[].localStorage` entries — no cookie
 * involved. We log in PROGRAMMATICALLY against the API rather than opening a
 * browser for a human to type into: the credentials are seeded test accounts,
 * the flow is two HTTP calls, and it means `visual:login` works unattended in a
 * script or an agent session.
 *
 * Commands:
 *   node scripts/visual/session.mjs setup    create an empty auth.json
 *   node scripts/visual/session.mjs login    log in and save the session
 *   node scripts/visual/session.mjs check    say whether the session is still valid
 *
 * CREDENTIALS ARE NEVER STORED IN THIS REPO. They come from the environment:
 *
 *   VISUAL_EMAIL     defaults to recruiter.seed@linkhub.local
 *   VISUAL_PASSWORD  defaults to 12345678
 *
 * Those defaults are the seeded local accounts created by
 * `bash db-manage.sh seed-all` against the local docker database — they are
 * fixtures, published in apps/api/src/infra/database/drizzle/seed-realistic.ts,
 * and they exist nowhere but your laptop. Never point VISUAL_EMAIL at a real
 * account: `.playwright/auth.json` is a plaintext JWT on disk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const STATE = resolve(ROOT, ".playwright/auth.json");
const APP_URL = process.env.VISUAL_APP_URL || "http://localhost:5173";
const API_URL = process.env.VISUAL_API_URL || "http://localhost:3333";

const EMAIL = process.env.VISUAL_EMAIL || "recruiter.seed@linkhub.local";
const PASSWORD = process.env.VISUAL_PASSWORD || "12345678";

/** Must match AUTH_TOKENS_STORAGE_KEY in apps/web/src/lib/auth-tokens.ts. */
const TOKENS_KEY = "linkhub.auth.tokens";

/**
 * Must match the `name` given to zustand's `persist` in
 * apps/web/src/lib/user-info-store.ts.
 *
 * Tokens alone are not a session. Every dashboard route guards on
 * `getAuthTokens() && userInfo`, and `userInfo` lives in this separately
 * persisted store — so a state file holding only the tokens boots the app,
 * fails the guard, and bounces to "/", which reads exactly like an expired
 * session. Authenticated scenarios were unrunnable for that reason alone.
 */
const USER_INFO_KEY = "linkhub.auth.user-info";

const EMPTY_STATE = { cookies: [], origins: [] };

function readState() {
  if (!existsSync(STATE)) return null;
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
}

/** Idempotent on purpose — safe to call from `check` and from `login`. */
function setup() {
  if (existsSync(STATE)) return false;
  writeState(EMPTY_STATE);
  return true;
}

function storedTokens() {
  const state = readState();
  const origin = (state?.origins || []).find((entry) =>
    (entry.localStorage || []).some((item) => item.name === TOKENS_KEY),
  );
  if (!origin) return null;
  const raw = origin.localStorage.find((item) => item.name === TOKENS_KEY)?.value;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function login() {
  setup();

  console.log(`  Logging in as ${EMAIL} against ${API_URL} …`);

  let response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  } catch (error) {
    console.error(`❌ Could not reach the API at ${API_URL} — is it running? (npm run dev:api)`);
    console.error(`   ${error.message}`);
    return 1;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`❌ Login failed: HTTP ${response.status}. ${body.slice(0, 200)}`);
    console.error("   If this is a fresh database, seed it: bash db-manage.sh seed-all");
    console.error("   Or set VISUAL_EMAIL / VISUAL_PASSWORD for a different account.");
    return 1;
  }

  const payload = await response.json();
  if (!payload?.accessToken || !payload?.refreshToken) {
    console.error("❌ The login response had no tokens. Did the auth contract change?");
    return 1;
  }

  // Exactly the shape apps/web writes, so the app boots signed in without
  // knowing this file exists. Storing anything else here would be a fixture
  // that drifts away from the real client.
  writeState({
    cookies: [],
    origins: [
      {
        origin: APP_URL,
        localStorage: [
          {
            name: TOKENS_KEY,
            value: JSON.stringify({
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken,
            }),
          },
          {
            name: USER_INFO_KEY,
            // zustand's persist envelope, not the bare user — the store reads
            // `state.userInfo` and ignores anything shaped differently.
            value: JSON.stringify({
              state: { userInfo: payload.user },
              version: 0,
            }),
          },
        ],
      },
    ],
  });

  console.log(`\n✅ Session saved to .playwright/auth.json (user: ${payload.user?.login ?? EMAIL}).`);
  console.log("   It is gitignored. When it expires, run `npm run visual:login` again.\n");
  return 0;
}

/**
 * A session is valid when the API still accepts the access token — not when a
 * token merely exists. An expired JWT is still a perfectly well-formed JWT.
 */
async function check() {
  setup();

  const tokens = storedTokens();
  if (!tokens?.accessToken) {
    console.log("❌ No saved session. Run: npm run visual:login");
    return 1;
  }

  let response;
  try {
    response = await fetch(`${API_URL}/me`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
  } catch (error) {
    console.log(`❌ Could not reach the API at ${API_URL} — is it running? (npm run dev:api)`);
    console.log(`   ${error.message}`);
    return 1;
  }

  if (response.status === 401 || response.status === 403) {
    console.log("❌ Session expired. Run: npm run visual:login");
    return 1;
  }
  if (!response.ok) {
    console.log(
      `⚠️  Unexpected HTTP ${response.status} from ${API_URL}/me — cannot confirm the session.`,
    );
    return 1;
  }

  console.log("✅ Session valid — the API accepted the stored access token.");
  return 0;
}

const COMMANDS = {
  setup: () => (setup() ? 0 : 0),
  login,
  check,
};

const command = process.argv[2] || "check";
if (!COMMANDS[command]) {
  console.error(
    `Invalid command: "${command}". Use: ${Object.keys(COMMANDS).join(" | ")}`,
  );
  process.exit(64);
}
process.exit((await COMMANDS[command]()) ?? 0);
