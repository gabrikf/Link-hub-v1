import { beforeEach, describe, expect, it } from "vitest";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { SetWorkExperienceDisclosureUseCase } from "./set-work-experience-disclosure.use-case.js";

const USER_ID = "user-1";

function makeRole(userId = USER_ID) {
  return WorkExperienceEntity.create({
    userId,
    title: "Engineer",
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
    disclosureLevel: null,
    displayOrder: 0,
  });
}

describe("SetWorkExperienceDisclosureUseCase", () => {
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: SetWorkExperienceDisclosureUseCase;

  beforeEach(() => {
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    sut = new SetWorkExperienceDisclosureUseCase(workExperienceRepository);
  });

  it("sets an override on a role that was inheriting", async () => {
    const role = await workExperienceRepository.create(makeRole());

    const updated = await sut.execute({
      userId: USER_ID,
      workExperienceId: role.id,
      disclosureLevel: "detailed",
    });

    expect(updated.disclosureLevel).toBe("detailed");
  });

  it("clears the override with null so the role inherits again", async () => {
    const role = await workExperienceRepository.create(makeRole());

    await sut.execute({
      userId: USER_ID,
      workExperienceId: role.id,
      disclosureLevel: "full",
    });
    const cleared = await sut.execute({
      userId: USER_ID,
      workExperienceId: role.id,
      disclosureLevel: null,
    });

    expect(cleared.disclosureLevel).toBeNull();
  });

  it("does not disturb the rest of the row", async () => {
    const role = await workExperienceRepository.create(makeRole());

    const updated = await sut.execute({
      userId: USER_ID,
      workExperienceId: role.id,
      disclosureLevel: "summary",
    });

    expect(updated.title).toBe("Engineer");
    expect(updated.companyName).toBe("Acme Corp");
  });

  it("refuses to touch another user's role", async () => {
    const role = await workExperienceRepository.create(makeRole("someone-else"));

    await expect(
      sut.execute({
        userId: USER_ID,
        workExperienceId: role.id,
        disclosureLevel: "full",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws when the role does not exist", async () => {
    await expect(
      sut.execute({
        userId: USER_ID,
        workExperienceId: "missing",
        disclosureLevel: "full",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
