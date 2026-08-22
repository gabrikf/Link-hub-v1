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
  });
}

function roleAt(userId: string, companyName: string): WorkExperienceEntity {
  return WorkExperienceEntity.create({
    userId,
    title: "Senior Software Engineer",
    companyName,
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
