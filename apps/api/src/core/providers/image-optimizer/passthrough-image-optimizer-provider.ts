import {
  IImageOptimizerProvider,
  OptimizeImageParams,
  OptimizeImageResult,
} from "./image-optimizer-provider.js";

/**
 * Stores exactly what was uploaded.
 *
 * Two jobs. In tests it keeps upload assertions about bytes and content types
 * honest without pulling a native image codec into every suite. In production it
 * is the container's fallback when `sharp` cannot be loaded — a missing or
 * mismatched native binding must degrade to "images are a bit big" and never to
 * "nobody can upload an avatar".
 */
export class PassthroughImageOptimizerProvider
  implements IImageOptimizerProvider
{
  async optimize(params: OptimizeImageParams): Promise<OptimizeImageResult> {
    return { buffer: params.buffer, contentType: params.contentType };
  }
}
