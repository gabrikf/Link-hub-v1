import { beforeEach, describe, expect, it } from "vitest";
import { TitleCatalogEntity } from "../../../entity/title-catalog/title-catalog-entity.js";
import { InMemoryTitleCatalogRepository } from "../../../repositories/title-catalog/in-memory-title-catalog-repository.js";
import { ListTitlesCatalogUseCase } from "./list-titles-catalog.use-case.js";

describe("ListTitlesCatalogUseCase", () => {
  let titleCatalogRepository: InMemoryTitleCatalogRepository;
  let sut: ListTitlesCatalogUseCase;

  beforeEach(() => {
    titleCatalogRepository = new InMemoryTitleCatalogRepository();
    sut = new ListTitlesCatalogUseCase(titleCatalogRepository);
  });

  it("should list default and user custom titles", async () => {
    titleCatalogRepository.seed(
      TitleCatalogEntity.create({
        name: "Software Engineer",
        normalizedName: "software engineer",
        isDefault: true,
        createdByUserId: null,
      }),
    );

    titleCatalogRepository.seed(
      TitleCatalogEntity.create({
        name: "Platform Engineer",
        normalizedName: "platform engineer",
        isDefault: false,
        createdByUserId: "user-1",
      }),
    );

    titleCatalogRepository.seed(
      TitleCatalogEntity.create({
        name: "Mobile Engineer",
        normalizedName: "mobile engineer",
        isDefault: false,
        createdByUserId: "other-user",
      }),
    );

    const result = await sut.execute("user-1");

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual([
      "Software Engineer",
      "Platform Engineer",
    ]);
  });
});
