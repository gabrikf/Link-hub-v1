import { GRID_COLUMNS, type ProfileBlock } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import {
  blocksToRglLayout,
  buildDefaultLayout,
  compactBlocks,
  computeNextPlacement,
  moveBlockBy,
  pickViewport,
  PROFILE_CANVAS_WIDTH,
  resizeBlockBy,
  resolveViewportLayout,
  rglLayoutToPositions,
} from "./grid-utils";

const makeBlock = (overrides: Partial<ProfileBlock>): ProfileBlock => ({
  id: "b",
  groupId: "g",
  kind: "text",
  tabId: "tab-1",
  gridX: 0,
  gridY: 0,
  gridW: 2,
  gridH: 2,
  isVisible: true,
  pinnedAllTabs: false,
  config: null,
  ...overrides,
});

describe("pickViewport", () => {
  it("maps the mobile flag to a viewport", () => {
    expect(pickViewport(true)).toBe("mobile");
    expect(pickViewport(false)).toBe("pc");
  });
});

describe("buildDefaultLayout", () => {
  it("builds a single-tab layout with full-width built-in blocks", () => {
    const layout = buildDefaultLayout("pc");

    expect(layout.tabs).toHaveLength(1);
    expect(layout.blocks.every((block) => block.gridW === GRID_COLUMNS.pc)).toBe(
      true,
    );

    const header = layout.blocks.find((block) => block.kind === "header");
    expect(header?.pinnedAllTabs).toBe(true);
    expect(header?.tabId).toBeNull();

    const links = layout.blocks.find((block) => block.kind === "links");
    expect(links?.pinnedAllTabs).toBe(false);
    expect(links?.tabId).toBe(layout.tabs[0].id);
  });

  it("uses the mobile column count for the mobile viewport", () => {
    const layout = buildDefaultLayout("mobile");
    expect(layout.blocks.every((block) => block.gridW === GRID_COLUMNS.mobile)).toBe(
      true,
    );
  });
});

describe("resolveViewportLayout", () => {
  it("falls back to the default layout when full layout is undefined", () => {
    const layout = resolveViewportLayout(undefined, "pc");
    expect(layout.tabs).toHaveLength(1);
    expect(layout.blocks.length).toBeGreaterThan(0);
  });

  it("returns the requested viewport when present", () => {
    const custom = {
      tabs: [{ id: "t", title: "Custom", order: 0 }],
      blocks: [makeBlock({ id: "x", tabId: "t" })],
    };
    const full = { pc: custom, mobile: buildDefaultLayout("mobile") };

    expect(resolveViewportLayout(full, "pc")).toBe(custom);
  });

  it("falls back when the viewport has no tabs", () => {
    const full = {
      pc: { tabs: [], blocks: [] },
      mobile: buildDefaultLayout("mobile"),
    };
    const layout = resolveViewportLayout(full, "pc");
    expect(layout.tabs).toHaveLength(1);
  });
});

describe("blocksToRglLayout / rglLayoutToPositions", () => {
  it("round-trips block geometry through the rgl layout shape", () => {
    const blocks = [
      makeBlock({ id: "a", gridX: 1, gridY: 2, gridW: 3, gridH: 4 }),
      makeBlock({ id: "b", gridX: 0, gridY: 6, gridW: 6, gridH: 2 }),
    ];

    const rgl = blocksToRglLayout(blocks);
    expect(rgl).toEqual([
      { i: "a", x: 1, y: 2, w: 3, h: 4 },
      { i: "b", x: 0, y: 6, w: 6, h: 2 },
    ]);

    const positions = rglLayoutToPositions(rgl);
    expect(positions).toEqual([
      { id: "a", gridX: 1, gridY: 2, gridW: 3, gridH: 4 },
      { id: "b", gridX: 0, gridY: 6, gridW: 6, gridH: 2 },
    ]);
  });
});

