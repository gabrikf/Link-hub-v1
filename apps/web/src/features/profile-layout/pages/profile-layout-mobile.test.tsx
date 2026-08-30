import type {
  FullProfileLayout,
  ProfileBlock,
  ProfileLayout,
} from "@repo/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../../../lib/auth-tokens", () => ({
  getAuthTokens: () => ({ accessToken: "x", refreshToken: "y" }),
}));
vi.mock("../../../lib/user-info-store", () => ({
  useUserInfoStore: (selector: (state: unknown) => unknown) =>
    selector({ userInfo: { login: "ada", name: "Ada Lovelace" } }),
}));
vi.mock("../../../lib/profile-queries", () => ({
  useMyResumeQuery: () => ({ data: undefined, isLoading: false }),
}));

const { fetchLayout, updateBlockPositions } = vi.hoisted(() => ({
  fetchLayout: vi.fn(),
  updateBlockPositions: vi.fn(),
}));

vi.mock("../../../lib/auth-api", () => ({
  fetchLayout,
  updateBlockPositions,
  fetchMyProfile: () => Promise.resolve({ username: "ada", name: "Ada" }),
  fetchLinks: () => Promise.resolve([]),
  fetchMyWorkExperiences: () => Promise.resolve([]),
  createBlock: vi.fn(),
  createTab: vi.fn(),
  deleteBlock: vi.fn(),
  deleteTab: vi.fn(),
  renameTab: vi.fn(),
  reorderTabs: vi.fn(),
  setTabsEnabled: vi.fn(),
  updateBlock: vi.fn(),
}));

import { MOBILE_VIEWPORT_QUERY, COARSE_POINTER_QUERY } from "../grid-utils";
import { ProfileLayoutPage } from "./profile-layout-page";

/**
 * jsdom ships no `matchMedia` at all, so every media-driven branch in the
 * studio reads `false` (the desktop shape) unless a test says otherwise. This
 * installs one that answers per query, which is what lets a single test say
 * "narrow screen, coarse pointer" — i.e. a phone.
 */
function stubMedia(matches: (query: string) => boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const onAPhone = () =>
  stubMedia(
    (query) =>
      query === MOBILE_VIEWPORT_QUERY || query === COARSE_POINTER_QUERY,
  );

const onADesktop = () => stubMedia(() => false);

const block = (overrides: Partial<ProfileBlock>): ProfileBlock => ({
  id: "block",
  groupId: "g",
  kind: "text",
  tabId: "tab-1",
  gridX: 0,
  gridY: 0,
  gridW: 4,
  gridH: 2,
  isVisible: true,
  pinnedAllTabs: false,
  config: { body: "Body" },
  ...overrides,
});

/** Two stacked tab blocks per viewport, so "move down" has somewhere to go. */
const viewportLayout = (prefix: string, cols: number): ProfileLayout => ({
  tabs: [{ id: "tab-1", title: "Main", order: 0 }],
  blocks: [
    block({
      id: `${prefix}-header`,
      kind: "header",
      tabId: null,
      pinnedAllTabs: true,
      gridW: cols,
      gridH: 4,
      config: null,
    }),
    block({ id: `${prefix}-top`, gridY: 0, gridW: cols }),
    block({ id: `${prefix}-bottom`, gridY: 2, gridW: cols }),
  ],
  tabsEnabled: true,
});

const layout = (): FullProfileLayout => ({
  pc: viewportLayout("pc", 12),
  mobile: viewportLayout("mobile", 4),
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ProfileLayoutPage />
      </QueryClientProvider>,
    ),
  };
}

/** The editor is settled once the tab-strip skeleton copy is gone. */
async function settle(container: HTMLElement) {
  await waitFor(() => {
    expect(container.textContent ?? "").not.toContain("Loading tabs");
  });
}

const viewportButton = (name: "PC layout" | "Mobile layout") =>
  screen.getByRole("button", { name });

