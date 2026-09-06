import type { ProfileBlock } from "@repo/schemas";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { assertDefined } from "../../../test-support/assert-defined";
import { PROFILE_CANVAS_WIDTH, type GridLayoutItem } from "../grid-utils";
import { ensureProcessShim } from "../process-shim";
import { EditorGrid } from "./editor-grid";

/**
 * react-grid-layout bundles react-draggable, whose `log()` reads
 * `process.env.DRAGGABLE_DEBUG` at the start of every drag/resize. In the
 * browser `process` is undefined, so without the shim that read throws and the
 * gesture aborts — the drag/resize silently does nothing. This regression has
 * landed three times, so guard the shim explicitly.
 */
describe("editor-grid process shim", () => {
  it("leaves process.env defined after importing the module", () => {
    // Importing editor-grid runs ensureProcessShim() at module load.
    expect(
      (globalThis as { process?: { env?: unknown } }).process?.env,
    ).toBeDefined();
  });

  it("installs process.env when the runtime has no process global", () => {
    const scope = globalThis as { process?: unknown };
    const original = scope.process;
    try {
      delete scope.process;
      ensureProcessShim();
      expect(
        (globalThis as { process?: { env?: unknown } }).process?.env,
      ).toBeDefined();
    } finally {
      scope.process = original;
    }
  });
});

const makeBlock = (overrides: Partial<ProfileBlock>): ProfileBlock => ({
  id: "block",
  groupId: "g",
  kind: "text",
  tabId: "tab-1",
  gridX: 0,
  gridY: 0,
  gridW: 12,
  gridH: 2,
  isVisible: true,
  pinnedAllTabs: false,
  config: null,
  ...overrides,
});

const renderGrid = (
  blocks: ProfileBlock[],
  onChange: (items: GridLayoutItem[]) => void = () => {},
) =>
  render(
    <EditorGrid
      blocks={blocks}
      cols={12}
      viewport="pc"
      onChange={onChange}
      renderCard={(block) => <div>card-{block.id}</div>}
    />,
  );

/**
 * jsdom has no ResizeObserver, but none is needed: `useContainerWidth` guards
 * it and `measureBeforeMount` defaults to false, so the grid still renders.
 *
 * Vertical geometry is fully assertable regardless of the measured container
 * width. The default position strategy is transform-based (`cssTransforms`), so
 * items carry `transform: translate(<x>px,<y>px)` rather than a `top`. The Y
 * offset is `containerPaddingY + gridY * (rowHeight + marginY)`; with the
 * grid's rowHeight 40 and margin 12 that is `12 + gridY * 52`.
 */
const ROW_PITCH = 52;
const PADDING_Y = 12;

/** Y offset in grid rows for the nth (1-based) rendered grid item. */
const rowOf = (container: HTMLElement, nth: number): number => {
  const item = container.querySelector<HTMLElement>(
    `.react-grid-item:nth-child(${nth})`,
  );
  const match = item?.style.transform.match(
    /translate\(\s*-?[\d.]+px\s*,\s*(-?[\d.]+)px\s*\)/,
  );
  if (!match) {
    throw new Error(
      `No translate() transform on grid item ${nth}: ${item?.style.transform}`,
    );
  }
  return (Number(match[1]) - PADDING_Y) / ROW_PITCH;
};

