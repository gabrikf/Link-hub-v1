import nodemailer, { type Transporter } from "nodemailer";
import {
  IMailProvider,
  MailMessage,
} from "../../core/providers/mail/mail-provider.js";

export interface SmtpMailConfig {
  host: string;
  port: number;
  /** true = TLS from the connection's first byte; false = STARTTLS upgrade. */
  secure: boolean;
  user?: string;
  password?: string;
  /** RFC 5322 From header, e.g. `CraftHub <no-reply@crafthub.dev>`. */
  from: string;
}

/**
 * Real delivery, over SMTP.
 *
 * Pooled, and registered as a cached singleton in the container: the transport
 * owns persistent connections, and building one per email would open a TCP+TLS
 * handshake per message and leak sockets under any real signup rate. That is
 * the same reason `ResumeEmbeddingQueue` and `ActivityDigestQueue` are
 * singletons.
 */
export class SmtpMailProvider implements IMailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpMailConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      pool: true,
      // Credentials are optional: a local relay (MailHog, Mailpit) and some
      // internal smarthosts accept unauthenticated submission, and sending
      // `auth: { user: undefined }` makes nodemailer attempt AUTH anyway.
      ...(config.user
        ? { auth: { user: config.user, pass: config.password ?? "" } }
        : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
