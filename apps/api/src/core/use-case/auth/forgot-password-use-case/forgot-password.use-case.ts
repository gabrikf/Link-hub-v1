import { PasswordResetTokenEntity } from "../../../entity/password-reset-token/password-reset-token-entity.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IPasswordResetTokenRepository } from "../../../repositories/password-reset-token/password-reset-token-repository.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { IMailProvider } from "../../../providers/mail/mail-provider.js";
import { IForgotPasswordUseCaseInput } from "../../types.js";
import {
  buildPasswordResetMessage,
  buildPasswordResetUrl,
} from "../password-reset-email.js";
import { AUTH_EMAIL_COOLDOWN_MS } from "../auth-email-cooldown.js";

export interface ForgotPasswordUseCaseOptions {
  appPublicUrl: string;
  /** Minutes the emailed link stays usable. OWASP: no more than 20. */
  tokenTtlMinutes: number;
}

/**
 * Why no email went out. Reported to the CALLER for testability only — the
 * controller answers 200 { status: "sent" } for every one of these.
 */
export type ForgotPasswordOutcome =
  | "sent"
  | "no-such-account"
  | "cooling-down";

export class ForgotPasswordUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordResetTokenRepository: IPasswordResetTokenRepository,
    private tokenProvider: ITokenProvider,
    private mailProvider: IMailProvider,
    private options: ForgotPasswordUseCaseOptions,
    private validator: (input: unknown) => IForgotPasswordUseCaseInput,
  ) {}

  async execute(
    input: IForgotPasswordUseCaseInput,
  ): Promise<{ outcome: ForgotPasswordOutcome }> {
    const data = this.validator(input);

    const user = await this.usersRepository.findByEmail(data.email);

    if (!user) {
      /**
       * Do the token work anyway, then throw it away.
       *
       * The response body is already identical for a known and an unknown
       * address; a bare `return` here would leave a TIMING difference instead —
       * the "account exists" path generates 32 random bytes and a sha256, and
       * an early return skips both. That is a smaller tell than a different
       * status code, but it is the same oracle, measured with a stopwatch.
       *
       * The database write and the mail send are NOT simulated: writing a row
       * for a user that does not exist is impossible, and sending mail to an
       * address nobody registered is the abuse this endpoint must not enable.
       * So this narrows the gap and does not close it — a measured ~9 ms vs
       * ~2 ms remained, and ~50 ms vs ~2 ms with a real SMTP transport.
       *
       * What closes it is one layer out: `ForgotPasswordController` runs this
       * use case behind a fixed response-time floor, so the caller measures the
       * floor rather than the branch. Do not delete the discarded work below on
       * the strength of that — it keeps the untimed cost of the two branches in
       * the same order of magnitude, which is what stops the floor from being
       * the only thing standing between an attacker and an answer.
       */
      const discarded = this.tokenProvider.generateOpaqueToken();
      this.tokenProvider.hash(discarded);

      return { outcome: "no-such-account" };
    }

    /**
     * NO OAUTH EXCLUSION, and this is a decision rather than an oversight.
     *
     * An account created through Google or LinkedIn has a random password hash
     * nobody knows. Letting its owner set a real one is the ordinary "add a
     * password to my social login" flow, and the emailed token proves control
     * of the same mailbox the provider vouched for — which is exactly the
     * evidence a password change needs. Refusing would strand anyone who loses
     * access to their Google account with no way back into their CraftHub
     * profile, and it would have to be visible in the response to be useful,
     * which would reintroduce the enumeration oracle this endpoint avoids.
     */

    const latest = await this.passwordResetTokenRepository.findLatestByUserId(
      user.id,
    );

    const now = new Date();

    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < AUTH_EMAIL_COOLDOWN_MS
    ) {
      return { outcome: "cooling-down" };
    }

    /**
     * Kill the user's outstanding links BEFORE issuing the new one, so only the
     * newest email in their inbox works. Someone who clicks "forgot password"
     * three times must not be left with three live keys to their account.
     */
    await this.passwordResetTokenRepository.consumeAllForUser(user.id, now);

    const rawToken = this.tokenProvider.generateOpaqueToken();

    await this.passwordResetTokenRepository.create(
      PasswordResetTokenEntity.create({
        userId: user.id,
        tokenHash: this.tokenProvider.hash(rawToken),
        expiresAt: new Date(
          now.getTime() + this.options.tokenTtlMinutes * 60 * 1000,
        ),
        consumedAt: null,
      }),
    );

    /**
     * Not swallowed HERE: the send is the point of the request, and a use case
     * that reports success over a failed transport is lying to its own tests.
     *
     * It no longer reaches the client as a 500, though, and the comment that
     * used to say the 500 "leaks nothing" was wrong: only an address with a
     * real account ever gets as far as sending, so a mail outage would have
     * answered 500 for registered addresses and 200 for unknown ones — the
     * enumeration oracle again, wearing a status code. `ForgotPasswordController`
     * catches this, logs it and reports it to Sentry, and still answers 200.
     */
    await this.mailProvider.send(
      buildPasswordResetMessage({
        to: user.email,
        name: user.name,
        resetUrl: buildPasswordResetUrl(this.options.appPublicUrl, rawToken),
        expiresInMinutes: this.options.tokenTtlMinutes,
      }),
    );

    return { outcome: "sent" };
  }
}
