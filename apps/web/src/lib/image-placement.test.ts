import { describe, expect, it } from "vitest";
import {
  canPanImage,
  clampPlacement,
  coveredSize,
  panPlacement,
  placementOverflow,
  placementStyle,
  safeAreaRect,
  visibleImageRect,
} from "./image-placement";

/**
 * The geometry that decides whether the face the owner dragged into frame is
 * still there when the page renders. Every number below is checked against the
 * frame it is drawn into, not against a snapshot.
 */

/** A 1200x1200 square photo dropped into a 3:1 banner strip. */
const SQUARE = { width: 1200, height: 1200 };
const BANNER = { width: 900, height: 300 };

describe("coveredSize", () => {
  it("scales a square photo up until it fills a wide frame", () => {
    // cover = max(900/1200, 300/1200) = 0.75 -> 900x900 inside a 900x300 frame.
    expect(coveredSize(BANNER, SQUARE, 1)).toEqual({ width: 900, height: 900 });
  });

  it("multiplies by the zoom", () => {
    expect(coveredSize(BANNER, SQUARE, 2)).toEqual({
      width: 1800,
      height: 1800,
    });
  });

  it("returns null rather than dividing by zero for an unmeasured frame", () => {
    expect(coveredSize({ width: 0, height: 0 }, SQUARE, 1)).toBeNull();
    expect(coveredSize(BANNER, { width: 0, height: 0 }, 1)).toBeNull();
  });
});

describe("placementOverflow", () => {
  it("reports only the axis that actually has hidden pixels", () => {
    // 900x900 in a 900x300 frame: nothing hidden sideways, 600px hidden below.
    expect(placementOverflow(BANNER, SQUARE, 1)).toEqual({
      width: 0,
      height: 600,
    });
  });

  it("zooming creates overflow on the axis that had none", () => {
    expect(placementOverflow(BANNER, SQUARE, 2)).toEqual({
      width: 900,
      height: 1500,
    });
  });

  it("never reports a negative overflow", () => {
    const overflow = placementOverflow(
      { width: 900, height: 300 },
      { width: 900, height: 300 },
      1,
    );
    expect(overflow).toEqual({ width: 0, height: 0 });
  });
});

describe("panPlacement", () => {
  const centered = { x: 50, y: 50, scale: 1 };

  it("moves the picture the way the pointer moved", () => {
    // 600px of vertical overflow; dragging DOWN by 60px reveals more of the
    // TOP of the photo, i.e. y decreases by 60/600 = 10 percentage points.
    const next = panPlacement(centered, { dx: 0, dy: 60 }, BANNER, SQUARE);
    expect(next.y).toBe(40);
  });

  it("dragging up moves toward the bottom of the photo", () => {
    const next = panPlacement(centered, { dx: 0, dy: -60 }, BANNER, SQUARE);
    expect(next.y).toBe(60);
  });

  it("does nothing on an axis with no hidden pixels", () => {
    // A square photo in a 3:1 frame at 1x hides nothing horizontally, so a
    // sideways drag must not move it — and must not produce Infinity.
    const next = panPlacement(centered, { dx: 200, dy: 0 }, BANNER, SQUARE);
    expect(next.x).toBe(50);
  });

  it("clamps at the edges instead of running off", () => {
    const next = panPlacement(centered, { dx: 0, dy: 100_000 }, BANNER, SQUARE);
    expect(next.y).toBe(0);

    const other = panPlacement(
      centered,
      { dx: 0, dy: -100_000 },
      BANNER,
      SQUARE,
    );
    expect(other.y).toBe(100);
  });

  it("keeps the zoom it was given", () => {
    const next = panPlacement(
      { x: 50, y: 50, scale: 2.5 },
      { dx: 10, dy: 10 },
      BANNER,
      SQUARE,
    );
    expect(next.scale).toBe(2.5);
  });

  it("survives a drag that starts before the image reported its size", () => {
    const next = panPlacement(
      centered,
      { dx: 30, dy: 30 },
      { width: 0, height: 0 },
      { width: 0, height: 0 },
    );
    expect(next).toEqual(centered);
  });
});

describe("clampPlacement", () => {
  it("holds the schema's bounds", () => {
    expect(clampPlacement({ x: -20, y: 180, scale: 9 })).toEqual({
      x: 0,
      y: 100,
      scale: 3,
    });
    expect(clampPlacement({ x: 10, y: 10, scale: 0.2 })).toEqual({
      x: 10,
      y: 10,
      scale: 1,
    });
  });

  it("rounds to two decimals so the stored value stays readable", () => {
    expect(clampPlacement({ x: 33.333333, y: 66.666666, scale: 1.23456 })).toEqual(
      { x: 33.33, y: 66.67, scale: 1.23 },
    );
  });

  it("replaces NaN with the centred default rather than sending it to the API", () => {
    expect(clampPlacement({ x: NaN, y: NaN, scale: NaN })).toEqual({
      x: 50,
      y: 50,
      scale: 1,
    });
  });
});

