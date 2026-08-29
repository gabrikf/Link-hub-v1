import { MailMessage } from "../../providers/mail/mail-provider.js";
import { escapeHtml } from "./escape-html.js";

/**
 * The verification email, as a pure function of (name, link).
 *
 * ENGLISH ONLY, and deliberately so for now: the web app is translated into
 * three locales through react-i18next, but the API has no catalogue and no
 * per-user language on the signup path, so the honest options were "one
 * language" or "a second translation system nobody maintains". Revisit when the
 * signup request starts carrying the chosen locale.
 *
 * Its own module because it is the piece most likely to be edited by someone
 * who is not touching auth logic at all.
 */
export function buildEmailVerificationMessage(params: {
  to: string;
  name: string;
  verificationUrl: string;
  expiresInHours: number;
}): MailMessage {
  const { to, name, verificationUrl, expiresInHours } = params;

  const hoursLabel = expiresInHours === 1 ? "1 hour" : `${expiresInHours} hours`;

  const text = [
    `Hi ${name},`,
    "",
    "Confirm your email address to finish setting up your CraftHub account:",
    "",
    verificationUrl,
    "",
    `This link expires in ${hoursLabel} and can only be used once.`,
    "",
    "If you did not create a CraftHub account, you can ignore this email.",
  ].join("\n");

  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    "<p>Confirm your email address to finish setting up your CraftHub account:</p>",
    `<p><a href="${escapeHtml(verificationUrl)}">Confirm my email address</a></p>`,
    `<p>Or paste this link into your browser:<br>${escapeHtml(verificationUrl)}</p>`,
    `<p>This link expires in ${hoursLabel} and can only be used once.</p>`,
    "<p>If you did not create a CraftHub account, you can ignore this email.</p>",
  ].join("\n");

  return {
    to,
    subject: "Confirm your CraftHub email address",
    text,
    html,
  };
}

/**
 * Where the emailed link points. One function so the API and any future
 * re-send path cannot disagree about the shape of the URL the web app parses.
 */
export function buildVerificationUrl(
  appPublicUrl: string,
  rawToken: string,
): string {
  const base = appPublicUrl.replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
}
