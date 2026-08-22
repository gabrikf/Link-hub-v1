import { createRequire } from "node:module";
import type { Sharp, SharpOptions } from "sharp";
import {
  IImageOptimizerProvider,
  OptimizeImageParams,
  OptimizeImageResult,
} from "../../core/providers/image-optimizer/image-optimizer-provider.js";
import { PassthroughImageOptimizerProvider } from "../../core/providers/image-optimizer/passthrough-image-optimizer-provider.js";
import { imageOptimizationConfig } from "../config/app-config.js";

export type SharpFactory = (input: Buffer, options?: SharpOptions) => Sharp;

/**
 * `sharp` is loaded through `createRequire` rather than a static `import`, and
 * only the *types* are imported statically (erased at compile time).
 *
 * WHY: sharp is a native addon. A platform mismatch in a Docker image or a
 * half-finished `npm install` makes loading it throw, and a static import would
 * turn that into a failure of the whole `container.ts` import chain — i.e. the
 * API would not boot at all because avatars might have been a bit large. Loading
 * it here lets `createImageOptimizerProvider()` catch the failure and fall back
 * to passthrough.
 */
function loadSharp(): SharpFactory {
  const require = createRequire(import.meta.url);
  const sharp = require("sharp") as SharpFactory & {
    concurrency?: (threads: number) => number;
  };

  /**
   * libvips defaults its thread pool to the number of CPU cores and uses it
   * PER concurrent image. On a shared 4GB box that multiplies the per-request
   * memory ceiling by the core count for a workload that is a handful of avatar
   * resizes a day. One thread each keeps the footprint predictable; resizing a
   * 5 MB photo single-threaded is still milliseconds.
   */
  sharp.concurrency?.(1);

  return sharp;
}

/**
 * Re-encoders per format. The output format always matches the input: a caller
 * has already decided the stored key's extension from the detected type, and
 * silently turning a PNG into a WebP would break every client that assumes the
 * two agree.
 *
 * `image/gif` is deliberately absent — see `optimize()`.
 */
const RE_ENCODERS: Record<
  string,
  (pipeline: Sharp, quality: number) => Sharp
> = {
  "image/jpeg": (pipeline, quality) => pipeline.jpeg({ quality, mozjpeg: true }),
  "image/png": (pipeline, quality) =>
    // PNG has no quality knob of its own; `palette: true` is what makes
    // `quality` mean anything (8-bit quantisation), and it is where the large
    // win on flat UI screenshots and logos comes from.
    pipeline.png({ quality, compressionLevel: 9, palette: true }),
  "image/webp": (pipeline, quality) => pipeline.webp({ quality }),
  // AVIF encoding is markedly slower than the others. It stays supported
  // because the upload path accepts AVIF, but it is a rare input in practice.
  "image/avif": (pipeline, quality) => pipeline.avif({ quality }),
};

/**
 * Shrinks uploaded images before they are stored.
 *
 * A phone photo arrives at ~4000px and 4 MB to be displayed as a 96px avatar or
 * a card banner. Bounding the longest side and re-encoding at a sane quality
 * typically removes 80-95% of the bytes we would otherwise pay to store and to
 * serve on every page view.
 */
export class SharpImageOptimizerProvider implements IImageOptimizerProvider {
  private readonly sharp: SharpFactory;

  /** The factory is injectable so tests can drive failure paths directly. */
  constructor(sharpFactory: SharpFactory = loadSharp()) {
    this.sharp = sharpFactory;
  }

