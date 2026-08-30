import { AGENT_DISCLOSURE_LEVELS, type AgentPolicy } from "@repo/schemas";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enUS from "../../../i18n/locales/en-US.json";
import esES from "../../../i18n/locales/es-ES.json";
import ptBR from "../../../i18n/locales/pt-BR.json";

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

afterEach(async () => {
  // i18next is a singleton: a test that switches language leaks that choice
  // into every test after it, in this file and the next. `act` because the
  // components mounted by the test are still on screen when this runs — the
  // language change re-renders them.
  await act(async () => {
    await i18next.changeLanguage("en-US");
  });
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

  it("renders each level's allows and blocks, translated", () => {
    const { container } = render(<DisclosurePanel />);
    const text = container.textContent ?? "";

    // The bullets arrive from the schema as wire values and are resolved
    // through the catalogue; in en-US the catalogue text matches the English
    // the MCP is given, which is what makes the two readable side by side.
    expect(text).toContain(enUS.enum.disclosureBullet["role-titles"]);
    expect(text).toContain(
      enUS.enum.disclosureBullet["employer-and-client-names"],
    );
    expect(text).toContain(enUS.enum.disclosureLevelDescription.summary);
    // No raw key leaked through a missing leaf.
    expect(text).not.toContain("enum.disclosureBullet.");
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

    expect(text).toContain("CraftHub enforces this on the server");
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

  /*
   * The keys this panel builds are template literals — `t(\`enum.disclosureBullet.${id}\`)`
   * — and `scripts/guardrails/i18n-raw-strings.mjs` cannot see through those.
   * Adding an eighth bullet to `summary` without three translations would ship
   * a raw key onto a privacy screen and no guardrail would say a word. These
   * tests are the only thing standing there, so they enumerate the enum rather
   * than sampling it.
   */
  describe("every level and every bullet resolves in all three locales", () => {
    // All three files share a shape, so one type covers them and a leaf missing
    // from pt-BR or es-ES is a compile error before it is a test failure.
    const CATALOGUES: Record<string, typeof enUS> = {
      "en-US": enUS,
      "pt-BR": ptBR,
      "es-ES": esES,
    };

    const LEVEL_VALUES = AGENT_DISCLOSURE_LEVELS.map((level) => level.value);
    const BULLET_IDS = [
      ...new Set(
        AGENT_DISCLOSURE_LEVELS.flatMap((level) => [
          ...level.allowIds,
          ...level.blockIds,
        ]),
      ),
    ];

    it("enumerates every level the schema defines", () => {
      // Guards the guard: a level added to the schema would widen the loops
      // below silently, and this is the line that makes someone look.
      expect(LEVEL_VALUES).toEqual(["summary", "detailed", "full"]);
    });

    for (const [language, catalogue] of Object.entries(CATALOGUES)) {
      it(`translates every level name and description in ${language}`, () => {
        for (const value of LEVEL_VALUES) {
          expect(
            catalogue.enum.disclosureLevel[value],
            `enum.disclosureLevel.${value} in ${language}`,
          ).toBeTruthy();
          expect(
            catalogue.enum.disclosureLevelDescription[value],
            `enum.disclosureLevelDescription.${value} in ${language}`,
          ).toBeTruthy();
        }
      });

      it(`translates every allow/block bullet in ${language}`, () => {
        for (const id of BULLET_IDS) {
          expect(
            catalogue.enum.disclosureBullet[id],
            `enum.disclosureBullet.${id} in ${language}`,
          ).toBeTruthy();
        }
      });
    }

    it("gives pt-BR its own words, not the English fallback", async () => {
      await act(async () => {
        await i18next.changeLanguage("pt-BR");
      });
      const { container } = render(<DisclosurePanel />);
      const text = container.textContent ?? "";

      for (const level of AGENT_DISCLOSURE_LEVELS) {
        expect(text).toContain(ptBR.enum.disclosureLevelDescription[level.value]);

        for (const id of [...level.allowIds, ...level.blockIds]) {
          expect(text, `bullet ${id}`).toContain(
            ptBR.enum.disclosureBullet[id],
          );
        }

        // The English the MCP is handed must never reach a Portuguese screen.
        expect(text).not.toContain(level.shortDescription);
        for (const english of [...level.allows, ...level.blocks]) {
          expect(text, `English bullet "${english}" leaked`).not.toContain(
            english,
          );
        }
      }
    });

    it("gives es-ES its own words, not the English fallback", async () => {
      await act(async () => {
        await i18next.changeLanguage("es-ES");
      });
      const { container } = render(<DisclosurePanel />);
      const text = container.textContent ?? "";

      for (const level of AGENT_DISCLOSURE_LEVELS) {
        expect(text).toContain(esES.enum.disclosureLevelDescription[level.value]);

        for (const id of [...level.allowIds, ...level.blockIds]) {
          expect(text, `bullet ${id}`).toContain(
            esES.enum.disclosureBullet[id],
          );
        }

        expect(text).not.toContain(level.shortDescription);
        for (const english of [...level.allows, ...level.blocks]) {
          expect(text, `English bullet "${english}" leaked`).not.toContain(
            english,
          );
        }
      }
    });
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
