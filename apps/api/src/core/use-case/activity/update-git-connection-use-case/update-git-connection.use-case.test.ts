import { beforeEach, describe, expect, it } from "vitest";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import { DeleteGitConnectionUseCase } from "../delete-git-connection-use-case/delete-git-connection.use-case.js";
import { ListGitConnectionsUseCase } from "../list-git-connections-use-case/list-git-connections.use-case.js";
import { UpdateGitConnectionUseCase } from "./update-git-connection.use-case.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_ID = "33333333-3333-4333-8333-333333333333";

function makeConnection(userId: string) {
  return GitConnectionEntity.create({
    userId,
    provider: "github",
    kind: "personal",
    displayName: "Personal GitHub",
    externalAccountId: "octocat",
    workExperienceId: null,
    disclosureLevelOverride: null,
    webhookSecret: "github-secret",
    autoPostEnabled: false,
    cadence: "weekly",
    includeAgentSummary: false,
    lastDigestAt: null,
  });
}

describe("Git connection update / delete / list use cases", () => {
  let repository: InMemoryGitConnectionRepository;
  let update: UpdateGitConnectionUseCase;
  let remove: DeleteGitConnectionUseCase;
  let list: ListGitConnectionsUseCase;
  let connection: GitConnectionEntity;

  beforeEach(() => {
    repository = new InMemoryGitConnectionRepository();
    update = new UpdateGitConnectionUseCase(repository);
    remove = new DeleteGitConnectionUseCase(repository);
    list = new ListGitConnectionsUseCase(repository);

    connection = makeConnection(OWNER_ID);
    repository.seed(connection);
  });

  it("updates only the fields that were sent", async () => {
    const result = await update.execute({
      userId: OWNER_ID,
      connectionId: connection.id,
      displayName: "Work GitHub",
      kind: "work",
      cadence: "monthly",
    });

    expect(result.displayName).toBe("Work GitHub");
    expect(result.kind).toBe("work");
    expect(result.cadence).toBe("monthly");
    // Untouched.
    expect(result.autoPostEnabled).toBe(false);
    expect(result.includeAgentSummary).toBe(false);
  });

  it("never disturbs the webhook secret an update did not mention", async () => {
    // The secret is what authenticates every future delivery; a PATCH that
    // silently cleared it would take the integration down with no error.
    await update.execute({
      userId: OWNER_ID,
      connectionId: connection.id,
      displayName: "Renamed",
    });

    const stored = await repository.findById(connection.id);
    expect(stored?.webhookSecret).toBe("github-secret");
  });

  it("masks another user's connection as not found, never as forbidden", async () => {
    // Same collapse as health/preview/ingest: a 403 would confirm the id exists.
    await expect(
      update.execute({
        userId: STRANGER_ID,
        connectionId: connection.id,
        displayName: "Hijacked",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("reports a missing connection as not found", async () => {
    await expect(
      update.execute({
        userId: OWNER_ID,
        connectionId: MISSING_ID,
        displayName: "Nope",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("deletes the caller's own connection", async () => {
    await expect(remove.execute(OWNER_ID, connection.id)).resolves.toEqual({
      success: true,
    });

    expect(await repository.findById(connection.id)).toBeNull();
  });

  it("masks another user's connection as not found on delete, and removes nothing", async () => {
    await expect(
      remove.execute(STRANGER_ID, connection.id),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);

    expect(await repository.findById(connection.id)).not.toBeNull();
  });

  it("lists only the caller's own connections", async () => {
    repository.seed(makeConnection(STRANGER_ID));

    const result = await list.execute(OWNER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(connection.id);
  });
});
