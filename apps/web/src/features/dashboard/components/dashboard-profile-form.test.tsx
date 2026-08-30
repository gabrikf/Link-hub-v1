import { DEFAULT_PROFILE_APPEARANCE } from "@repo/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  appearance: DEFAULT_PROFILE_APPEARANCE,
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

/**
 * Everything about the background photo that the owner can see BEFORE saving.
 *
 * The reported bug had two halves: the background never rendered in a preview,
 * and the veil over it on the published page was hardcoded at ~85%. Both are
 * settings now, and both are previewed where they are set.
 */
describe("DashboardProfileForm — background appearance", () => {
  const withBackground = (appearance = DEFAULT_PROFILE_APPEARANCE) => ({
    ...initialValues,
    backgroundImageUrl: "https://cdn.example.com/bg.jpg",
    appearance,
  });

  it("draws the background photo in the live preview", () => {
    renderForm({ initialValues: withBackground() });

    const preview = screen.getByTestId("profile-appearance-preview");
    expect(preview).toContainElement(
      screen.getByTestId("profile-background-image"),
    );
  });

  it("offers no veil or blur control while there is no background", () => {
    // Two sliders that move nothing read as broken, not as inapplicable.
    renderForm();

    expect(screen.queryByTestId("background-tuning")).not.toBeInTheDocument();
  });

  it("offers the veil and blur controls once a background is set", () => {
    renderForm({ initialValues: withBackground() });

    expect(screen.getByTestId("background-tuning")).toBeInTheDocument();
    expect(screen.getByLabelText(/veil/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/blur/i)).toBeInTheDocument();
  });

  it("repaints the preview the moment the veil moves, before any save", () => {
    renderForm({ initialValues: withBackground() });

    const veilBefore = Number(
      screen.getByTestId("profile-background-veil").style.opacity,
    );

    fireEvent.change(screen.getByLabelText(/veil/i), {
      target: { value: "10" },
    });

    expect(
      Number(screen.getByTestId("profile-background-veil").style.opacity),
    ).toBeCloseTo(0.1);
    expect(veilBefore).not.toBeCloseTo(0.1);
  });

  it("shows the banner in the preview at its stored focal point", () => {
    renderForm({
      initialValues: {
        ...initialValues,
        bannerImageUrl: "https://cdn.example.com/banner.jpg",
        appearance: {
          ...DEFAULT_PROFILE_APPEARANCE,
          bannerPlacement: { x: 50, y: 15, scale: 1.3 },
        },
      },
    });

    const banner = screen.getByTestId("profile-cover-image");
    expect(banner.style.objectPosition).toBe("50% 15%");
    expect(banner.style.transform).toBe("scale(1.3)");
  });

  it("submits the appearance the sliders produced", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ initialValues: withBackground(), onSubmit });

    fireEvent.change(screen.getByLabelText(/blur/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].appearance).toEqual({
      ...DEFAULT_PROFILE_APPEARANCE,
      backgroundBlur: 0,
    });
  });
});

/**
 * The in-form preview is the ONE screen this whole feature is tuned from: the
 * veil and blur sliders sit directly under it. It has to be the same picture
 * the published page draws, or the numbers the owner chooses are chosen against
 * something else.
 */
describe("DashboardProfileForm — the preview is the published stack", () => {
  const withBackground = {
    ...initialValues,
    name: "Mariana",
    backgroundImageUrl: "https://cdn.example.com/bg.jpg",
    appearance: DEFAULT_PROFILE_APPEARANCE,
  };

  it("frosts the preview card over the photo, as the published page does", () => {
    renderForm({ initialValues: withBackground });

    // The cover strip's grandparent is the frosted card; the background layer
    // is its sibling underneath.
    const card = screen.getByTestId("profile-cover-strip").parentElement
      ?.parentElement;
    expect(card?.className).toContain("backdrop-blur-md");
    expect(card?.className).toContain("bg-white/75");
    expect(card?.className).toContain("dark:bg-zinc-900/70");
  });

  it("draws no frosted card without a photo to sit on", () => {
    renderForm();

    const card = screen.getByTestId("profile-cover-strip").parentElement
      ?.parentElement;
    expect(card?.className ?? "").not.toContain("backdrop-blur");
  });

  it("steps the handle up to the readable grey over a photo", () => {
    // On a translucent card `zinc-500` measures 1.2:1 against a dark
    // photograph. This is the line the owner reads while moving the veil.
    renderForm({ initialValues: withBackground });

    const handle = screen.getByText(`@${initialValues.username}`);
    expect(handle).toHaveClass("text-zinc-700", "dark:text-zinc-200");
  });

  it("ignores a background url that could never load", () => {
    renderForm({
      initialValues: { ...withBackground, backgroundImageUrl: "not-a-url" },
    });

    const card = screen.getByTestId("profile-cover-strip").parentElement
      ?.parentElement;
    expect(card?.className ?? "").not.toContain("backdrop-blur");
  });
});
