import { UserEntity } from "../../../entity/user/user-entity.js";
import { EmailVerificationTokenEntity } from "../../../entity/email-verification-token/email-verification-token-entity.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IEmailVerificationTokenRepository } from "../../../repositories/email-verification-token/email-verification-token-repository.js";
import { IHashProvider } from "../../../providers/hash/hash-provider.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { IMailProvider } from "../../../providers/mail/mail-provider.js";
import { DuplicateResourceError } from "../../../errors/index.js";
import { ICreateUserUseCaseInput } from "../../types.js";
import {
  buildEmailVerificationMessage,
  buildVerificationUrl,
} from "../email-verification-email.js";

export interface CreateUserUseCaseOptions {
  /** Canonical origin the emailed link points at. See `appPublicUrl()`. */
  appPublicUrl: string;
  /** Hours the emailed link stays usable. */
  tokenTtlHours: number;
}

export interface CreateUserUseCaseResult {
  user: ReturnType<UserEntity["toPublic"]>;
  /** Always true for a password signup. Part of the published contract. */
  emailVerificationRequired: boolean;
  /**
   * Whether the verification email actually went out.
   *
   * NOT part of the HTTP response — the controller logs it. A failed send must
   * not fail the registration (the account is real and the user can ask for
   * another link), but it must also not vanish: "signups work, nobody can
   * confirm" is the exact failure this field exists to make visible.
   */
  verificationEmailSent: boolean;
  /** The send failure, when there was one, so the controller can log it. */
  verificationEmailError: Error | null;
}

export class CreateUserUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private emailVerificationTokenRepository: IEmailVerificationTokenRepository,
    private hashProvider: IHashProvider,
    private tokenProvider: ITokenProvider,
    private mailProvider: IMailProvider,
    private options: CreateUserUseCaseOptions,
    private validator: (input: unknown) => ICreateUserUseCaseInput,
  ) {}

  async execute(
    input: ICreateUserUseCaseInput,
  ): Promise<CreateUserUseCaseResult> {
    // 1. Validate input (already handled by Zod in the controller, but good practice)
    const data = this.validator(input);

    // 2. Check if user already exists (parallel execution)
    const [userWithSameEmail, userWithSameLogin] = await Promise.all([
      this.usersRepository.findByEmailOrLogin(data.email),
      this.usersRepository.findByEmailOrLogin(data.login),
    ]);

    if (userWithSameEmail) {
      throw new DuplicateResourceError("User", "email", data.email);
    }

    if (userWithSameLogin) {
      throw new DuplicateResourceError("User", "login", data.login);
    }

    // 3. Hash the password
    const passwordHash = await this.hashProvider.hash(data.password);

    // 4. Create a new user entity — UNVERIFIED. `emailVerifiedAt` stays null
    //    until the link in the email below is opened.
    const user = UserEntity.create({
      email: data.email,
      login: data.login,
      name: data.name,
      password: passwordHash,
      description: data.description ?? null,
      avatarUrl: data.avatarUrl ?? null,
      persona: data.persona ?? null,
      emailVerifiedAt: null,
      googleId: null,
    });

    // 5. Save the user to the database
    const createdUser = await this.usersRepository.create(user);

    // 6. Mint the verification token. The RAW value is generated here and never
    //    stored — only its sha256 goes to the database, and the raw half exists
    //    from this line until it lands in the user's inbox.
    const rawToken = this.tokenProvider.generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.options.tokenTtlHours * 60 * 60 * 1000,
    );

    await this.emailVerificationTokenRepository.create(
      EmailVerificationTokenEntity.create({
        userId: createdUser.id,
        tokenHash: this.tokenProvider.hash(rawToken),
        expiresAt,
        consumedAt: null,
      }),
    );

    // 7. Send the email. A transport failure must NOT roll the signup back:
    //    the row is committed, the token is valid, and destroying a real
    //    account because an SMTP server hiccuped would be a far worse outcome
    //    than an account whose owner has to press "resend".
    let verificationEmailSent = true;
    let verificationEmailError: Error | null = null;

    try {
      await this.mailProvider.send(
        buildEmailVerificationMessage({
          to: createdUser.email,
          name: createdUser.name,
          verificationUrl: buildVerificationUrl(
            this.options.appPublicUrl,
            rawToken,
          ),
          expiresInHours: this.options.tokenTtlHours,
        }),
      );
    } catch (error) {
      verificationEmailSent = false;
      verificationEmailError =
        error instanceof Error ? error : new Error(String(error));
    }

    // 8. NO TOKENS. Registration no longer signs anyone in — the session is
    //    minted by VerifyEmailUseCase, once the address is proved.
    return {
      user: createdUser.toPublic(),
      emailVerificationRequired: true,
      verificationEmailSent,
      verificationEmailError,
    };
  }
}
