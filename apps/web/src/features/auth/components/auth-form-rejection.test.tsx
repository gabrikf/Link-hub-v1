import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

// A failed sign-in is the most ordinary thing a user can do. The parent page
// renders the failure through `errorMessage`; nothing about it should escape as
// an unhandled promise rejection, because Sentry's global `unhandledrejection`
// handler turns every wrong password into a production error report — and the
// duplicate-email message carries the address the user just typed.
const escapedRejections: unknown[] = [];
const collectRejection = (reason: unknown) => {
  escapedRejections.push(reason);
};

beforeAll(() => {
  process.on("unhandledRejection", collectRejection);
});

afterAll(() => {
  process.off("unhandledRejection", collectRejection);
});

afterEach(() => {
  escapedRejections.length = 0;
});

// Node emits `unhandledRejection` a tick after the rejection goes unhandled, so
// the assertion has to give it that tick.
async function drainRejections() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return escapedRejections.map(String);
}

describe("auth forms with a rejecting onSubmit", () => {
  it("LoginForm handles a rejected submit instead of letting it escape", async () => {
    const user = userEvent.setup();
    render(
      <LoginForm
        isPending={false}
        errorMessage="Invalid email or password"
        onSubmit={() => Promise.reject(new Error("Invalid email or password"))}
      />,
    );

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await drainRejections()).toEqual([]);
    expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
  });

  it("RegisterForm handles a rejected submit instead of letting it escape", async () => {
    const user = userEvent.setup();
    render(
      <RegisterForm
        isPending={false}
        errorMessage="User with email 'ada@example.com' already exists"
        onSubmit={() =>
          Promise.reject(
            new Error("User with email 'ada@example.com' already exists"),
          )
        }
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Login"), "ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await drainRejections()).toEqual([]);
  });

  it("RegisterForm keeps what the user typed when the submit fails", async () => {
    const user = userEvent.setup();
    render(
      <RegisterForm
        isPending={false}
        onSubmit={() =>
          Promise.reject(
            new Error("User with email 'ada@example.com' already exists"),
          )
        }
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Login"), "ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await drainRejections();
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("RegisterForm still clears itself after a successful submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RegisterForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Login"), "ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });
});
