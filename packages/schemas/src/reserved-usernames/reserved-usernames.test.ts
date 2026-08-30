/**
 * The blocklist is a contract, not a convenience.
 *
 * `/:username` is the only public profile URL, so the username namespace and
 * the route namespace are the same namespace. These assertions are the ones
 * that fail if somebody removes a name from the list, breaks the
 * case-insensitive comparison, or drops the refinement off one of the two
 * schemas that claim a username.
 */
import { describe, expect, it } from "vitest";
import { createUserSchemaInput } from "../auth/index.js";
import { updateProfileSchemaInput } from "../profile/index.js";
import { isReservedUsername, RESERVED_USERNAMES } from "./index.js";

/**
 * The floor the round-3 checklist names by hand. Listed here rather than
 * summarised, so removing one from `RESERVED_USERNAMES` fails HERE with the
 * name in the message instead of somewhere downstream months later.
 */
const REQUIRED = [
  "dashboard",
  "login",
  "register",
  "profile",
  "settings",
  "search",
  "posts",
  "api",
  "admin",
  "about",
  "terms",
  "privacy",
  "verify-email",
  "reset-password",
  "forgot-password",
  "auth",
  "layout",
  "static",
  "assets",
  "public",
  "help",
  "support",
  "blog",
  "pricing",
] as const;

const signup = (login: string) => ({
  email: "someone@example.com",
  login,
  name: "Someone",
  password: "password123",
});

describe("the reserved-username list itself", () => {
  it.each(REQUIRED)("reserves %s", (name) => {
    expect(isReservedUsername(name)).toBe(true);
  });

  it("holds no duplicates", () => {
    expect(new Set(RESERVED_USERNAMES).size).toBe(RESERVED_USERNAMES.length);
  });

  /**
   * Every entry is compared against a lowercased, trimmed input, so an entry
   * that is not itself lowercase and trimmed can never match anything.
   */
  it("stores every entry already normalised", () => {
    const wrong = RESERVED_USERNAMES.filter(
      (name) => name !== name.trim().toLowerCase(),
    );
    expect(wrong).toEqual([]);
  });

  /**
   * `users.login` is compared with `=` in Postgres, so `Dashboard` is a
   * DIFFERENT account from `dashboard` — while the router matches paths
   * case-insensitively. A case-sensitive blocklist would let the capitalised
   * spelling straight through to the same shadowed-forever outcome.
   */
  it.each(["DASHBOARD", "Dashboard", "dAsHbOaRd", "  admin  "])(
    "matches %s despite case and surrounding space",
    (variant) => {
      expect(isReservedUsername(variant)).toBe(true);
    },
  );

  it("leaves ordinary names alone", () => {
    for (const name of [
      "gabrielkochf",
      "ada",
      "seed-react-frontend-003",
      "administrators",
      "dashboards",
      "my-blog",
    ]) {
      expect(isReservedUsername(name)).toBe(false);
    }
  });
});

describe("registration cannot claim a reserved name", () => {
  it.each(["dashboard", "Dashboard", "settings"])("rejects %s", (login) => {
    const result = createUserSchemaInput.safeParse(signup(login));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "login")).toBe(true);
  });

  it("still accepts an ordinary login", () => {
    expect(createUserSchemaInput.safeParse(signup("ada")).success).toBe(true);
  });
});

describe("an existing user cannot RENAME into a reserved name", () => {
  it.each(["dashboard", "ADMIN", "verify-email"])("rejects %s", (username) => {
    const result = updateProfileSchemaInput.safeParse({ username });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "username")).toBe(
      true,
    );
  });

  it("still accepts an ordinary rename", () => {
    expect(
      updateProfileSchemaInput.safeParse({ username: "ada-lovelace" }).success,
    ).toBe(true);
  });
});
