# Global Error Handler - Quick Reference

## 🎯 The Problem It Solves

**Before:**

```typescript
// Every controller/service needed try-catch
async create(data) {
  try {
    const result = await service.execute(data);
    return reply.status(201).send(result);
  } catch (error) {
    if (error instanceof DuplicateError) {
      return reply.status(409).send({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return reply.status(400).send({ error: error.message });
    }
    return reply.status(500).send({ error: "Internal Error" });
  }
}
```

**After:**

```typescript
// Clean, simple code
async create(data) {
  const result = await service.execute(data);
  return reply.status(201).send(result);
}
// ✨ Global error handler catches everything automatically!
```

## 🚀 Quick Start

### 1. Error handler is already registered in `server.ts`

```typescript
import { errorHandler } from "./middleware/global-error-handler.js";

const server = fastify();
server.setErrorHandler(errorHandler); // ✅ Done!
```

### 2. Just throw errors in your code

```typescript
// In services/use cases
if (userExists) {
  throw new DuplicateResourceError("User", "email", email);
}

// In repositories
if (!user) {
  throw new NotFoundError("User not found");
}

// Anywhere in your code
if (unauthorized) {
  throw new UnauthorizedError("Invalid token");
}
```

### 3. That's it! 🎉

No try-catch needed. The global error handler will:

- Catch the error ✅
- Set the correct HTTP status code ✅
- Format the response consistently ✅
- Log for debugging ✅
- Send to client ✅

## 📦 Available Error Classes

```typescript
import {
  BadRequestError, // 400
  UnauthorizedError, // 401
  ForbiddenError, // 403
  NotFoundError, // 404
  ConflictError, // 409
  DuplicateResourceError, // 409
  ValidationError, // 422
  InternalServerError, // 500
} from "../../core/errors/index.js";
```

## 🎨 Response Format

All errors return this consistent format:

```json
{
  "error": "DUPLICATE_RESOURCE",
  "message": "User with email 'user@example.com' already exists",
  "statusCode": 409,
  "timestamp": "2025-10-11T10:30:00.000Z",
  "path": "/register"
}
```

## ✨ Special Handling

### Zod Validation Errors

Automatically formatted with field-level details:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation Error",
  "statusCode": 400,
  "details": [
    { "path": "email", "message": "Invalid email" },
    { "path": "password", "message": "Too short" }
  ]
}
```

### JWT Errors

```typescript
jwt.verify(token, secret); // Throws automatically
// → 401 Unauthorized response
```

### Database Errors

```typescript
db.insert(users).values(data); // Duplicate key error
// → 500 with sanitized message in production
```

## 🎯 Best Practices

### ✅ DO:

```typescript
throw new DuplicateResourceError("User", "email", email);
throw new NotFoundError(`User ${id} not found`);
throw new UnauthorizedError("Invalid credentials");
```

### ❌ DON'T:

```typescript
throw new Error("Something went wrong");  // Too generic
try { ... } catch { throw error; }        // Unnecessary
return reply.status(400).send({...});     // Let error handler do it
```

## 📊 HTTP Status Code Mapping

| Error                    | Code | Status                |
| ------------------------ | ---- | --------------------- |
| `BadRequestError`        | 400  | Bad Request           |
| `UnauthorizedError`      | 401  | Unauthorized          |
| `ForbiddenError`         | 403  | Forbidden             |
| `NotFoundError`          | 404  | Not Found             |
| `ConflictError`          | 409  | Conflict              |
| `DuplicateResourceError` | 409  | Conflict              |
| `ValidationError`        | 422  | Unprocessable Entity  |
| `InternalServerError`    | 500  | Internal Server Error |
| `ZodError`               | 400  | Bad Request           |
| JWT Errors               | 401  | Unauthorized          |
| Database Errors          | 500  | Internal Server Error |

## 🔒 Production Safety

- ✅ **Development**: Full error details + stack traces
- ✅ **Production**: Sanitized messages, no sensitive data
- ✅ Database errors never exposed to clients
- ✅ Consistent format across all errors

## 💡 Real-World Examples

### Controller (No try-catch!)

```typescript
app.post("/register", async (request, reply) => {
  const result = await createUserUseCase.execute(request.body);
  reply.status(201).send({ user: result.user.toPublic(), token: result.token });
});
```

### Use Case (Just throw!)

```typescript
async execute(input: CreateUserInput) {
  const existing = await this.repository.findByEmail(input.email);

  if (existing) {
    throw new DuplicateResourceError("User", "email", input.email);
  }

  return await this.repository.create(UserEntity.create(input));
}
```

### Repository (Just throw!)

```typescript
async findById(id: string): Promise<UserEntity> {
  const user = await db.select().from(users).where(eq(users.id, id));

  if (!user) {
    throw new NotFoundError(`User with ID ${id} not found`);
  }

  return new UserEntity(user);
}
```

---

## 🎉 Summary

**One error handler registered = Zero try-catch blocks needed!**

Just throw errors anywhere, the global error handler catches them all and responds appropriately. Clean code, consistent errors, production-ready! ✨
