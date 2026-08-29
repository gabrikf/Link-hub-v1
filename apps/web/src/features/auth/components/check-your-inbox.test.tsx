import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/auth-api", () => ({
  resendVerificationRequest: vi.fn(),
}));

import { resendVerificationRequest } from "../../../lib/auth-api";
import { CheckYourInbox } from "./check-your-inbox";

const mockedResend = vi.mocked(resendVerificationRequest);

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const renderInbox = (onBackToSignIn = vi.fn()) =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <CheckYourInbox email="ada@example.com" onBackToSignIn={onBackToSignIn} />
    </QueryClientProvider>,
  );

/** Never resolves — holds the mutation in its pending state on screen. */
const heldOpen = () => new Promise<never>(() => {});

beforeEach(() => {
  mockedResend.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("check your inbox — idle", () => {
  it("names the address the account was created with", () => {
    renderInbox();

    expect(
      screen.getByRole("heading", { name: /check your inbox/i }),
    ).toBeInTheDocument();
    // The single most common way this flow dead-ends is a typo in the address,
    // which is only findable if the address is on screen.
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument();
  });

  it("offers a resend without asking for the address again", () => {
    renderInbox();

    expect(
      screen.getByRole("button", { name: /send the link again/i }),
    ).toBeEnabled();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("offers a way back to sign-in", async () => {
    const onBackToSignIn = vi.fn();
    renderInbox(onBackToSignIn);

    await userEvent.click(
      screen.getByRole("button", { name: /back to login/i }),
    );

    expect(onBackToSignIn).toHaveBeenCalledTimes(1);
  });
});

describe("check your inbox — resending", () => {
  it("shows the in-flight state and blocks a second click", async () => {
    mockedResend.mockImplementation(heldOpen);
    renderInbox();

    await userEvent.click(
      screen.getByRole("button", { name: /send the link again/i }),
    );

    const button = await screen.findByRole("button", { name: /sending/i });
    expect(button).toHaveAttribute("aria-busy", "true");

    await userEvent.click(button);
    expect(mockedResend).toHaveBeenCalledTimes(1);
  });
});

describe("check your inbox — resent", () => {
  it("confirms without saying anything about the address", async () => {
    mockedResend.mockResolvedValue({ status: "sent" });
    renderInbox();

    await userEvent.click(
      screen.getByRole("button", { name: /send the link again/i }),
    );

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent(/open the newest link/i);
    /*
     * `/auth/resend-verification` answers "sent" for an unknown address and an
     * already-verified one alike, so that it cannot be used to discover who has
     * an account here. A confirmation that varied — "we've sent it to you"
     * versus "no such account" — would hand that oracle back through the UI.
     */
    expect(confirmation).not.toHaveTextContent(/ada@example\.com/);
  });

  it("shuts the button behind a countdown after a successful send", async () => {
    mockedResend.mockResolvedValue({ status: "sent" });
    renderInbox();

    await userEvent.click(
      screen.getByRole("button", { name: /send the link again/i }),
    );

    // A frustrated user cannot machine-gun the endpoint: the button says when
    // it will work again rather than answering the fourth click with a 429.
    const throttled = await screen.findByRole("button", {
      name: /you can send another in 60s/i,
    });
    expect(throttled).toBeDisabled();

    await userEvent.click(throttled);
    expect(mockedResend).toHaveBeenCalledTimes(1);
  });

  /*
   * Fake timers, and therefore no `userEvent` and no `waitFor`: React Testing
   * Library detects JEST's fake timers only (`typeof jest !== "undefined"`),
   * so under vitest's its async helpers keep polling on a `setInterval` that
   * the fake clock never advances — the test hangs until its own timeout. Every
   * step here is driven explicitly through `act` instead.
   */
  it("counts the cooldown down second by second", async () => {
    vi.useFakeTimers();
    mockedResend.mockResolvedValue({ status: "sent" });
    renderInbox();

    fireEvent.click(
      screen.getByRole("button", { name: /send the link again/i }),
    );
    await act(async () => {});

    expect(
      screen.getByRole("button", { name: /you can send another in 60s/i }),
    ).toBeInTheDocument();

    // One second per step: each tick schedules the next timeout from an effect,
    // which only runs once React has re-rendered.
    for (let second = 0; second < 3; second += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(
      screen.getByRole("button", { name: /you can send another in 57s/i }),
    ).toBeInTheDocument();
    expect(mockedResend).toHaveBeenCalledTimes(1);
  });
});

describe("check your inbox — resend failed", () => {
  it("renders the failure and leaves the button usable", async () => {
    mockedResend.mockRejectedValue(new Error("Service unavailable"));
    renderInbox();

    await userEvent.click(
      screen.getByRole("button", { name: /send the link again/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable",
    );
    // No cooldown on a failure — the user has nothing to wait for.
    expect(
      screen.getByRole("button", { name: /send the link again/i }),
    ).toBeEnabled();
  });
});
