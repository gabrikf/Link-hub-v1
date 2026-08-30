import { describe, expect, it } from "vitest";
import {
  personaOtherSchema,
  personaSchema,
  profileSchema,
  updateProfileSchemaInput,
} from "./index.js";

/**
 * The strongest sensor for this feature: a realistic payload — the exact shape
 * `GET /profile/:username` builds in `get-public-profile.use-case.ts` — pushed
 * through the schema both clients parse with. If the api ever stops sending
 * `personaOther`, or sends it under another name, this fails here rather than
 * as `undefined` inside a banner chip.
 */
const realisticProfilePayload = {
  username: "ada",
  name: "Ada Lovelace",
  description: "Rebuilding knees, one gait cycle at a time.",
  userPhoto: "https://cdn.crafthub.dev/u/ada.png",
  backgroundImageUrl: null,
  bannerImageUrl: "https://cdn.crafthub.dev/b/ada.jpg",
  themeAccent: "#0ea5e9",
  themePreset: "ocean",
  openToWork: true,
  location: "Jaraguá do Sul, Santa Catarina",
  persona: "other",
  personaOther: "Fisioterapeuta",
  links: [],
};

describe("profileSchema — the personaOther contract", () => {
  it("parses a real profile payload carrying a custom role label", () => {
    const parsed = profileSchema.parse(realisticProfilePayload);

    expect(parsed.persona).toBe("other");
    expect(parsed.personaOther).toBe("Fisioterapeuta");
  });

  it("parses a real profile payload with no custom role label", () => {
    const parsed = profileSchema.parse({
      ...realisticProfilePayload,
      persona: "developer",
      personaOther: null,
    });

    expect(parsed.persona).toBe("developer");
    expect(parsed.personaOther).toBeNull();
  });

  it("reads a pre-personaOther payload as 'no custom label' instead of failing", () => {
    const { personaOther: _omitted, ...legacyPayload } =
      realisticProfilePayload;

    expect(profileSchema.parse(legacyPayload).personaOther).toBeNull();
  });

  it("keeps persona a CLOSED enum — free text never passes as a persona", () => {
    expect(personaSchema.safeParse("fisioterapeuta").success).toBe(false);
    expect(
      profileSchema.safeParse({
        ...realisticProfilePayload,
        persona: "Fisioterapeuta",
      }).success,
    ).toBe(false);
  });
});

describe("personaOtherSchema", () => {
  it("trims before it measures, so whitespace is not a label", () => {
    expect(personaOtherSchema.parse("  Fisioterapeuta  ")).toBe(
      "Fisioterapeuta",
    );
    expect(personaOtherSchema.safeParse("   ").success).toBe(false);
    expect(personaOtherSchema.safeParse("").success).toBe(false);
  });

  it("bounds the label at 60 characters", () => {
    expect(personaOtherSchema.safeParse("x".repeat(60)).success).toBe(true);
    expect(personaOtherSchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});

describe("updateProfileSchemaInput", () => {
  it("accepts a custom label alongside persona 'other'", () => {
    const parsed = updateProfileSchemaInput.parse({
      username: "ada",
      persona: "other",
      personaOther: "  Fisioterapeuta ",
    });

    expect(parsed.personaOther).toBe("Fisioterapeuta");
  });

  it("accepts null to clear the label", () => {
    expect(
      updateProfileSchemaInput.parse({
        username: "ada",
        persona: "developer",
        personaOther: null,
      }).personaOther,
    ).toBeNull();
  });

  it("rejects a blank label rather than storing an empty chip", () => {
    expect(
      updateProfileSchemaInput.safeParse({
        username: "ada",
        persona: "other",
        personaOther: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects a label past the bound", () => {
    expect(
      updateProfileSchemaInput.safeParse({
        username: "ada",
        persona: "other",
        personaOther: "x".repeat(61),
      }).success,
    ).toBe(false);
  });
});
