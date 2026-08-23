import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { fetchLayout } = vi.hoisted(() => ({ fetchLayout: vi.fn() }));

vi.mock("../../../lib/auth-api", () => ({
  fetchLayout,
  fetchLinks: () => Promise.resolve([]),
  fetchMyProfile: () => Promise.resolve({ username: "ada", name: "Ada" }),
  fetchMyWorkExperiences: () => Promise.resolve([]),
  createBlock: vi.fn(),
  createTab: vi.fn(),
  deleteBlock: vi.fn(),
  deleteTab: vi.fn(),
  renameTab: vi.fn(),
  reorderTabs: vi.fn(),
  updateBlock: vi.fn(),
  updateBlockPositions: vi.fn(),
}));

import { queryClient as appQueryClient } from "../../../lib/query-client";
import { buildDefaultLayout } from "../grid-utils";
import { ProfileLayoutPage } from "./profile-layout-page";

const ERROR_COPY = /couldn.?t load|could not load|failed to load/i;

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

/** Wait for the layout query to settle — the loading copy is gone either way. */
async function settle(container: HTMLElement) {
  await waitFor(() => {
    expect(container.textContent ?? "").not.toContain("Loading tabs");
  });
}

describe("ProfileLayoutPage — GET /me/layout fails", () => {
  beforeEach(() => {
    fetchLayout.mockReset();
  });

  it("says the layout could not be loaded instead of showing a fabricated default arrangement", async () => {
    fetchLayout.mockRejectedValue(new Error("boom"));

    const { container } = renderPage();
    await settle(container);

    const text = container.textContent ?? "";

    // The user is told what happened.
    expect(text).toMatch(ERROR_COPY);

    // The editor is NOT offered: no fabricated blocks, and no promise that
    // changes are being saved (every drag in this state is refused by the api).
    const groups = screen
      .queryAllByRole("group")
      .map((element) => element.getAttribute("aria-label") ?? "");
    expect(groups.filter((label) => label.includes("block"))).toEqual([]);
    expect(text).not.toContain("Changes save automatically");
  });

  it("offers a retry that refetches the layout", async () => {
    fetchLayout.mockRejectedValue(new Error("boom"));

    const { container } = renderPage();
    await settle(container);

    const callsBeforeRetry = fetchLayout.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(fetchLayout.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    });
  });

  it("still renders the editor when the layout loads (positive control)", async () => {
    fetchLayout.mockResolvedValue({
      pc: buildDefaultLayout("pc"),
      mobile: buildDefaultLayout("mobile"),
    });

    const { container } = renderPage();
    await settle(container);

    const text = container.textContent ?? "";

    expect(text).not.toMatch(ERROR_COPY);
    expect(text).toContain("Changes save automatically");

    const groups = screen
      .queryAllByRole("group")
      .map((element) => element.getAttribute("aria-label") ?? "");
    expect(
      groups.some((label) => label.startsWith("Profile header block")),
    ).toBe(true);
  });

  it("keeps the editor when a background refetch fails but the layout is already loaded", async () => {
    fetchLayout.mockResolvedValue({
      pc: buildDefaultLayout("pc"),
      mobile: buildDefaultLayout("mobile"),
    });

    const { container, client } = renderPage();
    await settle(container);
    expect(container.textContent ?? "").toContain("Changes save automatically");

    // Exactly what invalidateLayout() does after every successful mutation,
    // with the api hiccuping on the refetch it triggers.
    fetchLayout.mockRejectedValue(new Error("transient 503"));
    await client.invalidateQueries({ queryKey: ["layout"] });

    await waitFor(() => {
      expect(fetchLayout.mock.calls.length).toBeGreaterThan(1);
    });

    // The layout is in the cache and the save already succeeded — nothing is
    // fabricated, so the editor must stay up.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(ERROR_COPY);
    expect(text).toContain("Changes save automatically");

    const groups = screen
      .queryAllByRole("group")
      .map((element) => element.getAttribute("aria-label") ?? "");
    expect(
      groups.some((label) => label.startsWith("Profile header block")),
    ).toBe(true);
  });
});

/**
 * Every test above mounts a test-only client with `retry: false`, so they prove
 * the error screen EXISTS but never that a user sees it. In the real app the
 * editor sat on its "Loading tabs" skeleton for ~7.5s first — the initial
 * request plus three silent retries at 1s/2s/4s. This client inherits the app's
 * shipped defaults instead of restating them, so it cannot drift.
 */
function renderPageWithShippedQueryDefaults() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() })
      }
    >
      <ProfileLayoutPage />
    </QueryClientProvider>,
  );
}

describe("ProfileLayoutPage — how fast a failed layout load is admitted", () => {
  beforeEach(() => {
    fetchLayout.mockReset();
  });

  it("reaches the error screen in about a second, with a bounded number of attempts", async () => {
    fetchLayout.mockRejectedValue(new Error("boom"));

    const startedAt = performance.now();
    const { container } = renderPageWithShippedQueryDefaults();

    await waitFor(
      () => {
        expect(container.textContent ?? "").toMatch(ERROR_COPY);
      },
      { timeout: 15_000 },
    );
    const elapsedMs = performance.now() - startedAt;

    // A user waits a couple of seconds before deciding a screen is broken.
    expect(elapsedMs).toBeLessThan(1_500);

    // One quick retry heals a transient blip invisibly; three, spaced
    // exponentially, only hide the failure. The screen has its own Retry.
    expect(fetchLayout.mock.calls.length).toBeLessThanOrEqual(2);
  }, 20_000);
});
