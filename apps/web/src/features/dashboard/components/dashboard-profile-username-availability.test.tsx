import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Tell me BEFORE I press Save whether this handle is free."
 *
 * The 409 from `PUT /profile` was the only signal a user got that somebody
 * already owned the name they had chosen — delivered after the whole form was
 * filled in and submitted. These tests are about the answer arriving while the
 * name is still being typed, and about the three things that answer must never
 * do: fire once per keystroke, comment on a field nobody touched, or call a
 * name free when the check itself failed.
 */
const fetchUsernameAvailability = vi.fn();
vi.mock("../../../lib/auth-api", () => ({
  fetchUsernameAvailability: (username: string) =>
    fetchUsernameAvailability(username),
}));
vi.mock("../../../shared-components/file-upload", () => ({
  FileUpload: () => null,
}));

import {
  DashboardProfileForm,
  type ProfileFormValues,
} from "./dashboard-profile-form";
import { DEFAULT_THEME_PRESET } from "../../profile/components/profile-theme";

const initialValues: ProfileFormValues = {
  username: "marianamanfrinn",
  name: "Mariana Manfrin Freitas",
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

const renderForm = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardProfileForm
        initialValues={initialValues}
        currentUsername="marianamanfrinn"
        onSubmit={vi.fn()}
      />
    </QueryClientProvider>,
  );

const usernameField = () => screen.getByLabelText(/^username$/i);

const answer = (
  isAvailable: boolean,
  reason: "taken" | "reserved" | null = null,
) =>
  fetchUsernameAvailability.mockImplementation((username: string) =>
    Promise.resolve({ username, isAvailable, reason }),
  );

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  answer(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Types, then lets the debounce window elapse. */
const typeHandle = async (value: string) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.clear(usernameField());
  await user.type(usernameField(), value);
  await vi.advanceTimersByTimeAsync(500);
};

describe("the username availability check", () => {
  it("says nothing, and asks nothing, about the handle the account already has", async () => {
    renderForm();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchUsernameAvailability).not.toHaveBeenCalled();
    expect(screen.queryByText(/available|taken|reserved/i)).not.toBeInTheDocument();
  });

  it("reports a free handle", async () => {
    renderForm();
    answer(true);

    await typeHandle("mariana");

    expect(await screen.findByText(/mariana is available/i)).toBeInTheDocument();
  });

  it("reports a handle somebody else already owns", async () => {
    renderForm();
    answer(false, "taken");

    await typeHandle("ada");

    expect(await screen.findByText(/ada is already taken/i)).toBeInTheDocument();
  });

  /** A different problem with a different fix, so it gets its own sentence. */
  it("distinguishes a reserved name from a taken one", async () => {
    renderForm();
    answer(false, "reserved");

    await typeHandle("dashboard");

    expect(
      await screen.findByText(/dashboard is reserved by crafthub/i),
    ).toBeInTheDocument();
  });

  /**
   * The debounce, stated as the thing it protects: ONE request for a handle
   * typed in one go, not one per character. Without it "marianamanfrin" is 14
   * requests and 14 verdicts, most of them about prefixes.
   */
  it("asks once for a handle typed in one go, not once per keystroke", async () => {
    renderForm();
    answer(true);

    await typeHandle("mariana");
    await waitFor(() => expect(fetchUsernameAvailability).toHaveBeenCalled());

    expect(fetchUsernameAvailability).toHaveBeenCalledTimes(1);
    expect(fetchUsernameAvailability).toHaveBeenCalledWith("mariana");
  });

  /**
   * A check that could not run must not read as a green light. The user is told
   * we do not know, and Save stays the authority — the alternative is walking
   * them into a 409 we implied could not happen.
   */
  it("admits it does not know when the check fails, rather than claiming the name is free", async () => {
    renderForm();
    fetchUsernameAvailability.mockRejectedValue(new Error("network down"));

    await typeHandle("mariana");

    expect(
      await screen.findByText(/could not check this username/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is available/i)).not.toBeInTheDocument();
  });

  /** Typing back to the original handle returns the form to silence. */
  it("goes quiet again when the field returns to the current handle", async () => {
    renderForm();
    answer(false, "taken");

    await typeHandle("ada");
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();

    await typeHandle("marianamanfrinn");

    await waitFor(() =>
      expect(screen.queryByText(/already taken/i)).not.toBeInTheDocument(),
    );
  });
});
