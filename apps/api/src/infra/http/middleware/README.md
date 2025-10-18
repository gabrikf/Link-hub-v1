# Global Error Handler

A comprehensive, production-ready error handling system for Fastify that eliminates the need for try-catch blocks throughout your application.

## ✨ Features

- ✅ **Zero try-catch required** in controllers, services, and repositories
- ✅ **Automatic error detection** and appropriate HTTP status codes
- ✅ **Consistent error responses** across the entire API
- ✅ **Type-safe** with full TypeScript support
- ✅ **Development-friendly** with detailed error info in dev mode
- ✅ **Production-safe** with sanitized error messages in production
- ✅ **Zod validation** error formatting
- ✅ **Custom domain errors** support

## 🚀 How It Works

The global error handler is registered in the Fastify server and automatically catches **all** errors thrown anywhere in your application:

```typescript
// server.ts
import { errorHandler } from "./middleware/global-error-handler.js";

const server = fastify();
server.setErrorHandler(errorHandler);
```

## 📝 Usage

### Before (With try-catch)

```typescript
export class CreateUserController {
  static async handle(server: FastifyInstance) {
    app.post("/register", async (request, reply) => {
      try {
        const result = await createUserUseCase.execute(request.body);
        reply.status(201).send(result);
      } catch (error) {
        if (error instanceof DuplicateResourceError) {
          return reply.status(409).send({ error: error.message });
        }
        if (error instanceof ValidationError) {
          return reply.status(400).send({ error: error.message });
        }
        reply.status(500).send({ error: "Internal Server Error" });
      }
    });
  }
}
```

### After (Clean code)

```typescript
export class CreateUserController {
  static async handle(server: FastifyInstance) {
    app.post("/register", async (request, reply) => {
      // Just write business logic - errors are handled automatically!
      const result = await createUserUseCase.execute(request.body);
      reply.status(201).send(result);
    });
  }
}
```

## 🎯 Supported Error Types

### Custom Application Errors

All errors extending `BaseError` are automatically handled:

```typescript
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  DuplicateResourceError,
  ValidationError,
  InternalServerError,
} from "../../../core/errors/index.js";

// In your service/use case
throw new UnauthorizedError("Invalid credentials");
throw new DuplicateResourceError("User", "email", "user@example.com");
throw new NotFoundError("User not found");
throw new ValidationError("Invalid email format");
```

### Zod Validation Errors

Automatically formats Zod validation errors:

```typescript
// Zod validation fails
const schema = z.object({ email: z.string().email() });
schema.parse({ email: "invalid" });

// Response (handled automatically):
{
  "error": "VALIDATION_ERROR",
  "message": "Validation Error",
  "statusCode": 400,
  "timestamp": "2025-10-11T10:30:00.000Z",
  "path": "/register",
  "details": [
    {
      "path": "email",
      "message": "Invalid email"
    }
  ]
}
```

### JWT Errors

```typescript
// JWT verification fails
jwt.verify(invalidToken, secret);

// Response (handled automatically):
{
  "error": "UNAUTHORIZED",
  "message": "Unauthorized",
  "statusCode": 401,
  "timestamp": "2025-10-11T10:30:00.000Z",
  "path": "/protected-route"
}
```

### Database Errors

Database errors are caught and sanitized:

```typescript
// In development mode
{
  "error": "DATABASE_ERROR",
  "message": "duplicate key value violates unique constraint",
  "statusCode": 500,
  "timestamp": "2025-10-11T10:30:00.000Z"
}

// In production mode (sanitized)
{
  "error": "DATABASE_ERROR",
  "message": "Database Error",
  "statusCode": 500,
  "timestamp": "2025-10-11T10:30:00.000Z"
}
```

## 📋 Error Response Format

All errors return a consistent format:

```typescript
interface ErrorResponse {
  error: string; // Error code (e.g., "VALIDATION_ERROR", "UNAUTHORIZED")
  message: string; // Human-readable message
  statusCode: number; // HTTP status code
  timestamp: string; // ISO 8601 timestamp
  path?: string; // Request path
  code?: string; // Additional error code (optional)
  details?: unknown; // Additional error details (in dev mode)
}
```

## 🔒 Security

- **Production Mode**: Error details are sanitized to prevent information leakage
- **Development Mode**: Full error details including stack traces for debugging
- **Database Errors**: Never expose raw database errors to clients in production

