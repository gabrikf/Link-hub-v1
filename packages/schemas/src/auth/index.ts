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
  avatarUrl: z.string().url("Invalid URL format").optional(),
});

// User response without password (for general user data)
export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  login: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Output schema for user response (using camelCase for API)
export const createUserSchemaOutput = z.object({
  user: userResponseSchema,
  token: z.string(),
});

// Login schema
export const loginSchemaInput = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const loginSchemaOutput = z.object({
  user: userResponseSchema,
  token: z.string(),
});

// Types
export type CreateUserInput = z.infer<typeof createUserSchemaInput>;
export type CreateUserOutput = z.infer<typeof createUserSchemaOutput>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type LoginInput = z.infer<typeof loginSchemaInput>;
export type LoginOutput = z.infer<typeof loginSchemaOutput>;
