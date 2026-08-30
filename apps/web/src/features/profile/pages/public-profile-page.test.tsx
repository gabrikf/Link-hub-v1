import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Everything below the page shell is stubbed on purpose. What is under test is
 * the page's own BOX MODEL — the two nested horizontal gutters that decide how
 * wide the reading column is on a phone — not the grid renderer, the cover or
 * the network layer.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useParams: () => ({ username: "ada" }),
}));

vi.mock("../../../lib/auth-api", () => ({
  fetchPublicProfile: vi.fn(async () => ({
    name: "Ada Lovelace",
    username: "ada",
    description: "Analytical engine enthusiast",
    userPhoto: null,
    bannerImageUrl: null,
    backgroundImageUrl: null,
    location: null,
    persona: null,
    personaOther: null,
    themePreset: "violet",
    themeAccent: null,
    links: [],
    layout: undefined,
  })),
  fetchPublicResume: vi.fn(async () => null),
  fetchPublicWorkExperiences: vi.fn(async () => []),
}));

vi.mock("../components/profile-blocks", () => ({
  ProfileBlocks: () => <div data-testid="profile-blocks" />,
}));

vi.mock("../components/profile-cover", () => ({
  ProfileCover: () => <div data-testid="profile-cover" />,
}));

import { PublicProfilePage } from "./public-profile-page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PublicProfilePage />
    </QueryClientProvider>,
  );
}

/** The page shell — the outer of the two nested horizontal gutters. */
function getMain(): HTMLElement {
  return screen.getByRole("main");
}

/** The block stack — the inner gutter, the parent of `<ProfileBlocks />`. */
async function getBlockStack(): Promise<HTMLElement> {
  const blocks = await screen.findByTestId("profile-blocks");
  const stack = blocks.parentElement;
  if (!(stack instanceof HTMLElement)) {
    throw new Error("block stack not found");
  }
  return stack;
}

/**
 * jsdom loads no Tailwind stylesheet, so a real width measurement is impossible
 * here — that lives in the Playwright pass. What jsdom CAN prove is the shape
 * of the responsive pair: a narrow base gutter, and an `sm:` override that
 * restores the exact value desktop had before.
 */
function gutters(className: string) {
  const base = className.match(/(?:^|\s)px-([\d.]+)(?=\s|$)/)?.[1] ?? null;
  const sm = className.match(/(?:^|\s)sm:px-([\d.]+)(?=\s|$)/)?.[1] ?? null;
  return { base, sm };
}

beforeEach(() => {
  vi.clearAllMocks();

  /*
   * jsdom ships no `matchMedia`, and the page calls it during the very first
   * render to pick the mobile vs pc layout. Stubbed here rather than in
   * `test-setup.ts` so this file owns its own environment and no other suite
   * inherits a media query it did not ask for. `matches: false` = the pc
   * viewport; the gutters under test are the same either way.
   */
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

/*
 * The bug: horizontal padding NESTED. `<main>` had `px-4`, the block stack had
 * `px-6`, and every block adds its own `p-4` — 56px of chrome per side against
 * a 375px phone, so the text read as a compressed ribbon down the middle.
 */
describe("PublicProfilePage horizontal gutters", () => {
  it("gives the page shell a narrow gutter on a phone", async () => {
    renderPage();
    await screen.findByTestId("profile-blocks");

    const { base } = gutters(getMain().className);
    expect(base).toBe("2");
  });

  it("restores the previous desktop gutter on the page shell at sm", async () => {
    renderPage();
    await screen.findByTestId("profile-blocks");

    // `px-4` is what `<main>` carried unconditionally before this change.
    // Desktop must be byte-for-byte unchanged.
    expect(gutters(getMain().className).sm).toBe("4");
  });

  it("gives the block stack a narrow gutter on a phone", async () => {
    renderPage();

    const { base } = gutters((await getBlockStack()).className);
    expect(base).toBe("1.5");
  });

  it("restores the previous desktop gutter on the block stack at sm", async () => {
    renderPage();

    // The stack was `px-6 sm:px-8`. From 640px up it is still `px-8`.
    expect(gutters((await getBlockStack()).className).sm).toBe("8");
  });

  it("keeps the phone gutter strictly narrower than the sm one on both levels", async () => {
    renderPage();

    for (const element of [getMain(), await getBlockStack()]) {
      const { base, sm } = gutters(element.className);
      expect(base).not.toBeNull();
      expect(sm).not.toBeNull();
      expect(Number(base)).toBeLessThan(Number(sm));
    }
  });

  /**
   * This assertion used to read `py-10` and pinned "vertical spacing is not
   * part of the gutter fix". Vertical spacing IS now part of a deliberate
   * change: `TopBarNav` is a `sticky top-0` bar with its own rule, and 40px of
   * empty page under it made the card read as a separate slab instead of the
   * first thing on the screen. Top padding drops to `pt-3`; the bottom padding
   * and the avatar-overlap maths are untouched, which is the half of the old
   * assertion that still has a job.
   */
  it("sits close under the header and leaves the overlap maths alone", async () => {
    renderPage();

    expect(getMain().className).toContain("pt-3");
    expect(getMain().className).toContain("pb-10");
    expect(getMain().className).not.toContain("py-10");
    const stack = await getBlockStack();
    expect(stack.className).toContain("-mt-14");
    expect(stack.className).toContain("pb-8");
  });

  it("keeps a gutter on both levels, so the card still reads as a card", async () => {
    renderPage();

    // Zero would run the shell edge-to-edge and cut its rounded corners off
    // against the viewport. The fix narrows the gutters; it does not remove
    // them.
    expect(Number(gutters(getMain().className).base)).toBeGreaterThan(0);
    expect(Number(gutters((await getBlockStack()).className).base)).toBeGreaterThan(0);
  });
});
