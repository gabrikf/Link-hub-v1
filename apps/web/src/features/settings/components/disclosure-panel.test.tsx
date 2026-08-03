import type { AgentPolicy } from "@repo/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updatePolicyMutate = vi.fn();
const updateOverrideMutate = vi.fn();

const useAgentPolicy = vi.fn();
const useWorkExperiencesForPolicy = vi.fn();

vi.mock("../lib/agent-policy-queries", () => ({
  useAgentPolicy: () => useAgentPolicy(),
  useWorkExperiencesForPolicy: () => useWorkExperiencesForPolicy(),
  useUpdateAgentPolicy: () => ({
    mutate: updatePolicyMutate,
    isPending: false,
    isError: false,
  }),
  useUpdateWorkExperienceDisclosure: () => ({
    mutate: updateOverrideMutate,
    isPending: false,
    isError: false,
  }),
}));

import { DisclosurePanel } from "./disclosure-panel";

const SUMMARY_POLICY: AgentPolicy = {
  disclosureLevel: "summary",
  blockedTerms: [],
  perEmployer: [],
};

const ROLES = [
  {
    id: "role-1",
    userId: "u1",
    title: "Senior Engineer",
    companyName: "Acme Corp",
    employmentType: null,
    workModel: null,
    locationCity: null,
    locationState: null,
    locationCountry: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    description: null,
    mainStack: [],
    displayOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
];

beforeEach(() => {
  useAgentPolicy.mockReturnValue({
    data: SUMMARY_POLICY,
    isLoading: false,
    isError: false,
  });
  useWorkExperiencesForPolicy.mockReturnValue({
    data: ROLES,
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  updatePolicyMutate.mockReset();
  updateOverrideMutate.mockReset();
  useAgentPolicy.mockReset();
  useWorkExperiencesForPolicy.mockReset();
});

describe("DisclosurePanel", () => {
  it("renders the three levels as selectable cards", () => {
    render(<DisclosurePanel />);
    const group = screen.getByRole("radiogroup", { name: "Disclosure level" });

    for (const label of ["Summary", "Detailed", "Full"]) {
      expect(
        within(group).getByRole("radio", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("marks the user's current level as checked", () => {
    render(<DisclosurePanel />);

    expect(screen.getByRole("radio", { name: "Summary" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Full" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("renders each level's allows and blocks verbatim from the shared schema", () => {
    const { container } = render(<DisclosurePanel />);
    const text = container.textContent ?? "";

    // Straight out of AGENT_DISCLOSURE_LEVELS — this copy is the same text the
    // agent is given, so the UI must not paraphrase it.
    expect(text).toContain("Role titles and seniority");
    expect(text).toContain("Employer and client names");
    expect(text).toContain(
      "Share what you did and how you did it, never who you did it for.",
    );
  });

  it("saves a new level when another card is picked", async () => {
    const user = userEvent.setup();
    render(<DisclosurePanel />);

    await user.click(screen.getByRole("radio", { name: "Detailed" }));

    expect(updatePolicyMutate).toHaveBeenCalledWith({
      disclosureLevel: "detailed",
    });
  });

  it("does not re-save the level that is already selected", async () => {
    const user = userEvent.setup();
    render(<DisclosurePanel />);

    await user.click(screen.getByRole("radio", { name: "Summary" }));

    expect(updatePolicyMutate).not.toHaveBeenCalled();
  });

  it("adds a blocked term, appending to the existing list", async () => {
    const user = userEvent.setup();
    useAgentPolicy.mockReturnValue({
      data: { ...SUMMARY_POLICY, blockedTerms: ["Atlas"] },
      isLoading: false,
      isError: false,
    });
    render(<DisclosurePanel />);

    await user.type(screen.getByLabelText("Add a term"), "Project Falcon");
    await user.click(screen.getByRole("button", { name: /Add/ }));

    expect(updatePolicyMutate).toHaveBeenCalledWith({
      blockedTerms: ["Atlas", "Project Falcon"],
    });
  });

  it("rejects a term shorter than 2 characters instead of saving it", async () => {
    const user = userEvent.setup();
    render(<DisclosurePanel />);

    await user.type(screen.getByLabelText("Add a term"), "x");
    await user.click(screen.getByRole("button", { name: /Add/ }));

    expect(screen.getByText("Enter at least 2 characters.")).toBeInTheDocument();
    expect(updatePolicyMutate).not.toHaveBeenCalled();
  });

  it("rejects a duplicate term case-insensitively — the server collapses them", async () => {
    const user = userEvent.setup();
    useAgentPolicy.mockReturnValue({
      data: { ...SUMMARY_POLICY, blockedTerms: ["Falcon"] },
      isLoading: false,
      isError: false,
    });
    render(<DisclosurePanel />);

    await user.type(screen.getByLabelText("Add a term"), "falcon");
    await user.click(screen.getByRole("button", { name: /Add/ }));

    expect(
      screen.getByText("That term is already blocked."),
    ).toBeInTheDocument();
    expect(updatePolicyMutate).not.toHaveBeenCalled();
  });

  it("removes a blocked term via its chip", async () => {
    const user = userEvent.setup();
    useAgentPolicy.mockReturnValue({
      data: { ...SUMMARY_POLICY, blockedTerms: ["Falcon", "Atlas"] },
      isLoading: false,
      isError: false,
    });
    render(<DisclosurePanel />);

    await user.click(screen.getByRole("button", { name: "Remove Falcon" }));

    expect(updatePolicyMutate).toHaveBeenCalledWith({
      blockedTerms: ["Atlas"],
    });
  });

  it("lists each role with a level select defaulting to the account default", () => {
    render(<DisclosurePanel />);

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByLabelText("Level")).toHaveValue("inherit");
  });

  it("shows a role's existing override as the selected value", () => {
    useAgentPolicy.mockReturnValue({
      data: {
        ...SUMMARY_POLICY,
        perEmployer: [
          {
            workExperienceId: "role-1",
            companyName: "Acme Corp",
            disclosureLevel: "full" as const,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<DisclosurePanel />);

    expect(screen.getByLabelText("Level")).toHaveValue("full");
  });

  it("saves a per-employer override", async () => {
    const user = userEvent.setup();
    render(<DisclosurePanel />);

    await user.selectOptions(screen.getByLabelText("Level"), "detailed");

    expect(updateOverrideMutate).toHaveBeenCalledWith({
      workExperienceId: "role-1",
      disclosureLevel: "detailed",
    });
  });

  it("clears an override back to null when 'Account default' is picked", async () => {
    const user = userEvent.setup();
    useAgentPolicy.mockReturnValue({
      data: {
        ...SUMMARY_POLICY,
        perEmployer: [
          {
            workExperienceId: "role-1",
            companyName: "Acme Corp",
            disclosureLevel: "full" as const,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<DisclosurePanel />);

    await user.selectOptions(screen.getByLabelText("Level"), "inherit");

    expect(updateOverrideMutate).toHaveBeenCalledWith({
      workExperienceId: "role-1",
      disclosureLevel: null,
    });
  });

  it("states plainly that the rule is enforced, not merely suggested", () => {
    const { container } = render(<DisclosurePanel />);
    const text = container.textContent ?? "";

    expect(text).toContain("LinkHub enforces this on the server");
    expect(text).toContain("rejected");
  });

  it("prompts the user to add work experience when they have no roles", () => {
    useWorkExperiencesForPolicy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<DisclosurePanel />);

    expect(
      screen.getByText(/Add work experience to your profile/i),
    ).toBeInTheDocument();
  });

  it("surfaces a load failure instead of rendering a misleading empty policy", () => {
    useAgentPolicy.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<DisclosurePanel />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Could not load your disclosure settings/i,
    );
  });
});