describe("compactBlocks", () => {
  it("returns an empty array for no blocks", () => {
    expect(compactBlocks([], GRID_COLUMNS.pc)).toEqual([]);
  });

  it("packs blocks upward, closing vertical holes", () => {
    const blocks = [
      makeBlock({ id: "a", gridX: 0, gridY: 3, gridW: 12, gridH: 2 }),
      makeBlock({ id: "b", gridX: 0, gridY: 9, gridW: 12, gridH: 2 }),
    ];

    const packed = compactBlocks(blocks, GRID_COLUMNS.pc);
    expect(packed.map((block) => block.gridY)).toEqual([0, 2]);
  });

  it("packs survivors to the top after a hidden middle block is filtered out", () => {
    // This is the public-profile case: `isVisible` is filtered AFTER the
    // editor assigned coordinates, so the middle block leaves a hole.
    const blocks = [
      makeBlock({ id: "a", gridY: 0, gridW: 12, gridH: 2 }),
      makeBlock({ id: "hidden", gridY: 2, gridW: 12, gridH: 2, isVisible: false }),
      makeBlock({ id: "c", gridY: 4, gridW: 12, gridH: 2 }),
      makeBlock({ id: "d", gridY: 6, gridW: 12, gridH: 2 }),
    ];

    const visible = blocks.filter((block) => block.isVisible);
    const packed = compactBlocks(visible, GRID_COLUMNS.pc);

    expect(packed.map((block) => block.id)).toEqual(["a", "c", "d"]);
    expect(packed.map((block) => block.gridY)).toEqual([0, 2, 4]);
  });

  it("keeps side-by-side blocks on the same row", () => {
    const blocks = [
      makeBlock({ id: "left", gridX: 0, gridY: 4, gridW: 6, gridH: 2 }),
      makeBlock({ id: "right", gridX: 6, gridY: 4, gridW: 6, gridH: 2 }),
    ];

    const packed = compactBlocks(blocks, GRID_COLUMNS.pc);
    expect(packed.map((block) => block.gridY)).toEqual([0, 0]);
    expect(packed.map((block) => block.gridX)).toEqual([0, 6]);
  });

  it("pulls out-of-bounds blocks back inside the column count", () => {
    const blocks = [makeBlock({ id: "wide", gridX: 10, gridY: 5, gridW: 6, gridH: 2 })];

    const [packed] = compactBlocks(blocks, GRID_COLUMNS.pc);
    expect(packed.gridX + packed.gridW).toBeLessThanOrEqual(GRID_COLUMNS.pc);
    expect(packed.gridY).toBe(0);
  });

  it("does not mutate the input blocks", () => {
    const blocks = [makeBlock({ id: "a", gridY: 7, gridW: 12, gridH: 2 })];

    compactBlocks(blocks, GRID_COLUMNS.pc);
    expect(blocks[0].gridY).toBe(7);
  });
});

describe("computeNextPlacement", () => {
  it("places a new block below the tallest existing block", () => {
    const blocks = [
      makeBlock({ id: "a", gridY: 0, gridH: 4 }),
      makeBlock({ id: "b", gridY: 4, gridH: 6 }),
    ];

    const placement = computeNextPlacement(blocks, "pc");
    expect(placement.gridY).toBe(10);
    expect(placement.gridX).toBe(0);
    expect(placement.gridW).toBeLessThanOrEqual(GRID_COLUMNS.pc);
  });

  it("spans the full width on mobile and starts at the top when empty", () => {
    const placement = computeNextPlacement([], "mobile");
    expect(placement.gridY).toBe(0);
    expect(placement.gridW).toBe(GRID_COLUMNS.mobile);
  });
});

describe("PROFILE_CANVAS_WIDTH", () => {
  /**
   * The editor and the published page both clamp to these. The pc value has to
   * leave a 12-column grid usable columns; the mobile value has to approximate
   * a phone's content box, or the mobile editor lies about column width (it
   * used to be edited at ~1169px and published at 293px).
   */
  it("keeps a pc column wide enough to be draggable and a mobile column phone-sized", () => {
    const gutter = 12;
    const pcColumn =
      (PROFILE_CANVAS_WIDTH.pc - (GRID_COLUMNS.pc - 1) * gutter) /
      GRID_COLUMNS.pc;
    const mobileColumn =
      (PROFILE_CANVAS_WIDTH.mobile - (GRID_COLUMNS.mobile - 1) * gutter) /
      GRID_COLUMNS.mobile;

    expect(pcColumn).toBeGreaterThan(60);
    expect(mobileColumn).toBeGreaterThan(60);
    // A phone content box, not a desktop one.
    expect(PROFILE_CANVAS_WIDTH.mobile).toBeLessThan(430);
  });
});