describe("ProfileLayoutPage on a phone", () => {
  beforeEach(() => {
    fetchLayout.mockReset();
    updateBlockPositions.mockReset();
    updateBlockPositions.mockResolvedValue(undefined);
    fetchLayout.mockImplementation(() => Promise.resolve(layout()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * The reported bug: the studio refused to open below 1024px and told the user
   * to come back on a bigger screen — to someone whose only device is a phone,
   * that is the whole feature gone.
   */
  it("opens the editor on a narrow screen instead of a wider-screen dead end", async () => {
    onAPhone();
    const { container } = renderPage();
    await settle(container);

    expect(
      screen.getByRole("heading", { name: "Always visible" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show tabs on my profile" }))
      .toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/larger screen/i);
  });

  it("opens on the MOBILE layout when the screen is narrow", async () => {
    onAPhone();
    const { container } = renderPage();
    await settle(container);

    expect(viewportButton("Mobile layout")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(viewportButton("PC layout")).toHaveAttribute("aria-pressed", "false");
  });

  it("still opens on the PC layout on a wide screen", async () => {
    onADesktop();
    const { container } = renderPage();
    await settle(container);

    expect(viewportButton("PC layout")).toHaveAttribute("aria-pressed", "true");
    expect(viewportButton("Mobile layout")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  /*
   * DELIBERATE REVERSAL of the two tests that used to sit here.
   *
   * They asserted the opposite rule: that a phone could reach the pc canvas,
   * signposted with "swipe the canvas sideways". Gabriel's round-3 call is that
   * a phone edits the phone layout and nothing else — arranging a 1024px design
   * through a 375px letterbox means never seeing what is being arranged. The
   * behaviour changed, so the tests that pinned the old behaviour had to change
   * with it; these pin the new rule just as tightly.
   */
  it("does not let a narrow screen edit the PC layout", async () => {
    onAPhone();
    const { container } = renderPage();
    await settle(container);

    expect(viewportButton("PC layout")).toBeDisabled();

    // Even a programmatic click cannot move the editor off mobile.
    await userEvent.click(viewportButton("PC layout"));

    expect(viewportButton("PC layout")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(viewportButton("Mobile layout")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.textContent ?? "").not.toMatch(/swipe the canvas/i);
  });

  /*
   * "Do not silently hide the PC option." A greyed-out button with no reason
   * beside it reads as a broken editor; the sentence is the difference between
   * a rule and a bug, and it is wired to the button so a screen reader gets it
   * as the button's description rather than as unrelated prose.
   */
  it("says WHY the PC layout is unavailable, wired to the disabled button", async () => {
    onAPhone();
    const { container } = renderPage();
    await settle(container);

    const describedBy = viewportButton("PC layout").getAttribute(
      "aria-describedby",
    );
    expect(describedBy).toBeTruthy();

    const explanation = describedBy
      ? container.ownerDocument.getElementById(describedBy)
      : null;
    expect(explanation?.textContent ?? "").toMatch(
      /open the studio on a computer/i,
    );
    // It must also say the desktop layout is not lost.
    expect(explanation?.textContent ?? "").toMatch(/untouched and still live/i);
  });

  it("keeps BOTH layouts editable on a desktop", async () => {
    onADesktop();
    const { container } = renderPage();
    await settle(container);

    expect(viewportButton("PC layout")).toBeEnabled();
    expect(viewportButton("Mobile layout")).toBeEnabled();
    expect(viewportButton("PC layout")).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(container.textContent ?? "").not.toMatch(
      /open the studio on a computer/i,
    );

    await userEvent.click(viewportButton("Mobile layout"));
    expect(viewportButton("Mobile layout")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(viewportButton("PC layout"));
    expect(viewportButton("PC layout")).toHaveAttribute("aria-pressed", "true");
  });

  /*
   * The touch reordering path. Dragging is a gesture this test cannot perform
   * and a phone may not reliably deliver; a button is a button.
   */
  it("offers move and resize buttons on every block when a finger is driving", async () => {
    onAPhone();
    const { container } = renderPage();
    await settle(container);

    expect(
      screen.getAllByRole("button", { name: /^Move .* up$/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /^Make .* taller$/ }).length,
    ).toBeGreaterThan(0);
  });

  it("hides those buttons under a mouse, where the card already drags", async () => {
    onADesktop();
    const { container } = renderPage();
    await settle(container);

    expect(screen.queryByRole("button", { name: /^Move .* up$/ })).toBeNull();
  });

  /*
   * The touch control must actually rearrange the layout, not merely exist.
   * "Move down" on the top block swaps it with the one below and persists the
   * new geometry for the viewport being edited.
   */
  it("reorders blocks from the move button and saves the result", async () => {
    onAPhone();
    const { container } = renderPage();
    await settle(container);

    // The TAB zone's first block. The pinned zone holds one block on its own,
    // and a lone block has nowhere to move — `moveBlockBy` correctly returns the
    // array it was handed and nothing is persisted.
    // The first of the tab zone's two text blocks — the one with a neighbour
    // below it to swap with.
    await userEvent.click(
      screen.getAllByRole("button", { name: "Move Text down" })[0]!,
    );

    await waitFor(
      () => {
        expect(updateBlockPositions).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    const payload = updateBlockPositions.mock.calls.at(-1)?.[0] as {
      viewport: string;
      positions: { id: string; gridY: number }[];
    };
    expect(payload.viewport).toBe("mobile");
    const rowOf = (id: string) =>
      payload.positions.find((position) => position.id === id)?.gridY;
    expect(rowOf("mobile-top")).toBeGreaterThan(rowOf("mobile-bottom")!);
  });

  /*
   * The two layouts are independent rows in the database and independent
   * caches in the client. A mobile edit that quietly rewrote pc geometry would
   * be invisible until the user opened a desktop browser.
   */
  it("leaves the pc layout untouched when the mobile layout is edited", async () => {
    onAPhone();
    const { client, container } = renderPage();
    await settle(container);

    const before = JSON.stringify(
      client.getQueryData<FullProfileLayout>(["layout"])?.pc,
    );

    // The first of the tab zone's two text blocks — the one with a neighbour
    // below it to swap with.
    await userEvent.click(
      screen.getAllByRole("button", { name: "Move Text down" })[0]!,
    );

    await waitFor(
      () => {
        expect(updateBlockPositions).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    expect(
      JSON.stringify(client.getQueryData<FullProfileLayout>(["layout"])?.pc),
    ).toBe(before);
    for (const call of updateBlockPositions.mock.calls) {
      expect((call[0] as { viewport: string }).viewport).toBe("mobile");
    }
  });
});

/**
 * The live-preview modal. Its device scope follows the same rule as the editor
 * — a phone previews the phone — and it has to behave like a modal while doing
 * it, because on a phone the modal IS the screen.
 */
describe("ProfileLayoutPage — the live preview modal", () => {
  beforeEach(() => {
    fetchLayout.mockReset();
    updateBlockPositions.mockReset();
    updateBlockPositions.mockResolvedValue(undefined);
    fetchLayout.mockImplementation(() => Promise.resolve(layout()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const previewTrigger = () => screen.getByRole("button", { name: "Preview" });

  const openPreview = async (container: HTMLElement) => {
    await settle(container);
    await userEvent.click(previewTrigger());
    return await screen.findByRole("dialog");
  };

  it("offers the mobile preview ONLY on a narrow screen", async () => {
    onAPhone();
    const { container } = renderPage();
    const dialog = await openPreview(container);

    expect(
      within(dialog).queryByRole("button", { name: "Desktop" }),
    ).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Mobile" })).toBeNull();
    // Not silently missing: the modal names what it is showing and why.
    expect(dialog.textContent ?? "").toMatch(/showing the mobile preview/i);
  });

  it("keeps BOTH preview devices on a desktop", async () => {
    onADesktop();
    const { container } = renderPage();
    const dialog = await openPreview(container);

    const desktopOption = within(dialog).getByRole("button", {
      name: "Desktop",
    });
    const mobileOption = within(dialog).getByRole("button", { name: "Mobile" });

    // Opens on whatever the editor is editing, which on a desktop is pc.
    expect(desktopOption).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(mobileOption);
    expect(mobileOption).toHaveAttribute("aria-pressed", "true");
    expect(desktopOption).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(desktopOption);
    expect(desktopOption).toHaveAttribute("aria-pressed", "true");
    expect(dialog.textContent ?? "").not.toMatch(/showing the mobile preview/i);
  });

  /*
   * Dismissible, Escape-closable, and it hands focus back. Radix provides all
   * three; this test is what notices if the modal is ever swapped for a
   * hand-rolled overlay that provides none of them.
   */
  it("closes on Escape and returns focus to the button that opened it", async () => {
    onAPhone();
    const { container } = renderPage();
    await openPreview(container);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    // `waitFor`: the restore runs on the focus scope's unmount, one frame after
    // the content leaves the tree — asserting it synchronously reads `body`.
    await waitFor(() => {
      expect(previewTrigger()).toHaveFocus();
    });
  });

  it("closes from its own close button", async () => {
    onADesktop();
    const { container } = renderPage();
    const dialog = await openPreview(container);

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Close/ }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
