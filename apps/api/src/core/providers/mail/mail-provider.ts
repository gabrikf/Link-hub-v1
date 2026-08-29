/**
 * One outbound email.
 *
 * `text` is required, not optional: an HTML-only message is what gets a young
 * sending domain filed as spam, and the verification link is the one email in
 * this product that absolutely must arrive.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sending email, as core sees it: one method, no transport, no configuration.
 *
 * Same shape as the OAuth provider interfaces — the use case knows that mail
 * can be sent and nothing about how, so `src/core/` never imports nodemailer
 * and the auth tests never open a socket.
 */
export interface IMailProvider {
  send(message: MailMessage): Promise<void>;
}