  async optimize(params: OptimizeImageParams): Promise<OptimizeImageResult> {
    const original: OptimizeImageResult = {
      buffer: params.buffer,
      contentType: params.contentType,
    };

    const config = imageOptimizationConfig();

    // Full bypass, so the whole feature can be switched off from the
    // environment without a deploy if it ever misbehaves on real uploads.
    if (!config.enabled) {
      return original;
    }

    /**
     * GIF passes through untouched.
     *
     * Decoding one correctly requires `sharp(buffer, { animated: true })`,
     * which loads every frame into memory, and re-encoding it is both expensive
     * and visibly lossy — while a still GIF that took the animated path comes
     * back with its animation destroyed. The upload path allows GIF but it is a
     * rare input, so the cost of getting this wrong outweighs the bytes saved.
     */
    if (params.contentType === "image/gif") {
      return original;
    }

    const reEncode = RE_ENCODERS[params.contentType];

    // Unknown type: never guess. Storing it as-is is the only safe move.
    if (!reEncode) {
      return original;
    }

    // The config comes from the environment, and sharp rejects a quality
    // outside 1-100 or a dimension below 1 — which would silently turn every
    // upload into a passthrough via the catch below. Clamp instead.
    const quality = Math.min(100, Math.max(1, Math.round(config.quality)));
    const maxDimension = Math.max(1, Math.round(config.maxDimension));

    try {
      const pipeline = this.sharp(params.buffer, {
        /**
         * DECOMPRESSION-BOMB GUARD, and the reason this is not left at the
         * default. sharp's default ceiling is 0x3FFF^2 = 268,402,689 pixels —
         * about 1.07 GB once decoded to RGBA. The multipart limit upstream is
         * 10 MB, and a 16000x16000 PNG of flat colour compresses to a small
         * fraction of that, so a single upload could ask for a gigabyte inside
         * a container limited to 768 MB. The catch below is a correct failure
         * path but it only runs *after* the allocation, which is too late.
         *
         * 50 megapixels still accepts anything a real camera produces (a 50 MP
         * phone sensor is the current high end) while capping the decode at
         * roughly 200 MB.
         */
        limitInputPixels: 50_000_000,
        // Streams the source instead of holding the whole decoded image, which
        // matters most for exactly the large inputs above.
        sequentialRead: true,
      })
        /**
         * Applies the EXIF orientation to the pixels before we discard the tag.
         * Without this, a photo taken in portrait on a phone would be stored
         * sideways once its metadata is gone.
         */
        .rotate()
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: "inside",
          // A 200px avatar must come out at 200px. Upscaling to the bound would
          // cost bytes and produce a blurrier image than the one uploaded.
          withoutEnlargement: true,
        });

      /**
       * Metadata is dropped because sharp only preserves it when explicitly
       * asked (`withMetadata()`), and we deliberately never ask: the EXIF block
       * of a phone photo routinely carries GPS coordinates, the device serial
       * and a capture timestamp. Publishing an avatar to a public profile must
       * not publish where the user lives.
       *
       * Note there is no "keep whichever is smaller" comparison here on
       * purpose: an already-small image that grows by a few bytes on re-encode
       * is a much better trade than one that keeps its GPS tag.
       */
      const optimized = await reEncode(pipeline, quality).toBuffer();

      return { buffer: optimized, contentType: params.contentType };
    } catch {
      /**
       * Corrupt-but-plausible files (truncated downloads, exotic format
       * variants) get through the magic-byte sniff and then fail to decode.
       * Losing an upload because our optimiser choked is a worse outcome for
       * the user than storing an unoptimised file, so the original is stored
       * unchanged. Note this branch also covers decompression bombs: sharp's
       * built-in pixel limit rejects them here rather than in the heap.
       */
      return original;
    }
  }
}

let cached: IImageOptimizerProvider | undefined;

/**
 * Builds the optimiser for the DI container, falling back to passthrough when
 * sharp cannot be loaded. Memoised, so a transient registration still probes the
 * native binding only once and stays lazy — a worker process that never handles
 * an upload never loads the addon at all.
 */
export function createImageOptimizerProvider(): IImageOptimizerProvider {
  if (cached) {
    return cached;
  }

  try {
    cached = new SharpImageOptimizerProvider();
  } catch {
    // A broken native binding degrades to "images are stored as uploaded", not
    // to "nobody can upload an avatar".
    cached = new PassthroughImageOptimizerProvider();
  }

  return cached;
}
