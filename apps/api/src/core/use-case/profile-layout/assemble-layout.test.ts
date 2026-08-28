/**
 * The public/owner asymmetry lives in these two functions, so it is asserted
 * here rather than only at the HTTP edge.
 *
 * `toPublicLayout` withholds tab content when the owner has tabs switched off:
 * the strip is not rendered, so its titles and its blocks are not the public's
 * business either. `assembleLayout` must keep serving all of it — it feeds the
 * owner's editor, where the content still exists and is still editable.
 */
import { describe, expect, it } from "vitest";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";
import { assembleLayout, toPublicLayout } from "./assemble-layout.js";

const USER_ID = "user-1";

function makeTab(title: string, order: number) {
  return ProfileTabEntity.create({
    userId: USER_ID,
    viewport: "pc",
    title,
    order,
  });
}

function makeBlock(props: {
  kind: "text" | "links" | "resume" | "posts";
  tabId: string | null;
  pinnedAllTabs?: boolean;
  isVisible?: boolean;
  gridY: number;
  config?: unknown;
}) {
  return ProfileBlockEntity.create({
    userId: USER_ID,
    viewport: "pc",
    tabId: props.tabId,
    kind: props.kind,
    gridX: 0,
    gridY: props.gridY,
    gridW: 4,
    gridH: 2,
    isVisible: props.isVisible ?? true,
    pinnedAllTabs: props.pinnedAllTabs ?? false,
    config: props.config ?? null,
  });
}

/**
 * The shape the defect was reported against: two tabs, a pinned header, a
 * pinned-but-hidden block, a visible block inside a tab carrying real content,
 * and a hidden block inside a tab.
 */
function fixture() {
  const main = makeTab("Main", 0);
  const posts = makeTab("Posts", 1);

  const pinnedVisible = makeBlock({
    kind: "text",
    tabId: null,
    pinnedAllTabs: true,
    gridY: 0,
    config: { body: "pinned header" },
  });
  const pinnedHidden = makeBlock({
    kind: "links",
    tabId: null,
    pinnedAllTabs: true,
    isVisible: false,
    gridY: 1,
  });
  const tabVisible = makeBlock({
    kind: "resume",
    tabId: main.id,
    gridY: 2,
    config: { secretUrl: "https://example.com/private-resume.pdf" },
  });
  const tabHidden = makeBlock({
    kind: "posts",
    tabId: posts.id,
    isVisible: false,
    gridY: 3,
  });

  return {
    tabs: [main, posts],
    blocks: [pinnedVisible, pinnedHidden, tabVisible, tabHidden],
    main,
    posts,
    pinnedVisible,
    pinnedHidden,
    tabVisible,
    tabHidden,
  };
}

describe("toPublicLayout", () => {
  describe("tabs disabled", () => {
    it("serves no tabs and no tab blocks", () => {
      const f = fixture();

      const layout = toPublicLayout(f.tabs, f.blocks, false);

      expect(layout.tabs).toEqual([]);
      // The defect: this block is `isVisible: true`, so the old filter let it
      // through even though nothing renders it.
      expect(layout.blocks.map((block) => block.id)).not.toContain(
        f.tabVisible.id,
      );
      expect(layout.tabsEnabled).toBe(false);
      // Not just absent by id — its payload must not travel at all.
      expect(JSON.stringify(layout)).not.toContain("private-resume.pdf");
      // No tab title either.
      expect(JSON.stringify(layout)).not.toContain("Main");
    });

    it("still serves pinned visible blocks, and still excludes hidden ones", () => {
      const f = fixture();

      const layout = toPublicLayout(f.tabs, f.blocks, false);

      expect(layout.blocks.map((block) => block.id)).toEqual([
        f.pinnedVisible.id,
      ]);
      expect(layout.blocks[0]?.config).toEqual({ body: "pinned header" });
      expect(layout.blocks.map((block) => block.id)).not.toContain(
        f.pinnedHidden.id,
      );
    });

    it("keeps a pinned block that is not visible out even when it is the only one", () => {
      const main = makeTab("Main", 0);
      const onlyHiddenPin = makeBlock({
        kind: "text",
        tabId: null,
        pinnedAllTabs: true,
        isVisible: false,
        gridY: 0,
      });

      const layout = toPublicLayout([main], [onlyHiddenPin], false);

      expect(layout).toEqual({ tabs: [], blocks: [], tabsEnabled: false });
    });
  });

  describe("tabs enabled (regression guard — behaviour must not change)", () => {
    it("serves every tab in order and every visible block", () => {
      const f = fixture();

      const layout = toPublicLayout(f.tabs, f.blocks, true);

      expect(layout.tabs.map((tab) => tab.title)).toEqual(["Main", "Posts"]);
      expect(layout.blocks.map((block) => block.id)).toEqual([
        f.pinnedVisible.id,
        f.tabVisible.id,
      ]);
      expect(layout.tabsEnabled).toBe(true);
    });

    it("sorts tabs by order regardless of input order", () => {
      const second = makeTab("Second", 1);
      const first = makeTab("First", 0);

      const layout = toPublicLayout([second, first], [], true);

      expect(layout.tabs.map((tab) => tab.title)).toEqual(["First", "Second"]);
    });
  });
});

describe("assembleLayout (owner's editor payload)", () => {
  it("still returns every tab and every block with tabs disabled", () => {
    const f = fixture();

    const layout = assembleLayout(f.tabs, f.blocks, false);

    // Deliberately NOT the public rule. The owner keeps their content in the
    // editor with tabs off — otherwise turning tabs off looks like a delete,
    // and the hidden-block warning loses the blocks it counts.
    expect(layout.tabs.map((tab) => tab.title)).toEqual(["Main", "Posts"]);
    expect(layout.blocks.map((block) => block.id)).toEqual([
      f.pinnedVisible.id,
      f.pinnedHidden.id,
      f.tabVisible.id,
      f.tabHidden.id,
    ]);
    expect(layout.tabsEnabled).toBe(false);
  });

  it("returns the same tabs and blocks whether tabs are on or off", () => {
    const f = fixture();

    const off = assembleLayout(f.tabs, f.blocks, false);
    const on = assembleLayout(f.tabs, f.blocks, true);

    expect(off).toEqual({ ...on, tabsEnabled: false });
  });
});
