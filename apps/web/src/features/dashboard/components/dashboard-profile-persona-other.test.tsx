import { DEFAULT_PROFILE_APPEARANCE } from "@repo/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DashboardProfileForm,
  type ProfileFormValues,
} from "./dashboard-profile-form";
import { DEFAULT_THEME_PRESET } from "../../profile/components/profile-theme";

vi.mock("../../../shared-components/file-upload", () => ({
  FileUpload: () => null,
}));

const baseValues: ProfileFormValues = {
  username: "ada",
  name: "Ada Lovelace",
  description: "",
  userPhoto: "",
  bannerImageUrl: "",
  backgroundImageUrl: "",
  appearance: DEFAULT_PROFILE_APPEARANCE,
  themePreset: DEFAULT_THEME_PRESET,
  themeAccent: "",
  openToWork: false,
  location: "",
  persona: "",
  personaOther: "",
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

function renderForm(
  overrides: Partial<ProfileFormValues> = {},
  onSubmit = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <DashboardProfileForm
        initialValues={{ ...baseValues, ...overrides }}
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  );
  return onSubmit;
}

const roleSelect = () => screen.getByLabelText("Role");
const customRoleInput = () => screen.getByLabelText("Which?");
const saveButton = () => screen.getByRole("button", { name: /Save profile/ });

/**
 * The persona dropdown is a CLOSED list of eight categories, so it covers most
 * people and nobody else — a physiotherapist could only file themselves under
 * "Other", and the word they would have typed was thrown away.
 */
describe("DashboardProfileForm — a role the dropdown does not cover", () => {
  it("hides the free-text field until 'Other' is picked", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByLabelText("Which?")).not.toBeInTheDocument();

    await user.selectOptions(roleSelect(), "other");

    expect(await screen.findByLabelText("Which?")).toBeInTheDocument();
  });

  it("hides it again when the user goes back to a named role", async () => {
    const user = userEvent.setup();
    renderForm({ persona: "other", personaOther: "Fisioterapeuta" });

    expect(customRoleInput()).toBeInTheDocument();

    await user.selectOptions(roleSelect(), "developer");

    await waitFor(() =>
      expect(screen.queryByLabelText("Which?")).not.toBeInTheDocument(),
    );
  });

  it("reopens in the 'Other' state with the saved label filled in", () => {
    renderForm({ persona: "other", personaOther: "Fisioterapeuta" });

    expect(roleSelect()).toHaveValue("other");
    expect(customRoleInput()).toHaveValue("Fisioterapeuta");
  });

  it("submits the typed label", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ persona: "other" });

    await user.type(customRoleInput(), "Fisioterapeuta");
    await user.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      persona: "other",
      personaOther: "Fisioterapeuta",
    });
  });

  it("refuses to save 'Other' with nothing typed, and says so in the user's language", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ persona: "other" });

    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your role.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only label as nothing typed", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ persona: "other" });

    await user.type(customRoleInput(), "   ");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your role.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enforces the same 60-character bound the API enforces", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({
      persona: "other",
      // Past the bound already, because the input's own maxLength stops a
      // person from TYPING past it — the schema is what catches a value that
      // arrived any other way (a paste into a rehydrated form, an autofill).
      personaOther: "x".repeat(61),
    });

    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use at most 60 characters.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("caps typing at the bound so the message is a last resort, not the norm", () => {
    renderForm({ persona: "other" });

    expect(customRoleInput()).toHaveAttribute("maxLength", "60");
  });

  it("does not block a save when the role is not 'Other', whatever is stored", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({
      persona: "developer",
      personaOther: "",
    });

    await user.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("shows the typed label on the live banner preview", async () => {
    const user = userEvent.setup();
    renderForm({ persona: "other" });

    await user.type(customRoleInput(), "Fisioterapeuta");

    const chip = await screen.findByTestId("profile-meta-chip");
    expect(chip).toHaveTextContent("Fisioterapeuta");
  });
});
