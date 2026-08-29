import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));
vi.mock("../../../lib/auth-api", () => ({
  forgotPasswordRequest: vi.fn(),
}));

import { forgotPasswordRequest } from "../../../lib/auth-api";
import { ForgotPasswordPage } from "./forgot-password-page";

const mockedForgot = vi.mocked(forgotPasswordRequest);

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const renderPage = () =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <ForgotPasswordPage />
    </QueryClientProvider>,
  );

const heldOpen = () => new Promise<never>(() => {});

const submit = async (email: string) => {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.click(
    screen.getByRole("button", { name: /send reset link/i }),
  );
};

beforeEach(() => {
  mockedForgot.mockReset();
  navigate.mockReset();
});

describe("forgot password — idle", () => {
  it("asks for the address and explains what will happen", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /reset your password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /send reset link/i }),
    ).toBeEnabled();
  });

  it("rejects a malformed address before it reaches the API", async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    /*
     * Submitted directly rather than clicked: jsdom runs the browser's own
     * constraint validation on `type="email"` and refuses to submit at all,
     * which would leave the app's zod guard — the one that also runs for a
     * paste, an autofill, and any browser with looser native rules — untested.
     */
    fireEvent.submit(
      screen.getByRole("button", { name: /send reset link/i }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockedForgot).not.toHaveBeenCalled();
  });

  it("offers a way back to sign-in", async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: /back to login/i }),
    );

    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });
});

describe("forgot password — submitting", () => {
  it("shows the in-flight state and blocks a second submit", async () => {
    mockedForgot.mockImplementation(heldOpen);
    renderPage();

    await submit("ada@example.com");

    const button = await screen.findByRole("button", { name: /sending/i });
    expect(button).toHaveAttribute("aria-busy", "true");

    await userEvent.click(button);
    expect(mockedForgot).toHaveBeenCalledTimes(1);
  });
});

describe("forgot password — confirmation", () => {
  /**
   * `/auth/forgot-password` answers `{ status: "sent" }` for a registered
   * address, an unknown one and an OAuth-only account alike, so that it cannot
   * be used to find out who has an account here. The screen has to hold that
   * line: a UI that said "we couldn't find that address" would hand the oracle
   * straight back.
   */
  it("says the same thing whether or not the account exists", async () => {
    mockedForgot.mockResolvedValue({ status: "sent" });
    renderPage();

    await submit("stranger@example.com");

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent(/if stranger@example\.com has an account/i);
    // Conditional wording, and no claim either way about the address.
    expect(confirmation).not.toHaveTextContent(/we (found|couldn't find)/i);
    // The form is replaced, so there is nothing left to hammer.
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("renders a failure instead of a confirmation when the request fails", async () => {
    mockedForgot.mockRejectedValue(new Error("Service unavailable"));
    renderPage();

    await submit("ada@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable",
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
