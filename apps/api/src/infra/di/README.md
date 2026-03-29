# Dependency Injection Container

This directory contains the dependency injection setup using **TSyringe**, a lightweight dependency injection container for TypeScript/JavaScript.

## Overview

The DI container manages the lifecycle and dependencies of:

- **Repositories**: Data access layer (e.g., `DrizzleUserRepository`)
- **Providers**: External services (e.g., `Argon2HashProvider`, `JwtProvider`)
- **Use Cases**: Business logic (e.g., `CreateUserUseCase`)

## How It Works

### 1. Container Setup (`container.ts`)

The container is configured with all dependencies and their implementations:

```typescript
import { resolve, TOKENS } from "./infra/di/container.js";

// Resolve a dependency
const createUserUseCase = resolve<CreateUserUseCase>(TOKENS.CreateUserUseCase);
```

### 2. Available Tokens

```typescript
TOKENS.UsersRepository; // IUsersRepository implementation
TOKENS.HashProvider; // IHashProvider implementation (Argon2)
TOKENS.JwtProvider; // IJwtProvider implementation
TOKENS.CreateUserUseCase; // CreateUserUseCase with all dependencies
```

### 3. Singleton Pattern

All dependencies are registered as **singletons** by default:

- ✅ Single instance per application lifecycle
- ✅ Shared state across the application
- ✅ Better performance (no repeated instantiation)

## Usage in Controllers

```typescript
import { resolve, TOKENS } from "../../../di/container.js";
import { CreateUserUseCase } from "../../../../core/use-case/auth/create-user-use-case/create-user.use-case.js";

export class CreateUserController {
  static async handle(server: FastifyInstance) {
    app.post("/register", async (request, reply) => {
      // Resolve the use case from the DI container
      const createUserUseCase = resolve<CreateUserUseCase>(
        TOKENS.CreateUserUseCase,
      );

      // Execute the use case
      const result = await createUserUseCase.execute(request.body);

      reply.status(201).send(result);
    });
  }
}
```

## Adding New Dependencies

### 1. Create a Token

```typescript
export const TOKENS = {
  // ... existing tokens
  MyNewService: Symbol.for("MyNewService"),
};
```

### 2. Register in Container

```typescript
container.register<IMyService>(TOKENS.MyNewService, {
  useClass: MyServiceImplementation,
});

// Or with factory for complex initialization
container.register<IMyService>(TOKENS.MyNewService, {
  useFactory: (c) => {
    const dependency = c.resolve<IDependency>(TOKENS.Dependency);
    return new MyServiceImplementation(dependency, process.env.CONFIG);
  },
});
```

### 3. Resolve and Use

```typescript
const myService = resolve<IMyService>(TOKENS.MyNewService);
```

## Benefits

✅ **Testability**: Easy to mock dependencies in tests  
✅ **Maintainability**: Centralized dependency configuration  
✅ **Flexibility**: Easy to swap implementations  
✅ **Type Safety**: Full TypeScript support  
✅ **Single Responsibility**: Classes focus on business logic, not dependency creation

## Environment Variables

Configure providers through environment variables:

```env
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRES_IN=7d
```

## Testing

For tests, you can reset the container or use a separate test container:

```typescript
import { container } from "tsyringe";
import { InMemoryUsersRepository } from "./repositories/in-memory-users-repository.js";

// Override for testing
container.register(TOKENS.UsersRepository, {
  useClass: InMemoryUsersRepository,
});
```
