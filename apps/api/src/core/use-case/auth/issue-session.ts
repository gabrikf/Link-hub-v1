import { RefreshTokenEntity } from "../../entity/refresh-token/refresh-token-entity.js";
import { IJwtProvider } from "../../providers/jwt/jwt-provider.js";
import { IRefreshTokenRepository } from "../../repositories/refresh-token/refresh-token-repository.js";

/**
 * Refresh-token lifetime. Paired with a ~15 minute access token: the short one
 * is what an attacker gets from a leaked header, the long one is what keeps a
 * user signed in, and `POST /auth/refresh` rotates it on every use.
 */
export const REFRESH_TOKEN_TTL_DAYS = 7;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * Mint one session: a signed access token plus a freshly persisted refresh
 * token.
 *
 * Extracted because five call sites (register-then-verify, login, OAuth
 * sign-in, and refresh itself) had four hand-rolled copies of the same six
 * lines, and the TTL was a magic `7` in each of them — the shape of bug where
 * one path quietly gets a different expiry from the rest.
 */
export async function issueSession(deps: {
  jwtProvider: IJwtProvider;
  refreshTokenRepository: IRefreshTokenRepository;
  userId: string;
}): Promise<IssuedSession> {
  const { jwtProvider, refreshTokenRepository, userId } = deps;

  const accessToken = await jwtProvider.sign({ sub: userId });

  const refreshTokenValue = crypto.randomUUID();
  const refreshTokenExpiresAt = new Date();
  refreshTokenExpiresAt.setDate(
    refreshTokenExpiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS,
  );

  await refreshTokenRepository.create(
    RefreshTokenEntity.create({
      userId,
      token: refreshTokenValue,
      expiresAt: refreshTokenExpiresAt,
    }),
  );

  return { accessToken, refreshToken: refreshTokenValue };
}
