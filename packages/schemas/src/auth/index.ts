import { z } from "zod/v4";
import { personaSchema } from "../profile/index.js";

// Input schema for creating a user
export const createUserSchemaInput = z.object({
  email: z.string().email("Invalid email format"),
  login: z.string().min(1, "Login is required"),
  name: z.string().min(1, "Name is required"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
  description: z.string().optional(),
  avatarUrl: z.url("Invalid URL format").optional(),
  // Optional profession/persona chosen at signup. Omitted → user starts with null.
  persona: personaSchema.optional(),
});

// User response without password (for general user data)
export const userResponseSchema = z.object({
  id: z.string(),
  email: z.email("Invalid email format"),
  login: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  googleId: z.string().nullable(),
  /**
   * Whether this address has been proved. A password signup starts false and
   * flips on /auth/verify-email; an OAuth account is true by construction,
   * because the provider already proved control of the mailbox.
   *
   * A boolean rather than the underlying `emailVerifiedAt` timestamp on
   * purpose: no client has a use for the moment it happened, and shipping the
   * date would invite someone to compute a "verified N days ago" badge out of
   * a column we may later backfill.
   */
  emailVerified: z.boolean(),
  createdAt: z.coerce.date(), // Accepts Date objects and coerces to proper format
  updatedAt: z.coerce.date(), // Accepts Date objects and coerces to proper format
});

/**
 * Output schema for user registration response.
 *
 * NO TOKENS. Registering no longer signs you in: the account exists but its
 * address is unproved, so handing out a session here would make the whole
 * verification step decorative. The client's next screen is "check your
 * inbox", and the session is minted by /auth/verify-email instead.
 */
export const createUserSchemaOutput = z.object({
  user: userResponseSchema,
  emailVerificationRequired: z.boolean(),
});

// Login schema
export const loginSchemaInput = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const loginSchemaOutput = z.object({
  user: userResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

// Google sign-in schema
export const googleSignInSchemaInput = z
  .object({
    idToken: z.string().min(1, "Google ID token is required").optional(),
    accessToken: z
      .string()
      .min(1, "Google access token is required")
      .optional(),
  })
  .refine((value) => Boolean(value.idToken || value.accessToken), {
    message: "Either idToken or accessToken is required",
  });

export const googleSignInSchemaOutput = z.object({
  user: userResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

/* ------------------------------------------------------------------ *
 * Email verification
 * ------------------------------------------------------------------ */

/**
 * The raw token from the emailed link. Only its sha256 is ever stored, so this
 * value exists in exactly two places: the link and this request body.
 */
export const verifyEmailSchemaInput = z.object({
  token: z.string().min(1, "Verification token is required"),
});

/** Verifying signs the user in — this is the first session a password account gets. */
export const verifyEmailSchemaOutput = z.object({
  user: userResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const resendVerificationSchemaInput = z.object({
  email: z.email("Invalid email format"),
});

/**
 * Deliberately says nothing. "sent" is returned for an unknown address and for
 * an already-verified one too — anything else turns this endpoint into an
 * account-existence oracle.
 */
export const resendVerificationSchemaOutput = z.object({
  status: z.literal("sent"),
});

/* ------------------------------------------------------------------ *
 * Forgotten password
 * ------------------------------------------------------------------ */

export const forgotPasswordSchemaInput = z.object({
  email: z.email("Invalid email format"),
});

/**
 * Says nothing, exactly like `resendVerificationSchemaOutput`. "sent" comes
 * back for an unknown address, a registered one and an OAuth-only account
 * alike — any difference between those makes this endpoint a free tool for
 * discovering who has an account here.
 */
export const forgotPasswordSchemaOutput = z.object({
  status: z.literal("sent"),
});

export const resetPasswordSchemaInput = z.object({
  /** The raw token from the emailed link. Only its sha256 is ever stored. */
  token: z.string().min(1, "Reset token is required"),
  /**
   * The SAME policy as `createUserSchemaInput.password`, deliberately. A reset
   * form that accepts a weaker password than the signup form is a downgrade
   * path, and one that demands a stronger one rejects passwords the account
   * already has.
   */
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
});

/**
 * NO SESSION. Resetting does not sign the user in — they go to the sign-in
 * form and use the password they just chose. That is the OWASP-preferred
 * behaviour: whoever opened the link has proved control of the mailbox, which
 * is enough to change the password, but making it also a login turns a
 * forwarded email into an authenticated session.
 */
export const resetPasswordSchemaOutput = z.object({
  status: z.literal("reset"),
});

/* ------------------------------------------------------------------ *
 * Session refresh
 * ------------------------------------------------------------------ */

export const refreshSessionSchemaInput = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Both tokens come back because the refresh token is ROTATED: the one that was
 * presented is deleted, so a client that keeps the old value is holding a token
 * that no longer exists.
 */
export const refreshSessionSchemaOutput = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

// Types
export type CreateUserInput = z.infer<typeof createUserSchemaInput>;
export type CreateUserOutput = z.infer<typeof createUserSchemaOutput>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type LoginInput = z.infer<typeof loginSchemaInput>;
export type LoginOutput = z.infer<typeof loginSchemaOutput>;
export type GoogleSignInInput = z.infer<typeof googleSignInSchemaInput>;
export type GoogleSignInOutput = z.infer<typeof googleSignInSchemaOutput>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchemaInput>;
export type VerifyEmailOutput = z.infer<typeof verifyEmailSchemaOutput>;
export type ResendVerificationInput = z.infer<
  typeof resendVerificationSchemaInput
>;
export type ResendVerificationOutput = z.infer<
  typeof resendVerificationSchemaOutput
>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchemaInput>;
export type RefreshSessionOutput = z.infer<typeof refreshSessionSchemaOutput>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchemaInput>;
export type ForgotPasswordOutput = z.infer<typeof forgotPasswordSchemaOutput>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchemaInput>;
export type ResetPasswordOutput = z.infer<typeof resetPasswordSchemaOutput>;
