import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse as parseDotenv } from "dotenv";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  LOCAL_MINIO_STORAGE_CONFIG,
  S3FileStorageProvider,
  readS3StorageConfigFromEnv,
  resolveFileStorageConfig,
} from "./s3-file-storage-provider.js";

function makeConfig() {
  return {
    endpoint: "https://account.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "media",
    accessKeyId: "key",
    secretAccessKey: "secret",
    publicBaseUrl: "https://cdn.example.com",
  };
}

describe("S3FileStorageProvider", () => {
  it("uploads via PutObjectCommand and returns the public URL", async () => {
    const send = vi.fn().mockResolvedValue({});
    const fakeClient = { send } as unknown as S3Client;
    const provider = new S3FileStorageProvider(makeConfig(), fakeClient);

    const result = await provider.upload({
      body: Buffer.from("hello"),
      contentType: "image/png",
      key: "uploads/user-1/abc.png",
    });

    expect(result.url).toBe("https://cdn.example.com/uploads/user-1/abc.png");
    expect(send).toHaveBeenCalledTimes(1);

    const command = send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "media",
      Key: "uploads/user-1/abc.png",
      ContentType: "image/png",
    });
  });

  it("normalizes trailing/leading slashes when building the URL", async () => {
    const send = vi.fn().mockResolvedValue({});
    const fakeClient = { send } as unknown as S3Client;
    const provider = new S3FileStorageProvider(
      { ...makeConfig(), publicBaseUrl: "https://cdn.example.com/" },
      fakeClient,
    );

    const result = await provider.upload({
      body: Buffer.from("x"),
      contentType: "image/jpeg",
      key: "/uploads/user-2/x.jpg",
    });

    expect(result.url).toBe("https://cdn.example.com/uploads/user-2/x.jpg");
  });
});

describe("readS3StorageConfigFromEnv", () => {
  const fullEnv = {
    S3_ENDPOINT: "https://s3.example.com",
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_PUBLIC_BASE_URL: "https://cdn.example.com",
  } satisfies NodeJS.ProcessEnv;

  it("returns config with region defaulting to 'auto'", () => {
    expect(readS3StorageConfigFromEnv({ ...fullEnv })).toEqual({
      endpoint: "https://s3.example.com",
      region: "auto",
      bucket: "media",
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicBaseUrl: "https://cdn.example.com",
    });
  });

  it("honors an explicit S3_REGION", () => {
    const config = readS3StorageConfigFromEnv({
      ...fullEnv,
      S3_REGION: "us-east-1",
    });
    expect(config?.region).toBe("us-east-1");
  });

  it("treats a whitespace-only value as missing, not as configuration", () => {
    // `S3_BUCKET=" "` used to be truthy and produced a config with a one-space
    // bucket: the boot succeeded and the failure arrived as an opaque S3 error
    // on somebody's first upload. It also disagreed with the "is anything
    // configured?" check, which trims.
    expect(
      readS3StorageConfigFromEnv({ ...fullEnv, S3_BUCKET: "   " }),
    ).toBeNull();
  });

  it("trims the values it does accept", () => {
    const config = readS3StorageConfigFromEnv({
      ...fullEnv,
      S3_PUBLIC_BASE_URL: "  https://cdn.example.com  ",
    });
    expect(config?.publicBaseUrl).toBe("https://cdn.example.com");
  });

  it("returns null when a required variable is missing", () => {
    const withoutBucket = {
      S3_ENDPOINT: fullEnv.S3_ENDPOINT,
      S3_ACCESS_KEY_ID: fullEnv.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: fullEnv.S3_SECRET_ACCESS_KEY,
      S3_PUBLIC_BASE_URL: fullEnv.S3_PUBLIC_BASE_URL,
    };
    expect(readS3StorageConfigFromEnv(withoutBucket)).toBeNull();
    expect(readS3StorageConfigFromEnv({})).toBeNull();
  });
});

/**
 * The dev fallback to the local MinIO. The behaviour worth pinning is not
 * "development gets MinIO" — it is the two things that must NEVER happen:
 * production silently writing user photographs to a loopback address, and a
 * half-filled `S3_*` block being papered over instead of reported.
 */
