/**
 * E2E tests for `POST /me/uploads`, the one route that turns a request body
 * into a stored artifact.
 *
 * Before this file the route had NO HTTP-level coverage: the multipart parsing,
 * the auth guard, the declared-vs-detected content-type split, the size ceiling
 * and every 400 they produce were exercised by nothing at all. The only test
 * touching storage mocked `S3Client` and asserted a command shape.
 *
 * Hermetic, per `build-test-app.ts`: real controller, real zod schemas from
 * `@repo/schemas`, real auth guard, real sharp optimiser, and an
 * `InMemoryFileStorageProvider` in place of the bucket. No socket, no docker.
 * The complement — that the bytes really reach an S3-compatible store and come
 * back over an ANONYMOUS GET — is
 * `infra/providers/s3-file-storage-provider.minio.e2e.test.ts`, against real
 * MinIO. Neither file can replace the other: this one cannot prove a bucket
 * policy, and that one cannot drive a multipart request through the guard.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uploadImageResponseSchema } from "@repo/schemas";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

/** 1x1 transparent PNG — real magic bytes, so the sniffer accepts it. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** 1x1 GIF. A second real format, to prove the extension follows the bytes. */
const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const BOUNDARY = "----crafthubtestboundary";

/**
 * A multipart/form-data body built by hand.
 *
 * `app.inject` has no multipart helper, and reaching for a builder library for
 * one test is a dependency to keep forever. The shape is fixed and short:
 * preamble, one part, epilogue.
 */
function multipartBody(
  bytes: Buffer,
  { filename = "photo.png", contentType = "image/png" } = {},
): { payload: Buffer; headers: Record<string, string> } {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  const payload = Buffer.concat([head, bytes, tail]);

  return {
    payload,
    headers: {
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      "content-length": String(payload.length),
    },
  };
}

describe("Uploads E2E — POST /me/uploads", () => {
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

  function upload(
    token: string | null,
    bytes: Buffer,
    options?: { filename?: string; contentType?: string },
  ) {
    const { payload, headers } = multipartBody(bytes, options);
    return ctx.app.inject({
      method: "POST",
      url: "/me/uploads",
      headers: {
        ...headers,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload,
    });
  }

  it("stores the image and answers 201 with a public URL", async () => {
    const { token } = await authedUser();

    const response = await upload(token, PNG);

    expect(response.statusCode).toBe(201);
    // Parsed through the SHARED schema, not shape-matched by hand: this is the
    // exact object the web client's `uploadImage` decodes, so a contract break
    // fails here instead of in someone's browser.
    const body = uploadImageResponseSchema.parse(response.json());
    expect(body.url).toMatch(/^https:\/\/storage\.test\.crafthub\/uploads\//);

    expect(ctx.fileStorageProvider.uploads.size).toBe(1);
  });

  it("namespaces the object key under the uploader's own id", async () => {
    const { user, token } = await authedUser();

    await upload(token, PNG);

    // The key is the ONLY thing separating one account's images from another's,
    // and it is invisible in the response body.
    const stored = ctx.fileStorageProvider.lastUpload;
    expect(stored?.key.startsWith(`uploads/${user.id}/`)).toBe(true);
  });

  it("gives two uploads from the same account different keys", async () => {
    const { token } = await authedUser();

    await upload(token, PNG);
    await upload(token, PNG);

    // A key derived from anything but a fresh uuid would have the second upload
    // silently overwrite the first — and the first is somebody's current avatar.
    expect(ctx.fileStorageProvider.uploads.size).toBe(2);
  });

  it("keeps one account's key out of another account's namespace", async () => {
    const first = await authedUser();
    const second = await authedUser();

    await upload(first.token, PNG);
    await upload(second.token, PNG);

    const keys = [...ctx.fileStorageProvider.uploads.keys()];
    expect(keys.some((key) => key.startsWith(`uploads/${first.user.id}/`))).toBe(
      true,
    );
    expect(
      keys.some((key) => key.startsWith(`uploads/${second.user.id}/`)),
    ).toBe(true);
  });

  it("makes the stored content type and the key's extension agree", async () => {
    const { token } = await authedUser();

    await upload(token, GIF, { filename: "loop.gif", contentType: "image/gif" });

    const stored = ctx.fileStorageProvider.lastUpload!;
    const extension = stored.key.split(".").pop();
    // The optimiser is allowed to change the format; what must never happen is
    // bytes labelled with one type sitting behind a URL ending in another.
    expect(stored.contentType).toBe(`image/${extension === "jpg" ? "jpeg" : extension}`);
  });

  it("trusts the BYTES over the declared content type", async () => {
    const { token } = await authedUser();

    // A PNG announced as a JPEG. The declared type passes the cheap allowlist
    // check, so only the magic-byte sniff can catch it — and what gets stored
    // must be what the bytes really are.
    await upload(token, PNG, {
      filename: "liar.jpg",
      contentType: "image/jpeg",
    });

    expect(ctx.fileStorageProvider.lastUpload?.contentType).not.toBe(
      "image/jpeg",
    );
  });

  it("rejects an anonymous upload with 401 and stores nothing", async () => {
    const response = await upload(null, PNG);

    expect(response.statusCode).toBe(401);
    expect(ctx.fileStorageProvider.uploads.size).toBe(0);
  });

  it("rejects a non-image content type with 400", async () => {
    const { token } = await authedUser();

    const response = await upload(token, Buffer.from("#!/bin/sh\n"), {
      filename: "payload.sh",
      contentType: "application/x-sh",
    });

    expect(response.statusCode).toBe(400);
    expect(ctx.fileStorageProvider.uploads.size).toBe(0);
  });

  it("rejects bytes that are not really an image, however they are labelled", async () => {
    const { token } = await authedUser();

    // Declared image/png, actually text. This is the case the allowlist alone
    // cannot see, and the one that would put an executable-shaped object behind
    // a public URL.
    const response = await upload(token, Buffer.from("<?php echo 1; ?>"), {
      filename: "shell.png",
      contentType: "image/png",
    });

    expect(response.statusCode).toBe(400);
    expect(ctx.fileStorageProvider.uploads.size).toBe(0);
  });

  it("rejects an empty file with 400", async () => {
    const { token } = await authedUser();

    const response = await upload(token, Buffer.alloc(0));

    expect(response.statusCode).toBe(400);
    expect(ctx.fileStorageProvider.uploads.size).toBe(0);
  });

  it("rejects a request that is not multipart at all with 400", async () => {
    const { token } = await authedUser();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/uploads",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: { url: "https://example.com/photo.png" },
    });

    expect(response.statusCode).toBe(400);
    expect(ctx.fileStorageProvider.uploads.size).toBe(0);
  });

  it("rejects an oversized image with 400 and stores nothing", async () => {
    const { token } = await authedUser();

    // Over the controller's 5 MB ceiling, with valid PNG magic bytes so the
    // request is rejected for its SIZE and not for its type.
    const huge = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024, 0)]);

    const response = await upload(token, huge);

    expect(response.statusCode).toBe(400);
    expect(ctx.fileStorageProvider.uploads.size).toBe(0);
  });
});
