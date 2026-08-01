import type { Readable } from "node:stream";

export interface UploadFileParams {
  /** Raw bytes (or a readable stream) of the object to store. */
  body: Buffer | Readable;
  /** MIME type of the object, e.g. `image/png`. */
  contentType: string;
  /** Object key/path within the bucket, e.g. `uploads/<userId>/<uuid>.png`. */
  key: string;
}

export interface UploadFileResult {
  /** Public, directly-embeddable URL of the stored object. */
  url: string;
}

/**
 * Port for persisting binary files (images, etc.) in an object store. The
 * concrete adapter (S3-compatible) lives in `infra/providers`.
 */
export interface IFileStorageProvider {
  upload(params: UploadFileParams): Promise<UploadFileResult>;
}
