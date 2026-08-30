import "reflect-metadata";
import { container } from "tsyringe";
import type { AgentDisclosureLevel } from "@repo/schemas";
import fastify, { type FastifyInstance } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { TOKENS } from "../../di/container.js";
import { errorHandler } from "../middleware/global-error-handler.js";
import { UserEntity } from "../../../core/entity/user/user-entity.js";
import { InMemoryUsersRepository } from "../../../core/repositories/user/in-memory-users-repository.js";
import { InMemoryPostsRepository } from "../../../core/repositories/post/in-memory-posts-repository.js";
import { InMemoryApiTokenRepository } from "../../../core/repositories/api-token/in-memory-api-token-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../core/repositories/work-experience/in-memory-work-experience-repository.js";
import { InMemoryGitConnectionRepository } from "../../../core/repositories/git-connection/in-memory-git-connection-repository.js";
import { InMemoryActivityEventRepository } from "../../../core/repositories/activity-event/in-memory-activity-event-repository.js";
import { InMemoryLinksRepository } from "../../../core/repositories/link/in-memory-links-repository.js";
import { InMemoryProfileTabsRepository } from "../../../core/repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryProfileBlocksRepository } from "../../../core/repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryUserPreferencesRepository } from "../../../core/repositories/user-preferences/in-memory-user-preferences-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../core/repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryOAuthAccountRepository } from "../../../core/repositories/oauth-account/in-memory-oauth-account-repository.js";
import { InMemoryEmailVerificationTokenRepository } from "../../../core/repositories/email-verification-token/in-memory-email-verification-token-repository.js";
import { InMemoryPasswordResetTokenRepository } from "../../../core/repositories/password-reset-token/in-memory-password-reset-token-repository.js";
import { InMemoryMailProvider } from "../../../core/providers/mail/in-memory-mail-provider.js";
import { InMemoryFileStorageProvider } from "../../../core/providers/storage/in-memory-file-storage-provider.js";
import { createImageOptimizerProvider } from "../../providers/sharp-image-optimizer-provider.js";
import { InMemoryHashProvider } from "../../../core/providers/hash/in-memory-hash-provider.js";
import { CryptoTokenProvider } from "../../providers/crypto-token-provider.js";
import { CryptoWebhookSecretProvider } from "../../providers/crypto-webhook-secret-provider.js";
import { JwtProvider } from "../../providers/jwt-provider.js";
import { CreatePostUseCase } from "../../../core/use-case/posts/create-post-use-case/create-post.use-case.js";
import { ListMyPostsUseCase } from "../../../core/use-case/posts/list-my-posts-use-case/list-my-posts.use-case.js";
import { ListPublicPostsUseCase } from "../../../core/use-case/posts/list-public-posts-use-case/list-public-posts.use-case.js";
import { GetPostUseCase } from "../../../core/use-case/posts/get-post-use-case/get-post.use-case.js";
import { UpdatePostUseCase } from "../../../core/use-case/posts/update-post-use-case/update-post.use-case.js";
import { DeletePostUseCase } from "../../../core/use-case/posts/delete-post-use-case/delete-post.use-case.js";
import { ApprovePostUseCase } from "../../../core/use-case/posts/approve-post-use-case/approve-post.use-case.js";
import { CreateApiTokenUseCase } from "../../../core/use-case/api-tokens/create-api-token-use-case/create-api-token.use-case.js";
import { ListApiTokensUseCase } from "../../../core/use-case/api-tokens/list-api-tokens-use-case/list-api-tokens.use-case.js";
import { RevokeApiTokenUseCase } from "../../../core/use-case/api-tokens/revoke-api-token-use-case/revoke-api-token.use-case.js";
import { GetAgentPolicyUseCase } from "../../../core/use-case/agent-policy/get-agent-policy-use-case/get-agent-policy.use-case.js";
import { UpdateAgentPolicyUseCase } from "../../../core/use-case/agent-policy/update-agent-policy-use-case/update-agent-policy.use-case.js";
import { GetWorkContextUseCase } from "../../../core/use-case/agent-policy/get-work-context-use-case/get-work-context.use-case.js";
import { SetWorkExperienceDisclosureUseCase } from "../../../core/use-case/agent-policy/set-work-experience-disclosure-use-case/set-work-experience-disclosure.use-case.js";
import { CreateGitConnectionUseCase } from "../../../core/use-case/activity/create-git-connection-use-case/create-git-connection.use-case.js";
import { ListGitConnectionsUseCase } from "../../../core/use-case/activity/list-git-connections-use-case/list-git-connections.use-case.js";
import { UpdateGitConnectionUseCase } from "../../../core/use-case/activity/update-git-connection-use-case/update-git-connection.use-case.js";
import { DeleteGitConnectionUseCase } from "../../../core/use-case/activity/delete-git-connection-use-case/delete-git-connection.use-case.js";
import { IngestActivityUseCase } from "../../../core/use-case/activity/ingest-activity-use-case/ingest-activity.use-case.js";
import { BuildCandidateEvidenceUseCase } from "../../../core/use-case/activity/build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import { GetConnectionHealthUseCase } from "../../../core/use-case/activity/get-connection-health-use-case/get-connection-health.use-case.js";
import { PreviewActivityDigestUseCase } from "../../../core/use-case/activity/preview-activity-digest-use-case/preview-activity-digest.use-case.js";
import { CreateLinkUseCase } from "../../../core/use-case/links/create-link-use-case/create-link.use-case.js";
import { UpdateLinkUseCase } from "../../../core/use-case/links/update-link-use-case/update-link.use-case.js";
import { GetLayoutUseCase } from "../../../core/use-case/profile-layout/get-layout-use-case/get-layout.use-case.js";
import { SetTabsEnabledUseCase } from "../../../core/use-case/profile-layout/set-tabs-enabled-use-case/set-tabs-enabled.use-case.js";
import { InMemoryUnitOfWork } from "../../../core/providers/unit-of-work/in-memory-unit-of-work.js";
import { GetMeProfileUseCase } from "../../../core/use-case/profiles/get-me-profile-use-case/get-me-profile.use-case.js";
import { GetPublicProfileUseCase } from "../../../core/use-case/profiles/get-public-profile-use-case/get-public-profile.use-case.js";
import { UpdateProfileUseCase } from "../../../core/use-case/profiles/update-profile-use-case/update-profile.use-case.js";
import { CheckUsernameAvailabilityUseCase } from "../../../core/use-case/profiles/check-username-availability-use-case/check-username-availability.use-case.js";
import { GetUserPreferencesUseCase } from "../../../core/use-case/preferences/get-user-preferences-use-case/get-user-preferences.use-case.js";
import { UpdateUserPreferencesUseCase } from "../../../core/use-case/preferences/update-user-preferences-use-case/update-user-preferences.use-case.js";
import { PostsController } from "../controllers/posts/posts-controller.js";
import { LinksController } from "../controllers/links/links-controller.js";
import { ApiTokensController } from "../controllers/api-tokens/api-tokens-controller.js";
import { AgentPolicyController } from "../controllers/agent-policy/agent-policy-controller.js";
import { ActivityController } from "../controllers/activity/activity-controller.js";
import { WorkExperienceController } from "../controllers/work-experience/work-experience-controller.js";
import { AiImportController } from "../controllers/ai-import/ai-import-controller.js";
import { ProfileController } from "../controllers/profile/profile-controller.js";
import { profileLayoutRoutes } from "../routes/profile-layout.js";
import { PreferencesController } from "../controllers/preferences/preferences-controller.js";
import { UploadsController } from "../controllers/uploads/uploads-controller.js";
import { CreateUserUseCase } from "../../../core/use-case/auth/create-user-use-case/create-user.use-case.js";
import { LoginUseCase } from "../../../core/use-case/auth/login-use-case/login.use-case.js";
import { VerifyEmailUseCase } from "../../../core/use-case/auth/verify-email-use-case/verify-email.use-case.js";
import { ResendVerificationUseCase } from "../../../core/use-case/auth/resend-verification-use-case/resend-verification.use-case.js";
import { RefreshSessionUseCase } from "../../../core/use-case/auth/refresh-session-use-case/refresh-session.use-case.js";
import { ForgotPasswordUseCase } from "../../../core/use-case/auth/forgot-password-use-case/forgot-password.use-case.js";
import { ResetPasswordUseCase } from "../../../core/use-case/auth/reset-password-use-case/reset-password.use-case.js";
import { authRoutes } from "../routes/auth.js";
import { webhooksRoutes } from "../routes/webhooks.js";