describe("moveBlockBy", () => {
  it("moves a block sideways within the grid", () => {
    const blocks = [makeBlock({ id: "a", gridX: 0, gridY: 0, gridW: 4, gridH: 2 })];

    const [moved] = moveBlockBy(blocks, "a", 2, 0, GRID_COLUMNS.pc);
    expect(moved.gridX).toBe(2);
  });

  it("clamps at the grid edges instead of pushing a block out of bounds", () => {
    const blocks = [makeBlock({ id: "a", gridX: 0, gridY: 0, gridW: 4, gridH: 2 })];

    expect(moveBlockBy(blocks, "a", -1, 0, GRID_COLUMNS.pc)[0].gridX).toBe(0);
    expect(moveBlockBy(blocks, "a", 0, -1, GRID_COLUMNS.pc)[0].gridY).toBe(0);

    const atEdge = [
      makeBlock({ id: "a", gridX: GRID_COLUMNS.pc - 4, gridW: 4, gridH: 2 }),
    ];
    expect(moveBlockBy(atEdge, "a", 1, 0, GRID_COLUMNS.pc)[0].gridX).toBe(
      GRID_COLUMNS.pc - 4,
    );
  });

  it("pushes neighbours aside and repacks, exactly like a mouse drag", () => {
    const blocks = [
      makeBlock({ id: "a", gridX: 0, gridY: 0, gridW: 12, gridH: 2 }),
      makeBlock({ id: "b", gridX: 0, gridY: 2, gridW: 12, gridH: 2 }),
    ];

    const moved = moveBlockBy(blocks, "b", 0, -2, GRID_COLUMNS.pc);
    const byId = Object.fromEntries(moved.map((block) => [block.id, block]));

    // b took the top row; a was pushed down and the zone stays gapless.
    expect(byId.b.gridY).toBe(0);
    expect(byId.a.gridY).toBe(2);
  });

  it("leaves the input untouched and ignores an unknown id", () => {
    const blocks = [makeBlock({ id: "a", gridX: 0, gridW: 4, gridH: 2 })];

    expect(moveBlockBy(blocks, "nope", 1, 0, GRID_COLUMNS.pc)).toBe(blocks);
    moveBlockBy(blocks, "a", 3, 0, GRID_COLUMNS.pc);
    expect(blocks[0].gridX).toBe(0);
  });
});

describe("resizeBlockBy", () => {
  it("grows and shrinks a block by whole grid cells", () => {
    const blocks = [makeBlock({ id: "a", gridX: 0, gridW: 4, gridH: 4 })];

    const [wider] = resizeBlockBy(blocks, "a", 2, 0, GRID_COLUMNS.pc);
    expect(wider.gridW).toBe(6);

    const [shorter] = resizeBlockBy(blocks, "a", 0, -1, GRID_COLUMNS.pc);
    expect(shorter.gridH).toBe(3);
  });

  it("honours the same minimums the mouse resize enforces", () => {
    const pc = [makeBlock({ id: "a", gridX: 0, gridW: 2, gridH: 2 })];
    expect(resizeBlockBy(pc, "a", -1, 0, GRID_COLUMNS.pc)).toBe(pc);
    expect(resizeBlockBy(pc, "a", 0, -1, GRID_COLUMNS.pc)).toBe(pc);

    // Mobile only has 4 columns, so a single-column block is legal there.
    const mobile = [makeBlock({ id: "a", gridX: 0, gridW: 2, gridH: 2 })];
    expect(
      resizeBlockBy(mobile, "a", -1, 0, GRID_COLUMNS.mobile)[0].gridW,
    ).toBe(1);
  });

  it("never lets a block grow past the right edge", () => {
    const blocks = [
      makeBlock({ id: "a", gridX: GRID_COLUMNS.pc - 2, gridW: 2, gridH: 2 }),
    ];

    const [resized] = resizeBlockBy(blocks, "a", 4, 0, GRID_COLUMNS.pc);
    expect(resized.gridX + resized.gridW).toBeLessThanOrEqual(GRID_COLUMNS.pc);
  });
});
