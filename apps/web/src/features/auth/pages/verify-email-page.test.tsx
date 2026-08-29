import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));
vi.mock("../../../lib/auth-api", () => ({
  verifyEmailRequest: vi.fn(),
  resendVerificationRequest: vi.fn(),
}));

import { ApiRequestError } from "../../../lib/api-error";
import { verifyEmailRequest } from "../../../lib/auth-api";
import { getAuthTokens } from "../../../lib/auth-tokens";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { VerifyEmailPage } from "./verify-email-page";

const mockedVerify = vi.mocked(verifyEmailRequest);

const verifiedUser = {
  id: "user-1",
  email: "ada@example.com",
  login: "ada",
  name: "Ada Lovelace",
  description: null,
  avatarUrl: null,
  googleId: null,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const openLink = (search: string) => {
  window.history.replaceState(null, "", `/verify-email${search}`);

  return render(
    <QueryClientProvider client={newQueryClient()}>
      <VerifyEmailPage />
    </QueryClientProvider>,
  );
};

/** Never resolves — holds the request in flight so the loading state stays up. */
const heldOpen = () => new Promise<never>(() => {});

beforeEach(() => {
  mockedVerify.mockReset();
  navigate.mockReset();
  window.localStorage.clear();
  useUserInfoStore.setState({ userInfo: null });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("verify email — loading", () => {
  it("announces the check while the request is in flight", async () => {
    mockedVerify.mockImplementation(heldOpen);

    openLink("?token=raw-token-value");

    expect(screen.getByRole("status")).toHaveTextContent(
      /confirming your email address/i,
    );
    // React Query dispatches the mutation function on a microtask, so the call
    // lands a tick after the effect that asked for it. Only the first argument
    // is ours — v5 passes a mutation context as the second.
    await waitFor(() => expect(mockedVerify).toHaveBeenCalledTimes(1));
    expect(mockedVerify.mock.calls[0]?.[0]).toEqual({
      token: "raw-token-value",
    });
  });

  /**
   * The token is a bearer credential for one account. Left in the address bar
   * it reaches the browser history, any screenshot of the window, and every
   * `Referer` header the page emits.
   */
  it("strips the token from the URL and never renders it", () => {
    mockedVerify.mockImplementation(heldOpen);

    const { container } = openLink("?token=raw-token-value");

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/verify-email");
    expect(container.textContent).not.toContain("raw-token-value");
  });
});

describe("verify email — success", () => {
  it("stores the session it was handed and routes to the dashboard", async () => {
    mockedVerify.mockResolvedValue({
      user: verifiedUser,
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    openLink("?token=good-token");

    expect(await screen.findByText(/email confirmed/i)).toBeInTheDocument();
    // Verifying is the first session a password account gets — see
    // `verifyEmailSchemaOutput`, which carries tokens where register does not.
    expect(getAuthTokens()).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    expect(useUserInfoStore.getState().userInfo?.email).toBe("ada@example.com");
    expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" });
  });
});

describe("verify email — invalid or expired", () => {
  it("explains the dead link and offers a new one", async () => {
    mockedVerify.mockRejectedValue(
      new ApiRequestError(
        "This verification link is invalid or has expired. Request a new one.",
        "INVALID_VERIFICATION_TOKEN",
      ),
    );

    openLink("?token=stale-token");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid or has expired/i,
    );
    // The resend has to ask for an address: a rejected token tells us nothing
    // about whose it was.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send the link again/i }),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the API's own message when the failure is not a dead token", async () => {
    mockedVerify.mockRejectedValue(new ApiRequestError("Service unavailable"));

    openLink("?token=some-token");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable",
    );
  });
});

describe("verify email — missing token", () => {
  it.each(["", "?token=", "?token=%20%20", "?other=1"])(
    "explains what is wrong with `%s` and never calls the API",
    (search) => {
      openLink(search);

      expect(screen.getByRole("alert")).toHaveTextContent(
        /missing its verification token/i,
      );
      expect(mockedVerify).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: /send the link again/i }),
      ).toBeInTheDocument();
    },
  );
});

/**
 * `main.tsx` mounts the whole app inside `<StrictMode>`, so this is the tree the
 * page actually runs in — and it is where the first version of this screen
 * broke. Firing the request as a MUTATION from a mount effect left the answer
 * unobserved: the double-invoked effect subscribed, tore down and re-subscribed
 * around the call, and the committed tree never saw the result. The screen sat
 * on "Confirming your email address…" forever with the response already in
 * hand, and no test outside StrictMode could see it — the visual scenario is
 * what caught it.
 */
describe("verify email — inside StrictMode, as the app really mounts it", () => {
  const renderStrict = (search: string) => {
    window.history.replaceState(null, "", `/verify-email${search}`);

    return render(
      <StrictMode>
        <QueryClientProvider client={newQueryClient()}>
          <VerifyEmailPage />
        </QueryClientProvider>
      </StrictMode>,
    );
  };

  it("consumes the single-use token exactly once", async () => {
    mockedVerify.mockResolvedValue({
      user: verifiedUser,
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    renderStrict("?token=good-token");

    expect(await screen.findByText(/email confirmed/i)).toBeInTheDocument();
    // A second request would consume nothing and report a good link as expired.
    expect(mockedVerify).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" });
  });

  it("leaves the loading state when the answer arrives", async () => {
    mockedVerify.mockRejectedValue(
      new ApiRequestError("Dead link.", "INVALID_VERIFICATION_TOKEN"),
    );

    renderStrict("?token=stale-token");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText(/confirming your email address/i),
    ).not.toBeInTheDocument();
  });
});
