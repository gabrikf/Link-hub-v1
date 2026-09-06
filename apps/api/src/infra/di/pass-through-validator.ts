/**
 * A handful of auth use cases (see `src/core/use-case/auth/**`) take a
 * `validator: (input: unknown) => T` constructor argument so each use case
 * can enforce its own input shape independent of whoever calls `.execute()`.
 *
 * In this codebase every one of those use cases sits behind an HTTP route
 * whose Fastify schema is a zod object from `@repo/schemas`
 * (e.g. `body: createUserSchemaInput` in
 * `src/infra/http/controllers/auth/create-user-controller.ts`).
 * `fastify-type-provider-zod` validates and parses `request.body` against
 * that schema before the controller ever calls the use case, so the "Zod
 * validation happens at controller level" claim these registrations used to
 * carry in a comment is true — confirmed against every one of the nine
 * `container.ts` call sites and their controllers. The one indirect case,
 * `GoogleSignInUseCase` composing `OAuthSignInUseCase` internally, only ever
 * passes it a value it constructed itself from an already-validated OAuth
 * profile, not raw user input.
 *
 * Because of that, the container never had real per-use-case validation
 * logic to wire in — it registers a pass-through. This generic helper is the
 * single, named, documented place that casts `unknown` to `T`, used at every
 * pass-through site instead of a scattered `as any`.
 */
export function passThroughValidator<T>(): (input: unknown) => T {
  return (input: unknown) => input as T;
}
