import { beforeEach, describe, expect, it } from "vitest";
import { UserPreferencesEntity } from "../../../entity/user-preferences/user-preferences-entity.js";
import { InMemoryUserPreferencesRepository } from "../../../repositories/user-preferences/in-memory-user-preferences-repository.js";
import { UpdateUserPreferencesUseCase } from "./update-user-preferences.use-case.js";

describe("UpdateUserPreferencesUseCase", () => {
  let repository: InMemoryUserPreferencesRepository;
  let useCase: UpdateUserPreferencesUseCase;

  beforeEach(() => {
    repository = new InMemoryUserPreferencesRepository();
    useCase = new UpdateUserPreferencesUseCase(repository);
  });

  async function seed(language: "en-US" | "pt-BR" | "es-ES" | null, theme: "light" | "dark" | "system") {
    await repository.save(
      new UserPreferencesEntity({
        userId: "user-1",
        language,
        theme,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  }

  it("creates the row on a first save for a user who has none", async () => {
    const result = await useCase.execute({ userId: "user-1", theme: "dark" });

    expect(result).toEqual({ language: null, theme: "dark" });
    expect(repository.count()).toBe(1);
  });

  it("leaves language untouched when only theme is sent", async () => {
    await seed("pt-BR", "system");

    const result = await useCase.execute({ userId: "user-1", theme: "dark" });

    // The bug: treating an absent field as "clear it", so a dark-mode toggle
    // silently resets the user's language to follow-the-device.
    expect(result).toEqual({ language: "pt-BR", theme: "dark" });
  });

  it("leaves theme untouched when only language is sent", async () => {
    await seed(null, "dark");

    const result = await useCase.execute({
      userId: "user-1",
      language: "es-ES",
    });

    expect(result).toEqual({ language: "es-ES", theme: "dark" });
  });

  it("distinguishes an explicit null language from an omitted one", async () => {
    await seed("pt-BR", "dark");

    // `null` is a real choice — "go back to following the device" — and must
    // not be collapsed into "not provided".
    const result = await useCase.execute({ userId: "user-1", language: null });

    expect(result).toEqual({ language: null, theme: "dark" });
  });

  it("returns the full new state, not just the field that changed", async () => {
    await seed("en-US", "light");

    const result = await useCase.execute({ userId: "user-1", theme: "system" });

    expect(Object.keys(result).sort()).toEqual(["language", "theme"]);
    expect(result.language).toBe("en-US");
  });

  it("persists the change so the next read sees it", async () => {
    await seed("en-US", "light");

    await useCase.execute({ userId: "user-1", language: "pt-BR" });

    const stored = await repository.findByUserId("user-1");
    expect(stored?.language).toBe("pt-BR");
    expect(stored?.theme).toBe("light");
  });

  it("does not touch another user's row", async () => {
    await seed("en-US", "light");

    await useCase.execute({ userId: "user-2", theme: "dark" });

    const untouched = await repository.findByUserId("user-1");
    expect(untouched?.theme).toBe("light");
  });
});
