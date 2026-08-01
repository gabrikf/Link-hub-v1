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
 * Read the S3 storage configuration from the environment.
 *
 * @returns the config when every required variable is present, otherwise
 *   `null`. Callers should surface a clear error (rather than crashing at boot)
 *   when this returns `null`.
 */
export function readS3StorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3FileStorageConfig | null {
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  const publicBaseUrl = env.S3_PUBLIC_BASE_URL;
  const region = env.S3_REGION && env.S3_REGION.length > 0 ? env.S3_REGION : "auto";

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
