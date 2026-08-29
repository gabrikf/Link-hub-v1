/**
 * Escape a value that is about to be interpolated into an outbound email body.
 *
 * The display name comes from a signup form, so it lands in the HTML unescaped
 * unless something escapes it. A name of `<img onerror=...>` would otherwise be
 * live markup in an email we sent, signed with our own domain.
 *
 * Shared by the verification and password-reset templates so the two cannot
 * disagree about it — one of them forgetting is exactly the kind of difference
 * nobody notices until it is a report.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
