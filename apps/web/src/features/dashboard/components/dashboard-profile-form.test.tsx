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

function renderForm(props: Partial<React.ComponentProps<
  typeof DashboardProfileForm
>> = {}) {
  return render(
    <DashboardProfileForm
      initialValues={initialValues}
      onSubmit={vi.fn()}
      {...props}
    />,
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
