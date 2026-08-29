import { IRefreshTokenRepository } from "../../../repositories/refresh-token/refresh-token-repository.js";
import { IJwtProvider } from "../../../providers/jwt/jwt-provider.js";
import { InvalidCredentialsError } from "../../../errors/index.js";
import { IRefreshSessionUseCaseInput } from "../../types.js";
import { issueSession } from "../issue-session.js";

/**
 * Exchange a refresh token for a fresh session.
 *
 * Access tokens live ~15 minutes. Without this endpoint every signed-in user is
 * thrown out a quarter of an hour after logging in, which is exactly what the
 * web client's `unauthorized-interceptor` has been working around by latching
 * "refresh unsupported" and signing out on the first expiry.
 */
export class RefreshSessionUseCase {
  constructor(
    private refreshTokenRepository: IRefreshTokenRepository,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => IRefreshSessionUseCaseInput,
  ) {}

  async execute(input: IRefreshSessionUseCaseInput) {
    const data = this.validator(input);

    const stored = await this.refreshTokenRepository.findByToken(
      data.refreshToken,
    );

    // Unknown or expired: one error for both, and 401 rather than 403 so the
    // client's existing "session is over, sign out" path fires. `/auth/*` is on
    // the client's credential-endpoint list, so this 401 will not be caught by
    // the refresh interceptor and loop.
    if (!stored || stored.isExpired()) {
      throw new InvalidCredentialsError("Invalid or expired refresh token");
    }

    /**
     * ROTATION. The presented token is destroyed before the replacement is
     * issued, so a refresh token is usable exactly once.
     *
     * That is what makes a stolen token a bounded loss instead of a permanent
     * one: the thief and the real user cannot both keep refreshing, and the
     * loser of the race is signed out — which is a visible, reportable event
     * rather than a silent shared session.
     *
     * Delete first, on purpose: if issuing the new one fails, the user is
     * signed out and retries, which is strictly better than leaving the old
     * token alive after we intended to burn it.
     */
    await this.refreshTokenRepository.deleteByToken(stored.token);

    return issueSession({
      jwtProvider: this.jwtProvider,
      refreshTokenRepository: this.refreshTokenRepository,
      userId: stored.userId,
    });
  }
}
