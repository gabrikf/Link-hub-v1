import { publicWorkExperienceSchema } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { GetPublicWorkExperiencesByUsernameUseCase } from "./get-public-work-experiences-by-username.use-case.js";

function makeRole(
  userId: string,
  overrides: Partial<Parameters<typeof WorkExperienceEntity.create>[0]> = {},
) {
  return WorkExperienceEntity.create({
    userId,
    title: "Engineer",
    companyName: "Acme Corp",
    employmentType: "full-time",
    workModel: "remote",
    locationCity: "Berlin",
    locationState: "BE",
    locationCountry: "DE",
    startDate: "2020-01-01",
    endDate: "2022-01-01",
    isCurrent: false,
    description: "Built things",
    mainStack: ["typescript"],
    disclosureLevel: null,
    displayOrder: 0,
    ...overrides,
  });
}

describe("GetPublicWorkExperiencesByUsernameUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: GetPublicWorkExperiencesByUsernameUseCase;
  let ownerId: string;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    sut = new GetPublicWorkExperiencesByUsernameUseCase(
      usersRepository,
      workExperienceRepository,
    );

    const owner = await usersRepository.create(
      UserEntity.create({
        email: "owner@example.com",
        login: "owner",
        name: "Owner",
        password: "hashed",
        description: null,
        avatarUrl: null,
        googleId: null,
      }),
    );
    ownerId = owner.id;
  });

  it("rejects an unknown username with 404 naming the handle, not the user id", async () => {
    await expect(sut.execute("nobody")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    await expect(sut.execute("nobody")).rejects.toMatchObject({
      statusCode: 404,
      message: "User with identifier 'nobody' not found",
    });
  });

  // CHARACTERIZATION: handle lookup is exact-match, so a differently-cased
  // handle is simply an unknown user. Consistent with every other login lookup
  // in the repo (email is normalized, login is not).
  it("treats a differently-cased handle as an unknown user", async () => {
    await expect(sut.execute("OWNER")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("returns an empty list — not a 404 — for a real user with no roles", async () => {
    await expect(sut.execute("owner")).resolves.toEqual([]);
  });

  it("returns only that user's roles, ordered by displayOrder", async () => {
    const other = await usersRepository.create(
      UserEntity.create({
        email: "other@example.com",
        login: "other",
        name: "Other",
        password: "hashed",
        description: null,
        avatarUrl: null,
        googleId: null,
      }),
    );

    await workExperienceRepository.create(
      makeRole(ownerId, { displayOrder: 2, title: "Third" }),
    );
    await workExperienceRepository.create(
      makeRole(ownerId, { displayOrder: 0, title: "First" }),
    );
    await workExperienceRepository.create(
      makeRole(ownerId, { displayOrder: 1, title: "Second" }),
    );
    await workExperienceRepository.create(
      makeRole(other.id, { title: "Somebody else's role" }),
    );

    const result = await sut.execute("owner");

    expect(result.map((role) => role.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  describe("what crosses into the public payload", () => {
    // CHARACTERIZATION: the use case hands back the raw entity, which still
    // carries userId, disclosureLevel, createdAt and updatedAt. Nothing is
    // stripped here — the route's `publicWorkExperienceSchema` response schema
    // is the only thing that removes them (asserted below). Anyone consuming
    // this use case outside that route would publish all four.
    it("returns the raw entity, including userId and the disclosure level", async () => {
      await workExperienceRepository.create(
        makeRole(ownerId, { disclosureLevel: "detailed" }),
      );

      const [role] = await sut.execute("owner");

      expect(Object.keys(role!).sort()).toEqual(
        [
          "companyName",
          "createdAt",
          "description",
          "disclosureLevel",
          "displayOrder",
          "employmentType",
          "endDate",
          "id",
          "isCurrent",
          "locationCity",
          "locationCountry",
          "locationState",
          "mainStack",
          "startDate",
          "title",
          "updatedAt",
          "userId",
          "workModel",
        ].sort(),
      );
      expect(role!.userId).toBe(ownerId);
      expect(role!.disclosureLevel).toBe("detailed");
    });

    it("the shared public schema is what drops userId and disclosureLevel", async () => {
      await workExperienceRepository.create(
        makeRole(ownerId, { disclosureLevel: "detailed" }),
      );

      const [role] = await sut.execute("owner");
      const published = publicWorkExperienceSchema.parse(role);

      expect(published).not.toHaveProperty("userId");
      expect(published).not.toHaveProperty("disclosureLevel");
      expect(published).not.toHaveProperty("createdAt");
      expect(published).not.toHaveProperty("updatedAt");
      expect(Object.keys(published).sort()).toEqual(
        [
          "companyName",
          "description",
          "displayOrder",
          "employmentType",
          "endDate",
          "id",
          "isCurrent",
          "locationCity",
          "locationCountry",
          "locationState",
          "mainStack",
          "startDate",
          "title",
          "workModel",
        ].sort(),
      );
    });

    // CHARACTERIZATION: there is no "hidden role" concept — every stored role of
    // a user is public. A user cannot keep one employer off their public
    // profile short of deleting it. That is the current product shape.
    it("publishes every stored role — there is no per-role visibility flag", async () => {
      await workExperienceRepository.create(
        makeRole(ownerId, { displayOrder: 0, title: "Public" }),
      );
      await workExperienceRepository.create(
        makeRole(ownerId, {
          displayOrder: 1,
          title: "Stealth startup",
          disclosureLevel: "none",
        }),
      );

      const result = await sut.execute("owner");

      expect(result.map((role) => role.title)).toEqual([
        "Public",
        "Stealth startup",
      ]);
    });
  });
});
