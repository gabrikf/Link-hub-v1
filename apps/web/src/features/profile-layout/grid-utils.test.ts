import {
  DEFAULT_TABS_ENABLED,
  GRID_COLUMNS,
  type ProfileBlock,
} from "@repo/schemas";
import { describe, expect, it } from "vitest";
import {
  blocksToRglLayout,
  buildDefaultLayout,
  compactBlocks,
  computeNextPlacement,
  countBlocksHiddenWithoutTabs,
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
    expect(
      layout.blocks.every((block) => block.gridW === GRID_COLUMNS.pc),
    ).toBe(true);

    // Header AND links are pinned: a profile's always-visible zone is the photo,
    // the name and the links. `links` used to live in the tab and this assertion
    // said so — it encoded the old default.
    for (const kind of ["header", "links"] as const) {
      const block = layout.blocks.find((candidate) => candidate.kind === kind);
      expect(block?.pinnedAllTabs).toBe(true);
      expect(block?.tabId).toBeNull();
    }

    const resume = layout.blocks.find((block) => block.kind === "resume");
    expect(resume?.pinnedAllTabs).toBe(false);
    expect(resume?.tabId).toBe(layout.tabs[0].id);
  });

  /*
   * The legacy fallback keeps `tabsEnabled: true` even though a BRAND-NEW
   * account is created with it false. It fires only for a stored profile whose
   * response carries no layout at all, and it fabricates the resume/work/posts
   * blocks — reading false here would take those off a long-standing profile
   * that has simply never been arranged.
   */
  it("keeps the tab strip on, unlike a freshly created account", () => {
    expect(buildDefaultLayout("pc").tabsEnabled).toBe(true);
    expect(buildDefaultLayout("mobile").tabsEnabled).toBe(true);
    expect(DEFAULT_TABS_ENABLED).toBe(false);
  });

  it("uses the mobile column count for the mobile viewport", () => {
    const layout = buildDefaultLayout("mobile");
    expect(
      layout.blocks.every((block) => block.gridW === GRID_COLUMNS.mobile),
    ).toBe(true);
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
      tabsEnabled: true,
    };
    const full = { pc: custom, mobile: buildDefaultLayout("mobile") };

    expect(resolveViewportLayout(full, "pc")).toBe(custom);
  });

  it("falls back when the viewport has no tabs", () => {
    const full = {
      pc: { tabs: [], blocks: [], tabsEnabled: true },
      mobile: buildDefaultLayout("mobile"),
    };
    const layout = resolveViewportLayout(full, "pc");
    expect(layout.tabs).toHaveLength(1);
  });

  it("does NOT fall back when tabs are off — an empty tab list is the right answer", () => {
    /*
     * The reported bug, and it needed two correct changes to appear. The public
     * payload started omitting tabs for a profile with its tab section off, and
     * the empty-tabs fallback read that as "legacy profile" and fabricated the
     * default builtin blocks — so the page rendered a made-up arrangement of
     * exactly the content the owner had just hidden.
     */
    const pinnedOnly = {
      tabs: [],
      blocks: [makeBlock({ id: "p", tabId: null, pinnedAllTabs: true })],
      tabsEnabled: false,
    };
    const full = { pc: pinnedOnly, mobile: buildDefaultLayout("mobile") };

    const layout = resolveViewportLayout(full, "pc");

    expect(layout).toBe(pinnedOnly);
    expect(layout.tabs).toHaveLength(0);
    // Nothing invented: only the one pinned block the server actually sent.
    expect(layout.blocks.map((block) => block.id)).toEqual(["p"]);
  });

  it("still returns a tabs-off viewport that does have tabs, untouched", () => {
    // The owner's own editor payload keeps its tabs even with the section off.
    const withTabs = {
      tabs: [{ id: "t", title: "Main", order: 0 }],
      blocks: [makeBlock({ id: "x", tabId: "t" })],
      tabsEnabled: false,
    };
    const full = { pc: withTabs, mobile: buildDefaultLayout("mobile") };

    expect(resolveViewportLayout(full, "pc")).toBe(withTabs);
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
      makeBlock({
        id: "hidden",
        gridY: 2,
        gridW: 12,
        gridH: 2,
        isVisible: false,
      }),
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
    const blocks = [
      makeBlock({ id: "wide", gridX: 10, gridY: 5, gridW: 6, gridH: 2 }),
    ];

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
    const blocks = [
      makeBlock({ id: "a", gridX: 0, gridY: 0, gridW: 4, gridH: 2 }),
    ];

    const [moved] = moveBlockBy(blocks, "a", 2, 0, GRID_COLUMNS.pc);
    expect(moved.gridX).toBe(2);
  });

  it("clamps at the grid edges instead of pushing a block out of bounds", () => {
    const blocks = [
      makeBlock({ id: "a", gridX: 0, gridY: 0, gridW: 4, gridH: 2 }),
    ];

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

  /**
   * The delta the card actually sends is ONE row (`ArrowUp` -> `dy: -1` in
   * `grid-block-card.tsx`), and real blocks are much taller than one row. One
   * row can never clear a six-row neighbour: the vertical compactor floats the
   * block straight back down, so the press does nothing and the user cannot
   * reorder their profile without a mouse.
   */
  it("lifts a block over a taller neighbour with the one-row delta the card sends", () => {
    const blocks = [
      makeBlock({ id: "tall", gridX: 0, gridY: 0, gridW: 12, gridH: 6 }),
      makeBlock({ id: "short", gridX: 0, gridY: 6, gridW: 12, gridH: 2 }),
    ];

    const moved = moveBlockBy(blocks, "short", 0, -1, GRID_COLUMNS.pc);
    const byId = Object.fromEntries(moved.map((block) => [block.id, block]));

    expect(byId.short.gridY).toBe(0);
    expect(byId.tall.gridY).toBe(2);
  });

  it("drops a block under a shorter neighbour with the one-row delta the card sends", () => {
    const blocks = [
      makeBlock({ id: "tall", gridX: 0, gridY: 0, gridW: 12, gridH: 6 }),
      makeBlock({ id: "short", gridX: 0, gridY: 6, gridW: 12, gridH: 2 }),
    ];

    const moved = moveBlockBy(blocks, "tall", 0, 1, GRID_COLUMNS.pc);
    const byId = Object.fromEntries(moved.map((block) => [block.id, block]));

    expect(byId.short.gridY).toBe(0);
    expect(byId.tall.gridY).toBe(2);
  });

  it("returns the same blocks when a nudge has nowhere to go, so nothing is persisted", () => {
    const blocks = [
      makeBlock({ id: "tall", gridX: 0, gridY: 0, gridW: 12, gridH: 6 }),
      makeBlock({ id: "short", gridX: 0, gridY: 6, gridW: 12, gridH: 2 }),
    ];

    expect(moveBlockBy(blocks, "tall", 0, -1, GRID_COLUMNS.pc)).toBe(blocks);
    expect(moveBlockBy(blocks, "short", 0, 1, GRID_COLUMNS.pc)).toBe(blocks);
  });

  /**
   * Two half-width blocks sharing a row, with a full-width block under them —
   * a shape the 12-column grid exists for, and one the editor's own
   * shift+Arrow resize can build.
   *
   * Lifting the full-width block over that shared row shoves BOTH row-mates
   * out of the way, so intermediate rows exist where the layout changed but
   * the focused block did not budge. Stopping at one of those is what makes a
   * single ArrowUp fling an untouched neighbour to the bottom of the profile
   * and save it, while the block the user was nudging never moves.
   */
  it("lifts a block over a shared row without flinging its occupants", () => {
    const blocks = [
      makeBlock({ id: "left", gridX: 0, gridY: 0, gridW: 6, gridH: 6 }),
      makeBlock({ id: "right", gridX: 6, gridY: 0, gridW: 6, gridH: 6 }),
      makeBlock({ id: "wide", gridX: 0, gridY: 6, gridW: 12, gridH: 6 }),
    ];

    const moved = moveBlockBy(blocks, "wide", 0, -1, GRID_COLUMNS.pc);
    const byId = Object.fromEntries(moved.map((block) => [block.id, block]));

    // The focused block actually crossed the row above it...
    expect(byId.wide.gridY).toBe(0);
    // ...and its two neighbours came down together, still side by side.
    expect(byId.left.gridY).toBe(6);
    expect(byId.right.gridY).toBe(6);
    expect(byId.left.gridX).toBe(0);
    expect(byId.right.gridX).toBe(6);
  });

  it("drops one half of a shared row below the block under it, leaving its row-mate alone", () => {
    const blocks = [
      makeBlock({ id: "left", gridX: 0, gridY: 0, gridW: 6, gridH: 6 }),
      makeBlock({ id: "right", gridX: 6, gridY: 0, gridW: 6, gridH: 6 }),
      makeBlock({ id: "wide", gridX: 0, gridY: 6, gridW: 12, gridH: 6 }),
    ];

    const moved = moveBlockBy(blocks, "left", 0, 1, GRID_COLUMNS.pc);
    const byId = Object.fromEntries(moved.map((block) => [block.id, block]));

    expect(byId.left.gridY).toBe(12);
    // The row-mate is a bystander: it must not be dragged along or displaced.
    expect(byId.right.gridY).toBe(0);
    expect(byId.wide.gridY).toBe(6);

    // The bottom block has nowhere further down to go: same array, no PATCH.
    expect(moveBlockBy(blocks, "wide", 0, 1, GRID_COLUMNS.pc)).toBe(blocks);
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

describe("countBlocksHiddenWithoutTabs", () => {
  const layout = (blocks: ProfileBlock[]) => ({
    tabs: [
      { id: "tab-1", title: "Main", order: 0 },
      { id: "tab-2", title: "Posts", order: 1 },
      { id: "tab-3", title: "Talks", order: 2 },
    ],
    blocks,
    tabsEnabled: true,
  });

  it("ignores blocks the owner had already hidden", () => {
    // The public profile only renders `isVisible` blocks, so one that was
    // already off was never on the page — counting it would inflate the very
    // warning people rely on to trust the switch.
    expect(
      countBlocksHiddenWithoutTabs(
        layout([
          makeBlock({ id: "a", tabId: "tab-2", isVisible: false }),
          makeBlock({ id: "b", tabId: "tab-3", isVisible: true }),
        ]),
      ),
    ).toBe(1);
  });

  it("counts nothing when every tab block is already hidden", () => {
    expect(
      countBlocksHiddenWithoutTabs(
        layout([
          makeBlock({ id: "a", tabId: "tab-2", isVisible: false }),
          makeBlock({ id: "b", tabId: "tab-3", isVisible: false }),
        ]),
      ),
    ).toBe(0);
  });

  // UPDATED for the tabs-v3 rule. This used to expect 3, excluding the block
  // on the first tab, because tabs-off still published that tab. It does not
  // any more: with tabs off the page is the always-visible zone alone, so every
  // tab block is hidden and a count that skipped the first tab under-reported
  // exactly the surprise this warning exists to prevent.
  it("counts every block on every tab, the first one included", () => {
    expect(
      countBlocksHiddenWithoutTabs(
        layout([
          makeBlock({ id: "a", tabId: "tab-1" }),
          makeBlock({ id: "b", tabId: "tab-2" }),
          makeBlock({ id: "c", tabId: "tab-3" }),
          makeBlock({ id: "d", tabId: "tab-3" }),
        ]),
      ),
    ).toBe(4);
  });

  it("counts a block that sits on the FIRST tab", () => {
    // The single case the old rule got wrong: one block, on tab 1, visible.
    // Tabs off hides it, so the warning has to say so.
    expect(
      countBlocksHiddenWithoutTabs(
        layout([makeBlock({ id: "only", tabId: "tab-1" })]),
      ),
    ).toBe(1);
  });

  it("excludes pinned blocks — they render on every tab, so tabs-off cannot hide them", () => {
    expect(
      countBlocksHiddenWithoutTabs(
        layout([
          makeBlock({ id: "pin", tabId: null, pinnedAllTabs: true }),
          // A pinned block whose stale tabId still points at a later tab must
          // NOT be counted: `pinnedAllTabs` is what decides where it renders.
          makeBlock({ id: "pin-stale", tabId: "tab-2", pinnedAllTabs: true }),
          makeBlock({ id: "later", tabId: "tab-2" }),
        ]),
      ),
    ).toBe(1);
  });

  // UPDATED for the tabs-v3 rule: this used to expect 0 on the grounds that
  // the first tab kept rendering. It no longer does, so both blocks count.
  it("counts blocks that all live on the first tab", () => {
    expect(
      countBlocksHiddenWithoutTabs(
        layout([
          makeBlock({ id: "a", tabId: "tab-1" }),
          makeBlock({ id: "b", tabId: "tab-1" }),
        ]),
      ),
    ).toBe(2);
  });

  it("is zero when the layout has no tab blocks at all", () => {
    expect(
      countBlocksHiddenWithoutTabs(
        layout([makeBlock({ id: "pin", tabId: null, pinnedAllTabs: true })]),
      ),
    ).toBe(0);
  });

  // UPDATED for the tabs-v3 rule. Tab order used to decide which blocks were
  // spared; now nothing is spared, so the answer must be the same whatever
  // order the tabs are stored in — the case kept, its meaning inverted.
  it("is independent of tab order — every tab's blocks count", () => {
    const shuffled = {
      tabs: [
        { id: "tab-late", title: "Late", order: 5 },
        { id: "tab-early", title: "Early", order: 0 },
      ],
      blocks: [
        makeBlock({ id: "a", tabId: "tab-early" }),
        makeBlock({ id: "b", tabId: "tab-late" }),
      ],
      tabsEnabled: true,
    };

    expect(countBlocksHiddenWithoutTabs(shuffled)).toBe(2);
  });

  it("counts nothing for a layout with no tabs", () => {
    expect(
      countBlocksHiddenWithoutTabs({
        tabs: [],
        blocks: [makeBlock({ id: "a", tabId: "ghost" })],
        tabsEnabled: true,
      }),
    ).toBe(0);
  });
});
