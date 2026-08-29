import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IEmailVerificationTokenRepository } from "../../../repositories/email-verification-token/email-verification-token-repository.js";
import { IRefreshTokenRepository } from "../../../repositories/refresh-token/refresh-token-repository.js";
import { IJwtProvider } from "../../../providers/jwt/jwt-provider.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { InvalidVerificationTokenError } from "../../../errors/index.js";
import { IVerifyEmailUseCaseInput } from "../../types.js";
import { issueSession } from "../issue-session.js";

export class VerifyEmailUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private emailVerificationTokenRepository: IEmailVerificationTokenRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private tokenProvider: ITokenProvider,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => IVerifyEmailUseCaseInput,
  ) {}

  async execute(input: IVerifyEmailUseCaseInput) {
    const data = this.validator(input);

    // The database only ever held the hash, so this is the lookup key.
    const tokenHash = this.tokenProvider.hash(data.token);
    const verificationToken =
      await this.emailVerificationTokenRepository.findByTokenHash(tokenHash);

    const now = new Date();

    /**
     * ONE error for four different failures: unknown token, expired token,
     * already-consumed token, and a token whose user is gone. Distinguishing
     * them would tell someone feeding this endpoint guesses which of their
     * guesses was once real, and there is nothing a legitimate user does
     * differently in any of the four cases — the answer is always "ask for a
     * new link".
     */
    if (!verificationToken || !verificationToken.isUsable(now)) {
      throw new InvalidVerificationTokenError();
    }

    const user = await this.usersRepository.findById(verificationToken.userId);

    if (!user) {
      throw new InvalidVerificationTokenError();
    }

    user.markEmailVerified(now);
    const verifiedUser = await this.usersRepository.update(user);

    /**
     * Single-use, enforced here: this stamps `consumed_at` on the token that
     * was just spent AND on every other outstanding token for the user. A user
     * who pressed "resend" three times has three live links in their inbox, and
     * after one succeeds none of the others may work.
     *
     * After the user update, not before: if the update throws, the link is
     * still good and the user can simply click it again.
     */
    await this.emailVerificationTokenRepository.consumeAllForUser(
      verificationToken.userId,
      now,
    );

    // Verifying signs them in. This is the first session a password account
    // ever gets, since registration deliberately hands out none.
    const session = await issueSession({
      jwtProvider: this.jwtProvider,
      refreshTokenRepository: this.refreshTokenRepository,
      userId: verifiedUser.id,
    });

    return {
      user: verifiedUser.toPublic(),
      ...session,
    };
  }
}
