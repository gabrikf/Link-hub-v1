/**
 * The API's error CODE, carried across the `throw` boundary.
 *
 * `readErrorMessage` in `auth-api.ts` turns a failed request into a sentence a
 * user can read, and every request function throws that sentence as a plain
 * `Error`. That is enough for "show the failure", but not for "behave
 * differently for this one failure": a 403 on sign-in has to open the
 * "confirm your email" branch, and the only reliable marker of it is the
 * `code` field the API puts in its error envelope.
 *
 * The alternative — matching the message text — breaks the moment the API is
 * asked for a different language, which it is on every request (`auth-api.ts`
 * sends `Accept-Language`). A localised message is not an identifier.
 *
 * `ApiRequestError extends Error`, so every existing call site that reads
 * `error.message` keeps working unchanged.
 */
export class ApiRequestError extends Error {
  /** The API envelope's `code`, or `null` for a transport failure with no body. */
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

/**
 * The codes this app branches on.
 *
 * The source of truth is `apps/api/src/core/errors/index.ts`, where each of
 * these is an `errorCode` on the error class the global error handler
 * serialises. They are not in `@repo/schemas` because the error envelope is
 * not a schema-validated contract — it is produced by one Fastify error
 * handler and never parsed. Naming them here, once, keeps the string out of
 * component code.
 */
export const API_ERROR_CODE = {
  emailNotVerified: "EMAIL_NOT_VERIFIED",
  invalidVerificationToken: "INVALID_VERIFICATION_TOKEN",
  invalidResetToken: "INVALID_RESET_TOKEN",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

/**
 * True when `error` is an API failure carrying exactly `code`.
 *
 * Takes `unknown` because that is what a TanStack Query `error` is worth
 * trusting as — the mutation types it as `Error`, but nothing guarantees which
 * kind.
 */
export function isApiErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof ApiRequestError && error.code === code;
}
