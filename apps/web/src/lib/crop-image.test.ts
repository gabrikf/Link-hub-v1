import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCroppedImg } from "./crop-image";

/**
 * jsdom ships neither a canvas backend nor an image decoder, so everything the
 * helper touches is stubbed. That is deliberate: `node-canvas` is a native build
 * that regularly breaks CI and would still not decode EXIF the way a browser
 * does, so it would buy no real coverage. What IS worth asserting is the
 * arithmetic — bounding boxes, the downscale cap, and the encoder fallback.
 */

type ImageStubConfig = {
  naturalWidth: number;
  naturalHeight: number;
  shouldFail: boolean;
};

const imageStub: ImageStubConfig = {
  naturalWidth: 800,
  naturalHeight: 600,
  shouldFail: false,
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  currentSrc = "";

  set src(value: string) {
    this.currentSrc = value;
    // A real decode is async; a microtask keeps the ordering honest without
    // making every test wait on a timer.
    queueMicrotask(() => {
      if (imageStub.shouldFail) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = imageStub.naturalWidth;
      this.naturalHeight = imageStub.naturalHeight;
      this.width = imageStub.naturalWidth;
      this.height = imageStub.naturalHeight;
      this.onload?.();
    });
  }

  get src(): string {
    return this.currentSrc;
  }
}

/** `toBlob` behaviour, per call, so the WebP→JPEG fallback can be exercised. */
let blobTypeFor: (requestedType: string) => string | null;

const canvases: HTMLCanvasElement[] = [];
const drawCalls: unknown[][] = [];

const makeContext = () =>
  ({
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn((...args: unknown[]) => {
      drawCalls.push(args);
    }),
    imageSmoothingQuality: "low",
  }) as unknown as CanvasRenderingContext2D;

let contextFactory: () => CanvasRenderingContext2D | null = makeContext;

beforeEach(() => {
  imageStub.naturalWidth = 800;
  imageStub.naturalHeight = 600;
  imageStub.shouldFail = false;
  blobTypeFor = (requestedType) => requestedType;
  contextFactory = makeContext;
  canvases.length = 0;
  drawCalls.length = 0;

  vi.stubGlobal("Image", FakeImage);

  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions,
  ) => {
    const element = realCreateElement(tagName, options);
    if (tagName === "canvas") {
      canvases.push(element as HTMLCanvasElement);
    }
    return element;
  }) as typeof document.createElement);

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => contextFactory()) as HTMLCanvasElement["getContext"],
  );

  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ) {
    const resolvedType = blobTypeFor(type ?? "image/png");
    callback(
      resolvedType ? new Blob(["binary"], { type: resolvedType }) : null,
    );
  } as HTMLCanvasElement["toBlob"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const square = (size: number) => ({ x: 0, y: 0, width: size, height: size });

/** Pass 1 renders the rotated source; pass 2 is the output we encode. */
const rotatedCanvas = () => canvases[0];
const outputCanvas = () => canvases[1];

describe("getCroppedImg output sizing", () => {
  it("caps the output at 512 px on the longest edge", async () => {
    await getCroppedImg("blob:x", square(2000));

    expect(outputCanvas().width).toBe(512);
    expect(outputCanvas().height).toBe(512);
  });

  it("never upscales — a 400 px crop stays 400 px", async () => {
    await getCroppedImg("blob:x", square(400));

    expect(outputCanvas().width).toBe(400);
    expect(outputCanvas().height).toBe(400);
  });

  it("does not multiply by devicePixelRatio", async () => {
    vi.stubGlobal("devicePixelRatio", 3);

    await getCroppedImg("blob:x", square(300));

    // 300 * 3 = 900 would be the classic bug; `croppedAreaPixels` is already in
    // source pixels so the DPR must not enter the calculation at all.
    expect(outputCanvas().width).toBe(300);
  });

  it("draws the crop rectangle from the rotated canvas into the output", async () => {
    await getCroppedImg("blob:x", { x: 120, y: 40, width: 1024, height: 1024 });

    const cropDraw = drawCalls.at(-1);
    expect(cropDraw?.slice(1)).toEqual([120, 40, 1024, 1024, 0, 0, 512, 512]);
  });
});

describe("getCroppedImg rotation", () => {
  it("keeps the intermediate canvas at source size for 0°", async () => {
    await getCroppedImg("blob:x", square(200), 0);

    expect(rotatedCanvas().width).toBe(800);
    expect(rotatedCanvas().height).toBe(600);
  });

  it("sizes the intermediate canvas to the rotated bounding box at 90°", async () => {
    await getCroppedImg("blob:x", square(200), 90);

    expect(rotatedCanvas().width).toBe(600);
    expect(rotatedCanvas().height).toBe(800);
  });

  it("expands the bounding box for an off-axis angle", async () => {
    await getCroppedImg("blob:x", square(200), 45);

    // |cos45|*800 + |sin45|*600 === |sin45|*800 + |cos45|*600 === ~990
    expect(rotatedCanvas().width).toBe(990);
    expect(rotatedCanvas().height).toBe(990);
  });
});

describe("getCroppedImg encoding", () => {
  it("prefers WebP", async () => {
    const file = await getCroppedImg("blob:x", square(256), 0, "photo.png");

    expect(file.type).toBe("image/webp");
    expect(file.name).toBe("photo.webp");
  });

  it("falls back to JPEG when toBlob returns a mismatched type", async () => {
    // Old Safari silently answers an unsupported request with a PNG rather than
    // failing, so the requested type cannot be trusted.
    blobTypeFor = (requestedType) =>
      requestedType === "image/webp" ? "image/png" : "image/jpeg";

    const file = await getCroppedImg("blob:x", square(256), 0, "photo.heic");

    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("photo.jpg");
  });

  it("accepts whatever the JPEG fallback actually produced", async () => {
    blobTypeFor = () => "image/png";

    const file = await getCroppedImg("blob:x", square(256));

    expect(file.type).toBe("image/png");
    expect(file.name).toBe("avatar.png");
  });

  it("returns a real File carrying the encoded bytes", async () => {
    const file = await getCroppedImg("blob:x", square(256));

    expect(file).toBeInstanceOf(File);
    expect(file.size).toBeGreaterThan(0);
  });

  it("defaults the base name when given a bare extension", async () => {
    const file = await getCroppedImg("blob:x", square(64), 0, ".png");

    expect(file.name).toBe("avatar.webp");
  });
});

describe("getCroppedImg failures", () => {
  it("throws a friendly error when getContext returns null", async () => {
    contextFactory = () => null;

    await expect(getCroppedImg("blob:x", square(256))).rejects.toThrow(
      /browser couldn't process this image/i,
    );
  });

  it("throws a friendly error when encoding fails entirely", async () => {
    blobTypeFor = () => null;

    await expect(getCroppedImg("blob:x", square(256))).rejects.toThrow(
      /couldn't process that image/i,
    );
  });

  it("throws a friendly error when the image cannot be decoded", async () => {
    imageStub.shouldFail = true;

    await expect(getCroppedImg("blob:x", square(256))).rejects.toThrow(
      /couldn't read that image/i,
    );
  });
});

describe("getCroppedImg canvas safety", () => {
  it("sets crossOrigin before assigning src so remote sources cannot taint", async () => {
    let observed: string | null = "unset";
    class ObservingImage extends FakeImage {
      override set src(value: string) {
        observed = this.crossOrigin;
        super.src = value;
      }
      override get src(): string {
        return super.src;
      }
    }
    vi.stubGlobal("Image", ObservingImage);

    await getCroppedImg("https://cdn.example.com/a.png", square(64));

    expect(observed).toBe("anonymous");
  });
});
