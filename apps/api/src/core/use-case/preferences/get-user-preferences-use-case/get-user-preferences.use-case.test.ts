import { beforeEach, describe, expect, it } from "vitest";
import { UserPreferencesEntity } from "../../../entity/user-preferences/user-preferences-entity.js";
import { InMemoryUserPreferencesRepository } from "../../../repositories/user-preferences/in-memory-user-preferences-repository.js";
import { GetUserPreferencesUseCase } from "./get-user-preferences.use-case.js";

describe("GetUserPreferencesUseCase", () => {
  let repository: InMemoryUserPreferencesRepository;
  let useCase: GetUserPreferencesUseCase;

  beforeEach(() => {
    repository = new InMemoryUserPreferencesRepository();
    useCase = new GetUserPreferencesUseCase(repository);
  });

  it("returns the stored preferences when a row exists", async () => {
    await repository.save(
      new UserPreferencesEntity({
        userId: "user-1",
        language: "pt-BR",
        theme: "dark",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await expect(useCase.execute("user-1")).resolves.toEqual({
      language: "pt-BR",
      theme: "dark",
    });
  });

  it("provisions follow-the-device defaults instead of failing when the row is missing", async () => {
    const result = await useCase.execute("user-without-a-row");

    expect(result).toEqual({ language: null, theme: "system" });
    // Provisioned, not merely defaulted in memory: the next read must not have
    // to re-derive it, and the row is what `PUT /preferences` updates.
    expect(repository.count()).toBe(1);
  });

  it("never overwrites an existing row while reading it", async () => {
    await repository.save(
      new UserPreferencesEntity({
        userId: "user-1",
        language: "es-ES",
        theme: "light",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await useCase.execute("user-1");

    // The bug this catches: an auto-provisioning read implemented as a blind
    // upsert, which resets a saved preference every time the app boots.
    const stored = await repository.findByUserId("user-1");
    expect(stored?.language).toBe("es-ES");
    expect(stored?.theme).toBe("light");
  });

  it("keeps one user's preferences out of another user's read", async () => {
    await repository.save(
      new UserPreferencesEntity({
        userId: "user-1",
        language: "pt-BR",
        theme: "dark",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await expect(useCase.execute("user-2")).resolves.toEqual({
      language: null,
      theme: "system",
    });
  });
});
