import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshSessionUseCase } from "./refresh-session.use-case.js";
import { RefreshTokenEntity } from "../../../entity/refresh-token/refresh-token-entity.js";
import { InvalidCredentialsError } from "../../../errors/index.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryJwtProvider } from "../../../providers/jwt/in-memory-jwt-provider.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("RefreshSessionUseCase", () => {
  const validator = vi.fn();

  let useCase: RefreshSessionUseCase;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;

  beforeEach(() => {
    refreshTokenRepository = new InMemoryRefreshTokenRepository();

    useCase = new RefreshSessionUseCase(
      refreshTokenRepository,
      new InMemoryJwtProvider(),
      validator,
    );

    vi.clearAllMocks();
  });

  async function storeToken(
    token: string,
    expiresAt = new Date(Date.now() + 7 * DAY_MS),
  ) {
    await refreshTokenRepository.create(
      RefreshTokenEntity.create({ userId: USER_ID, token, expiresAt }),
    );
  }

  function refresh(refreshToken: string) {
    vi.mocked(validator).mockReturnValue({ refreshToken });
    return useCase.execute({ refreshToken });
  }

  it("returns a new pair and ROTATES the refresh token", async () => {
    await storeToken("token-a");

    const result = await refresh("token-a");

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).not.toBe("token-a");

    // Exactly one row: the presented token is gone, its replacement is stored.
    const stored = refreshTokenRepository.getAll();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token).toBe(result.refreshToken);
    expect(stored[0]?.userId).toBe(USER_ID);
  });

  it("refuses a REUSED refresh token", async () => {
    await storeToken("token-a");

    const first = await refresh("token-a");

    // This is the whole point of rotation: a token that was already spent is
    // worthless, so a copy stolen from storage buys one refresh at most and
    // the race loser gets signed out visibly.
    await expect(refresh("token-a")).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );

    // The legitimate holder of the NEW token is unaffected.
    await expect(refresh(first.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
  });

  it("refuses an unknown refresh token", async () => {
    await expect(refresh("never-issued")).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(refreshTokenRepository.count()).toBe(0);
  });

  it("refuses an expired refresh token and does not issue a replacement", async () => {
    await storeToken("token-old", new Date(Date.now() - DAY_MS));

    await expect(refresh("token-old")).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );

    // 401, so the web client's session-expired path runs rather than its
    // retry path — `/auth/*` is excluded from the refresh interceptor.
    await expect(refresh("token-old")).rejects.toMatchObject({
      statusCode: 401,
    });

    // Nothing new was minted, and the dead row was not silently revived.
    expect(refreshTokenRepository.getAll()).toHaveLength(1);
    expect(refreshTokenRepository.getAll()[0]?.token).toBe("token-old");
  });
});