/**
 * Deterministic JWT secret for e2e tests. The same JwtProvider instance is
 * registered into the DI container AND used to mint tokens, so the guard's
 * real verify() path is exercised against tokens we signed.
 */
export const TEST_JWT_SECRET = "e2e-test-secret";

/**
 * Origin the test app builds verification links from, so an e2e test can pull
 * the raw token straight out of the email body it just caused to be "sent".
 */
export const TEST_APP_PUBLIC_URL = "https://app.test.crafthub";

/** Matches the production default; the expiry tests set their own clock. */
export const TEST_VERIFICATION_TTL_HOURS = 24;

/** Matches the production default (OWASP: a reset link lives 20 minutes). */
export const TEST_PASSWORD_RESET_TTL_MINUTES = 20;

/**
 * Response-time floor used by every hermetic HTTP test, in place of the 500 ms
 * production default.
 *
 * `/auth/forgot-password` and `/auth/resend-verification` answer after a fixed
 * budget so their duration cannot be used to tell a registered address from an
 * unknown one. At the production value the auth suites would spend eight
 * seconds asleep, and a slow gate is a gate people learn to skip.
 *
 * This lowers the number, not the mechanism: the floor still applies to both
 * branches and still does not apply to the schema-validation 400, and
 * `response-time-floor.timing.e2e.test.ts` asserts exactly that against
 * `authEmailResponseFloorMs()` — whatever it is set to. The production default
 * is pinned by its own assertion in `response-time-floor.test.ts`, so nobody
 * can quietly zero it here and take the suite green with them.
 */
