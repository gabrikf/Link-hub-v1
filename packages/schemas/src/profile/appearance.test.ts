import { describe, expect, it } from "vitest";
import {
  CENTERED_IMAGE_PLACEMENT,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_OVERLAY,
  DEFAULT_PROFILE_APPEARANCE,
  imagePlacementSchema,
  parseProfileAppearance,
  profileAppearanceSchema,
  profileSchema,
  storedProfileAppearanceSchema,
  updateProfileSchemaInput,
  updateProfileSchemaOutput,
} from "./index.js";

/**
 * A payload captured from a running api after setting a banner, a background
 * and a placement for each — the exact shape `GET /profile/:username` builds in
 * `get-public-profile.use-case.ts`. Asserting it through the shared schema is
 * what turns a rename or a dropped field into a failing test instead of a
 * banner that silently re-centres itself.
 */
const capturedProfilePayload = {
  username: "mariana",
  name: "Mariana Manfrin Freitas",
  description: "Fisioterapeuta formada há 5 anos.",
  userPhoto: "https://cdn.crafthub.dev/u/mariana.png",
  backgroundImageUrl: "https://cdn.crafthub.dev/bg/studio.jpg",
  bannerImageUrl: "https://cdn.crafthub.dev/b/pilates.jpg",
  themeAccent: null,
  themePreset: "violet",
  openToWork: true,
  location: "Jaraguá do Sul",
  persona: "other",
  personaOther: "Fisioterapeuta",
  appearance: {
    bannerPlacement: { x: 50, y: 18, scale: 1.2 },
    backgroundPlacement: { x: 62.5, y: 40, scale: 1 },
    backgroundOverlay: 45,
    backgroundBlur: 8,
  },
  links: [],
};

describe("imagePlacementSchema", () => {
  it("accepts a focal point inside the bounds", () => {
    expect(imagePlacementSchema.parse({ x: 0, y: 100, scale: 3 })).toEqual({
      x: 0,
      y: 100,
      scale: 3,
    });
  });

  it("rejects a percentage outside 0-100", () => {
    expect(
      imagePlacementSchema.safeParse({ x: -1, y: 50, scale: 1 }).success,
    ).toBe(false);
    expect(
      imagePlacementSchema.safeParse({ x: 101, y: 50, scale: 1 }).success,
    ).toBe(false);
  });

  it("rejects a zoom below 1 or above 3", () => {
    // Below 1 would letterbox the frame; above 3 is past what any uploaded
    // photo survives on a retina banner.
    expect(
      imagePlacementSchema.safeParse({ x: 50, y: 50, scale: 0.5 }).success,
    ).toBe(false);
    expect(
      imagePlacementSchema.safeParse({ x: 50, y: 50, scale: 4 }).success,
    ).toBe(false);
  });

  it("requires all three values — a partial focal point is not a focal point", () => {
    expect(imagePlacementSchema.safeParse({ x: 50, y: 50 }).success).toBe(
      false,
    );
  });

  it("CENTERED_IMAGE_PLACEMENT is itself valid", () => {
    expect(imagePlacementSchema.parse(CENTERED_IMAGE_PLACEMENT)).toEqual(
      CENTERED_IMAGE_PLACEMENT,
    );
  });
});

describe("profileAppearanceSchema (the write shape)", () => {
  it("takes a complete appearance", () => {
    expect(
      profileAppearanceSchema.parse(capturedProfilePayload.appearance),
    ).toEqual(capturedProfilePayload.appearance);
  });

  it("rejects a partial one, rather than quietly filling it in", () => {
    // The form always knows all four values, so a partial appearance arriving
    // over HTTP is a bug worth hearing about.
    expect(
      profileAppearanceSchema.safeParse({ backgroundOverlay: 20 }).success,
    ).toBe(false);
  });

  it("bounds the veil and the blur", () => {
    const complete = { ...DEFAULT_PROFILE_APPEARANCE };
    expect(
      profileAppearanceSchema.safeParse({ ...complete, backgroundOverlay: 101 })
        .success,
    ).toBe(false);
    expect(
      profileAppearanceSchema.safeParse({ ...complete, backgroundBlur: 25 })
        .success,
    ).toBe(false);
    expect(
      profileAppearanceSchema.safeParse({ ...complete, backgroundBlur: -1 })
        .success,
    ).toBe(false);
  });
});