describe("EditorGrid vertical compaction", () => {
  it("packs a layout with a vertical hole up to the top", () => {
    // Second block starts at row 7, leaving a five-row hole under the first.
    const blocks = [
      makeBlock({ id: "a", gridY: 0, gridH: 2 }),
      makeBlock({ id: "b", gridY: 7, gridH: 2 }),
    ];

    const onChange = vi.fn();
    const { container } = renderGrid(blocks, onChange);

    // The compacted geometry is reported back so it can be persisted — this is
    // how legacy layouts containing holes get migrated on first open.
    expect(onChange).toHaveBeenCalledTimes(1);
    const [firstCall] = onChange.mock.calls;
    assertDefined(firstCall, "the first onChange call");
    const reported = firstCall[0] as GridLayoutItem[];
    expect(reported.find((item) => item.i === "b")?.y).toBe(2);

    // ...and it is rendered packed: the hole is gone, b sits right under a.
    expect(rowOf(container, 1)).toBe(0);
    expect(rowOf(container, 2)).toBe(2);
  });

  it("keeps side-by-side blocks on the same row", () => {
    const blocks = [
      makeBlock({ id: "left", gridX: 0, gridY: 0, gridW: 6, gridH: 2 }),
      makeBlock({ id: "right", gridX: 6, gridY: 0, gridW: 6, gridH: 2 }),
    ];

    const { container } = renderGrid(blocks);
    expect(rowOf(container, 1)).toBe(0);
    expect(rowOf(container, 2)).toBe(0);
  });

  /**
   * The single most valuable test here. GridLayout's mount effect calls
   * `onLayoutChange` unconditionally whenever its internal layout is not
   * `deepEqual` to the `layout` prop — and it never is, because the internal
   * items are 14-key clones while ours carry 7 keys. Without the geometry guard
   * in EditorGrid, EVERY mount, tab switch and pc/mobile switch would PATCH the
   * server with geometry nobody touched.
   */
  it("never fires onChange for an already-compacted layout", () => {
    const blocks = [
      makeBlock({ id: "a", gridY: 0, gridH: 2 }),
      makeBlock({ id: "b", gridY: 2, gridH: 2 }),
      makeBlock({ id: "c", gridY: 4, gridH: 2 }),
    ];

    const onChange = vi.fn();
    renderGrid(blocks, onChange);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EditorGrid canvas width", () => {
  /**
   * The editor canvas used to be ~1.9x wider per column than the published
   * page (1169px vs 670px for the same 12 columns), and on mobile 4.6x
   * (1169px vs 293px). Both canvases now clamp to the same
   * `PROFILE_CANVAS_WIDTH`, so a column is the same pixel width in each.
   */
  it("clamps each viewport's canvas to the shared profile canvas width", () => {
    const blocks = [makeBlock({ id: "a" })];

    const { container: pc } = render(
      <EditorGrid
        blocks={blocks}
        cols={12}
        viewport="pc"
        onChange={() => {}}
        renderCard={(block) => <div>card-{block.id}</div>}
      />,
    );
    const { container: mobile } = render(
      <EditorGrid
        blocks={blocks}
        cols={4}
        viewport="mobile"
        onChange={() => {}}
        renderCard={(block) => <div>card-{block.id}</div>}
      />,
    );

    expect(
      pc.querySelector<HTMLElement>(".editor-grid-zone")?.style.maxWidth,
    ).toBe(`${PROFILE_CANVAS_WIDTH.pc}px`);
    expect(
      mobile.querySelector<HTMLElement>(".editor-grid-zone")?.style.maxWidth,
    ).toBe(`${PROFILE_CANVAS_WIDTH.mobile}px`);
  });
});

describe("EditorGrid resize handles", () => {
  const AXES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

  it("renders all eight resize handles on every block", () => {
    const { container } = renderGrid([
      makeBlock({ id: "a", gridY: 0, gridH: 2 }),
      makeBlock({ id: "b", gridY: 2, gridH: 2 }),
    ]);

    const items = container.querySelectorAll(".react-grid-item");
    expect(items).toHaveLength(2);

    items.forEach((item) => {
      const handles = item.querySelectorAll(".react-resizable-handle");
      expect(handles).toHaveLength(8);

      // Exactly one handle per axis — no duplicates, no missing side.
      AXES.forEach((axis) => {
        expect(
          item.querySelectorAll(`.react-resizable-handle-${axis}`),
        ).toHaveLength(1);
      });
    });
  });
});
