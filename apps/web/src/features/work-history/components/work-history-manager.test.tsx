import type { WorkExperienceResponse } from "@repo/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMyWorkExperiences = vi.fn();
vi.mock("../../../lib/auth-api", () => ({
  fetchMyWorkExperiences: () => fetchMyWorkExperiences(),
  createWorkExperience: vi.fn(),
  updateWorkExperience: vi.fn(),
  deleteWorkExperience: vi.fn(),
}));

import { WorkHistoryManager } from "./work-history-manager";

const entry: WorkExperienceResponse = {
  id: "we-1",
  userId: "user-1",
  title: "Staff Engineer",
  companyName: "Northwind",
  employmentType: "full-time",
  workModel: "remote",
  locationCity: "Lisbon",
  locationState: null,
  locationCountry: "PT",
  startDate: "2023-01-01",
  endDate: null,
  isCurrent: true,
  description: null,
  mainStack: ["TypeScript"],
  displayOrder: 0,
  createdAt: new Date("2023-01-01"),
  updatedAt: new Date("2023-01-01"),
};

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkHistoryManager />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  fetchMyWorkExperiences.mockReset();
});

describe("WorkHistoryManager loading state", () => {
  it("renders entry-shaped skeletons instead of a text label while loading", () => {
    // A promise that never settles keeps the query in `isLoading`.
    fetchMyWorkExperiences.mockReturnValue(new Promise(() => {}));

    const { container } = renderManager();

    expect(container.textContent).not.toContain("Loading work history...");

    // Skeletons are aria-hidden, so the announcement carries the state.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading work history",
    );

    // Placeholders sit in the same `mt-4 space-y-2` list as the real rows.
    const list = container.querySelector("ul.space-y-2");
    expect(list).not.toBeNull();
    expect(list).toHaveClass("mt-4");
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(3);
  });

  it("swaps the skeleton for the real rows once the query resolves", async () => {
    fetchMyWorkExperiences.mockResolvedValue([entry]);

    const { container } = renderManager();

    expect(await screen.findByText("Staff Engineer")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const list = container.querySelector("ul.space-y-2");
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(1);
  });
});
