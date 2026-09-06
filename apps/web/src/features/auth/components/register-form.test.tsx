import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { assertDefined } from "../../../test-support/assert-defined";
import { RegisterForm } from "./register-form";

const EXPECTED_PERSONAS = [
  "Developer",
  "Designer",
  "Product Manager",
  "Product Owner",
  "QA Engineer",
  "Data",
  "DevOps",
  "Other",
];

describe("RegisterForm persona picker", () => {
  it("renders the 'prefer not to say' default plus every persona option", () => {
    render(<RegisterForm isPending={false} onSubmit={vi.fn()} />);

    const select = screen.getByLabelText(/role/i);
    expect(
      within(select).getByRole("option", { name: "Prefer not to say" }),
    ).toBeInTheDocument();
    for (const label of EXPECTED_PERSONAS) {
      expect(
        within(select).getByRole("option", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("includes the chosen persona in the submitted payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RegisterForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Login"), "ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.selectOptions(screen.getByLabelText(/role/i), "designer");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ada Lovelace",
        login: "ada",
        email: "ada@example.com",
        password: "secret123",
        persona: "designer",
      }),
    );
  });

  it("omits persona when 'prefer not to say' is left selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RegisterForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Grace Hopper");
    await user.type(screen.getByLabelText("Login"), "grace");
    await user.type(screen.getByLabelText("Email"), "grace@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [firstCall] = onSubmit.mock.calls;
    assertDefined(firstCall, "the first onSubmit call");
    const [payload] = firstCall;
    expect(payload.persona).toBeUndefined();
  });
});
