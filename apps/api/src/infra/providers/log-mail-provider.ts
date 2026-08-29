import {
  IMailProvider,
  MailMessage,
} from "../../core/providers/mail/mail-provider.js";
import { structuredLoggingEnabled } from "../config/app-config.js";

/**
 * Writes the message to the log instead of delivering it. This is what
 * development and test get, and it is what makes the whole verification flow
 * usable with no SMTP server configured anywhere: the link is printed, you
 * paste it into the browser, the account verifies.
 *
 * The BODY is logged, not just "an email was sent" — a line that says an email
 * went somewhere you cannot read is worse than no line at all, because it looks
 * like the feature worked.
 */
export class LogMailProvider implements IMailProvider {
  async send(message: MailMessage): Promise<void> {
    // There is no request in scope here and this app has no standalone pino
    // instance — every non-request log in `src/infra/` goes through `console`
    // (the workers and `server.ts` do the same). One JSON line where the log
    // pipeline is structured, a readable block where a human is watching.
    //
    // `assertProductionConfig()` refuses to boot production on this transport,
    // so the branch below is a safety net, not a supported deployment.
    if (structuredLoggingEnabled()) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "[mail:log] email NOT delivered — MAIL_TRANSPORT=log",
          to: message.to,
          subject: message.subject,
          body: message.text,
        }),
      );
      return;
    }

    console.info(
      [
        "",
        "──────────────────────────────────────────────────────────────",
        "[mail:log] MAIL_TRANSPORT=log — this email was NOT delivered.",
        `  to:      ${message.to}`,
        `  subject: ${message.subject}`,
        "",
        message.text,
        "──────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}