## 🎨 HTTP Status Code Mapping

| Error Type               | Status Code | Error Code           |
| ------------------------ | ----------- | -------------------- |
| `BadRequestError`        | 400         | `BADREQUEST`         |
| `UnauthorizedError`      | 401         | `UNAUTHORIZED`       |
| `ForbiddenError`         | 403         | `FORBIDDEN`          |
| `NotFoundError`          | 404         | `NOTFOUND`           |
| `ConflictError`          | 409         | `CONFLICT`           |
| `DuplicateResourceError` | 409         | `DUPLICATE_RESOURCE` |
| `ValidationError`        | 422         | `VALIDATION`         |
| `InternalServerError`    | 500         | `INTERNALSERVER`     |
| `ZodError`               | 400         | `VALIDATION_ERROR`   |
| `JsonWebTokenError`      | 401         | `UNAUTHORIZED`       |
| Database Errors          | 500         | `DATABASE_ERROR`     |
| Unknown Errors           | 500         | `INTERNAL_ERROR`     |

## 💡 Best Practices

### 1. Use Domain-Specific Errors

```typescript
// ❌ Don't throw generic errors
throw new Error("User already exists");

// ✅ Use specific error classes
throw new DuplicateResourceError("User", "email", email);
```

### 2. Let Errors Bubble Up

```typescript
// ❌ Don't catch and re-throw unnecessarily
async create(user: User) {
  try {
    return await this.repository.save(user);
  } catch (error) {
    throw error; // Unnecessary!
  }
}

// ✅ Just let it throw naturally
async create(user: User) {
  return await this.repository.save(user);
}
```

### 3. Add Context to Errors

```typescript
// ❌ Vague error
throw new NotFoundError();

// ✅ Specific error with context
throw new NotFoundError(`User with ID ${userId} not found`);
```

### 4. Use Async/Await

```typescript
// ❌ Promise chains make error handling harder
repository.findById(id)
  .then(user => ...)
  .catch(error => ...);

// ✅ Async/await - errors bubble up automatically
const user = await repository.findById(id);
```

## 🧪 Testing

The error handler works seamlessly with tests:

```typescript
it("should return 409 for duplicate email", async () => {
  // No need to mock error handling - just test the business logic
  await expect(createUserUseCase.execute(userData)).rejects.toThrow(
    DuplicateResourceError
  );
});
```

## 🔧 Environment Variables

```env
NODE_ENV=development  # or 'production'
```

- **Development**: Full error details, stack traces visible
- **Production**: Sanitized error messages, no stack traces

## 📚 Examples

### Use Case

```typescript
export class CreateUserUseCase {
  async execute(input: CreateUserInput) {
    // Check if user exists
    const existing = await this.repository.findByEmail(input.email);

    if (existing) {
      // Just throw - error handler takes care of the rest!
      throw new DuplicateResourceError("User", "email", input.email);
    }

    // Create user
    const user = UserEntity.create(input);
    return await this.repository.create(user);
  }
}
```

### Repository

```typescript
export class DrizzleUserRepository {
  async findById(id: string): Promise<UserEntity> {
    const user = await db.select().from(users).where(eq(users.id, id));

    if (!user) {
      // Just throw - error handler takes care of the rest!
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    return new UserEntity(user);
  }
}
```

### Controller

```typescript
export class GetUserController {
  static async handle(server: FastifyInstance) {
    app.get("/users/:id", async (request, reply) => {
      // Clean, simple code - no error handling needed!
      const user = await getUserUseCase.execute({ id: request.params.id });
      reply.send({ user: user.toPublic() });
    });
  }
}
```

## 🎯 Summary

With the global error handler:

- ✅ **No more try-catch blocks** cluttering your code
- ✅ **Consistent error responses** across your entire API
- ✅ **Better developer experience** - focus on business logic
- ✅ **Production-ready** with proper error sanitization
- ✅ **Type-safe** with full TypeScript support
- ✅ **Framework-agnostic errors** in your domain layer

Just throw errors anywhere in your application, and the global error handler will:

1. Catch the error
2. Determine the appropriate HTTP status code
3. Format the response consistently
4. Log the error for debugging
5. Send the response to the client

**Write less code, handle errors better!** 🎉
