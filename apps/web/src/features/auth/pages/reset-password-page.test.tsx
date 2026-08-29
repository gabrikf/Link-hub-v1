import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));
vi.mock("../../../lib/auth-api", () => ({
  resetPasswordRequest: vi.fn(),
}));

import { ApiRequestError } from "../../../lib/api-error";
import { resetPasswordRequest } from "../../../lib/auth-api";
import { peekAuthNotice } from "../lib/auth-notice";
import { ResetPasswordPage } from "./reset-password-page";

const mockedReset = vi.mocked(resetPasswordRequest);

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const openLink = (search: string) => {
  window.history.replaceState(null, "", `/reset-password${search}`);

  return render(
    <QueryClientProvider client={newQueryClient()}>
      <ResetPasswordPage />
    </QueryClientProvider>,
  );
};

const heldOpen = () => new Promise<never>(() => {});

const fillAndSubmit = async (password: string, confirmation: string) => {
  await userEvent.type(screen.getByLabelText("New password"), password);
  await userEvent.type(
    screen.getByLabelText("Confirm new password"),
    confirmation,
  );
  await userEvent.click(
    screen.getByRole("button", { name: /update password/i }),
  );
};

beforeEach(() => {
  mockedReset.mockReset();
  navigate.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("reset password — idle", () => {
  it("shows both fields and strips the token from the URL", () => {
    const { container } = openLink("?token=raw-reset-token");

    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
    expect(window.location.search).toBe("");
    expect(container.textContent).not.toContain("raw-reset-token");
  });
});

describe("reset password — rejected by the form", () => {
  it("refuses two passwords that do not match", async () => {
    openLink("?token=good-token");

    await fillAndSubmit("secret123", "secret124");

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(mockedReset).not.toHaveBeenCalled();
  });

  /**
   * The policy is `resetPasswordSchemaInput`'s own — the same min 6 / max 100
   * the signup form validates against. A reset form with its own numbers is how
   * one of the two ends up rejecting a password the other accepts.
   */
  it("refuses a password shorter than the shared policy allows", async () => {
    openLink("?token=good-token");

    await fillAndSubmit("short", "short");

    expect(
      await screen.findByText(/at least 6 characters/i),
    ).toBeInTheDocument();
    expect(mockedReset).not.toHaveBeenCalled();
  });
});

describe("reset password — submitting", () => {
  it("sends the captured token with the new password and blocks a re-submit", async () => {
    mockedReset.mockImplementation(heldOpen);
    openLink("?token=good-token");

    await fillAndSubmit("secret123", "secret123");

    const button = await screen.findByRole("button", {
      name: /updating password/i,
    });
    expect(button).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(mockedReset).toHaveBeenCalledTimes(1));
    expect(mockedReset.mock.calls[0]?.[0]).toEqual({
      token: "good-token",
      password: "secret123",
    });
  });
});

describe("reset password — success", () => {
  /**
   * Resetting mints NO session on purpose (`resetPasswordSchemaOutput`), so the
   * next screen is the sign-in form — and it has to say why the user is looking
   * at it, or the reset reads as having done nothing.
   */
  it("routes to sign-in with a confirmation and no session", async () => {
    mockedReset.mockResolvedValue({ status: "reset" });
    openLink("?token=good-token");

    await fillAndSubmit("secret123", "secret123");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(peekAuthNotice()).toBe("auth.passwordUpdated");
    expect(window.localStorage.getItem("crafthub.auth.tokens")).toBeNull();
  });
});

describe("reset password — dead link", () => {
  it("explains a rejected token and offers a new one", async () => {
    mockedReset.mockRejectedValue(
      new ApiRequestError(
        "This password reset link is invalid or has expired. Request a new one.",
        "INVALID_RESET_TOKEN",
      ),
    );
    openLink("?token=stale-token");

    await fillAndSubmit("secret123", "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid or has expired/i,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /request a new link/i }),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/forgot-password" });
  });

  it.each(["", "?token=", "?token=%20", "?other=1"])(
    "explains a link with no usable token (`%s`) without asking for a password",
    (search) => {
      openLink(search);

      expect(screen.getByRole("alert")).toHaveTextContent(
        /missing its reset token/i,
      );
      expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /request a new link/i }),
      ).toBeInTheDocument();
    },
  );

  it("keeps the form up for a failure that is not a dead token", async () => {
    mockedReset.mockRejectedValue(new ApiRequestError("Service unavailable"));
    openLink("?token=good-token");

    await fillAndSubmit("secret123", "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable",
    );
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });
});
