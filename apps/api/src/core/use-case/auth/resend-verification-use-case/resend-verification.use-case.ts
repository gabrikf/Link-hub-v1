import { EmailVerificationTokenEntity } from "../../../entity/email-verification-token/email-verification-token-entity.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IEmailVerificationTokenRepository } from "../../../repositories/email-verification-token/email-verification-token-repository.js";
import { IOAuthAccountRepository } from "../../../repositories/oauth-account/oauth-account-repository.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { IMailProvider } from "../../../providers/mail/mail-provider.js";
import { IResendVerificationUseCaseInput } from "../../types.js";
import {
  buildEmailVerificationMessage,
  buildVerificationUrl,
} from "../email-verification-email.js";
import { AUTH_EMAIL_COOLDOWN_MS } from "../auth-email-cooldown.js";

/**
 * Re-exported under its original name so call sites and tests keep reading
 * naturally; the value is shared with `/auth/forgot-password`, which has the
 * same abuse shape. See `auth-email-cooldown.ts`.
 */
export const RESEND_VERIFICATION_COOLDOWN_MS = AUTH_EMAIL_COOLDOWN_MS;

export interface ResendVerificationUseCaseOptions {
  appPublicUrl: string;
  tokenTtlHours: number;
}

/**
 * Why the caller was not sent an email. Returned, never rendered: the endpoint
 * answers `{ status: "sent" }` in every one of these cases. It exists so the
 * unit tests can tell "we chose not to send" from "we tried and it worked",
 * which a test asserting only on the HTTP body could never see.
 */
export type ResendVerificationOutcome =
  | "sent"
  | "no-such-account"
  | "already-verified"
  | "cooling-down";

export class ResendVerificationUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private emailVerificationTokenRepository: IEmailVerificationTokenRepository,
    private oauthAccountRepository: IOAuthAccountRepository,
    private tokenProvider: ITokenProvider,
    private mailProvider: IMailProvider,
    private options: ResendVerificationUseCaseOptions,
    private validator: (input: unknown) => IResendVerificationUseCaseInput,
  ) {}

  async execute(
    input: IResendVerificationUseCaseInput,
  ): Promise<{ outcome: ResendVerificationOutcome }> {
    const data = this.validator(input);

    const user = await this.usersRepository.findByEmail(data.email);

    // No account with that address. The controller still answers "sent" —
    // anything else lets anyone enumerate who has a CraftHub account by typing
    // addresses into a form.
    //
    // The token work runs anyway and is thrown away, the same way
    // `ForgotPasswordUseCase` does it: with the response bodies already
    // identical, an early return would leave a TIMING difference in place of
    // the one the body no longer gives away. It narrows the gap rather than
    // closing it — the database write and the mail send cannot be simulated for
    // a user who does not exist, and a measured ~50 ms vs ~2 ms remained.
    //
    // What closes it is `ResendVerificationController`, which runs this use
    // case behind a fixed response-time floor so the caller measures the floor
    // instead of the branch. Keep the discarded work anyway: it holds the two
    // branches within the same order of magnitude, so the floor is not the only
    // thing separating an attacker from an answer.
    if (!user) {
      const discarded = this.tokenProvider.generateOpaqueToken();
      this.tokenProvider.hash(discarded);

      return { outcome: "no-such-account" };
    }

    if (user.isEmailVerified()) {
      return { outcome: "already-verified" };
    }

    // Same OAuth rule as login: a linked provider already proved the address,
    // so there is nothing to verify and no email to send.
    const oauthAccounts = await this.oauthAccountRepository.findByUserId(
      user.id,
    );

    if (oauthAccounts.length > 0) {
      return { outcome: "already-verified" };
    }

    const latest = await this.emailVerificationTokenRepository.findLatestByUserId(
      user.id,
    );

    const now = new Date();

    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() <
        RESEND_VERIFICATION_COOLDOWN_MS
    ) {
      return { outcome: "cooling-down" };
    }

    const rawToken = this.tokenProvider.generateOpaqueToken();

    await this.emailVerificationTokenRepository.create(
      EmailVerificationTokenEntity.create({
        userId: user.id,
        tokenHash: this.tokenProvider.hash(rawToken),
        expiresAt: new Date(
          now.getTime() + this.options.tokenTtlHours * 60 * 60 * 1000,
        ),
        consumedAt: null,
      }),
    );

    /**
     * NOT swallowed HERE, unlike the send during registration.
     *
     * There, the account had already been created and throwing would have
     * destroyed real work. Here the whole request is the send: if it fails, the
     * user asked for an email and did not get one, and a use case that reported
     * success anyway would be lying to its own tests.
     *
     * It no longer surfaces as a 500 to the client, though, and the comment
     * that used to say the 500 "leaks nothing" was wrong: only an address with
     * a real unverified account ever gets as far as sending, so a mail outage
     * would have answered 500 for those and 200 for everyone else — the
     * enumeration oracle again, wearing a status code. `ResendVerification-
     * Controller` catches this, logs it and reports it to Sentry, and still
     * answers 200.
     */
    await this.mailProvider.send(
      buildEmailVerificationMessage({
        to: user.email,
        name: user.name,
        verificationUrl: buildVerificationUrl(
          this.options.appPublicUrl,
          rawToken,
        ),
        expiresInHours: this.options.tokenTtlHours,
      }),
    );

    return { outcome: "sent" };
  }
}
