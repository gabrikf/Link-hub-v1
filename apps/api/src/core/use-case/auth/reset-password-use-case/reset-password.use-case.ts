import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IPasswordResetTokenRepository } from "../../../repositories/password-reset-token/password-reset-token-repository.js";
import { IRefreshTokenRepository } from "../../../repositories/refresh-token/refresh-token-repository.js";
import { IHashProvider } from "../../../providers/hash/hash-provider.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { InvalidResetTokenError } from "../../../errors/index.js";
import { IResetPasswordUseCaseInput } from "../../types.js";

export class ResetPasswordUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordResetTokenRepository: IPasswordResetTokenRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private hashProvider: IHashProvider,
    private tokenProvider: ITokenProvider,
    private validator: (input: unknown) => IResetPasswordUseCaseInput,
  ) {}

  async execute(
    input: IResetPasswordUseCaseInput,
  ): Promise<{ status: "reset" }> {
    const data = this.validator(input);

    const tokenHash = this.tokenProvider.hash(data.token);
    const resetToken =
      await this.passwordResetTokenRepository.findByTokenHash(tokenHash);

    const now = new Date();

    // ONE error for unknown, expired, already-used, and orphaned tokens. A
    // different answer for "expired" would confirm to someone guessing that a
    // guess had once been real, and no legitimate user acts differently in any
    // of the four cases — the answer is always "ask for a new link".
    if (!resetToken || !resetToken.isUsable(now)) {
      throw new InvalidResetTokenError();
    }

    const user = await this.usersRepository.findById(resetToken.userId);

    if (!user) {
      throw new InvalidResetTokenError();
    }

    user.updatePassword(await this.hashProvider.hash(data.password));

    /**
     * Verify the address while we are here, if it is not already.
     *
     * Opening this link proved control of the mailbox — the same proof
     * /auth/verify-email asks for. Without this, someone who registered, never
     * received the verification email, and used "forgot password" to get in
     * would set a working password and STILL be refused at login by the
     * verification gate: a dead end with no way out from inside the product.
     */
    user.markEmailVerified(now);

    await this.usersRepository.update(user);

    // Single-use, and it takes the user's other outstanding links with it: no
    // reset link may survive the password change it authorised.
    await this.passwordResetTokenRepository.consumeAllForUser(
      resetToken.userId,
      now,
    );

    /**
     * Every session is revoked, which is the entire point of a password reset.
     *
     * The realistic case is an account that was already compromised: the
     * attacker holds a refresh token and can keep minting access tokens
     * indefinitely, so changing the password without this would lock the OWNER
     * out of nothing and the intruder out of nothing either. It logs the
     * legitimate user out of their other devices too, which is the expected and
     * correct cost.
     */
    await this.refreshTokenRepository.deleteByUserId(resetToken.userId);

    /**
     * NO SESSION IS MINTED. The user signs in with the password they just
     * chose. Anything else would make a forwarded email an authenticated
     * session, and it would hand the freshly revoked-from attacker a brand new
     * one if they were the one who opened the link.
     */
    return { status: "reset" };
  }
}
