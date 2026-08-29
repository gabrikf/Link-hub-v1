/**
 * E2E tests for the Links HTTP API, focused on the URL scheme gate.
 *
 * A profile link is rendered as `href={link.url}` on the PUBLIC profile, so the
 * API must never store a `javascript:`, `data:` or `vbscript:` URL — the
 * renderer is not allowed to be the only defence. These run against the DB-free
 * app from `buildTestApp()`: the real controller, the real zod validation from
 * `@repo/schemas` and the real auth guard, via `app.inject()`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

const DANGEROUS_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "vbscript:msgbox(1)",
];

describe("Links E2E — URL scheme", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authedUser() {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);
    return { user, token };
  }

  it("creates a link with an https URL (201)", async () => {
    const { user, token } = await authedUser();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/links",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: "My GitHub",
        url: "https://github.com/gabrielk",
        isPublic: true,
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().url).toBe("https://github.com/gabrielk");
    const stored = await ctx.linksRepository.findByUserId(user.id);
    expect(stored).toHaveLength(1);
  });

  it.each(DANGEROUS_URLS)(
    "refuses to create a link with %s and stores nothing",
    async (url) => {
      const { user, token } = await authedUser();

      const response = await ctx.app.inject({
        method: "POST",
        url: "/links",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Totally normal link", url, isPublic: true }),
      });

      expect(response.statusCode).toBe(400);
      const stored = await ctx.linksRepository.findByUserId(user.id);
      expect(stored).toHaveLength(0);
    },
  );

  it.each(DANGEROUS_URLS)(
    "refuses to edit an existing link into %s and leaves the stored URL alone",
    async (url) => {
      const { user, token } = await authedUser();

      const created = await ctx.app.inject({
        method: "POST",
        url: "/links",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: "My GitHub",
          url: "https://github.com/gabrielk",
          isPublic: true,
        }),
      });
      const linkId = created.json().id;

      const response = await ctx.app.inject({
        method: "PUT",
        url: `/links/${linkId}`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "My GitHub", url, isPublic: true }),
      });

      expect(response.statusCode).toBe(400);
      const [stored] = await ctx.linksRepository.findByUserId(user.id);
      expect(stored?.url).toBe("https://github.com/gabrielk");
    },
  );
});