describe("storedProfileAppearanceSchema (the read shape)", () => {
  it("fills each field in on its own", () => {
    // The point of per-field defaults: a row written before `backgroundBlur`
    // existed must keep the three settings it DOES have.
    const stored = storedProfileAppearanceSchema.parse({
      bannerPlacement: { x: 50, y: 20, scale: 1 },
      backgroundOverlay: 30,
    });

    expect(stored).toEqual({
      bannerPlacement: { x: 50, y: 20, scale: 1 },
      backgroundPlacement: null,
      backgroundOverlay: 30,
      backgroundBlur: DEFAULT_BACKGROUND_BLUR,
    });
  });

  it("defaults an empty object to the documented appearance", () => {
    expect(storedProfileAppearanceSchema.parse({})).toEqual(
      DEFAULT_PROFILE_APPEARANCE,
    );
    expect(DEFAULT_PROFILE_APPEARANCE.backgroundOverlay).toBe(
      DEFAULT_BACKGROUND_OVERLAY,
    );
  });

  it("shows the photograph by default instead of hiding it", () => {
    // The whole bug: the veil used to be a hardcoded 82-85%, i.e. a background
    // image the owner could not see.
    expect(DEFAULT_BACKGROUND_OVERLAY).toBeLessThan(80);
  });
});

describe("parseProfileAppearance", () => {
  it("never throws on a row nobody has written yet", () => {
    expect(parseProfileAppearance(null)).toEqual(DEFAULT_PROFILE_APPEARANCE);
    expect(parseProfileAppearance(undefined)).toEqual(
      DEFAULT_PROFILE_APPEARANCE,
    );
  });

  it("never throws on a hand-edited row — decoration cannot take a page down", () => {
    expect(parseProfileAppearance("not an object")).toEqual(
      DEFAULT_PROFILE_APPEARANCE,
    );
    expect(
      parseProfileAppearance({ backgroundOverlay: "quite a lot" }),
    ).toEqual(DEFAULT_PROFILE_APPEARANCE);
    expect(
      parseProfileAppearance({ bannerPlacement: { x: 900, y: 0, scale: 1 } }),
    ).toEqual(DEFAULT_PROFILE_APPEARANCE);
  });

  it("keeps a valid stored appearance intact", () => {
    expect(parseProfileAppearance(capturedProfilePayload.appearance)).toEqual(
      capturedProfilePayload.appearance,
    );
  });
});

describe("the profile contract carries the appearance", () => {
  it("parses a captured public-profile payload", () => {
    const parsed = profileSchema.parse(capturedProfilePayload);
    expect(parsed.appearance).toEqual(capturedProfilePayload.appearance);
  });

  it("defaults the appearance for a payload written before the field existed", () => {
    const { appearance, ...legacy } = capturedProfilePayload;
    // The split itself is worth asserting: the fixture must really carry the
    // field, and `legacy` must really be missing it, or the defaulting below
    // would pass for the wrong reason.
    expect(appearance).toBeDefined();
    expect("appearance" in legacy).toBe(false);
    expect(profileSchema.parse(legacy).appearance).toEqual(
      DEFAULT_PROFILE_APPEARANCE,
    );
  });

  it("accepts an appearance on the update input, and leaves it out when absent", () => {
    const withAppearance = updateProfileSchemaInput.parse({
      username: "mariana",
      appearance: capturedProfilePayload.appearance,
    });
    expect(withAppearance.appearance).toEqual(
      capturedProfilePayload.appearance,
    );

    // `undefined` has to survive as `undefined` — it is what the use case reads
    // as "leave the stored appearance alone".
    const without = updateProfileSchemaInput.parse({ username: "mariana" });
    expect(without.appearance).toBeUndefined();
  });

  it("rejects an out-of-range placement at the API boundary", () => {
    const result = updateProfileSchemaInput.safeParse({
      username: "mariana",
      appearance: {
        ...DEFAULT_PROFILE_APPEARANCE,
        bannerPlacement: { x: 50, y: 50, scale: 12 },
      },
    });
    expect(result.success).toBe(false);
  });

  it("returns the appearance on the update output", () => {
    const parsed = updateProfileSchemaOutput.parse({
      id: "6f1d0d4e-6f14-4f4e-9b2b-6a0a5f2b1c3d",
      username: "mariana",
      name: "Mariana Manfrin Freitas",
      description: null,
      userPhoto: null,
      backgroundImageUrl: null,
      bannerImageUrl: null,
      themeAccent: null,
      themePreset: null,
      openToWork: true,
      location: null,
      persona: null,
      personaOther: null,
      appearance: capturedProfilePayload.appearance,
      email: "mariana@example.com",
    });

    expect(parsed.appearance).toEqual(capturedProfilePayload.appearance);
  });
});