export const TEST_AUTH_EMAIL_RESPONSE_FLOOR_MS = 25;

process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS ??= String(
  TEST_AUTH_EMAIL_RESPONSE_FLOOR_MS,
);

export interface TestAppHandles {
  app: FastifyInstance;
  usersRepository: InMemoryUsersRepository;
  postsRepository: InMemoryPostsRepository;
  apiTokenRepository: InMemoryApiTokenRepository;
  workExperienceRepository: InMemoryWorkExperienceRepository;
  gitConnectionRepository: InMemoryGitConnectionRepository;
  activityEventRepository: InMemoryActivityEventRepository;
  linksRepository: InMemoryLinksRepository;
  profileTabsRepository: InMemoryProfileTabsRepository;
  profileBlocksRepository: InMemoryProfileBlocksRepository;
  userPreferencesRepository: InMemoryUserPreferencesRepository;
  refreshTokenRepository: InMemoryRefreshTokenRepository;
  oauthAccountRepository: InMemoryOAuthAccountRepository;
  emailVerificationTokenRepository: InMemoryEmailVerificationTokenRepository;
  passwordResetTokenRepository: InMemoryPasswordResetTokenRepository;
  /** Every email the app tried to send. Assert on it, and read links out of it. */
  mailProvider: InMemoryMailProvider;
  /** Every object the app stored. Assert on the key and the stored MIME type. */
  fileStorageProvider: InMemoryFileStorageProvider;
  hashProvider: InMemoryHashProvider;
  tokenProvider: CryptoTokenProvider;
  webhookSecretProvider: CryptoWebhookSecretProvider;
  jwtProvider: JwtProvider;
  /** Mint a real, verifiable JWT access token for the given user id. */
  signJwt(userId: string): Promise<string>;
  /** Convenience: create + persist an in-memory user, returning the entity. */
  seedUser(overrides?: Partial<SeedUserInput>): Promise<UserEntity>;
}

interface SeedUserInput {
  email: string;
  login: string;
  name: string;
  password: string;
  /**
   * Defaults to VERIFIED. Every suite that predates email verification seeds a
   * user and expects it to behave like a normal account; making them all opt in
   * would have been a hundred-line diff that says nothing. Pass null to build
   * an unverified account on purpose.
   */
  emailVerifiedAt: Date | null;
  agentDisclosureLevel: AgentDisclosureLevel;
  agentBlockedTerms: string[];
  tabsEnabledPc: boolean;
  tabsEnabledMobile: boolean;
}

