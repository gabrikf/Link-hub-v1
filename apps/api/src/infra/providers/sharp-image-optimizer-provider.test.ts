import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { SharpImageOptimizerProvider } from "./sharp-image-optimizer-provider.js";

/**
 * Fixtures are generated with sharp itself rather than committed as binaries:
 * a repository of opaque test images is impossible to review, and a generated
 * one states its own intent (4000px, solid red, JPEG).
 */
async function makeImage(
  format: "jpeg" | "png" | "webp" | "gif",
  width: number,
  height: number,
): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  });

  if (format === "jpeg") return base.jpeg({ quality: 100 }).toBuffer();
  if (format === "png") return base.png().toBuffer();
  if (format === "webp") return base.webp({ quality: 100 }).toBuffer();
  return base.gif().toBuffer();
}

describe("SharpImageOptimizerProvider", () => {
  afterEach(() => {
    delete process.env.IMAGE_OPTIMIZATION_ENABLED;
    delete process.env.IMAGE_MAX_DIMENSION;
  });

  it("shrinks an oversized JPEG below the dimension limit", async () => {
    const provider = new SharpImageOptimizerProvider();
    const input = await makeImage("jpeg", 4000, 3000);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/jpeg",
    });

    const metadata = await sharp(result.buffer).metadata();

    // A phone photo uploaded to be shown as a 96px avatar. Every one of the
    // bytes we drop here is paid for on storage AND on every page view.
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBe(1200);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer.length).toBeLessThan(input.length);
  });

  it("does not enlarge a small image, and keeps its format", async () => {
    const provider = new SharpImageOptimizerProvider();
    const input = await makeImage("png", 200, 200);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/png",
    });

    const metadata = await sharp(result.buffer).metadata();

    // Upscaling a 200px avatar to the 1600px bound would cost bytes and hand
    // the user a blurrier image than the one they uploaded.
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(200);
    expect(metadata.format).toBe("png");
    expect(result.contentType).toBe("image/png");
  });

  it("re-encodes WebP as WebP", async () => {
    const provider = new SharpImageOptimizerProvider();
    const input = await makeImage("webp", 2400, 2400);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/webp",
    });

    const metadata = await sharp(result.buffer).metadata();

    // The stored key's extension comes from the detected type, so the format
    // must never silently change underneath it.
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1600);
    expect(result.contentType).toBe("image/webp");
  });

  it("strips metadata so an avatar cannot leak where the photo was taken", async () => {
    const provider = new SharpImageOptimizerProvider();
    const input = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .withExif({ IFD0: { Copyright: "linkhub", Software: "test-camera" } })
      .jpeg()
      .toBuffer();

    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/jpeg",
    });

    // The EXIF block of a real phone photo carries GPS coordinates and a device
    // serial alongside this.
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined();
  });

  it("passes GIF through byte-identically", async () => {
    const provider = new SharpImageOptimizerProvider();
    const input = await makeImage("gif", 2000, 2000);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/gif",
    });

    // Re-encoding an animated GIF needs `{ animated: true }`, is expensive, and
    // destroys the animation if the flag is missed. GIF uploads are rare enough
    // that the safe path wins.
    expect(result.buffer).toBe(input);
    expect(result.buffer.equals(input)).toBe(true);
    expect(result.contentType).toBe("image/gif");
  });

  it("returns the original when sharp cannot decode the buffer", async () => {
    const provider = new SharpImageOptimizerProvider();
    const garbage = Buffer.from(
      "\xff\xd8\xffnot actually a jpeg at all".repeat(20),
      "latin1",
    );

    const result = await provider.optimize({
      buffer: garbage,
      contentType: "image/jpeg",
    });

    // A user losing their upload because our optimiser choked is worse than
    // storing an unoptimised file.
    expect(result.buffer).toBe(garbage);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("returns the original when the sharp pipeline throws mid-encode", async () => {
    const provider = new SharpImageOptimizerProvider(() => {
      throw new Error("libvips exploded");
    });
    const input = await makeImage("png", 100, 100);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/png",
    });

    expect(result.buffer).toBe(input);
  });

  it("bypasses everything when optimisation is disabled", async () => {
    process.env.IMAGE_OPTIMIZATION_ENABLED = "false";

    const provider = new SharpImageOptimizerProvider();
    const input = await makeImage("jpeg", 3000, 3000);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/jpeg",
    });

    // The kill switch has to be total: no decode, no re-encode, same bytes.
    expect(result.buffer).toBe(input);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("honours a custom dimension limit", async () => {
    process.env.IMAGE_MAX_DIMENSION = "512";

    const provider = new SharpImageOptimizerProvider();
    const input = await makeImage("jpeg", 2000, 1000);

    const result = await provider.optimize({
      buffer: input,
      contentType: "image/jpeg",
    });

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(256);
  });
});
