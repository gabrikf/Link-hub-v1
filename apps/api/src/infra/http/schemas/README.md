# Error Response Schemas

Reusable Zod schemas for consistent error responses across all API endpoints.

## 🎯 Purpose

Eliminates code duplication by providing pre-defined error schemas that match the global error handler's response format.

## 📦 Available Schemas

### `errorResponseSchema`

Base schema for all error responses:

```typescript
{
  error: string;        // Error code (e.g., "VALIDATION_ERROR")
  message: string;      // Human-readable message
  statusCode: number;   // HTTP status code
  timestamp: string;    // ISO 8601 timestamp
  path?: string;        // Request path
  code?: string;        // Additional error code
  details?: any;        // Additional details (e.g., validation errors)
}
```

### `errorSchemas`

Pre-configured error schemas for common HTTP status codes:

```typescript
errorSchemas.badRequest; // 400 Bad Request
errorSchemas.unauthorized; // 401 Unauthorized
errorSchemas.forbidden; // 403 Forbidden
errorSchemas.notFound; // 404 Not Found
errorSchemas.conflict; // 409 Conflict
errorSchemas.unprocessableEntity; // 422 Unprocessable Entity
errorSchemas.internalServerError; // 500 Internal Server Error
```

### `validationErrorResponseSchema`

Extended schema for validation errors with field-level details:

```typescript
{
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
  details?: Array<{
    path: string;     // Field path (e.g., "email", "user.name")
    message: string;  // Validation error message
  }>;
}
```

## 🚀 Usage

### Method 1: Using `commonErrorResponses` Helper (Recommended)

The easiest way to add error responses to your routes:

```typescript
import { commonErrorResponses } from "../../schemas/error-schemas.js";

app.post(
  "/register",
  {
    schema: {
      body: createUserSchemaInput,
      response: {
        201: successSchema,
        ...commonErrorResponses([
          "badRequest",
          "conflict",
          "internalServerError",
        ]),
      },
    },
  },
  async (request, reply) => {
    // Your handler code
  }
);
```

**Result:** Automatically adds 400, 409, and 500 error response schemas to your API documentation.

### Method 2: Using Individual Error Schemas

For more control over which errors to include:

```typescript
import { errorSchemas } from "../../schemas/error-schemas.js";

app.get(
  "/users/:id",
  {
    schema: {
      response: {
        200: userSchema,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        500: errorSchemas.internalServerError,
      },
    },
  },
  async (request, reply) => {
    // Your handler code
  }
);
```

### Method 3: All Error Responses

To include all possible error responses:

```typescript
import { allErrorResponses } from "../../schemas/error-schemas.js";

app.post(
  "/important-endpoint",
  {
    schema: {
      response: {
        200: successSchema,
        ...allErrorResponses, // Adds 400, 401, 403, 404, 409, 422, 500
      },
    },
  },
  async (request, reply) => {
    // Your handler code
  }
);
```

## 📋 Common Error Combinations

### Public Endpoints (Registration, Login)

```typescript
...commonErrorResponses(["badRequest", "conflict", "internalServerError"])
// Adds: 400, 409, 500
```

### Protected Endpoints (Requires Authentication)

```typescript
...commonErrorResponses(["unauthorized", "forbidden", "internalServerError"])
// Adds: 401, 403, 500
```

### CRUD Operations

```typescript
// Create
...commonErrorResponses(["badRequest", "conflict", "unauthorized", "internalServerError"])
// Adds: 400, 409, 401, 500

// Read (Get by ID)
...commonErrorResponses(["notFound", "unauthorized", "internalServerError"])
// Adds: 404, 401, 500

// Update
...commonErrorResponses(["badRequest", "notFound", "unauthorized", "conflict", "internalServerError"])
// Adds: 400, 404, 401, 409, 500

// Delete
...commonErrorResponses(["notFound", "unauthorized", "forbidden", "internalServerError"])
// Adds: 404, 401, 403, 500
```

## 🎨 Real-World Examples

### Example 1: User Registration

```typescript
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class CreateUserController {
  static async handle(server: FastifyInstance) {
    app.post(
      "/register",
      {
        schema: {
          body: createUserSchemaInput,
          response: {
            201: createUserSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "conflict",
              "internalServerError",
            ]),
          },
        },
      },
      async (request, reply) => {
        const result = await createUserUseCase.execute(request.body);
        reply.status(201).send(result);
      }
    );
  }
}
```

