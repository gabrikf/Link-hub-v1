/**
 * Client-side rasteriser for the avatar cropper.
 *
 * Takes the `croppedAreaPixels` rectangle that react-easy-crop reports plus a
 * rotation in degrees and produces a real `File`, ready for {@link uploadImage}.
 *
 * Because the output is bounded at 512x512 (see {@link MAX_OUTPUT_PX}), a 12 MP
 * phone photo lands at roughly 30-60 kB — cropping before uploading removes the
 * 5 MB upload-limit failure mode for avatars entirely.
 */

/**
 * The rectangle react-easy-crop hands back. Structurally identical to its `Area`
 * type, redeclared here so this module stays free of a UI-library import.
 */
export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Longest edge of the encoded avatar. Anything larger is wasted bytes. */
const MAX_OUTPUT_PX = 512;

const ENCODE_QUALITY = 0.85;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Deliberately `new Image()` and NOT `createImageBitmap`.
 *
 * The browser applies EXIF orientation when decoding into an `HTMLImageElement`,
 * so `naturalWidth`/`naturalHeight` are the *oriented* dimensions — the exact
 * coordinate space react-easy-crop measured `croppedAreaPixels` in. An
 * `ImageBitmap` uses the raw, unoriented buffer, so mixing the two silently
 * rotates every portrait iPhone photo by 90 degrees.
 *
 * `crossOrigin = "anonymous"` matters even though we normally pass a blob URL:
 * a remote `src` without it taints the canvas and `toBlob` throws a
 * `SecurityError` instead of returning data.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("We couldn't read that image. Please try another file."));
    image.src = src;
  });
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(
      "Your browser couldn't process this image. Try a different browser.",
    );
  }
  return context;
}

/** `toBlob` is callback-based and can hand back `null` on failure. */
function encode(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, ENCODE_QUALITY);
  });
}

/**
 * Older Safari silently ignores an unsupported `type` and returns a PNG rather
 * than failing, so the requested type is worthless — check what actually came
 * back before trusting it.
 */
async function encodeBest(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await encode(canvas, "image/webp");
  if (webp && webp.type === "image/webp") {
    return webp;
  }

  const jpeg = await encode(canvas, "image/jpeg");
  if (jpeg) {
    return jpeg;
  }

  throw new Error("We couldn't process that image. Please try another file.");
}

/** Strips any existing extension so we can append the one we actually encoded. */
function baseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, "");
  return withoutExtension.trim() || "avatar";
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Crop `src` to `pixelCrop` (after applying `rotation`) and encode the result.
 *
 * The output is the SQUARE crop with no alpha channel — CSS `rounded-full`
 * draws the circle at render time. Keeping the bitmap square means the source
 * stays reusable (a future re-crop, a non-circular surface) and lets us use
 * lossy formats, which a transparent-corner PNG could not.
 */
export async function getCroppedImg(
  src: string,
  pixelCrop: PixelCrop,
  rotation = 0,
  fileName = "avatar",
): Promise<File> {
  const image = await loadImage(src);

  // `naturalWidth` is the oriented size; the `width` fallback keeps this working
  // under test doubles that only set the layout dimensions.
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  // --- Pass 1: bake the rotation into a canvas sized to the rotated bounding
  // box. react-easy-crop reports `croppedAreaPixels` in THIS space, so the crop
  // rectangle can be applied directly against it in pass 2.
  const radians = toRadians(rotation);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const boxWidth = Math.round(cos * sourceWidth + sin * sourceHeight);
  const boxHeight = Math.round(sin * sourceWidth + cos * sourceHeight);

  const rotated = document.createElement("canvas");
  rotated.width = boxWidth;
  rotated.height = boxHeight;
  const rotatedContext = getContext2d(rotated);

  rotatedContext.translate(boxWidth / 2, boxHeight / 2);
  rotatedContext.rotate(radians);
  rotatedContext.translate(-sourceWidth / 2, -sourceHeight / 2);
  rotatedContext.drawImage(image, 0, 0);

  // --- Pass 2: extract the crop and downscale it in the same `drawImage`.
  //
  // NOTE: do NOT multiply by `devicePixelRatio` here. `croppedAreaPixels` is
  // already expressed in SOURCE pixels, not CSS pixels, so a DPR multiplier just
  // inflates the file (and can upscale past the real resolution). That is the
  // single most common bug in blog-post versions of this helper.
  const longestEdge = Math.max(pixelCrop.width, pixelCrop.height);
  // `min(…, 1)` — cap the output, but never upscale a crop that is already small.
  const scale = longestEdge > 0 ? Math.min(MAX_OUTPUT_PX / longestEdge, 1) : 1;
  const outputWidth = Math.max(1, Math.round(pixelCrop.width * scale));
  const outputHeight = Math.max(1, Math.round(pixelCrop.height * scale));

  const output = document.createElement("canvas");
  output.width = outputWidth;
  output.height = outputHeight;
  const outputContext = getContext2d(output);
  outputContext.imageSmoothingQuality = "high";

  outputContext.drawImage(
    rotated,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await encodeBest(output);
  const extension = EXTENSION_BY_MIME[blob.type] ?? "jpg";

  return new File([blob], `${baseName(fileName)}.${extension}`, {
    type: blob.type,
  });
}
