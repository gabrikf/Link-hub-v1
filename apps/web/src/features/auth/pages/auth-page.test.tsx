import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));
vi.mock("@react-oauth/google", () => ({
  useGoogleLogin: () => vi.fn(),
}));
vi.mock("../../../lib/auth-api", () => ({
  getLinkedInSignInUrl: () => "http://localhost:3333/auth/linkedin",
  googleSignInRequest: vi.fn(),
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  resendVerificationRequest: vi.fn(),
}));

import { ApiRequestError } from "../../../lib/api-error";
import {
  loginRequest,
  registerRequest,
  resendVerificationRequest,
} from "../../../lib/auth-api";
import { handleSessionExpired } from "../../../lib/session";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { parkAuthNotice } from "../lib/auth-notice";
import { AuthPage } from "./auth-page";

const mockedLogin = vi.mocked(loginRequest);
const mockedRegister = vi.mocked(registerRequest);
const mockedResend = vi.mocked(resendVerificationRequest);

const newUser = {
  id: "user-1",
  email: "ada@example.com",
  login: "ada",
  name: "Ada Lovelace",
  description: null,
  avatarUrl: null,
  googleId: null,
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const renderPage = () =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <AuthPage />
    </QueryClientProvider>,
  );

const signInAs = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
};

const registerAs = async (email: string) => {
  await userEvent.click(screen.getByRole("button", { name: /register/i }));
  await userEvent.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await userEvent.type(screen.getByLabelText("Login"), "ada");
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), "secret123");
  await userEvent.click(
    screen.getByRole("button", { name: /create account/i }),
  );
};

beforeEach(() => {
  mockedLogin.mockReset();
  mockedRegister.mockReset();
  mockedResend.mockReset();
  navigate.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  useUserInfoStore.setState({ userInfo: null });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("registering", () => {
  /**
   * Registering deliberately does not sign you in — `createUserSchemaOutput`
   * carries no tokens — so "check your inbox" is the next SCREEN, not a note
   * beside a form the user has no reason to look at again.
   */
  it("replaces the form with check-your-inbox for the address used", async () => {
    mockedRegister.mockResolvedValue({
      user: newUser,
      emailVerificationRequired: true,
    });
    renderPage();

    await registerAs("ada@example.com");

    expect(
      await screen.findByRole("heading", { name: /check your inbox/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument();
    // No session was minted, so there is nothing to sign in with yet.
    expect(window.localStorage.getItem("crafthub.auth.tokens")).toBeNull();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("comes back to the sign-in tab from check-your-inbox", async () => {
    mockedRegister.mockResolvedValue({
      user: newUser,
      emailVerificationRequired: true,
    });
    renderPage();

    await registerAs("ada@example.com");
    await userEvent.click(
      await screen.findByRole("button", { name: /back to login/i }),
    );

    expect(
      await screen.findByRole("button", { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });
});

describe("signing in with an unverified address", () => {
  /**
   * A 403 with the CORRECT password is not a failed sign-in, it is an
   * unfinished signup. Detected by the error CODE: the API translates its
   * messages, so matching on text would work in English and quietly stop
   * working in pt-BR — and this branch decides whether the user is told "wrong
   * password" or "confirm your email".
   */
  it("explains the block and seeds a resend with the address just typed", async () => {
    mockedLogin.mockRejectedValue(
      new ApiRequestError(
        "Confirm your email address before signing in.",
        "EMAIL_NOT_VERIFIED",
      ),
    );
    mockedResend.mockResolvedValue({ status: "sent" });
    renderPage();

    await signInAs("ada@example.com", "secret123");

    expect(
      await screen.findByRole("heading", { name: /confirm your email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/open the link we sent to ada@example\.com/i),
    ).toBeInTheDocument();

    // Seeded from the login field, so there is no second address to type: the
    // only "Email" input on screen is still the sign-in form's.
    expect(screen.getAllByLabelText("Email")).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: /send the link again/i }),
    );

    await waitFor(() => expect(mockedResend).toHaveBeenCalledTimes(1));
    expect(mockedResend.mock.calls[0]?.[0]).toEqual({
      email: "ada@example.com",
    });
  });

  it("still shows an ordinary wrong-password failure as an error", async () => {
    mockedLogin.mockRejectedValue(
      new ApiRequestError("Invalid email or password.", null),
    );
    renderPage();

    await signInAs("ada@example.com", "wrongpass");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
    expect(
      screen.queryByRole("heading", { name: /confirm your email/i }),
    ).not.toBeInTheDocument();
  });
});

describe("forgot password", () => {
  it("is reachable from the sign-in tab", async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: /forgot your password/i }),
    );

    expect(navigate).toHaveBeenCalledWith({ to: "/forgot-password" });
  });

  /**
   * On the register tab too: somebody who cannot get in often assumes they
   * never registered, and lands there rather than on the sign-in tab.
   */
  it("is reachable from the register tab", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /register/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /forgot your password/i }),
    );

    expect(navigate).toHaveBeenCalledWith({ to: "/forgot-password" });
  });

  it("shows the parked confirmation after a password reset, exactly once", async () => {
    parkAuthNotice("auth.passwordUpdated");

    const view = renderPage();
    expect(
      await screen.findByText(/password updated\. sign in with your new/i),
    ).toBeInTheDocument();

    view.unmount();
    renderPage();

    expect(
      screen.queryByText(/password updated\. sign in with your new/i),
    ).not.toBeInTheDocument();
  });
});

/**
 * The expiry notice had been PARKED BUT NEVER READ: `lib/session.ts` wrote it
 * on every expiry and `consumeSessionExpiredMessage` had no caller in the app,
 * so a user whose token died mid-task was dropped on a bare sign-in form with
 * no explanation. These two tests are what keep it wired.
 */
describe("an expired session", () => {
  it("explains why the user is back on the sign-in page", async () => {
    handleSessionExpired();

    renderPage();

    expect(
      await screen.findByText(/your session expired/i),
    ).toBeInTheDocument();
  });

  it("does not resurface the notice on a later, unrelated visit", async () => {
    handleSessionExpired();

    const view = renderPage();
    expect(await screen.findByText(/your session expired/i)).toBeInTheDocument();

    view.unmount();
    renderPage();

    expect(screen.queryByText(/your session expired/i)).not.toBeInTheDocument();
  });
});
