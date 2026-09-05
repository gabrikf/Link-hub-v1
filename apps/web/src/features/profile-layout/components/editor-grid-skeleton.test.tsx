import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorGridSkeleton } from "./editor-grid-skeleton";

const placeholders = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(".anim-sheen"));

describe("EditorGridSkeleton", () => {
  it("lays placeholders out on the same row/gap geometry as EditorGrid", () => {
    // react-grid-layout renders an item of height `h` as
    // `h * rowHeight + (h - 1) * margin`, which is what a CSS grid with 40px
    // rows and a 12px gap produces. If these drift apart the editor zone
    // resizes the moment the real grid mounts.
    const { container } = render(
      <EditorGridSkeleton
        cols={12}
        spans={[
          { w: 12, h: 4 },
          { w: 6, h: 2 },
        ]}
        label="Loading blocks"
      />,
    );

    const items = placeholders(container);
    expect(items).toHaveLength(2);

    const grid = items[0]?.parentElement;
    expect(grid?.style.gridTemplateColumns).toBe("repeat(12, minmax(0, 1fr))");
    expect(grid?.style.gridAutoRows).toBe("40px");
    expect(grid?.style.gap).toBe("12px");

    expect(items[0]?.style.gridColumn).toBe("span 12");
    expect(items[0]?.style.gridRow).toBe("span 4");
    expect(items[1]?.style.gridColumn).toBe("span 6");
    expect(items[1]?.style.gridRow).toBe("span 2");
  });

  it("clamps a span to the column count so the mobile grid never overflows", () => {
    const { container } = render(
      <EditorGridSkeleton
        cols={4}
        spans={[{ w: 12, h: 3 }]}
        label="Loading blocks"
      />,
    );

    expect(placeholders(container)[0]?.style.gridColumn).toBe("span 4");
  });

  it("announces the loading region for screen readers", () => {
    render(
      <EditorGridSkeleton
        cols={12}
        spans={[{ w: 12, h: 4 }]}
        label="Loading blocks"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading blocks");
  });
});
