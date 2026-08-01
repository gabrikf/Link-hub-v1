import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const parseResumeImport = vi.fn();
vi.mock("../../../lib/auth-api", () => ({
  parseResumeImport: (input: unknown) => parseResumeImport(input),
  applyResumeImport: vi.fn(),
}));

import { ResumeImportModal } from "./resume-import-modal";

function openModal() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResumeImportModal
        open
        onOpenChange={vi.fn()}
        currentResume={null}
        currentProfileName=""
        currentProfileDescription={null}
        onApplied={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  parseResumeImport.mockReset();
});

describe("ResumeImportModal parse step", () => {
  it("replaces the upload form with a progress + skeleton state while the AI reads the resume", async () => {
    const user = userEvent.setup();
    // Never settles — holds the mutation in `isPending`.
    parseResumeImport.mockReturnValue(new Promise(() => {}));

    openModal();

    // Enough pasted text to enable the parse button (>= 20 chars).
    await user.type(
      screen.getByLabelText("Paste resume text"),
      "Staff engineer with ten years of TypeScript experience.",
    );
    await user.click(screen.getByRole("button", { name: "Parse with AI" }));

    // The button is now a spinner with a present-tense label, not a
    // silently-disabled "Parse with AI".
    const parseButton = await screen.findByRole("button", {
      name: "Reading resume...",
    });
    expect(parseButton).toHaveAttribute("aria-busy", "true");
    expect(parseButton).toBeDisabled();

    // The pick-a-file controls step aside for the progress banner.
    expect(
      screen.queryByLabelText("Paste resume text"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Reading your resume…")).toBeInTheDocument();
    expect(screen.getByText(/10.30 seconds/i)).toBeInTheDocument();

    // A screen-reader announcement pairs with the aria-hidden skeletons.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Reading your resume",
    );

    // The skeleton previews the review step: four ReviewGroup headings, five
    // CheckboxRow placeholders (checkbox + 2 lines each) and two chip rows.
    // The dialog renders through a portal, so query it rather than `container`.
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll(".anim-sheen").length).toBeGreaterThan(10);

    // Escape hatch stays available — the parse can't be cancelled, but the
    // user is never trapped in the dialog.
    expect(
      screen.getByRole("button", { name: "Skip for now" }),
    ).toBeEnabled();
  });

  it("keeps the upload form visible when no parse is in flight", () => {
    openModal();

    expect(screen.getByLabelText("Paste resume text")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Parse with AI" }),
    ).toBeDisabled();
  });
});
