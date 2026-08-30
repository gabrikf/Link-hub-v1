/**
 * Usernames nobody may own, because the username IS the URL.
 *
 * `/:username` is now the CANONICAL public profile URL. (`/profile/:username`
 * still resolves, but only as a redirect to it — see `legacyProfileRoute` in
 * `apps/web/src/router.tsx`.) That collapses two namespaces into one: every top-level path in the
 * web app is either an application route or somebody's profile, and the router
 * resolves the collision in favour of the static route. So a person who
 * registers `dashboard` does not get a broken profile — they get NO profile,
 * silently and permanently, while `/dashboard` keeps opening the app. The only
 * place that can be prevented is at the moment the name is claimed.
 *
 * This lives in `@repo/schemas` rather than in the api or the web because both
 * have to agree: the api rejects the write, the browser has to be able to say
 * why before the round trip, and a second copy of the list is a second copy
 * that drifts.
 *
 * Matching is CASE-INSENSITIVE, and that is load-bearing rather than tidy.
 * `users.login` is a plain `text ... unique` column and `findByLogin` compares
 * with `=`, so Postgres treats `Dashboard` and `dashboard` as two different
 * accounts. TanStack Router, meanwhile, matches paths case-insensitively by
 * default. A case-sensitive blocklist would therefore let `Dashboard` through
 * and hand that account the same shadowed-forever outcome the list exists to
 * prevent.
 *
 * Adding to the list is cheap and removing from it is not: a name released
 * here can be claimed within minutes, and reserving it again afterwards means
 * taking it off a real person. Err towards reserving.
 */

/**
 * Every reserved name, lowercase, sorted within its group.
 *
 * Groups, and why each is here:
 *
 * 1. **Routes the app serves today.** A direct collision — the static route
 *    always wins, so these profiles would be unreachable from the day they
 *    were created. Includes the `/dashboard` children even though they are two
 *    segments: `search`, `posts`, `layout` and `settings` are the obvious
 *    candidates to be promoted to top level, and reserving them now costs
 *    nothing.
 * 2. **Routes a product like this grows next.** Cheap insurance. Every one of
 *    these becoming a route later would otherwise mean either abandoning the
 *    route name or taking a username away from someone who already has it.
 * 3. **Auth and account verbs.** Same argument, plus these are the names a
 *    phisher wants: a link to `crafthub.dev/login` that renders a profile page
 *    with a hand-made sign-in form is a credential-harvesting page hosted on
 *    the real domain.
 * 4. **Static and platform paths.** The bundle is served by Cloudflare Pages,
 *    which reserves `/cdn-cgi/*` and treats `_headers` / `_redirects`
 *    specially; the rest are the directory names any static host or future
 *    same-origin API mount would take.
 * 5. **Impersonation.** `admin`, `support`, `crafthub`, `staff` and friends let
 *    a stranger's profile read as an official one. This is the group with the
 *    least technical justification and the most real-world harm.
 * 6. **Words that break tooling.** `null`, `undefined`, `true`, `false`, `nan`
 *    and `constructor` are what a bug in a client that stringifies a missing
 *    value produces; a real account at that name turns a client bug into a
 *    plausible-looking page instead of a 404 somebody investigates.
 */
export const RESERVED_USERNAMES = [
  // 1 — routes the app serves today
  "dashboard",
  "forgot-password",
  "layout",
  "posts",
  "profile",
  "reset-password",
  "review",
  "search",
  "settings",
  "verify-email",

  // 2 — routes this product plausibly grows
  "about",
  "billing",
  "blog",
  "careers",
  "changelog",
  "checkout",
  "companies",
  "contact",
  "cookies",
  "discover",
  "docs",
  "download",
  "explore",
  "feed",
  "help",
  "home",
  "invite",
  "jobs",
  "legal",
  "messages",
  "notifications",
  "onboarding",
  "press",
  "pricing",
  "privacy",
  "security",
  "status",
  "support",
  "terms",
  "welcome",

  // 3 — auth and account verbs
  "account",
  "accounts",
  "auth",
  "callback",
  "login",
  "logout",
  "me",
  "oauth",
  "password",
  "register",
  "session",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signout",
  "signup",
  "user",
  "users",
  "verify",

  // 4 — static and platform paths
  "api",
  "assets",
  "cdn-cgi",
  "css",
  "favicon.ico",
  "fonts",
  "graphql",
  "health",
  "images",
  "img",
  "js",
  "media",
  "mcp",
  "public",
  "robots.txt",
  "sitemap.xml",
  "static",
  "uploads",
  "webhooks",
  "well-known",

  // 5 — impersonation
  "admin",
  "administrator",
  "crafthub",
  "moderator",
  "official",
  "owner",
  "root",
  "staff",
  "system",

  // 6 — words that break tooling
  "constructor",
  "false",
  "nan",
  "null",
  "true",
  "undefined",
] as const;

export type ReservedUsername = (typeof RESERVED_USERNAMES)[number];

/**
 * A `Set` rather than `Array.includes`: this runs on every registration and
 * every profile save, and the list is long enough that the difference is a
 * real one.
 */
const RESERVED_USERNAME_SET: ReadonlySet<string> = new Set(RESERVED_USERNAMES);

/**
 * The one message both sides show.
 *
 * English, because it is the fallback language and because it is what the
 * other messages in `createUserSchemaInput` already are. The web's profile
 * form renders a translated version through `t()` instead — see
 * `dashboard.usernameReserved` — because that form is the one place that knows
 * which language to say it in.
 */
export const RESERVED_USERNAME_MESSAGE =
  "That username is reserved. Please choose another one.";

/**
 * `.trim()` before the comparison because zod does not trim these fields:
 * `" admin "` would otherwise pass the check and then be stored, and the router
 * would still resolve the trimmed path.
 */
export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAME_SET.has(value.trim().toLowerCase());
}
