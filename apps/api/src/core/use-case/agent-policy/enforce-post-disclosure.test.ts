import { describe, expect, it } from "vitest";
import { UserEntity } from "../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../entity/work-experience/work-experience-entity.js";
import { BadRequestError } from "../../errors/index.js";
import { assertPostRespectsDisclosure } from "./enforce-post-disclosure.js";

/**
 * The disclosure policy's promise is "never who you did it for". These tests
 * cover the URL-shaped fields, which reach exactly the same anonymous reader as
 * the body does: `externalUrl` is the post's `<a href>` on the public profile,
 * and `coverImageUrl`/`images` are its `<img src>`.
 */

function userAt(
  level: "summary" | "detailed" | "full",
  blockedTerms: string[] = [],
): UserEntity {
  return UserEntity.create({
    email: "dev@example.com",
    login: "dev",
    name: "Dev",
    password: "hashed",
    agentDisclosureLevel: level,
    agentBlockedTerms: blockedTerms,
    description: null,
    avatarUrl: null,
    googleId: null,
  });
}

function roleAt(
  userId: string,
  companyName: string,
  disclosureLevel: "summary" | "detailed" | "full" | null = null,
): WorkExperienceEntity {
  return WorkExperienceEntity.create({
    userId,
    title: "Senior Software Engineer",
    companyName,
    disclosureLevel,
    employmentType: "full-time",
    workModel: "remote",
    locationCity: null,
    locationState: null,
    locationCountry: null,
    startDate: null,
    endDate: null,
    isCurrent: true,
    description: null,
    mainStack: [],
    displayOrder: 0,
  });
}

describe("assertPostRespectsDisclosure — URL fields a public reader sees", () => {
  it("throws when the employer is named only in externalUrl", () => {
    const user = userAt("summary");
    const workExperiences = [roleAt(user.id, "Nubank")];

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences,
        title: "Shipped a ledger reconciliation job",
        body: "Cut p99 from 900ms to 120ms. TypeScript, Fastify, PostgreSQL.",
        tags: ["typescript", "fastify"],
        externalUrl: "https://github.com/nubank-internal/ledger/pull/4471",
      }),
    ).toThrow(BadRequestError);
  });

  it("names the offending term so the agent can act on the refusal", () => {
    const user = userAt("summary");
    const workExperiences = [roleAt(user.id, "Nubank")];

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences,
        body: "A clean body.",
        externalUrl: "https://github.com/nubank-internal/ledger/pull/4471",
      }),
    ).toThrow(/Nubank/);
  });

  it("throws when the employer is named only in coverImageUrl", () => {
    const user = userAt("summary");
    const workExperiences = [roleAt(user.id, "Nubank")];

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences,
        body: "A clean body.",
        coverImageUrl: "https://cdn.example.com/nubank/architecture.png",
      }),
    ).toThrow(BadRequestError);
  });

  it("throws when the employer is named only in one of the images", () => {
    const user = userAt("summary");
    const workExperiences = [roleAt(user.id, "Nubank")];

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences,
        body: "A clean body.",
        images: [
          "https://cdn.example.com/clean.png",
          "https://cdn.example.com/nubank/diagram.png",
        ],
      }),
    ).toThrow(BadRequestError);
  });

  it("throws when a user's own blocked term appears in a URL", () => {
    const user = userAt("full", ["Falcon"]);

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences: [],
        body: "A clean body.",
        externalUrl: "https://github.com/acme/falcon-ledger/pull/7",
      }),
    ).toThrow(/Falcon/);
  });

  it("accepts a post whose URLs do not name the employer", () => {
    const user = userAt("summary");
    const workExperiences = [roleAt(user.id, "Nubank")];

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences,
        title: "Shipped a ledger reconciliation job",
        body: "Cut p99 from 900ms to 120ms.",
        tags: ["typescript"],
        externalUrl: "https://github.com/openbank/ledger/pull/4471",
        coverImageUrl: "https://cdn.example.com/architecture.png",
        images: ["https://cdn.example.com/diagram.png"],
      }),
    ).not.toThrow();
  });

  it("accepts a URL naming the employer once the role raises the level", () => {
    const user = userAt("summary");
    const role = roleAt(user.id, "Nubank");
    role.disclosureLevel = "full";

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences: [role],
        workExperienceId: role.id,
        body: "A clean body.",
        externalUrl: "https://github.com/nubank-internal/ledger/pull/4471",
      }),
    ).not.toThrow();
  });
});

/**
 * Raising ONE role's level says "you may name THIS employer" — not "you may
 * name all of them". A developer who marks their open-source or already-public
 * stint `full` while leaving the NDA employer on `summary` must still be
 * protected from an agent that attributes the post to the permissive role.
 */
describe("assertPostRespectsDisclosure — a permissive role must not un-block the others", () => {
  it("still blocks an employer whose own role stayed at summary", () => {
    const user = userAt("summary");
    const open = roleAt(user.id, "VTEX", "full");
    const underNda = roleAt(user.id, "PagBank");

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences: [open, underNda],
        workExperienceId: open.id,
        body: "Shipped a reconciliation ledger at PagBank this quarter.",
      }),
    ).toThrow(/PagBank/);
  });

  it("blocks the employer of a role pinned to summary under a full account", () => {
    const user = userAt("full");
    const underNda = roleAt(user.id, "PagBank", "summary");

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences: [underNda],
        body: "Shipped a reconciliation ledger at PagBank this quarter.",
      }),
    ).toThrow(/PagBank/);
  });

  /**
   * The mirror of the rule, and a deliberate loosening: the denylist now asks
   * "is THIS employer's role at summary?", so a role the user raised to `full`
   * may be named even when the post is not attributed to it. That matches what
   * `GET /me/work-context` already hands the agent — it returns a `full` role's
   * companyName in cleartext regardless of attribution — and matches what the
   * user said by raising that role.
   */
  it("allows naming a full-level employer in a post attributed to no role", () => {
    const user = userAt("summary");
    const open = roleAt(user.id, "VTEX", "full");
    const underNda = roleAt(user.id, "PagBank");

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences: [open, underNda],
        body: "Shipped a reconciliation ledger at VTEX this quarter.",
      }),
    ).not.toThrow();
  });

  it("still allows naming the attributed employer itself", () => {
    const user = userAt("summary");
    const open = roleAt(user.id, "VTEX", "full");
    const underNda = roleAt(user.id, "PagBank");

    expect(() =>
      assertPostRespectsDisclosure({
        user,
        workExperiences: [open, underNda],
        workExperienceId: open.id,
        body: "Shipped a reconciliation ledger at VTEX this quarter.",
      }),
    ).not.toThrow();
  });
});
