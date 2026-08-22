import { describe, expect, it } from "vitest";
import type {
  RecordCandidateInteractionDeps,
  RecordCandidateInteractionUseCase,
} from "../../core/use-case/interactions/record-candidate-interaction-use-case/record-candidate-interaction.use-case.js";
import { DrizzleActivityEventRepository } from "../database/drizzle/repositories/activity-event.repository.js";
import { DrizzleGitConnectionRepository } from "../database/drizzle/repositories/git-connection.repository.js";
import { CryptoWebhookSecretProvider } from "../providers/crypto-webhook-secret-provider.js";
import { CreateGitConnectionUseCase } from "../../core/use-case/activity/create-git-connection-use-case/create-git-connection.use-case.js";
import { ListGitConnectionsUseCase } from "../../core/use-case/activity/list-git-connections-use-case/list-git-connections.use-case.js";
import { UpdateGitConnectionUseCase } from "../../core/use-case/activity/update-git-connection-use-case/update-git-connection.use-case.js";
import { DeleteGitConnectionUseCase } from "../../core/use-case/activity/delete-git-connection-use-case/delete-git-connection.use-case.js";
import { IngestActivityUseCase } from "../../core/use-case/activity/ingest-activity-use-case/ingest-activity.use-case.js";
import { GetConnectionHealthUseCase } from "../../core/use-case/activity/get-connection-health-use-case/get-connection-health.use-case.js";
import { PreviewActivityDigestUseCase } from "../../core/use-case/activity/preview-activity-digest-use-case/preview-activity-digest.use-case.js";
import { BuildCandidateEvidenceUseCase } from "../../core/use-case/activity/build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import { GenerateActivityDigestUseCase } from "../../core/use-case/activity/generate-activity-digest-use-case/generate-activity-digest.use-case.js";
import { SweepDueActivityDigestsUseCase } from "../../core/use-case/activity/sweep-due-activity-digests-use-case/sweep-due-activity-digests.use-case.js";
import { BullMqActivityDigestQueue } from "../providers/bullmq-activity-digest-queue.js";
import { resolve, setupContainer, TOKENS } from "./container.js";
import { container } from "tsyringe";

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

describe("container wiring — activity ingestion repositories", () => {
  // These two are registered ahead of the ingestion endpoints that will consume
  // them, so nothing else resolves them yet. A typo in a token or a missing
  // `container.register` would therefore surface as a runtime resolution
  // failure on the first webhook rather than at build time.
  it.each([
    ["GitConnectionRepository", DrizzleGitConnectionRepository],
    ["ActivityEventRepository", DrizzleActivityEventRepository],
  ] as const)("resolves %s to its Drizzle implementation", (token, impl) => {
    expect(resolve(TOKENS[token])).toBeInstanceOf(impl);
  });

  it("resolves WebhookSecretProvider to the crypto implementation", () => {
    expect(resolve(TOKENS.WebhookSecretProvider)).toBeInstanceOf(
      CryptoWebhookSecretProvider,
    );
  });
});