### Example 2: Get User by ID

```typescript
import { errorSchemas } from "../../schemas/error-schemas.js";

app.get(
  "/users/:id",
  {
    schema: {
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: userPublicSchema,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
        500: errorSchemas.internalServerError,
      },
    },
  },
  async (request, reply) => {
    const user = await getUserUseCase.execute({ id: request.params.id });
    reply.send({ user: user.toPublic() });
  }
);
```

### Example 3: Update User

```typescript
import { commonErrorResponses } from "../../schemas/error-schemas.js";

app.put(
  "/users/:id",
  {
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: updateUserSchemaInput,
      response: {
        200: userPublicSchema,
        ...commonErrorResponses([
          "badRequest",
          "unauthorized",
          "notFound",
          "conflict",
          "internalServerError",
        ]),
      },
    },
  },
  async (request, reply) => {
    const user = await updateUserUseCase.execute({
      id: request.params.id,
      ...request.body,
    });
    reply.send({ user: user.toPublic() });
  }
);
```

## ✨ Benefits

### Before (Repetitive Code)

```typescript
response: {
  201: successSchema,
  400: z.object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number(),
    timestamp: z.string(),
    path: z.string().optional(),
    details: z.any().optional(),
  }),
  409: z.object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number(),
    timestamp: z.string(),
    path: z.string().optional(),
  }),
  500: z.object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number(),
    timestamp: z.string(),
    path: z.string().optional(),
  }),
}
```

### After (Clean & DRY)

```typescript
response: {
  201: successSchema,
  ...commonErrorResponses(["badRequest", "conflict", "internalServerError"])
}
```

### Advantages:

- ✅ **DRY**: Don't Repeat Yourself - define once, use everywhere
- ✅ **Consistent**: All endpoints use the same error format
- ✅ **Type-Safe**: Full TypeScript + Zod validation
- ✅ **Self-Documenting**: Clear error types in API docs (Swagger)
- ✅ **Maintainable**: Update error format in one place
- ✅ **Flexible**: Choose exactly which errors each endpoint can return

## 📚 Status Code Reference

| Schema                | Status Code | Use Case                           |
| --------------------- | ----------- | ---------------------------------- |
| `badRequest`          | 400         | Invalid input, validation errors   |
| `unauthorized`        | 401         | Authentication required or failed  |
| `forbidden`           | 403         | Authenticated but lacks permission |
| `notFound`            | 404         | Resource doesn't exist             |
| `conflict`            | 409         | Duplicate resource, state conflict |
| `unprocessableEntity` | 422         | Semantic validation failed         |
| `internalServerError` | 500         | Server-side error                  |

## 🔗 Integration with Global Error Handler

These schemas match the response format of the global error handler, ensuring consistency between:

1. **API Documentation** (Swagger/OpenAPI)
2. **Runtime Error Responses** (actual error handler output)

This means your API documentation will always reflect the actual error responses!

## 💡 Tips

1. **Be Specific**: Only include error codes that your endpoint can actually return

   ```typescript
   // ❌ Don't add all errors if not needed
   ...allErrorResponses

   // ✅ Be specific
   ...commonErrorResponses(["badRequest", "conflict", "internalServerError"])
   ```

2. **Order Matters**: List errors in order of likelihood for better documentation

   ```typescript
   response: {
     200: successSchema,
     400: errorSchemas.badRequest,      // Most common
     409: errorSchemas.conflict,        // Less common
     500: errorSchemas.internalServerError, // Least common
   }
   ```

3. **Public vs Protected**: Different endpoints need different errors

   ```typescript
   // Public endpoint
   ...commonErrorResponses(["badRequest", "internalServerError"])

   // Protected endpoint
   ...commonErrorResponses(["unauthorized", "forbidden", "internalServerError"])
   ```

---

## 🎉 Summary

Use these reusable error schemas to:

- **Eliminate code duplication**
- **Ensure consistency** across all endpoints
- **Improve API documentation**
- **Maintain easily** in one central location

Just import and spread - it's that simple! ✨
