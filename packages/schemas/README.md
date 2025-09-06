# @repo/schemas

Shared Zod schemas for the LinkHub monorepo. This package provides type-safe validation schemas that can be used across both frontend and backend applications.

## Installation

This package is automatically installed as a workspace dependency. It's already included in:

- `apps/api` - Backend API
- `apps/web` - Frontend web application

## Usage

### Auth Schemas

#### Creating a User

```typescript
import {
  createUserSchemaInput,
  createUserSchemaOutput,
  CreateUserInput,
  CreateUserOutput,
} from "@repo/schemas";

// Input validation
const userInput: CreateUserInput = {
  email: "user@example.com",
  login: "username",
  name: "User Name",
  password: "securepassword",
  description: "Optional description",
  avatarUrl: "https://example.com/avatar.jpg", // optional
};

// Validate input
const validatedInput = createUserSchemaInput.parse(userInput);

// Response type
const response: CreateUserOutput = {
  user: {
    id: "user-id",
    email: "user@example.com",
    login: "username",
    name: "User Name",
    description: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  token: "jwt-token",
};
```

#### Login

```typescript
import {
  loginSchemaInput,
  loginSchemaOutput,
  LoginInput,
  LoginOutput,
} from "@repo/schemas";

// Input validation
const loginInput: LoginInput = {
  email: "user@example.com",
  password: "password",
};

// Validate input
const validatedInput = loginSchemaInput.parse(loginInput);
```

### Available Schemas

- `createUserSchemaInput` - Input validation for user creation
- `createUserSchemaOutput` - Output schema for user creation response
- `userResponseSchema` - General user response schema (without sensitive data)
- `loginSchemaInput` - Input validation for login
- `loginSchemaOutput` - Output schema for login response

### Available Types

- `CreateUserInput` - TypeScript type for user creation input
- `CreateUserOutput` - TypeScript type for user creation output
- `UserResponse` - TypeScript type for user data response
- `LoginInput` - TypeScript type for login input
- `LoginOutput` - TypeScript type for login output

## Development

To build the schemas package:

```bash
npm run build
```

To watch for changes during development:

```bash
npm run dev
```

## Adding New Schemas

1. Create your schema in the appropriate folder under `src/`
2. Export it from the folder's `index.ts` file
3. Re-export it from the main `src/index.ts` file
4. Run `npm run build` to compile the TypeScript
5. The schema will be available to import in other packages
