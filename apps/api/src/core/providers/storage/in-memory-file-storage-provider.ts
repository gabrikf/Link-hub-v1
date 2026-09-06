import type { Readable } from "node:stream";
import {
  IFileStorageProvider,
  UploadFileParams,
  UploadFileResult,
} from "./file-storage-provider.js";

/**
 * The real {@link IFileStorageProvider} interface, backed by a Map.
 *
 * Sibling of `InMemoryMailProvider`, and there for the same reason: the HTTP
 * suite must be able to drive `POST /me/uploads` through the exact zod schemas,
 * auth guard, magic-byte sniffing and error mapping that production uses,
 * without a bucket, a socket or a container. What it deliberately does NOT
 * prove is that the bytes reach an S3-compatible store and come back over an
 * anonymous GET — that is what
 * `infra/providers/s3-file-storage-provider.minio.e2e.test.ts` is for, against
 * real MinIO. The two are complements, not alternatives.
 *
 * It RECORDS rather than discards, so a test can assert the key the controller
 * chose and the content type it settled on after optimisation — the two things
 * a caller cannot see from the response body, and the two most likely to break.
 */
export class InMemoryFileStorageProvider implements IFileStorageProvider {
  /** Keyed by object key, in upload order. */
  readonly uploads = new Map<
    string,
    { body: Buffer; contentType: string; key: string }
  >();

  constructor(
    /** Mirrors a public bucket base URL; no trailing slash, as in production. */
    private readonly publicBaseUrl = "https://storage.test.crafthub",
  ) {}

  async upload({
    body,
    contentType,
    key,
  }: UploadFileParams): Promise<UploadFileResult> {
    const buffer = Buffer.isBuffer(body) ? body : await bufferFromStream(body);

    // Last write wins, exactly as an S3 PUT to an existing key does. A store
    // that rejected a repeat key here would let a test pass that would fail
    // against the real thing.
    this.uploads.set(key, { body: buffer, contentType, key });

    return { url: `${this.publicBaseUrl}/${key.replace(/^\/+/, "")}` };
  }

  /** The single upload a test made, when asserting on "the" upload. */
  get lastUpload() {
    // Index arithmetic rather than `Array.prototype.at`: apps/api's tsconfig
    // targets a lib older than es2022 (see the CLAUDE.md note about apps/api
    // not extending @repo/typescript-config).
    const all = [...this.uploads.values()];
    return all.length > 0 ? all[all.length - 1] : null;
  }
}

async function bufferFromStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunkToBuffer(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * A `Readable` yields `any`, so the chunk is narrowed rather than trusted.
 * These four shapes are every chunk Node produces for a byte stream; anything
 * else means the caller handed us an object-mode stream, which would have
 * thrown inside `Buffer.from` anyway — only later, and less legibly.
 */
function chunkToBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === "string") return Buffer.from(chunk);
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk);

  throw new TypeError(
    "Unsupported stream chunk: expected a Buffer, string, Uint8Array or ArrayBuffer.",
  );
}
