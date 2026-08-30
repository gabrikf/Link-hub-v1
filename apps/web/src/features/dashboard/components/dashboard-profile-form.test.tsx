import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DashboardProfileForm,
  type ProfileFormValues,
} from "./dashboard-profile-form";
import { DEFAULT_THEME_PRESET } from "../../profile/components/profile-theme";

vi.mock("../../../shared-components/file-upload", () => ({
  FileUpload: () => null,
}));

const initialValues: ProfileFormValues = {
  username: "ada",
  name: "Ada Lovelace",
  description: "",
  userPhoto: "",
  bannerImageUrl: "",
  backgroundImageUrl: "",
  themePreset: DEFAULT_THEME_PRESET,
  themeAccent: "",
  openToWork: false,
  location: "",
  persona: "",
};

/*
 * HARNESS ONLY. The form now asks the api whether a typed handle is free, so it
 * is a networked component and needs a client in scope. No assertion below
 * changed; the availability behaviour has its own file
 * (`dashboard-profile-username-availability.test.tsx`).
 *
 * The provider is written inline at each call site rather than behind a
 * `wrap(ui)` helper: two copies of `@types/react` are resolvable in this
 * workspace, and a helper typed `(ui: ReactElement) => ReactElement` makes the
 * mismatch between them a compile error (see
 * `apps/web/AGENTS.md` on duplicate React types). JSX children have no such
 * problem.
 */
const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderForm(props: Partial<React.ComponentProps<
  typeof DashboardProfileForm
>> = {}) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <DashboardProfileForm
        initialValues={initialValues}
        onSubmit={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

/**
 * The save error used to render in the page's right-hand `<aside>` — i.e.
 * underneath the Radix overlay — so a duplicate-username 409 made the modal
 * simply refuse to close, with the explanation invisible behind it.
 */
describe("DashboardProfileForm save feedback", () => {
  it("renders the save error inside the form, above the submit button", () => {
    renderForm({ errorMessage: "Username already taken" });

    const error = screen.getByText("Username already taken");
    expect(error).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /Save profile/ });

    // Ordering matters: the message has to precede the control it explains.
    expect(
      error.compareDocumentPosition(submit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // And it must be inside the form, not a sibling of the dialog.
    expect(submit.closest("form")).toContainElement(error);
  });

  it("shows no error surface when the save has not failed", () => {
    renderForm();

    expect(screen.queryByText(/already taken/)).not.toBeInTheDocument();
  });

  it("puts the submit button in a pending state while saving", () => {
    renderForm({ isSaving: true });

    const submit = screen.getByRole("button", { name: /Saving profile/ });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
  });

  it("reports a clean form as not dirty so closing does not prompt", () => {
    const onDirtyChange = vi.fn();
    renderForm({ onDirtyChange });

    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });
});

/**
 * The "Open to work" toggle publicly advertises job-seeking status, and it
 * announced as a bare "switch, not checked": the visible "Open to work" text
 * sat in a sibling paragraph that nothing tied to the control, so the
 * accessible name computation had nothing to work with and the switch was
 * unreachable from a screen reader's forms list / rotor.
 */
describe("DashboardProfileForm open-to-work switch", () => {
  it("gives the switch an accessible name", () => {
    renderForm();

    expect(
      screen.getByRole("switch", { name: /open to work/i }),
    ).toBeInTheDocument();
  });

  it("exposes the helper line as the switch's description", () => {
    renderForm();

    expect(screen.getByRole("switch")).toHaveAccessibleDescription(
      /recruiter-friendly badge/i,
    );
  });
});
