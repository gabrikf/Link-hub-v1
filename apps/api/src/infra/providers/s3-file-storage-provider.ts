import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  IFileStorageProvider,
  UploadFileParams,
  UploadFileResult,
} from "../../core/providers/storage/file-storage-provider.js";

export interface S3FileStorageConfig {
  /** S3-compatible endpoint (Cloudflare R2 / MinIO / Supabase / AWS). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL used to read stored objects (CDN / public bucket URL). */
  publicBaseUrl: string;
}

/**
 * S3-compatible object storage adapter. Uses `forcePathStyle: true`, required
 * by MinIO and Cloudflare R2 (and safe for other providers).
 */
export class S3FileStorageProvider implements IFileStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3FileStorageConfig, client?: S3Client) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, "");
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async upload({
    body,
    contentType,
    key,
  }: UploadFileParams): Promise<UploadFileResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    const normalizedKey = key.replace(/^\/+/, "");
    return { url: `${this.publicBaseUrl}/${normalizedKey}` };
  }
}

/**
 * The local MinIO service in `docker-compose.dev.yml`.
 *
 * These are FIXTURE credentials for a container that only ever listens on the
 * loopback interface of a developer's own machine. They are checked in on
 * purpose, exactly like the `crafthub_user` / `crafthub_password` pair the dev
 * Postgres uses and the `admin123` pgAdmin login beside it: an object store you
 * have to configure by hand before an avatar upload works is an object store
 * nobody configures, and "upload is broken locally" is then indistinguishable
 * from a real bug. `resolveFileStorageConfig` below refuses to hand these back
 * in production.
 *
 * `endpoint` is `127.0.0.1` and `publicBaseUrl` is `localhost` on purpose, and
 * the split is not cosmetic. `endpoint` is dialled by NODE, where a v6-first
 * `localhost` resolution against a v4-only published Docker port is a real
 * failure mode; `publicBaseUrl` is pasted into an `<img src>` and read by a
 * HUMAN, and browsers resolve both.
 *
 * `publicBaseUrl` carries the bucket because the provider signs with
 * `forcePathStyle: true`, so an object lands at `<endpoint>/<bucket>/<key>`.
 */
export const LOCAL_MINIO_STORAGE_CONFIG: S3FileStorageConfig = {
  endpoint: "http://127.0.0.1:9000",
  // MinIO's own default region. `auto` (correct for R2) makes MinIO reject the
  // SigV4 signature once MINIO_REGION is set, which it is in the dev compose.
  region: "us-east-1",
  bucket: "crafthub-media",
  accessKeyId: "crafthub",
  secretAccessKey: "crafthub_secret",
  publicBaseUrl: "http://localhost:9000/crafthub-media",
};

/**
 * The five variables that are REQUIRED to reach a bucket — the same five
 * `readS3StorageConfigFromEnv` refuses to build a config without.
 *
 * `S3_REGION` is deliberately absent. It has a default (`auto`) and shipped
 * UNCOMMENTED in `.env.example` for as long as that file has existed, so it
 * sits in essentially every developer's `.env` while saying nothing about
 * whether they configured storage. Counting it as intent made the MinIO
 * fallback dead on arrival for exactly the people it was written for — found by
 * driving a real upload through a browser, not by reading the code.
 *
 * `.env.example` now comments the whole block out, but that does not retire
 * this exception: the `.env` files already on disk keep the line.
 */
const S3_REQUIRED_ENV_KEYS = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_BASE_URL",
] as const;

/**
 * `S3_ENDPOINT=` in a `.env` is a placeholder somebody has not filled in, not a
 * configured endpoint — so an empty string counts as absent here, the same way
 * `readS3StorageConfigFromEnv` treats it.
 */
function hasAnyS3EnvVar(env: NodeJS.ProcessEnv): boolean {
  return S3_REQUIRED_ENV_KEYS.some((key) => (env[key] ?? "").trim().length > 0);
}

/**
 * The storage configuration the app should actually run with.
 *
 * Three outcomes, in this order, and the order is the whole design:
 *
 * 1. **A complete `S3_*` environment wins, always.** Production, staging, and a
 *    developer deliberately pointed at real R2 all land here.
 * 2. **A PARTIAL `S3_*` environment is an error, not an invitation.** Somebody
 *    who set four of the five variables has a typo, and silently redirecting
 *    their uploads to a local container would hide it — they would push a
 *    profile photo that resolves to `localhost` for every visitor. `null`, and
 *    the caller's clear message.
 * 3. **Nothing set, outside production: the local MinIO in
 *    `docker-compose.dev.yml`.** This is the case the whole helper exists for.
 *    Image upload is the one feature that was simply unusable on a fresh clone,
 *    and "works after you sign up for Cloudflare" is not a working local setup.
 *
 * Production NEVER reaches case 3. There is no environment in which a deployed
 * CraftHub writes user photographs to a loopback address and reports success:
 * unconfigured production still fails loudly at the first upload, exactly as
 * before this fallback existed.
 */
export function resolveFileStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3FileStorageConfig | null {
  const fromEnv = readS3StorageConfigFromEnv(env);
  if (fromEnv) {
    return fromEnv;
  }

  if (hasAnyS3EnvVar(env)) {
    return null;
  }

  // Mirrors `app-config.ts`'s `nodeEnv()`: unset means development, which is
  // what `npm run dev` actually runs as. `test` is deliberately NOT included —
  // a unit test that reaches for object storage should say so with an explicit
  // config, not inherit one from the developer's docker.
  const nodeEnv = env.NODE_ENV ?? "development";
  if (nodeEnv !== "development") {
    return null;
  }

  return LOCAL_MINIO_STORAGE_CONFIG;
}

/**
 * Read the S3 storage configuration from the environment.
 *
 * @returns the config when every required variable is present, otherwise
 *   `null`. Callers should surface a clear error (rather than crashing at boot)
 *   when this returns `null`.
 */
export function readS3StorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3FileStorageConfig | null {
  /*
   * Trimmed, so a whitespace-only value counts as absent.
   *
   * `S3_BUCKET=" "` used to be truthy here and produced a config with a
   * one-space bucket name: the server booted, the upload route resolved a
   * provider, and the failure arrived as an opaque S3 error on the first
   * upload. It also disagreed with `hasAnyS3EnvVar` above, which does trim —
   * so the same `.env` could be "configured" to one function and "unset" to
   * the other. One reading, and it is the strict one.
   */
  const read = (key: string) => {
    const value = (env[key] ?? "").trim();
    return value.length > 0 ? value : undefined;
  };

  const endpoint = read("S3_ENDPOINT");
  const bucket = read("S3_BUCKET");
  const accessKeyId = read("S3_ACCESS_KEY_ID");
  const secretAccessKey = read("S3_SECRET_ACCESS_KEY");
  const publicBaseUrl = read("S3_PUBLIC_BASE_URL");
  const region = read("S3_REGION") ?? "auto";

  if (
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBaseUrl
  ) {
    return null;
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}
