import { GRID_COLUMNS, type ProfileBlock } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import {
  blocksToRglLayout,
  buildDefaultLayout,
  computeNextPlacement,
  pickViewport,
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
