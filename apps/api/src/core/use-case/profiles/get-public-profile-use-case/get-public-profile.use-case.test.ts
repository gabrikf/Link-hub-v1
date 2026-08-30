import { beforeEach, describe, expect, it } from "vitest";
import { GetPublicProfileUseCase } from "./get-public-profile.use-case.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { seedDefaultLayout } from "../../profile-layout/seed-default-layout.js";

describe("GetPublicProfileUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let linksRepository: InMemoryLinksRepository;
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: GetPublicProfileUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    linksRepository = new InMemoryLinksRepository();
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new GetPublicProfileUseCase(
      usersRepository,
      linksRepository,
      tabsRepository,
      blocksRepository,
    );
  });

  async function makeUser() {
    const user = UserEntity.create({
      email: "public@example.com",
      login: "public-user",
      name: "Public User",
      password: "hashed-password",
      description: "Open profile",
      avatarUrl: "https://example.com/public.png",
      googleId: null,
    });
    await usersRepository.create(user);
    return user;
  }

  it("returns profile with only public links", async () => {
    const user = await makeUser();

    const publicLink = LinkEntity.create({
      userId: user.id,
      title: "Public",
      url: "https://public.dev",
      isPublic: true,
      order: 0,
    });

    const privateLink = LinkEntity.create({
      userId: user.id,
      title: "Private",
      url: "https://private.dev",
      isPublic: false,
      order: 1,
    });

    await linksRepository.create(publicLink);
    await linksRepository.create(privateLink);

    const result = await sut.execute("public-user");

    expect(result.username).toBe("public-user");
    expect(result.name).toBe("Public User");
    expect(result.description).toBe("Open profile");
    expect(result.userPhoto).toBe("https://example.com/public.png");
    expect(result.links).toHaveLength(1);
    expect(result.links[0].id).toBe(publicLink.id);
  });

  /*
   * A brand-new account starts MINIMAL: `DEFAULT_TABS_ENABLED` is false, so the
   * public payload is the always-visible zone and nothing else — the header
   * (photo + name) and the links. The resume/work/posts blocks ARE seeded into
   * the default tab, they are simply not published until the owner turns tabs
   * on, which is why `tabs` is empty here rather than one tab deep.
   *
   * This assertion used to read "one tab, plus a pinned header". It encoded the
   * old default, where a new profile published everything on day one.
   */
  it("publishes only the always-visible zone for a brand-new profile", async () => {
    await makeUser();

    const result = await sut.execute("public-user");

    for (const viewport of ["pc", "mobile"] as const) {
      const layout = result.layout[viewport];

      expect(layout.tabsEnabled).toBe(false);
      expect(layout.tabs).toEqual([]);
      expect(layout.blocks.map((block) => block.kind)).toEqual([
        "header",
        "links",
      ]);
      expect(layout.blocks.every((block) => block.pinnedAllTabs)).toBe(true);
      expect(layout.blocks.every((block) => block.tabId === null)).toBe(true);
      expect(layout.blocks.every((block) => block.isVisible)).toBe(true);
    }
  });

  it("excludes hidden blocks from the public layout", async () => {
    const user = await makeUser();

    // The public read path never writes, so persist a layout explicitly (as
    // /me/layout would), then hide a block.
    const { tab, blocks } = seedDefaultLayout(user.id).pc;
    await tabsRepository.create(tab);
    for (const block of blocks) {
      await blocksRepository.create(block);
    }

    const resume = blocks.find((block) => block.kind === "resume")!;
    resume.setVisibility(false);
    await blocksRepository.update(resume);

    const result = await sut.execute("public-user");

    expect(
      result.layout.pc.blocks.some((block) => block.kind === "resume"),
    ).toBe(false);
    expect(
      result.layout.pc.blocks.some((block) => block.kind === "header"),
    ).toBe(true);
  });

  it("does NOT persist a seeded layout on the public read path", async () => {
    const user = await makeUser();

    await sut.execute("public-user");

    // Anonymous visitors must not create rows in the owner's account.
    expect(await tabsRepository.findByUserAndViewport(user.id, "pc")).toHaveLength(
      0,
    );
    expect(
      await blocksRepository.findByUserAndViewport(user.id, "pc"),
    ).toHaveLength(0);
  });

  it("throws when username is not found", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
