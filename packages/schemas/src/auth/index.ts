import { z } from "zod";

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
  createdAt: z.coerce.date(), // Accepts Date objects and coerces to proper format
  updatedAt: z.coerce.date(), // Accepts Date objects and coerces to proper format
});

// Output schema for user registration response
export const createUserSchemaOutput = z.object({
  user: userResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
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
export const googleSignInSchemaInput = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
});

export const googleSignInSchemaOutput = z.object({
  user: userResponseSchema,
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
