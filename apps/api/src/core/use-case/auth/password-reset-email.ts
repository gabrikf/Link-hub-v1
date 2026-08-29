import { MailMessage } from "../../providers/mail/mail-provider.js";
import { escapeHtml } from "./escape-html.js";

/**
 * The password-reset email, as a pure function of (name, link, expiry).
 *
 * ENGLISH ONLY for now, for the same reason as the verification email: the API
 * has no message catalogue and the forgot-password request carries no locale.
 *
 * The expiry is stated in the body on purpose. A 20-minute link is short enough
 * that a user who opens their inbox after lunch WILL hit an expired one, and
 * "this link expires in 20 minutes" is the difference between "the site is
 * broken" and "I'll ask for another".
 */
export function buildPasswordResetMessage(params: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): MailMessage {
  const { to, name, resetUrl, expiresInMinutes } = params;

  const minutesLabel =
    expiresInMinutes === 1 ? "1 minute" : `${expiresInMinutes} minutes`;

  const text = [
    `Hi ${name},`,
    "",
    "Someone asked to reset the password on your CraftHub account. Choose a new one here:",
    "",
    resetUrl,
    "",
    `This link expires in ${minutesLabel} and can only be used once.`,
    "",
    // The standard line, and not just politeness: it is what turns an
    // unexpected email into a signal the account owner can act on.
    "If you did not ask for this, you can ignore this email — your password has not changed.",
  ].join("\n");

  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    "<p>Someone asked to reset the password on your CraftHub account. Choose a new one here:</p>",
    `<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>`,
    `<p>Or paste this link into your browser:<br>${escapeHtml(resetUrl)}</p>`,
    `<p>This link expires in ${minutesLabel} and can only be used once.</p>`,
    "<p>If you did not ask for this, you can ignore this email — your password has not changed.</p>",
  ].join("\n");

  return {
    to,
    subject: "Reset your CraftHub password",
    text,
    html,
  };
}

/**
 * Where the emailed link points. One function so the API and the web app cannot
 * disagree about the shape of the URL that gets parsed.
 */
export function buildPasswordResetUrl(
  appPublicUrl: string,
  rawToken: string,
): string {
  const base = appPublicUrl.replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}
