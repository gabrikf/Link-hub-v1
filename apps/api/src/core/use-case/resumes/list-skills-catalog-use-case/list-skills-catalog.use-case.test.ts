import { beforeEach, describe, expect, it } from "vitest";
import { SkillCatalogEntity } from "../../../entity/skill-catalog/skill-catalog-entity.js";
import { InMemorySkillCatalogRepository } from "../../../repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { ListSkillsCatalogUseCase } from "./list-skills-catalog.use-case.js";

describe("ListSkillsCatalogUseCase", () => {
  let skillCatalogRepository: InMemorySkillCatalogRepository;
  let sut: ListSkillsCatalogUseCase;

  beforeEach(() => {
    skillCatalogRepository = new InMemorySkillCatalogRepository();
    sut = new ListSkillsCatalogUseCase(skillCatalogRepository);
  });

  it("should list default and user custom skills", async () => {
    skillCatalogRepository.seed(
      SkillCatalogEntity.create({
        name: "TypeScript",
        normalizedName: "typescript",
        isDefault: true,
        createdByUserId: null,
      }),
    );

    skillCatalogRepository.seed(
      SkillCatalogEntity.create({
        name: "Elixir",
        normalizedName: "elixir",
        isDefault: false,
        createdByUserId: "user-1",
      }),
    );

    skillCatalogRepository.seed(
      SkillCatalogEntity.create({
        name: "Rust",
        normalizedName: "rust",
        isDefault: false,
        createdByUserId: "other-user",
      }),
    );

    const result = await sut.execute("user-1");

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(["TypeScript", "Elixir"]);
  });
});
