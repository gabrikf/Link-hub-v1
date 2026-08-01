/**
 * Image type detection by magic bytes (a.k.a. "content sniffing").
 *
 * The declared `Content-Type` of a multipart part is attacker-controlled, so it
 * must never be trusted on its own. These helpers inspect the leading bytes of
 * the uploaded buffer to confirm the file really is one of the image formats we
 * accept, and return the *detected* MIME type — which is what we hand to object
 * storage rather than the client-supplied header.
 */

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);

/** Default maximum accepted image size: 5 MB. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXTENSION: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Whether a client-declared content type is in our allow-list. */
export function isAllowedImageMimeType(
  mimeType: string | undefined | null,
): mimeType is AllowedImageMimeType {
  return typeof mimeType === "string" && ALLOWED_MIME_SET.has(mimeType);
}

/** File extension (no dot) for a detected image MIME type. */
export function extensionForImageMimeType(mimeType: AllowedImageMimeType): string {
  return MIME_TO_EXTENSION[mimeType];
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) {
    return false;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) {
      return false;
    }
  }
  return true;
}

function asciiEquals(buffer: Buffer, offset: number, text: string): boolean {
  if (buffer.length < offset + text.length) {
    return false;
  }
  return buffer.toString("latin1", offset, offset + text.length) === text;
}

/**
 * Detect the image MIME type of a buffer from its magic bytes.
 *
 * @returns the detected allowed MIME type, or `null` if the bytes do not match
 *   any accepted image format.
 */
export function detectImageMimeType(
  buffer: Buffer,
): AllowedImageMimeType | null {
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (asciiEquals(buffer, 0, "GIF87a") || asciiEquals(buffer, 0, "GIF89a")) {
    return "image/gif";
  }

  // WEBP: "RIFF" .... "WEBP" (RIFF container, WEBP form type at offset 8)
  if (asciiEquals(buffer, 0, "RIFF") && asciiEquals(buffer, 8, "WEBP")) {
    return "image/webp";
  }

  // AVIF: ISO-BMFF "ftyp" box at offset 4 with an AVIF brand.
  if (asciiEquals(buffer, 4, "ftyp")) {
    const majorBrand = buffer.toString("latin1", 8, 12);
    if (
      majorBrand === "avif" ||
      majorBrand === "avis" ||
      // `mif1`/`msf1` are used by some AVIF encoders as the major brand.
      majorBrand === "mif1" ||
      majorBrand === "msf1"
    ) {
      return "image/avif";
    }
  }

  return null;
}