describe("resolveFileStorageConfig", () => {
  const realS3Env = {
    S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    S3_BUCKET: "crafthub-media",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_PUBLIC_BASE_URL: "https://media.example.com",
  } satisfies NodeJS.ProcessEnv;

  it("falls back to the local MinIO in development when nothing is configured", () => {
    expect(resolveFileStorageConfig({ NODE_ENV: "development" })).toEqual(
      LOCAL_MINIO_STORAGE_CONFIG,
    );
  });

  it("treats an unset NODE_ENV as development, which is what `npm run dev` runs as", () => {
    expect(resolveFileStorageConfig({})).toEqual(LOCAL_MINIO_STORAGE_CONFIG);
  });

  it("treats empty placeholder values as unset", () => {
    // `S3_ENDPOINT=` sitting in a .env is somebody who has not filled it in.
    expect(
      resolveFileStorageConfig({
        NODE_ENV: "development",
        S3_ENDPOINT: "",
        S3_BUCKET: "",
        S3_ACCESS_KEY_ID: "  ",
        S3_SECRET_ACCESS_KEY: "",
        S3_PUBLIC_BASE_URL: "",
      }),
    ).toEqual(LOCAL_MINIO_STORAGE_CONFIG);
  });

  it("NEVER hands production the local MinIO", () => {
    // The single most important assertion in this file. A deployed CraftHub
    // that fell back would accept uploads, report success, and serve every
    // visitor an <img src="http://localhost:9000/…">.
    expect(resolveFileStorageConfig({ NODE_ENV: "production" })).toBeNull();
  });

  it("does not hand the test environment a fallback either", () => {
    // A unit test that wants object storage should say so with an explicit
    // config rather than inherit whatever docker the developer happens to run.
    expect(resolveFileStorageConfig({ NODE_ENV: "test" })).toBeNull();
  });

  it("lets a complete S3_* environment win in development", () => {
    expect(
      resolveFileStorageConfig({ NODE_ENV: "development", ...realS3Env }),
    ).toEqual({
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "crafthub-media",
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicBaseUrl: "https://media.example.com",
    });
  });

  it("uses a complete S3_* environment in production, as it always did", () => {
    expect(
      resolveFileStorageConfig({ NODE_ENV: "production", ...realS3Env }),
    ).not.toBeNull();
  });

  it("reports a PARTIAL S3_* environment instead of redirecting it to MinIO", () => {
    // Four of five set is a typo, and silently sending those uploads to a local
    // container would hide it until the photo failed to load for visitors.
    const missingBucket = {
      S3_ENDPOINT: realS3Env.S3_ENDPOINT,
      S3_ACCESS_KEY_ID: realS3Env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: realS3Env.S3_SECRET_ACCESS_KEY,
      S3_PUBLIC_BASE_URL: realS3Env.S3_PUBLIC_BASE_URL,
    };

    expect(
      resolveFileStorageConfig({ NODE_ENV: "development", ...missingBucket }),
    ).toBeNull();
  });

  it("does not let whitespace-only variables masquerade as real storage", () => {
    // Both halves of the resolver must agree that these are absent: if only
    // `hasAnyS3EnvVar` trimmed, this env would fall through to a `null` config
    // and report "not configured" on a machine where MinIO was running fine.
    expect(
      resolveFileStorageConfig({
        NODE_ENV: "development",
        S3_ENDPOINT: "   ",
        S3_BUCKET: "\t",
      }),
    ).toEqual(LOCAL_MINIO_STORAGE_CONFIG);
  });

  it("does not count S3_REGION as intent — it has a default and everyone has it", () => {
    // `S3_REGION=auto` shipped uncommented in `.env.example`, so it sits in
    // essentially every developer's .env while saying nothing about whether
    // they configured a bucket. Counting it made the fallback dead on arrival:
    // uploads still 500'd with "Image storage is not configured" on a machine
    // with MinIO running. Found by driving a real upload through the browser.
    expect(
      resolveFileStorageConfig({ NODE_ENV: "development", S3_REGION: "auto" }),
    ).toEqual(LOCAL_MINIO_STORAGE_CONFIG);
  });

  it("counts even one REQUIRED S3_* variable as intent to use real storage", () => {
    expect(
      resolveFileStorageConfig({
        NODE_ENV: "development",
        S3_BUCKET: "someones-real-bucket",
      }),
    ).toBeNull();
  });

  it("addresses MinIO path-style, with the bucket in the public base URL", () => {
    // `forcePathStyle: true` puts objects at <endpoint>/<bucket>/<key>, so a
    // public base URL without the bucket would build a 404 for every image.
    expect(LOCAL_MINIO_STORAGE_CONFIG.publicBaseUrl).toContain(
      `/${LOCAL_MINIO_STORAGE_CONFIG.bucket}`,
    );
    expect(LOCAL_MINIO_STORAGE_CONFIG.publicBaseUrl).not.toMatch(/\/$/);
  });

  it("keeps the MinIO fallback on loopback, so it can never be a deployed target", () => {
    for (const url of [
      LOCAL_MINIO_STORAGE_CONFIG.endpoint,
      LOCAL_MINIO_STORAGE_CONFIG.publicBaseUrl,
    ]) {
      expect(new URL(url).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    }
  });
});

/**
 * The documented setup step, executed.
 *
 * `README.md` and `DEVELOPMENT-GUIDE.md` both tell a new developer to copy
 * `apps/api/.env.example` into place. That file used to ship `S3_ENDPOINT`,
 * `S3_BUCKET` and `S3_PUBLIC_BASE_URL` filled in with R2 placeholders and the
 * two secrets blank — a PARTIAL configuration, which the resolver correctly
 * refuses. So the documented first step produced a 500 on the first upload:
 * exactly the fresh-clone failure the MinIO fallback exists to remove,
 * reintroduced by the file that is supposed to prevent it.
 *
 * Prose in that file cannot hold this. A test that reads the real bytes can.
 */
describe("apps/api/.env.example, copied verbatim", () => {
  const exampleEnv = parseDotenv(
    readFileSync(
      fileURLToPath(new URL("../../../.env.example", import.meta.url)),
      "utf8",
    ),
  );

  it("leaves the five required S3_* variables unset", () => {
    for (const key of [
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_PUBLIC_BASE_URL",
    ]) {
      expect(
        (exampleEnv[key] ?? "").trim(),
        `${key} must be commented out or empty in .env.example — a copied file ` +
          "with some of them filled in is a PARTIAL config, and every upload 500s",
      ).toBe("");
    }
  });

  it("gives a developer who copies it a working local object store", () => {
    expect(
      resolveFileStorageConfig({ ...exampleEnv, NODE_ENV: "development" }),
    ).toEqual(LOCAL_MINIO_STORAGE_CONFIG);
  });

  it("still leaves production unconfigured, and loudly so", () => {
    // The same copied file must NOT quietly make a production deploy "work".
    expect(
      resolveFileStorageConfig({ ...exampleEnv, NODE_ENV: "production" }),
    ).toBeNull();
  });
});
