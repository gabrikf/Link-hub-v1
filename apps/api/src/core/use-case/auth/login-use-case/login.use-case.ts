import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IRefreshTokenRepository } from "../../../repositories/refresh-token/refresh-token-repository.js";
import { IOAuthAccountRepository } from "../../../repositories/oauth-account/oauth-account-repository.js";
import { IHashProvider } from "../../../providers/hash/hash-provider.js";
import { IJwtProvider } from "../../../providers/jwt/jwt-provider.js";
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
} from "../../../errors/index.js";
import { ILoginUseCaseInput } from "../../types.js";
import { issueSession } from "../issue-session.js";

export class LoginUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private oauthAccountRepository: IOAuthAccountRepository,
    private hashProvider: IHashProvider,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => ILoginUseCaseInput,
  ) {}

  async execute(input: ILoginUseCaseInput) {
    // 1. Validate input
    const data = this.validator(input);

    // 2. Find user by email
    const user = await this.usersRepository.findByEmailOrLogin(data.email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    // 3. Verify password
    const isPasswordValid = await this.hashProvider.compare(
      data.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    // 4. The credentials are correct — now, is the address proved?
    //
    //    Checked AFTER the password on purpose: answering "verify your email"
    //    to any address typed with a wrong password would turn this endpoint
    //    into an account-existence oracle.
    if (!(await this.isEmailVerified(user.id, user.isEmailVerified()))) {
      throw new EmailNotVerifiedError();
    }

    // 5. Mint the session
    const session = await issueSession({
      jwtProvider: this.jwtProvider,
      refreshTokenRepository: this.refreshTokenRepository,
      userId: user.id,
    });

    return {
      user: user.toPublic(),
      ...session,
    };
  }

  /**
   * An account with a linked OAuth provider is verified by construction: the
   * provider proved control of the mailbox before it ever handed us the email.
   *
   * The entity covers `google_id`; this covers the `oauth_accounts` row, which
   * is the only signal LinkedIn leaves. Without it a user who signed up with
   * LinkedIn and later set a password could be refused a login for an email
   * nobody ever needed to send.
   *
   * The extra query runs ONLY when the flag is already false, so the ordinary
   * verified login still costs exactly what it did before.
   */
  private async isEmailVerified(
    userId: string,
    verifiedOnEntity: boolean,
  ): Promise<boolean> {
    if (verifiedOnEntity) {
      return true;
    }

    const oauthAccounts =
      await this.oauthAccountRepository.findByUserId(userId);

    return oauthAccounts.length > 0;
  }
}
