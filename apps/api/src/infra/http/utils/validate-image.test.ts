import { describe, expect, it } from "vitest";
import {
  detectImageMimeType,
  extensionForImageMimeType,
  isAllowedImageMimeType,
} from "./validate-image.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const gif87 = Buffer.from("GIF87a-rest-of-file", "latin1");
const gif89 = Buffer.from("GIF89a-rest-of-file", "latin1");

function webp(): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.write("RIFF", 0, "latin1");
  buffer.write("WEBP", 8, "latin1");
  return buffer;
}

function avif(brand: string): Buffer {
  const buffer = Buffer.alloc(16);
  // bytes 0-3 = box size (arbitrary), 4-7 = "ftyp", 8-11 = major brand
  buffer.writeUInt32BE(0x0000001c, 0);
  buffer.write("ftyp", 4, "latin1");
  buffer.write(brand, 8, "latin1");
  return buffer;
}

describe("detectImageMimeType", () => {
  it("detects each accepted format by magic bytes", () => {
    expect(detectImageMimeType(jpeg)).toBe("image/jpeg");
    expect(detectImageMimeType(png)).toBe("image/png");
    expect(detectImageMimeType(gif87)).toBe("image/gif");
    expect(detectImageMimeType(gif89)).toBe("image/gif");
    expect(detectImageMimeType(webp())).toBe("image/webp");
    expect(detectImageMimeType(avif("avif"))).toBe("image/avif");
    expect(detectImageMimeType(avif("mif1"))).toBe("image/avif");
  });

  it("returns null for non-image content (e.g. spoofed header)", () => {
    expect(detectImageMimeType(Buffer.from("%PDF-1.4", "latin1"))).toBeNull();
    expect(detectImageMimeType(Buffer.from("<html>", "latin1"))).toBeNull();
    expect(detectImageMimeType(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it("does not match RIFF containers that are not WEBP", () => {
    const wav = Buffer.alloc(16);
    wav.write("RIFF", 0, "latin1");
    wav.write("WAVE", 8, "latin1");
    expect(detectImageMimeType(wav)).toBeNull();
  });
});

describe("isAllowedImageMimeType", () => {
  it("accepts allow-listed types and rejects others", () => {
    expect(isAllowedImageMimeType("image/png")).toBe(true);
    expect(isAllowedImageMimeType("image/avif")).toBe(true);
    expect(isAllowedImageMimeType("image/svg+xml")).toBe(false);
    expect(isAllowedImageMimeType("application/pdf")).toBe(false);
    expect(isAllowedImageMimeType(undefined)).toBe(false);
  });
});

describe("extensionForImageMimeType", () => {
  it("maps MIME types to file extensions", () => {
    expect(extensionForImageMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForImageMimeType("image/webp")).toBe("webp");
  });
});