describe("container wiring — activity ingestion use cases", () => {
  /**
   * The e2e app builds its own wiring, so a token typo or a missing
   * `container.register` here would not fail a single test — it would fail at
   * runtime, on a webhook delivery GitLab does not retry.
   */
  it.each([
    ["CreateGitConnectionUseCase", CreateGitConnectionUseCase],
    ["ListGitConnectionsUseCase", ListGitConnectionsUseCase],
    ["UpdateGitConnectionUseCase", UpdateGitConnectionUseCase],
    ["DeleteGitConnectionUseCase", DeleteGitConnectionUseCase],
    ["IngestActivityUseCase", IngestActivityUseCase],
    ["GetConnectionHealthUseCase", GetConnectionHealthUseCase],
    ["PreviewActivityDigestUseCase", PreviewActivityDigestUseCase],
  ] as const)("resolves %s from the real container", (token, impl) => {
    expect(resolve(TOKENS[token])).toBeInstanceOf(impl);
  });

  it("gives IngestActivityUseCase a hash provider, without which nothing can be fingerprinted", () => {
    const useCase = resolve<IngestActivityUseCase>(TOKENS.IngestActivityUseCase);
    const tokenProvider = (
      useCase as unknown as { tokenProvider: { hash(value: string): string } }
    ).tokenProvider;

    expect(tokenProvider?.hash).toBeTypeOf("function");
    // 64 hex characters, i.e. what `activityFingerprintSchema` will accept — a
    // provider hashing to anything else would make every ingest a 400.
    expect(tokenProvider.hash("acme/rocket")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("container wiring — the digest engine", () => {
  /**
   * The digest worker is a separate process with no HTTP surface, so a missing
   * registration here does not fail a request anybody watches — it fails a
   * background job at 03:00 and the user simply never gets a post.
   */
  it.each([
    ["BuildCandidateEvidenceUseCase", BuildCandidateEvidenceUseCase],
    ["GenerateActivityDigestUseCase", GenerateActivityDigestUseCase],
    ["SweepDueActivityDigestsUseCase", SweepDueActivityDigestsUseCase],
  ] as const)("resolves %s from the real container", (token, impl) => {
    expect(resolve(TOKENS[token])).toBeInstanceOf(impl);
  });

  it("resolves ActivityDigestQueue to the BullMQ implementation", () => {
    expect(resolve(TOKENS.ActivityDigestQueue)).toBeInstanceOf(
      BullMqActivityDigestQueue,
    );
  });

  it("hands out ONE digest queue, because each instance owns a Redis connection", () => {
    // Registered as a singleton on purpose: a fresh queue per resolution would
    // open a new socket on every enqueue and leak them.
    expect(resolve(TOKENS.ActivityDigestQueue)).toBe(
      resolve(TOKENS.ActivityDigestQueue),
    );
  });

  it("gives GenerateActivityDigestUseCase the work history it needs to redact", () => {
    const useCase = resolve<GenerateActivityDigestUseCase>(
      TOKENS.GenerateActivityDigestUseCase,
    );

    // Unlike CreatePostUseCase, this dependency is not optional here. Without
    // it the digest would resolve a WORK connection's disclosure level from the
    // account default and publish a post the employer's own setting forbids —
    // silently, with no type error and nothing failing.
    const injected = useCase as unknown as {
      workExperienceRepository?: { findByUserId?: unknown };
      buildCandidateEvidenceUseCase?: unknown;
      createPostUseCase?: unknown;
    };

    expect(injected.workExperienceRepository?.findByUserId).toBeTypeOf(
      "function",
    );
    expect(injected.buildCandidateEvidenceUseCase).toBeInstanceOf(
      BuildCandidateEvidenceUseCase,
    );
    expect(injected.createPostUseCase).toBeDefined();
  });

  it("gives PreviewActivityDigestUseCase the work history it needs to redact", () => {
    const useCase = resolve<PreviewActivityDigestUseCase>(
      TOKENS.PreviewActivityDigestUseCase,
    );

    // Same failure mode as the generator: without this, a work connection's
    // preview would render at the account default level — silently.
    const injected = useCase as unknown as {
      workExperienceRepository?: { findByUserId?: unknown };
      buildCandidateEvidenceUseCase?: unknown;
    };

    expect(injected.workExperienceRepository?.findByUserId).toBeTypeOf(
      "function",
    );
    expect(injected.buildCandidateEvidenceUseCase).toBeInstanceOf(
      BuildCandidateEvidenceUseCase,
    );
  });

  it("points the sweep at the same queue the worker drains", () => {
    const useCase = resolve<SweepDueActivityDigestsUseCase>(
      TOKENS.SweepDueActivityDigestsUseCase,
    );

    const injected = useCase as unknown as {
      activityDigestQueue?: unknown;
    };

    expect(injected.activityDigestQueue).toBe(
      resolve(TOKENS.ActivityDigestQueue),
    );
  });
});

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

describe("every declared token is registered", () => {
  /**
   * A token can be declared in `TOKENS`, imported, and consumed by a controller
   * while nobody ever calls `container.register` for it. Nothing catches that:
   * `resolve()` is typed `<T>(token: symbol) => T`, so there is no type error,
   * `noUnusedLocals` is off so the dangling import is silent, and the failure
   * only appears as a 500 the first time that route is hit in production.
   *
   * That is not hypothetical either — `ImageOptimizerProvider` shipped exactly
   * this way and every avatar upload returned 500.
   *
   * Registration, not resolution, is the assertion: several providers throw by
   * design when their environment is absent (`FileStorageProvider` without the
   * S3 variables, `LinkedInOAuthProvider` without its redirect URI), and those
   * throws are correct behaviour that a resolve-everything test would flag.
   */
  it("has a registration for every symbol in TOKENS", () => {
    setupContainer();

    const unregistered = Object.entries(TOKENS)
      .filter(([, token]) => !container.isRegistered(token))
      .map(([name]) => name);

    expect(unregistered).toEqual([]);
  });
});
