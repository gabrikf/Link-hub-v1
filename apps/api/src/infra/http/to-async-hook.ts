import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

/**
 * Adapts an async route guard to the callback (`done`) hook shape Fastify's
 * route-option TYPES expect.
 *
 * WHY THIS EXISTS. Fastify 5 types `RouteShorthandOptions.preHandler` as
 * `preHandlerMetaHookHandler<...>` with only 8 of its 9 type arguments supplied,
 * so the `Return` parameter falls back to its default — the SYNCHRONOUS
 * handler, which returns `void`. The contextual type at that property is
 * therefore always void-returning, and every async guard in the repo trips
 * `@typescript-eslint/no-misused-promises`. Annotating the guard as
 * `preHandlerAsyncHookHandler` does not help; this was verified empirically by
 * three separate agents on 2026-09-04. It is a limitation of Fastify's own
 * types, not a defect in the guards.
 *
 * WHY IT IS SAFE HERE, AND THE ONE CASE WHERE IT WOULD NOT BE. Passing the
 * rejection to `done` is equivalent to letting an async hook reject: Fastify's
 * `hookRunner` routes both into the same error path, reaching
 * `global-error-handler.ts` identically. That equivalence holds ONLY because
 * every guard wrapped here signals failure by THROWING and never touches
 * `reply` — `authGuard`, `apiAccessGuard`, `verifyGithubDelivery` and
 * `verifyGitlabDelivery` all take `_reply` and leave it alone.
 *
 * Do NOT wrap a guard that writes a reply itself. `aiQuotaGuard` is the live
 * example: it calls `reply.status(429).send(...)` on quota exhaustion. Calling
 * `done()` after a reply has been sent tells Fastify to continue the chain into
 * the route handler on an already-sent reply. `aiQuotaGuard` is used only in
 * the array form (`preHandler: [authGuard, aiQuotaGuard(...)]`), which the lint
 * rule does not inspect, so it needs no adapter — leave it that way.
 *
 * A non-`Error` rejection is normalised, because `done` is typed to take an
 * `Error`. A real `Error` (every guard here throws one) passes through
 * untouched, preserving its type for the error handler's `instanceof` checks.
 */
export function toAsyncHook(
  guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
) {
  return (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ) => {
    guard(request, reply).then(
      () => {
        done();
      },
      (err: unknown) => {
        done(err instanceof Error ? err : new Error(String(err)));
      },
    );
  };
}
