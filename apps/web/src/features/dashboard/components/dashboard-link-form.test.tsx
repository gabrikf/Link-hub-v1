import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { DashboardLinkForm } from "./dashboard-link-form";
import { linkFormSchema, type LinkFormValues } from "../lib/link-form-schema";

const DEFAULT_ICON_OPTION = { value: "" as const, label: "Default icon" };

/**
 * Mirrors how DashboardPage wires the form, so the resolver under test is the
 * real one rather than a stand-in.
 */
function Harness({
  onSubmit,
  isSubmitting = false,
}: {
  readonly onSubmit: (values: LinkFormValues) => Promise<void> | void;
  readonly isSubmitting?: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: {
      title: "",
      url: "",
      iconOption: DEFAULT_ICON_OPTION,
      isPublic: true,
      editingLinkId: null,
    },
  });

  return (
    <DashboardLinkForm
      register={register}
      control={control}
      handleSubmit={handleSubmit}
      onSubmit={onSubmit}
      errors={errors}
      isSubmitting={isSubmitting}
      isEditing={false}
      onCancel={() => {}}
      linkIconOptions={[DEFAULT_ICON_OPTION]}
    />
  );
}

describe("DashboardLinkForm validation", () => {
  it("blocks submit and names both empty fields instead of failing silently", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /Create link/ }));

    // The whole point: the user used to get nothing at all here.
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a URL that is not a URL", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "My site");
    await user.type(screen.getByLabelText("URL"), "not-a-url");
    await user.click(screen.getByRole("button", { name: /Create link/ }));

    expect(await screen.findByText("Invalid URL format")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid link, keeping the fields the API schema does not carry", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "My site");
    await user.type(screen.getByLabelText("URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /Create link/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);

    // `editingLinkId` / `iconOption` are not in `createLinkSchemaInput`; a bare
    // resolver over that schema would have stripped them and broken editing.
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: "My site",
      url: "https://example.com",
      isPublic: true,
      editingLinkId: null,
      iconOption: DEFAULT_ICON_OPTION,
    });
  });

  it("shows a pending submit button while the mutation is in flight", () => {
    render(<Harness onSubmit={vi.fn()} isSubmitting />);

    const submit = screen.getByRole("button", { name: /Creating link/ });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
  });
});
