import { describe, expect, it } from "vitest";
import type {
  RecordCandidateInteractionDeps,
  RecordCandidateInteractionUseCase,
} from "../../core/use-case/interactions/record-candidate-interaction-use-case/record-candidate-interaction.use-case.js";
import { resolve, setupContainer, TOKENS } from "./container.js";

/**
 * Wiring tests: assertions about how the REAL container assembles use cases.
 *
 * These exist because of a specific failure mode that no other test can see.
 * `RecordCandidateInteractionUseCase` takes its guardrail dependencies as an
 * OPTIONAL bag and skips a guard when the dependency is absent — so a missing
 * registration disables a security check silently, with no type error and no
 * failing test. The use-case unit tests pass their own fakes, and the e2e app
 * (`build-test-app.ts`) registers its own wiring, so neither one ever observes
 * what `setupContainer()` actually built.
 *
 * That is not hypothetical: the self-interaction guard shipped inert. The use
 * case had a passing test proving it rejects someone rating their own profile,
 * the container never injected `findResumeOwnerId`, and the check was dead in
 * production while every surface looked healthy.
 *
 * Reaching into the instance is deliberate. The alternative — asserting on
 * behaviour — needs a live Postgres, and a guard being wired is exactly the
 * property that was broken.
 */

setupContainer();

function depsOf(
  useCase: RecordCandidateInteractionUseCase,
): RecordCandidateInteractionDeps {
  return (
    useCase as unknown as { deps: RecordCandidateInteractionDeps }
  ).deps;
}

describe("container wiring — candidate interactions", () => {
  it("injects the resume-owner lookup so the self-interaction guard is live", () => {
    const useCase = resolve<RecordCandidateInteractionUseCase>(
      TOKENS.RecordCandidateInteractionUseCase,
    );

    // Rating your own profile is the cheapest possible attack on the ranking
    // model. Without this dependency the use case skips the check entirely.
    expect(depsOf(useCase).findResumeOwnerId).toBeTypeOf("function");
  });

  it("wires the guard on every resolution, not just the first", () => {
    // The container builds a fresh use case per resolution, which is fine —
    // the rate-limit and dedup guardrails query the repository rather than
    // holding counters in memory, so the use case is stateless. What must hold
    // for every instance is that the guard dependency is present.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const useCase = resolve<RecordCandidateInteractionUseCase>(
        TOKENS.RecordCandidateInteractionUseCase,
      );
      expect(depsOf(useCase).findResumeOwnerId).toBeTypeOf("function");
    }
  });
});
