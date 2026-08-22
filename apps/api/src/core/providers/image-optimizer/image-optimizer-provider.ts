export type OptimizeImageParams = {
  /** Raw bytes of the image, already confirmed to be an image by magic bytes. */
  buffer: Buffer;
  /** Detected MIME type of `buffer`, e.g. `image/png`. */
  contentType: string;
};

export type OptimizeImageResult = {
  /** Bytes to store. May be the input buffer unchanged. */
  buffer: Buffer;
  /**
   * MIME type of `buffer`. Callers MUST use this rather than the input type for
   * both the stored object and the key's extension — an implementation is free
   * to hand back a different format (or to pass the original through) and the
   * two must never disagree.
   */
  contentType: string;
};

/**
 * Port for shrinking user-uploaded images before they reach object storage.
 *
 * WHY IT EXISTS: a modern phone photo is 3-5 MB at 4000px, and it is being
 * uploaded to be shown as a 96px avatar. We pay to store and to serve every one
 * of those bytes, forever. The concrete sharp-backed adapter lives in
 * `infra/providers`; `PassthroughImageOptimizerProvider` is the no-op fallback.
 *
 * CONTRACT: `optimize` must not reject. An optimiser that throws would cost a
 * user their upload, which is a worse outcome than storing an unoptimised file.
 */
export interface IImageOptimizerProvider {
  optimize(params: OptimizeImageParams): Promise<OptimizeImageResult>;
}
