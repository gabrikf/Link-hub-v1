/**
 * Proves `S3FileStorageProvider` actually stores an object, over a real S3 API
 * connection, and that the URL it hands back is one a BROWSER can load.
 *
 * NEEDS REAL MINIO — `bash db-manage.sh start` (or `docker compose -f
 * docker-compose.dev.yml up -d minio minio-setup`): S3 API on 9000, console on
 * 9001. `.e2e.test.ts` name, matching the other files here that cannot run
 * without infrastructure.
 *
 * WHY THIS FILE EXISTS:
 *
 * `s3-file-storage-provider.test.ts` next to it injects a fake `S3Client` and
 * asserts the shape of the `PutObjectCommand`. That is a real test of the
 * adapter's logic and it catches the wrong `Bucket` or a mangled key — but it
 * never signs a request, never opens a socket, and would pass just as happily
 * with a region MinIO rejects, `forcePathStyle` switched off, or a
 * `publicBaseUrl` that points at a path no server serves. Every one of those is
 * a 403 or a broken `<img>` in the browser and none of them is visible to a
 * mocked client.
 *
 * The second assertion is the one that matters most and the one a mock cannot
 * make at all: the returned URL is fetched back ANONYMOUSLY, with no
 * credentials and no signature, exactly as `<img src>` fetches it from the
 * dashboard. That is what proves the bucket's public-read policy — the thing
 * `minio-setup` configures — is really in place, in the same round trip that
 * proves the write worked.
 *
 * The config is `LOCAL_MINIO_STORAGE_CONFIG` itself rather than a hand-written
 * copy, so the values the app defaults to in development are the values this
 * test exercises. A drift between the compose file and that constant fails
 * here instead of in someone's browser.
 *
 * SELF-SKIPPING, not gate-only: an HTTP probe against MinIO's liveness endpoint
 * runs before the suite is built, so `npx vitest run` (or `related`) on a
 * machine without MinIO up skips cleanly and PRINTS why, instead of failing on
 * a connection that was never going to succeed. `scripts/guardrails/pre-push.mjs`
 * ALSO excludes this file by name when MinIO is unreachable — belt and braces,
 * same as the Postgres-bound and Mailpit-bound files, so the gate's own NOTICE
 * block names it too.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LOCAL_MINIO_STORAGE_CONFIG,
  S3FileStorageProvider,
} from "./s3-file-storage-provider.js";

const LIVENESS_URL = `${LOCAL_MINIO_STORAGE_CONFIG.endpoint}/minio/health/live`;

/**
 * The smallest thing that is unambiguously a PNG: a 1x1 transparent pixel. Real
 * bytes rather than a text blob, because the content type travels with the
 * object and a store that quietly rewrites it is worth catching.
 */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function minioReachable(timeoutMs = 900): Promise<boolean> {
  try {
    const response = await fetch(LIVENESS_URL, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const minioUp = await minioReachable();

if (!minioUp) {
  console.warn(
    "[s3-file-storage-provider.minio.e2e.test.ts] SKIPPED — MinIO is not " +
      `reachable at ${LIVENESS_URL}. Start it with: bash db-manage.sh start ` +
      "(or `docker compose -f docker-compose.dev.yml up -d minio minio-setup`). " +
      "S3FileStorageProvider's real upload path is therefore UNVERIFIED by " +
      "this run.",
  );
}

describe.skipIf(!minioUp)("S3FileStorageProvider against real MinIO", () => {
  it("stores an object and returns a URL that loads without credentials", async () => {
    const provider = new S3FileStorageProvider(LOCAL_MINIO_STORAGE_CONFIG);
    const key = `uploads/e2e-${randomUUID()}/pixel.png`;

    const { url } = await provider.upload({
      body: ONE_PIXEL_PNG,
      contentType: "image/png",
      key,
    });

    // Path-style addressing, which is what `forcePathStyle: true` produces and
    // what R2 uses too: <publicBaseUrl>/<key>, bucket already in the base.
    expect(url).toBe(`${LOCAL_MINIO_STORAGE_CONFIG.publicBaseUrl}/${key}`);

    // No `Authorization` header, no presigned query string — the same request
    // the browser makes for an <img src>. A 403 here means the bucket's
    // public-read policy is missing, which is invisible to the mocked test.
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const downloaded = Buffer.from(await response.arrayBuffer());
    expect(downloaded.equals(ONE_PIXEL_PNG)).toBe(true);
  });

  it("overwrites the same key rather than erroring on a second write", async () => {
    // Not a hypothetical: the reposition editor re-uploads the same image, and
    // an object store that 409s on an existing key would break it. S3 PUT
    // semantics are last-write-wins; this pins that MinIO agrees.
    const provider = new S3FileStorageProvider(LOCAL_MINIO_STORAGE_CONFIG);
    const key = `uploads/e2e-${randomUUID()}/twice.png`;

    await provider.upload({
      body: ONE_PIXEL_PNG,
      contentType: "image/png",
      key,
    });
    const second = await provider.upload({
      body: ONE_PIXEL_PNG,
      contentType: "image/png",
      key,
    });

    const response = await fetch(second.url);
    expect(response.status).toBe(200);
  });

  it("404s on a key nobody wrote, so a passing read is a real read", async () => {
    // Guards the two assertions above: if the bucket were serving a catch-all
    // 200 (a misconfigured proxy, an index document), they would pass while
    // proving nothing.
    const response = await fetch(
      `${LOCAL_MINIO_STORAGE_CONFIG.publicBaseUrl}/uploads/never-written-${randomUUID()}.png`,
    );

    expect(response.status).toBe(404);
  });
});