let seedCounter = 0;

/**
 * Build a fully DB-free Fastify app for e2e tests.
 *
 * The controllers + guards resolve their collaborators through the shared
 * tsyringe `container` via `resolve(TOKENS.*)`. We reset that container and
 * register IN-MEMORY repositories and real (but hermetic) providers as
 * instances, then register the use-cases wired to those repos. No database
 * plugin, no Redis, no OpenAI — requests flow through the exact same zod
 * validation, guards, controllers and global error handler as production.
 */
export async function buildTestApp(): Promise<TestAppHandles> {
  container.reset();

  const usersRepository = new InMemoryUsersRepository();
  const postsRepository = new InMemoryPostsRepository();
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const workExperienceRepository = new InMemoryWorkExperienceRepository();
  const gitConnectionRepository = new InMemoryGitConnectionRepository();
  const activityEventRepository = new InMemoryActivityEventRepository();
  const linksRepository = new InMemoryLinksRepository();
  const profileTabsRepository = new InMemoryProfileTabsRepository();
  const profileBlocksRepository = new InMemoryProfileBlocksRepository();
  const userPreferencesRepository = new InMemoryUserPreferencesRepository();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const oauthAccountRepository = new InMemoryOAuthAccountRepository();
  const emailVerificationTokenRepository =
    new InMemoryEmailVerificationTokenRepository();
  const passwordResetTokenRepository =
    new InMemoryPasswordResetTokenRepository();
  const mailProvider = new InMemoryMailProvider();
  const fileStorageProvider = new InMemoryFileStorageProvider();
  const hashProvider = new InMemoryHashProvider();
  const tokenProvider = new CryptoTokenProvider();
  const webhookSecretProvider = new CryptoWebhookSecretProvider();
  const jwtProvider = new JwtProvider({
    secret: TEST_JWT_SECRET,
    expiresIn: "15m",
  });

  // Repositories + providers the guards and use-cases resolve.
  container.registerInstance(TOKENS.UsersRepository, usersRepository);
  container.registerInstance(TOKENS.PostsRepository, postsRepository);
  container.registerInstance(TOKENS.ApiTokenRepository, apiTokenRepository);
  container.registerInstance(
    TOKENS.WorkExperienceRepository,
    workExperienceRepository,
  );
  container.registerInstance(
    TOKENS.GitConnectionRepository,
    gitConnectionRepository,
  );
  container.registerInstance(
    TOKENS.ActivityEventRepository,
    activityEventRepository,
  );
  container.registerInstance(TOKENS.LinksRepository, linksRepository);
  container.registerInstance(
    TOKENS.ProfileTabsRepository,
    profileTabsRepository,
  );
  container.registerInstance(
    TOKENS.ProfileBlocksRepository,
    profileBlocksRepository,
  );
  container.registerInstance(
    TOKENS.UserPreferencesRepository,
    userPreferencesRepository,
  );
  container.registerInstance(
    TOKENS.RefreshTokenRepository,
    refreshTokenRepository,
  );
  container.registerInstance(
    TOKENS.OAuthAccountRepository,
    oauthAccountRepository,
  );
  container.registerInstance(
    TOKENS.EmailVerificationTokenRepository,
    emailVerificationTokenRepository,
  );
  container.registerInstance(
    TOKENS.PasswordResetTokenRepository,
    passwordResetTokenRepository,
  );
  // The real provider interface, backed by an array. Nothing here opens a
  // socket, and a test can read the verification link out of what was "sent".
  container.registerInstance(TOKENS.MailProvider, mailProvider);
  /**
   * Object storage, recorded in a Map. The upload route is the one place a
   * request body becomes a stored artifact, and until this was registered the
   * route had no HTTP coverage at all: nothing exercised the multipart parsing,
   * the magic-byte sniff, the size ceiling or the 400s they produce.
   *
   * The image optimiser is the REAL one, not a stub. It is hermetic (sharp,
   * in-process, no network) and it is what decides the stored content type and
   * therefore the key's extension — a passthrough fake would make the
   * controller's "trust the optimiser's reported type" branch untested exactly
   * where it matters. `createImageOptimizerProvider()` already degrades to a
   * passthrough on a machine whose sharp binding will not load, so this cannot
   * become the reason a suite fails to run.
   */
  container.registerInstance(TOKENS.FileStorageProvider, fileStorageProvider);
  container.registerInstance(
    TOKENS.ImageOptimizerProvider,
    createImageOptimizerProvider(),
  );
  container.registerInstance(TOKENS.HashProvider, hashProvider);
  container.registerInstance(TOKENS.TokenProvider, tokenProvider);
  container.registerInstance(
    TOKENS.WebhookSecretProvider,
    webhookSecretProvider,
  );
  container.registerInstance(TOKENS.JwtProvider, jwtProvider);

  // Use-cases (wired to the in-memory repos above).
  // The work-experience repo is wired in on purpose: without it the disclosure
  // policy silently degrades to "no enforcement", which is precisely the
  // behaviour the e2e tests exist to catch.
  container.registerInstance(
    TOKENS.CreatePostUseCase,
    new CreatePostUseCase(
      postsRepository,
      usersRepository,
      workExperienceRepository,
    ),
  );
  container.registerInstance(
    TOKENS.ListMyPostsUseCase,
    new ListMyPostsUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.ListPublicPostsUseCase,
    new ListPublicPostsUseCase(usersRepository, postsRepository),
  );
  container.registerInstance(
    TOKENS.GetPostUseCase,
    new GetPostUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.UpdatePostUseCase,
    new UpdatePostUseCase(
      postsRepository,
      usersRepository,
      workExperienceRepository,
    ),
  );
  container.registerInstance(
    TOKENS.DeletePostUseCase,
    new DeletePostUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.ApprovePostUseCase,
    new ApprovePostUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.CreateApiTokenUseCase,
    new CreateApiTokenUseCase(apiTokenRepository, usersRepository, tokenProvider),
  );
  container.registerInstance(
    TOKENS.ListApiTokensUseCase,
    new ListApiTokensUseCase(apiTokenRepository),
  );
  container.registerInstance(
    TOKENS.RevokeApiTokenUseCase,
    new RevokeApiTokenUseCase(apiTokenRepository),
  );
  container.registerInstance(
    TOKENS.GetAgentPolicyUseCase,
    new GetAgentPolicyUseCase(usersRepository, workExperienceRepository),
  );
  container.registerInstance(
    TOKENS.UpdateAgentPolicyUseCase,
    new UpdateAgentPolicyUseCase(usersRepository, workExperienceRepository),
  );
  container.registerInstance(
    TOKENS.GetWorkContextUseCase,
    new GetWorkContextUseCase(usersRepository, workExperienceRepository),
  );
  container.registerInstance(
    TOKENS.SetWorkExperienceDisclosureUseCase,
    new SetWorkExperienceDisclosureUseCase(workExperienceRepository),
  );
  container.registerInstance(
    TOKENS.CreateGitConnectionUseCase,
    new CreateGitConnectionUseCase(
      gitConnectionRepository,
      usersRepository,
      webhookSecretProvider,
    ),
  );
  container.registerInstance(
    TOKENS.ListGitConnectionsUseCase,
    new ListGitConnectionsUseCase(gitConnectionRepository),
  );
  container.registerInstance(
    TOKENS.UpdateGitConnectionUseCase,
    new UpdateGitConnectionUseCase(gitConnectionRepository),
  );
  container.registerInstance(
    TOKENS.DeleteGitConnectionUseCase,
    new DeleteGitConnectionUseCase(gitConnectionRepository),
  );
  container.registerInstance(
    TOKENS.IngestActivityUseCase,
    new IngestActivityUseCase(
      gitConnectionRepository,
      activityEventRepository,
      tokenProvider,
    ),
  );
  container.registerInstance(
    TOKENS.GetConnectionHealthUseCase,
    new GetConnectionHealthUseCase(
      gitConnectionRepository,
      activityEventRepository,
    ),
  );
  container.registerInstance(
    TOKENS.PreviewActivityDigestUseCase,
    new PreviewActivityDigestUseCase(
      gitConnectionRepository,
      usersRepository,
      workExperienceRepository,
      new BuildCandidateEvidenceUseCase(activityEventRepository),
    ),
  );

  container.registerInstance(
    TOKENS.CreateLinkUseCase,
    new CreateLinkUseCase(linksRepository, usersRepository),
  );
  container.registerInstance(
    TOKENS.UpdateLinkUseCase,
    new UpdateLinkUseCase(linksRepository),
  );

  container.registerInstance(
    TOKENS.GetMeProfileUseCase,
    new GetMeProfileUseCase(usersRepository, linksRepository),
  );
  container.registerInstance(
    TOKENS.GetPublicProfileUseCase,
    new GetPublicProfileUseCase(
      usersRepository,
      linksRepository,
      profileTabsRepository,
      profileBlocksRepository,
    ),
  );
  container.registerInstance(
    TOKENS.UpdateProfileUseCase,
    new UpdateProfileUseCase(usersRepository),
  );
  container.registerInstance(
    TOKENS.CheckUsernameAvailabilityUseCase,
    new CheckUsernameAvailabilityUseCase(usersRepository),
  );
  container.registerInstance(
    TOKENS.GetLayoutUseCase,
    new GetLayoutUseCase(
      profileTabsRepository,
      profileBlocksRepository,
      new InMemoryUnitOfWork(),
      usersRepository,
    ),
  );
  container.registerInstance(
    TOKENS.SetTabsEnabledUseCase,
    new SetTabsEnabledUseCase(usersRepository),
  );
  container.registerInstance(
    TOKENS.GetUserPreferencesUseCase,
    new GetUserPreferencesUseCase(userPreferencesRepository),
  );
  container.registerInstance(
    TOKENS.UpdateUserPreferencesUseCase,
    new UpdateUserPreferencesUseCase(userPreferencesRepository),
  );

  /**
   * Auth use cases. This app registered NONE of them until email verification
   * landed, which is why /auth had no e2e coverage at all: every auth test was
   * a use-case unit test, and the controllers, the zod schemas and the error
   * mapping were exercised by nothing.
   *
   * The validators are pass-throughs, exactly as in the real container — zod
   * has already validated the body by the time a use case runs.
   */
  const passThroughValidator = <T>(input: unknown) => input as T;
  const verificationOptions = {
    appPublicUrl: TEST_APP_PUBLIC_URL,
    tokenTtlHours: TEST_VERIFICATION_TTL_HOURS,
  };

  container.registerInstance(
    TOKENS.CreateUserUseCase,
    new CreateUserUseCase(
      usersRepository,
      emailVerificationTokenRepository,
      hashProvider,
      tokenProvider,
      mailProvider,
      verificationOptions,
      passThroughValidator,
    ),
  );
  container.registerInstance(
    TOKENS.LoginUseCase,
    new LoginUseCase(
      usersRepository,
      refreshTokenRepository,
      oauthAccountRepository,
      hashProvider,
      jwtProvider,
      passThroughValidator,
    ),
  );
  container.registerInstance(
    TOKENS.VerifyEmailUseCase,
    new VerifyEmailUseCase(
      usersRepository,
      emailVerificationTokenRepository,
      refreshTokenRepository,
      tokenProvider,
      jwtProvider,
      passThroughValidator,
    ),
  );
  container.registerInstance(
    TOKENS.ResendVerificationUseCase,
    new ResendVerificationUseCase(
      usersRepository,
      emailVerificationTokenRepository,
      oauthAccountRepository,
      tokenProvider,
      mailProvider,
      verificationOptions,
      passThroughValidator,
    ),
  );
  container.registerInstance(
    TOKENS.RefreshSessionUseCase,
    new RefreshSessionUseCase(
      refreshTokenRepository,
      jwtProvider,
      passThroughValidator,
    ),
  );
  container.registerInstance(
    TOKENS.ForgotPasswordUseCase,
    new ForgotPasswordUseCase(
      usersRepository,
      passwordResetTokenRepository,
      tokenProvider,
      mailProvider,
      {
        appPublicUrl: TEST_APP_PUBLIC_URL,
        tokenTtlMinutes: TEST_PASSWORD_RESET_TTL_MINUTES,
      },
      passThroughValidator,
    ),
  );
  container.registerInstance(
    TOKENS.ResetPasswordUseCase,
    new ResetPasswordUseCase(
      usersRepository,
      passwordResetTokenRepository,
      refreshTokenRepository,
      hashProvider,
      tokenProvider,
      passThroughValidator,
    ),
  );

  const app = fastify();

  /**
   * Same limits as `server.ts`. They are part of the behaviour under test: the
   * controller asks for a 5 MB per-file cap of its own and relies on this
   * plugin to have parsed the part at all, so a test app without it would 400
   * every upload for the wrong reason and look like it was asserting something.
   */
  await app.register(fastifyMultipart, {
    limits: {
      files: 1,
      fileSize: 10 * 1024 * 1024,
    },
  });

  app.setErrorHandler(errorHandler);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  PostsController.handle(app);
  ApiTokensController.handle(app);
  AgentPolicyController.handle(app);
  // Registered for the per-employer disclosure override route. Its other
  // handlers resolve use-cases lazily, so they stay unavailable (and unused)
  // here without breaking registration.
  WorkExperienceController.handle(app);
  ActivityController.handle(app);
  // Registered for the resume-parse length gate. Its use-case is resolved
  // lazily inside the handler, so a test that wants the parse to succeed
  // registers its own (hermetic) ParseResumeUseCase; the rejection paths never
  // resolve one at all.
  AiImportController.handle(app);
  // Only the create/update use-cases are registered above: the other link
  // routes resolve theirs lazily inside the handler, so they stay unavailable
  // (and unused) here without breaking registration.
  LinksController.handle(app);
  ProfileController.handle(app);
  // Only the layout read and the per-viewport tabs switch have use-cases
  // registered above: the tab/block mutation routes resolve theirs lazily
  // inside the handler, so they stay unavailable (and unused) here without
  // breaking registration.
  //
  // Mounted twice, bare and under `/api/v1`, the way `routes/index.ts` mounts
  // every module in production — so an e2e test can assert both paths really
  // answer instead of taking the dual mount on trust.
  await app.register(profileLayoutRoutes);
  await app.register(profileLayoutRoutes, { prefix: "/api/v1" });
  PreferencesController.handle(app);
  UploadsController.handle(app);
  /**
   * Mounted twice, bare and under `/api/v1`, the way `routes/index.ts` does it
   * in production — the web client's refresher builds its URL from whichever
   * base it was configured with, so an e2e test has to be able to prove both
   * paths answer.
   */
  await app.register(async (instance) => {
    authRoutes(instance);
  });
  await app.register(
    async (instance) => {
      authRoutes(instance);
    },
    { prefix: "/api/v1" },
  );
  // Registered as a real plugin, not called like the controllers above: the
  // raw-body content-type parser it declares is only encapsulated — and the
  // rest of the app only keeps default JSON parsing — because it lives inside
  // its own registration scope. Calling it directly would silently move the
  // parser to the root and make every other e2e test exercise a different
  // parsing path than production.
  await app.register(webhooksRoutes);

  await app.ready();

  return {
    app,
    usersRepository,
    postsRepository,
    apiTokenRepository,
    workExperienceRepository,
    gitConnectionRepository,
    activityEventRepository,
    linksRepository,
    profileTabsRepository,
    profileBlocksRepository,
    userPreferencesRepository,
    fileStorageProvider,
    refreshTokenRepository,
    oauthAccountRepository,
    emailVerificationTokenRepository,
    passwordResetTokenRepository,
    mailProvider,
    hashProvider,
    tokenProvider,
    webhookSecretProvider,
    jwtProvider,
    signJwt: (userId: string) => jwtProvider.sign({ sub: userId }),
    async seedUser(overrides?: Partial<SeedUserInput>) {
      seedCounter += 1;
      const user = UserEntity.create({
        email: overrides?.email ?? `user${seedCounter}@example.com`,
        login: overrides?.login ?? `user${seedCounter}`,
        name: overrides?.name ?? `User ${seedCounter}`,
        password: overrides?.password ?? "hashed-password",
        emailVerifiedAt:
          overrides?.emailVerifiedAt === undefined
            ? new Date()
            : overrides.emailVerifiedAt,
        agentDisclosureLevel: overrides?.agentDisclosureLevel,
        agentBlockedTerms: overrides?.agentBlockedTerms,
        tabsEnabledPc: overrides?.tabsEnabledPc,
        tabsEnabledMobile: overrides?.tabsEnabledMobile,
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(user);
      return user;
    },
  };
}
