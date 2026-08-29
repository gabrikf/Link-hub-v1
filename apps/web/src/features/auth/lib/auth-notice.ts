/**
 * A one-shot confirmation handed from one auth screen to the next.
 *
 * Resetting a password deliberately mints NO session (see
 * `resetPasswordSchemaOutput`), so the screen after a successful reset is the
 * sign-in form — and it has to say why the user is looking at it. That message
 * has to survive a client-side navigation between two different route
 * components, which rules out component state.
 *
 * A KEY IS STORED, NOT A SENTENCE. The notice is rendered by whichever screen
 * picks it up, in whatever language is active at that moment — parking the
 * translated text instead would freeze it in the language of the previous
 * screen, which is wrong the moment somebody switches language in between.
 *
 * The peek/clear split (rather than one `consume`) is deliberate and matches
 * `lib/session.ts`'s expiry notice: reading is pure, so it is safe in a render
 * or in a `useState` initialiser that React may invoke twice under StrictMode.
 * Clearing is the side effect, and it belongs in an effect.
 */

const AUTH_NOTICE_STORAGE_KEY = "crafthub.auth.notice";

/** The i18n keys allowed through this channel. A union, so a typo is a type error. */
export type AuthNoticeKey = "auth.passwordUpdated";

const ALLOWED_NOTICES: readonly AuthNoticeKey[] = ["auth.passwordUpdated"];

export function parkAuthNotice(key: AuthNoticeKey): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(AUTH_NOTICE_STORAGE_KEY, key);
}

/** Reads without consuming. Pure — safe to call during render. */
export function peekAuthNotice(): AuthNoticeKey | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);

  // Anything else in that slot is a stale or hand-edited value, and rendering
  // it would put a raw i18n key in front of a user.
  return ALLOWED_NOTICES.includes(stored as AuthNoticeKey)
    ? (stored as AuthNoticeKey)
    : null;
}

/**
 * Drops the notice so a later, unrelated visit to the sign-in page cannot
 * resurface it.
 */
export function clearAuthNotice(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
}