describe("placementStyle", () => {
  it("puts the SAME pair on object-position and transform-origin", () => {
    // If these two ever disagree, zooming drifts away from the point the user
    // chose — the whole feature silently stops working.
    const style = placementStyle({ x: 20, y: 80, scale: 1.5 });
    expect(style.objectPosition).toBe("20% 80%");
    expect(style.transformOrigin).toBe("20% 80%");
    expect(style.transform).toBe("scale(1.5)");
  });

  it("renders a missing placement as a plain centred cover", () => {
    expect(placementStyle(null)).toEqual({
      objectPosition: "50% 50%",
      transformOrigin: "50% 50%",
      transform: "scale(1)",
    });
  });
});

describe("canPanImage", () => {
  // 3:1 is the banner strip.
  it("says a portrait photo can move inside a wide frame", () => {
    expect(canPanImage(3, { width: 600, height: 900 }, 1)).toBe(true);
  });

  it("says a photo of exactly the frame's shape cannot", () => {
    // Nothing is hidden, so a drag would do nothing — the editor has to say
    // "zoom in" rather than invite a gesture with no effect.
    expect(canPanImage(3, { width: 900, height: 300 }, 1)).toBe(false);
    expect(canPanImage(16 / 9, { width: 1600, height: 900 }, 1)).toBe(false);
  });

  it("says any zoom above 1 always leaves something to reveal", () => {
    expect(canPanImage(3, { width: 900, height: 300 }, 1.1)).toBe(true);
  });

  it("answers false rather than throwing before the image reports a size", () => {
    expect(canPanImage(3, { width: 0, height: 0 }, 1)).toBe(false);
  });
});

describe("visibleImageRect", () => {
  it("shows the whole width and a slice of the height for a tall photo", () => {
    // A 600x900 portrait in a 3:1 frame: the full width, a third of the height.
    const rect = visibleImageRect(3, { width: 600, height: 900 }, {
      x: 50,
      y: 50,
      scale: 1,
    });
    expect(rect?.width).toBe(1);
    expect(rect?.height).toBeCloseTo(600 / 900 / 3, 5);
    // Centred vertically.
    expect(rect?.top).toBeCloseTo((1 - 600 / 900 / 3) / 2, 5);
  });

  it("slides the slice with the focal point", () => {
    const top = visibleImageRect(3, { width: 600, height: 900 }, {
      x: 50,
      y: 0,
      scale: 1,
    });
    expect(top?.top).toBe(0);

    const bottom = visibleImageRect(3, { width: 600, height: 900 }, {
      x: 50,
      y: 100,
      scale: 1,
    });
    expect((bottom?.top ?? 0) + (bottom?.height ?? 0)).toBeCloseTo(1, 5);
  });

  it("zooming shows less of the photo", () => {
    const rect = visibleImageRect(3, { width: 600, height: 900 }, {
      x: 50,
      y: 50,
      scale: 2,
    });
    expect(rect?.width).toBeCloseTo(0.5, 5);
  });

  it("returns null before the image reports a size", () => {
    expect(
      visibleImageRect(3, { width: 0, height: 0 }, { x: 50, y: 50, scale: 1 }),
    ).toBeNull();
  });
});

describe("safeAreaRect", () => {
  // The two shapes one banner is really published at.
  const PHONE_COVER = 374 / 176;
  const DESKTOP_COVER = 1120 / 176;
  const PORTRAIT = { width: 600, height: 900 };

  it("marks the narrow desktop band inside the taller phone frame", () => {
    const rect = safeAreaRect(PHONE_COVER, DESKTOP_COVER, PORTRAIT, {
      x: 50,
      y: 50,
      scale: 1,
    });

    // The desktop cover is ~3x wider for the same height, so it keeps ~1/3 of
    // what the phone frame shows.
    expect(rect?.height).toBeCloseTo(PHONE_COVER / DESKTOP_COVER, 4);
    expect(rect?.width).toBe(1);
    // Centred placement -> centred band.
    expect(rect?.top).toBeCloseTo((1 - PHONE_COVER / DESKTOP_COVER) / 2, 4);
  });

  it("moves the band with the photograph", () => {
    const high = safeAreaRect(PHONE_COVER, DESKTOP_COVER, PORTRAIT, {
      x: 50,
      y: 0,
      scale: 1,
    });
    const low = safeAreaRect(PHONE_COVER, DESKTOP_COVER, PORTRAIT, {
      x: 50,
      y: 100,
      scale: 1,
    });

    expect(high?.top).toBeCloseTo(0, 4);
    expect((low?.top ?? 0) + (low?.height ?? 0)).toBeCloseTo(1, 4);
  });

  it("draws nothing when both shapes keep the same crop", () => {
    // Nothing extra is cropped, so an overlay would just trace the frame.
    expect(
      safeAreaRect(3, 3, PORTRAIT, { x: 50, y: 50, scale: 1 }),
    ).toBeNull();
  });

  it("stays inside the frame it is drawn on", () => {
    for (const y of [0, 17, 50, 83, 100]) {
      const rect = safeAreaRect(PHONE_COVER, DESKTOP_COVER, PORTRAIT, {
        x: 50,
        y,
        scale: 1,
      });
      expect(rect?.top).toBeGreaterThanOrEqual(0);
      expect((rect?.top ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("returns null before the image reports a size", () => {
    expect(
      safeAreaRect(PHONE_COVER, DESKTOP_COVER, { width: 0, height: 0 }, {
        x: 50,
        y: 50,
        scale: 1,
      }),
    ).toBeNull();
  });
});
