import "reflect-metadata";
import { container, instanceCachingFactory } from "tsyringe";
import { IUsersRepository } from "../../core/repositories/user/user-repository.js";
import { IUserPreferencesRepository } from "../../core/repositories/user-preferences/user-preferences-repository.js";
import { ILinksRepository } from "../../core/repositories/link/link-repository.js";
import { IPostRepository } from "../../core/repositories/post/post-repository.js";
import { IApiTokenRepository } from "../../core/repositories/api-token/api-token-repository.js";
import { IProfileTabsRepository } from "../../core/repositories/profile-tab/profile-tabs-repository.js";
import { IProfileBlocksRepository } from "../../core/repositories/profile-block/profile-block-repository.js";
import { IRefreshTokenRepository } from "../../core/repositories/refresh-token/refresh-token-repository.js";
import { IEmailVerificationTokenRepository } from "../../core/repositories/email-verification-token/email-verification-token-repository.js";
import { IPasswordResetTokenRepository } from "../../core/repositories/password-reset-token/password-reset-token-repository.js";
import { IOAuthAccountRepository } from "../../core/repositories/oauth-account/oauth-account-repository.js";
import { IResumesRepository } from "../../core/repositories/resume/resume-repository.js";
import { ISkillCatalogRepository } from "../../core/repositories/skill-catalog/skill-catalog-repository.js";
import { ITitleCatalogRepository } from "../../core/repositories/title-catalog/title-catalog-repository.js";
import { IResumeSkillRepository } from "../../core/repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../core/repositories/resume-title/resume-title-repository.js";
import { IResumeEmbeddingsRepository } from "../../core/repositories/resume-embedding/resume-embedding-repository.js";
import { IResumeSectionEmbeddingsRepository } from "../../core/repositories/resume-section-embedding/resume-section-embedding-repository.js";
import { IResumeSearchRepository } from "../../core/repositories/resume-search/resume-search-repository.js";
import { ICandidateInteractionRepository } from "../../core/repositories/candidate-interaction/candidate-interaction-repository.js";
import { IWorkExperienceRepository } from "../../core/repositories/work-experience/work-experience-repository.js";
import { IGitConnectionRepository } from "../../core/repositories/git-connection/git-connection-repository.js";
import { IActivityEventRepository } from "../../core/repositories/activity-event/activity-event-repository.js";
import { IHashProvider } from "../../core/providers/hash/hash-provider.js";
import { IWebhookSecretProvider } from "../../core/providers/webhook-secret/webhook-secret-provider.js";
import { IJwtProvider } from "../../core/providers/jwt/jwt-provider.js";
import { ITokenProvider } from "../../core/providers/token/token-provider.js";
import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";
import { IRecruiterQueryConversionProvider } from "../../core/providers/query-conversion/recruiter-query-conversion-provider.js";
import { IGoogleOAuthProvider } from "../../core/providers/oauth/google-oauth-provider.js";
import { ILinkedInOAuthProvider } from "../../core/providers/oauth/linkedin-oauth-provider.js";
import { IResumeEmbeddingQueue } from "../../core/providers/queue/resume-embedding-queue.js";
import { IActivityDigestQueue } from "../../core/providers/queue/activity-digest-queue.js";
import { IResumeParsingProvider } from "../../core/providers/resume-parsing/resume-parsing-provider.js";
import { IFileStorageProvider } from "../../core/providers/storage/file-storage-provider.js";
import { IImageOptimizerProvider } from "../../core/providers/image-optimizer/image-optimizer-provider.js";
import { IAiQuotaProvider } from "../../core/providers/ai-quota/ai-quota-provider.js";
import { IMailProvider } from "../../core/providers/mail/mail-provider.js";
import { InMemoryAiQuotaProvider } from "../../core/providers/ai-quota/in-memory-ai-quota-provider.js";
import { IUnitOfWork } from "../../core/providers/unit-of-work/unit-of-work.js";
import { DrizzleUserRepository } from "../database/drizzle/repositories/user.repository.js";
import { DrizzleUserPreferencesRepository } from "../database/drizzle/repositories/user-preferences.repository.js";
import { DrizzleLinksRepository } from "../database/drizzle/repositories/link.repository.js";
import { DrizzlePostsRepository } from "../database/drizzle/repositories/post.repository.js";
import { DrizzleApiTokenRepository } from "../database/drizzle/repositories/api-token.repository.js";
import { DrizzleProfileTabsRepository } from "../database/drizzle/repositories/profile-tab.repository.js";
import { DrizzleProfileBlocksRepository } from "../database/drizzle/repositories/profile-block.repository.js";
import { DrizzleRefreshTokenRepository } from "../database/drizzle/repositories/refresh-token.repository.js";
import { DrizzleEmailVerificationTokenRepository } from "../database/drizzle/repositories/email-verification-token.repository.js";
import { DrizzlePasswordResetTokenRepository } from "../database/drizzle/repositories/password-reset-token.repository.js";
import { DrizzleOAuthAccountRepository } from "../database/drizzle/repositories/oauth-account.repository.js";
import { DrizzleResumesRepository } from "../database/drizzle/repositories/resume.repository.js";
import { DrizzleSkillCatalogRepository } from "../database/drizzle/repositories/skill-catalog.repository.js";
import { DrizzleTitleCatalogRepository } from "../database/drizzle/repositories/title-catalog.repository.js";
import { DrizzleResumeSkillRepository } from "../database/drizzle/repositories/resume-skill.repository.js";
import { DrizzleResumeTitleRepository } from "../database/drizzle/repositories/resume-title.repository.js";
import { DrizzleResumeEmbeddingsRepository } from "../database/drizzle/repositories/resume-embedding.repository.js";
import { DrizzleResumeSectionEmbeddingsRepository } from "../database/drizzle/repositories/resume-section-embedding.repository.js";
import { DrizzleResumeSearchRepository } from "../database/drizzle/repositories/resume-search.repository.js";
import { DrizzleCandidateInteractionRepository } from "../database/drizzle/repositories/candidate-interaction.repository.js";
import { DrizzleWorkExperienceRepository } from "../database/drizzle/repositories/work-experience.repository.js";
import { DrizzleGitConnectionRepository } from "../database/drizzle/repositories/git-connection.repository.js";
import { DrizzleActivityEventRepository } from "../database/drizzle/repositories/activity-event.repository.js";
import { DrizzleUnitOfWork } from "../database/drizzle/drizzle-unit-of-work.js";
import { Argon2HashProvider } from "../providers/argon2-hash-provider.js";
import { JwtProvider } from "../providers/jwt-provider.js";
import { CryptoTokenProvider } from "../providers/crypto-token-provider.js";
import { CryptoWebhookSecretProvider } from "../providers/crypto-webhook-secret-provider.js";
import { OpenAiEmbeddingProvider } from "../providers/openai-embedding-provider.js";
import { CachedEmbeddingProvider } from "../providers/cached-embedding-provider.js";
import { DeterministicEmbeddingProvider } from "../../core/providers/embedding/deterministic-embedding-provider.js";
import { DeterministicRecruiterQueryConversionProvider } from "../providers/deterministic-recruiter-query-conversion-provider.js";
import { OpenAiRecruiterQueryConversionProvider } from "../providers/openai-recruiter-query-conversion-provider.js";
import { GoogleOAuthProvider } from "../providers/google-oauth-provider.js";
import { LinkedInOAuthProvider } from "../providers/linkedin-oauth-provider.js";
import { BullMqResumeEmbeddingQueue } from "../providers/bullmq-resume-embedding-queue.js";
import { BullMqActivityDigestQueue } from "../providers/bullmq-activity-digest-queue.js";
import { OpenAiResumeParsingProvider } from "../providers/openai-resume-parsing-provider.js";
import { DeterministicResumeParsingProvider } from "../providers/deterministic-resume-parsing-provider.js";
import {
  S3FileStorageProvider,
  resolveFileStorageConfig,
} from "../providers/s3-file-storage-provider.js";
import { createImageOptimizerProvider } from "../providers/sharp-image-optimizer-provider.js";
import { RedisAiQuotaProvider } from "../providers/redis-ai-quota-provider.js";
import { SmtpMailProvider } from "../providers/smtp-mail-provider.js";
import { LogMailProvider } from "../providers/log-mail-provider.js";
import {
  appPublicUrl,
  emailVerificationConfig,
  mailConfig,
  passwordResetConfig,
} from "../config/app-config.js";
import { isRedisConfigured } from "../redis/redis-client.js";
import { InternalServerError } from "../../core/errors/index.js";
import { passThroughValidator } from "./pass-through-validator.js";
import {
  ICreateUserUseCaseInput,
  ILoginUseCaseInput,
  IOAuthSignInUseCaseInput,
  IGoogleSignInUseCaseInput,
  IVerifyEmailUseCaseInput,
  IResendVerificationUseCaseInput,
  IRefreshSessionUseCaseInput,
  IForgotPasswordUseCaseInput,
  IResetPasswordUseCaseInput,
} from "../../core/use-case/types.js";
import { CreateUserUseCase } from "../../core/use-case/auth/create-user-use-case/create-user.use-case.js";
import { LoginUseCase } from "../../core/use-case/auth/login-use-case/login.use-case.js";
import { GoogleSignInUseCase } from "../../core/use-case/auth/google-sign-in-use-case/google-sign-in.use-case.js";
import { OAuthSignInUseCase } from "../../core/use-case/auth/oauth-sign-in-use-case/oauth-sign-in.use-case.js";
import { VerifyEmailUseCase } from "../../core/use-case/auth/verify-email-use-case/verify-email.use-case.js";
import { ResendVerificationUseCase } from "../../core/use-case/auth/resend-verification-use-case/resend-verification.use-case.js";
import { RefreshSessionUseCase } from "../../core/use-case/auth/refresh-session-use-case/refresh-session.use-case.js";
import { ForgotPasswordUseCase } from "../../core/use-case/auth/forgot-password-use-case/forgot-password.use-case.js";
import { ResetPasswordUseCase } from "../../core/use-case/auth/reset-password-use-case/reset-password.use-case.js";
import { ListUserLinksUseCase } from "../../core/use-case/links/list-user-links-use-case/list-user-links.use-case.js";
import { GetLinkByIdUseCase } from "../../core/use-case/links/get-link-by-id-use-case/get-link-by-id.use-case.js";
import { CreateLinkUseCase } from "../../core/use-case/links/create-link-use-case/create-link.use-case.js";
import { UpdateLinkUseCase } from "../../core/use-case/links/update-link-use-case/update-link.use-case.js";
import { DeleteLinkUseCase } from "../../core/use-case/links/delete-link-use-case/delete-link.use-case.js";
import { ReorderLinksUseCase } from "../../core/use-case/links/reorder-links-use-case/reorder-links.use-case.js";
import { ToggleLinkVisibilityUseCase } from "../../core/use-case/links/toggle-link-visibility-use-case/toggle-link-visibility.use-case.js";
import { GetLayoutUseCase } from "../../core/use-case/profile-layout/get-layout-use-case/get-layout.use-case.js";
import { CreateTabUseCase } from "../../core/use-case/profile-layout/create-tab-use-case/create-tab.use-case.js";
import { RenameTabUseCase } from "../../core/use-case/profile-layout/rename-tab-use-case/rename-tab.use-case.js";
import { SetTabsEnabledUseCase } from "../../core/use-case/profile-layout/set-tabs-enabled-use-case/set-tabs-enabled.use-case.js";
import { DeleteTabUseCase } from "../../core/use-case/profile-layout/delete-tab-use-case/delete-tab.use-case.js";
import { ReorderTabsUseCase } from "../../core/use-case/profile-layout/reorder-tabs-use-case/reorder-tabs.use-case.js";
import { CreateBlockUseCase } from "../../core/use-case/profile-layout/create-block-use-case/create-block.use-case.js";
import { UpdateBlockUseCase } from "../../core/use-case/profile-layout/update-block-use-case/update-block.use-case.js";
import { DeleteBlockUseCase } from "../../core/use-case/profile-layout/delete-block-use-case/delete-block.use-case.js";
import { UpdateBlockPositionsUseCase } from "../../core/use-case/profile-layout/update-block-positions-use-case/update-block-positions.use-case.js";
import { GetPublicProfileUseCase } from "../../core/use-case/profiles/get-public-profile-use-case/get-public-profile.use-case.js";
import { CheckUsernameAvailabilityUseCase } from "../../core/use-case/profiles/check-username-availability-use-case/check-username-availability.use-case.js";
import { GetMeProfileUseCase } from "../../core/use-case/profiles/get-me-profile-use-case/get-me-profile.use-case.js";
import { UpdateProfileUseCase } from "../../core/use-case/profiles/update-profile-use-case/update-profile.use-case.js";
import { GetUserPreferencesUseCase } from "../../core/use-case/preferences/get-user-preferences-use-case/get-user-preferences.use-case.js";
import { UpdateUserPreferencesUseCase } from "../../core/use-case/preferences/update-user-preferences-use-case/update-user-preferences.use-case.js";
import { GetMyResumeUseCase } from "../../core/use-case/resumes/get-my-resume-use-case/get-my-resume.use-case.js";
import { UpsertMyResumeUseCase } from "../../core/use-case/resumes/upsert-my-resume-use-case/upsert-my-resume.use-case.js";
import { ListSkillsCatalogUseCase } from "../../core/use-case/resumes/list-skills-catalog-use-case/list-skills-catalog.use-case.js";
import { CreateCustomSkillUseCase } from "../../core/use-case/resumes/create-custom-skill-use-case/create-custom-skill.use-case.js";
import { AddSkillToResumeUseCase } from "../../core/use-case/resumes/add-skill-to-resume-use-case/add-skill-to-resume.use-case.js";
import { ListTitlesCatalogUseCase } from "../../core/use-case/resumes/list-titles-catalog-use-case/list-titles-catalog.use-case.js";
import { CreateCustomTitleUseCase } from "../../core/use-case/resumes/create-custom-title-use-case/create-custom-title.use-case.js";
import { AddTitleToResumeUseCase } from "../../core/use-case/resumes/add-title-to-resume-use-case/add-title-to-resume.use-case.js";
import { GetPublicResumeByUsernameUseCase } from "../../core/use-case/resumes/get-public-resume-by-username-use-case/get-public-resume-by-username.use-case.js";
import { SaveResumeSkillsBulkUseCase } from "../../core/use-case/resumes/save-resume-skills-bulk-use-case/save-resume-skills-bulk.use-case.js";
import { SaveResumeTitlesBulkUseCase } from "../../core/use-case/resumes/save-resume-titles-bulk-use-case/save-resume-titles-bulk.use-case.js";
import { EnqueueResumeEmbeddingUseCase } from "../../core/use-case/resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { ProcessResumeEmbeddingJobUseCase } from "../../core/use-case/resumes/process-resume-embedding-job-use-case/process-resume-embedding-job.use-case.js";
import { SearchResumesByRecruiterQueryUseCase } from "../../core/use-case/resumes/search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";
import { TransformRecruiterSearchInputUseCase } from "../../core/use-case/resumes/transform-recruiter-search-input-use-case/transform-recruiter-search-input.use-case.js";
import { RevealCandidateContactUseCase } from "../../core/use-case/resumes/reveal-candidate-contact-use-case/reveal-candidate-contact.use-case.js";
import { RecordCandidateInteractionUseCase } from "../../core/use-case/interactions/record-candidate-interaction-use-case/record-candidate-interaction.use-case.js";
import { ListMyWorkExperiencesUseCase } from "../../core/use-case/work-experiences/list-my-work-experiences-use-case/list-my-work-experiences.use-case.js";
import { CreateWorkExperienceUseCase } from "../../core/use-case/work-experiences/create-work-experience-use-case/create-work-experience.use-case.js";
import { UpdateWorkExperienceUseCase } from "../../core/use-case/work-experiences/update-work-experience-use-case/update-work-experience.use-case.js";
import { DeleteWorkExperienceUseCase } from "../../core/use-case/work-experiences/delete-work-experience-use-case/delete-work-experience.use-case.js";
import { GetPublicWorkExperiencesByUsernameUseCase } from "../../core/use-case/work-experiences/get-public-work-experiences-by-username-use-case/get-public-work-experiences-by-username.use-case.js";
import { ParseResumeUseCase } from "../../core/use-case/ai-import/parse-resume-use-case/parse-resume.use-case.js";
import { ApplyAiResumeImportUseCase } from "../../core/use-case/ai-import/apply-ai-resume-import-use-case/apply-ai-resume-import.use-case.js";
import { CreatePostUseCase } from "../../core/use-case/posts/create-post-use-case/create-post.use-case.js";
import { ListMyPostsUseCase } from "../../core/use-case/posts/list-my-posts-use-case/list-my-posts.use-case.js";
import { ListPublicPostsUseCase } from "../../core/use-case/posts/list-public-posts-use-case/list-public-posts.use-case.js";
import { GetPostUseCase } from "../../core/use-case/posts/get-post-use-case/get-post.use-case.js";
import { UpdatePostUseCase } from "../../core/use-case/posts/update-post-use-case/update-post.use-case.js";
import { DeletePostUseCase } from "../../core/use-case/posts/delete-post-use-case/delete-post.use-case.js";
import { ApprovePostUseCase } from "../../core/use-case/posts/approve-post-use-case/approve-post.use-case.js";
import { GetAgentPolicyUseCase } from "../../core/use-case/agent-policy/get-agent-policy-use-case/get-agent-policy.use-case.js";
import { UpdateAgentPolicyUseCase } from "../../core/use-case/agent-policy/update-agent-policy-use-case/update-agent-policy.use-case.js";
import { GetWorkContextUseCase } from "../../core/use-case/agent-policy/get-work-context-use-case/get-work-context.use-case.js";
import { SetWorkExperienceDisclosureUseCase } from "../../core/use-case/agent-policy/set-work-experience-disclosure-use-case/set-work-experience-disclosure.use-case.js";
import { CreateApiTokenUseCase } from "../../core/use-case/api-tokens/create-api-token-use-case/create-api-token.use-case.js";
import { ListApiTokensUseCase } from "../../core/use-case/api-tokens/list-api-tokens-use-case/list-api-tokens.use-case.js";
import { RevokeApiTokenUseCase } from "../../core/use-case/api-tokens/revoke-api-token-use-case/revoke-api-token.use-case.js";
import { CreateGitConnectionUseCase } from "../../core/use-case/activity/create-git-connection-use-case/create-git-connection.use-case.js";
import { ListGitConnectionsUseCase } from "../../core/use-case/activity/list-git-connections-use-case/list-git-connections.use-case.js";
import { UpdateGitConnectionUseCase } from "../../core/use-case/activity/update-git-connection-use-case/update-git-connection.use-case.js";
import { DeleteGitConnectionUseCase } from "../../core/use-case/activity/delete-git-connection-use-case/delete-git-connection.use-case.js";
import { BuildCandidateEvidenceUseCase } from "../../core/use-case/activity/build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import { GenerateActivityDigestUseCase } from "../../core/use-case/activity/generate-activity-digest-use-case/generate-activity-digest.use-case.js";
import { SweepDueActivityDigestsUseCase } from "../../core/use-case/activity/sweep-due-activity-digests-use-case/sweep-due-activity-digests.use-case.js";
import { IngestActivityUseCase } from "../../core/use-case/activity/ingest-activity-use-case/ingest-activity.use-case.js";
import { GetConnectionHealthUseCase } from "../../core/use-case/activity/get-connection-health-use-case/get-connection-health.use-case.js";
import { PreviewActivityDigestUseCase } from "../../core/use-case/activity/preview-activity-digest-use-case/preview-activity-digest.use-case.js";

// Tokens for dependency injection
export const TOKENS = {
  UsersRepository: Symbol.for("UsersRepository"),
  UserPreferencesRepository: Symbol.for("UserPreferencesRepository"),
  LinksRepository: Symbol.for("LinksRepository"),
  PostsRepository: Symbol.for("PostsRepository"),
  ApiTokenRepository: Symbol.for("ApiTokenRepository"),
  ProfileTabsRepository: Symbol.for("ProfileTabsRepository"),
  ProfileBlocksRepository: Symbol.for("ProfileBlocksRepository"),
  RefreshTokenRepository: Symbol.for("RefreshTokenRepository"),
  EmailVerificationTokenRepository: Symbol.for(
    "EmailVerificationTokenRepository",
  ),
  PasswordResetTokenRepository: Symbol.for("PasswordResetTokenRepository"),
  OAuthAccountRepository: Symbol.for("OAuthAccountRepository"),
  ResumesRepository: Symbol.for("ResumesRepository"),
  SkillCatalogRepository: Symbol.for("SkillCatalogRepository"),
  TitleCatalogRepository: Symbol.for("TitleCatalogRepository"),
  ResumeSkillRepository: Symbol.for("ResumeSkillRepository"),
  ResumeTitleRepository: Symbol.for("ResumeTitleRepository"),
  ResumeEmbeddingsRepository: Symbol.for("ResumeEmbeddingsRepository"),
  ResumeSectionEmbeddingsRepository: Symbol.for(
    "ResumeSectionEmbeddingsRepository",
  ),
  ResumeSearchRepository: Symbol.for("ResumeSearchRepository"),
  CandidateInteractionRepository: Symbol.for("CandidateInteractionRepository"),
  WorkExperienceRepository: Symbol.for("WorkExperienceRepository"),
  GitConnectionRepository: Symbol.for("GitConnectionRepository"),
  ActivityEventRepository: Symbol.for("ActivityEventRepository"),
  HashProvider: Symbol.for("HashProvider"),
  JwtProvider: Symbol.for("JwtProvider"),
  TokenProvider: Symbol.for("TokenProvider"),
  WebhookSecretProvider: Symbol.for("WebhookSecretProvider"),
  EmbeddingProvider: Symbol.for("EmbeddingProvider"),
  RecruiterQueryConversionProvider: Symbol.for(
    "RecruiterQueryConversionProvider",
  ),
  ResumeParsingProvider: Symbol.for("ResumeParsingProvider"),
  FileStorageProvider: Symbol.for("FileStorageProvider"),
  ImageOptimizerProvider: Symbol.for("ImageOptimizerProvider"),
  AiQuotaProvider: Symbol.for("AiQuotaProvider"),
  MailProvider: Symbol.for("MailProvider"),
  UnitOfWork: Symbol.for("UnitOfWork"),
  ResumeEmbeddingQueue: Symbol.for("ResumeEmbeddingQueue"),
  ActivityDigestQueue: Symbol.for("ActivityDigestQueue"),
  GoogleOAuthProvider: Symbol.for("GoogleOAuthProvider"),
  LinkedInOAuthProvider: Symbol.for("LinkedInOAuthProvider"),
  CreateUserUseCase: Symbol.for("CreateUserUseCase"),
  LoginUseCase: Symbol.for("LoginUseCase"),
  OAuthSignInUseCase: Symbol.for("OAuthSignInUseCase"),
  VerifyEmailUseCase: Symbol.for("VerifyEmailUseCase"),
  ResendVerificationUseCase: Symbol.for("ResendVerificationUseCase"),
  RefreshSessionUseCase: Symbol.for("RefreshSessionUseCase"),
  ForgotPasswordUseCase: Symbol.for("ForgotPasswordUseCase"),
  ResetPasswordUseCase: Symbol.for("ResetPasswordUseCase"),
  GoogleSignInUseCase: Symbol.for("GoogleSignInUseCase"),
  ListUserLinksUseCase: Symbol.for("ListUserLinksUseCase"),
  GetLinkByIdUseCase: Symbol.for("GetLinkByIdUseCase"),
  CreateLinkUseCase: Symbol.for("CreateLinkUseCase"),
  UpdateLinkUseCase: Symbol.for("UpdateLinkUseCase"),
  DeleteLinkUseCase: Symbol.for("DeleteLinkUseCase"),
  ReorderLinksUseCase: Symbol.for("ReorderLinksUseCase"),
  ToggleLinkVisibilityUseCase: Symbol.for("ToggleLinkVisibilityUseCase"),
  GetLayoutUseCase: Symbol.for("GetLayoutUseCase"),
  CreateTabUseCase: Symbol.for("CreateTabUseCase"),
  RenameTabUseCase: Symbol.for("RenameTabUseCase"),
  DeleteTabUseCase: Symbol.for("DeleteTabUseCase"),
  ReorderTabsUseCase: Symbol.for("ReorderTabsUseCase"),
  SetTabsEnabledUseCase: Symbol.for("SetTabsEnabledUseCase"),
  CreateBlockUseCase: Symbol.for("CreateBlockUseCase"),
  UpdateBlockUseCase: Symbol.for("UpdateBlockUseCase"),
  DeleteBlockUseCase: Symbol.for("DeleteBlockUseCase"),
  UpdateBlockPositionsUseCase: Symbol.for("UpdateBlockPositionsUseCase"),
  GetPublicProfileUseCase: Symbol.for("GetPublicProfileUseCase"),
  CheckUsernameAvailabilityUseCase: Symbol.for(
    "CheckUsernameAvailabilityUseCase",
  ),
  GetMeProfileUseCase: Symbol.for("GetMeProfileUseCase"),
  UpdateProfileUseCase: Symbol.for("UpdateProfileUseCase"),
  GetUserPreferencesUseCase: Symbol.for("GetUserPreferencesUseCase"),
  UpdateUserPreferencesUseCase: Symbol.for("UpdateUserPreferencesUseCase"),
  GetMyResumeUseCase: Symbol.for("GetMyResumeUseCase"),
  UpsertMyResumeUseCase: Symbol.for("UpsertMyResumeUseCase"),
  ListSkillsCatalogUseCase: Symbol.for("ListSkillsCatalogUseCase"),
  CreateCustomSkillUseCase: Symbol.for("CreateCustomSkillUseCase"),
  AddSkillToResumeUseCase: Symbol.for("AddSkillToResumeUseCase"),
  ListTitlesCatalogUseCase: Symbol.for("ListTitlesCatalogUseCase"),
  CreateCustomTitleUseCase: Symbol.for("CreateCustomTitleUseCase"),
  AddTitleToResumeUseCase: Symbol.for("AddTitleToResumeUseCase"),
  SaveResumeSkillsBulkUseCase: Symbol.for("SaveResumeSkillsBulkUseCase"),
  SaveResumeTitlesBulkUseCase: Symbol.for("SaveResumeTitlesBulkUseCase"),
  EnqueueResumeEmbeddingUseCase: Symbol.for("EnqueueResumeEmbeddingUseCase"),
  ProcessResumeEmbeddingJobUseCase: Symbol.for(
    "ProcessResumeEmbeddingJobUseCase",
  ),
  SearchResumesByRecruiterQueryUseCase: Symbol.for(
    "SearchResumesByRecruiterQueryUseCase",
  ),
  TransformRecruiterSearchInputUseCase: Symbol.for(
    "TransformRecruiterSearchInputUseCase",
  ),
  RevealCandidateContactUseCase: Symbol.for("RevealCandidateContactUseCase"),
  RecordCandidateInteractionUseCase: Symbol.for(
    "RecordCandidateInteractionUseCase",
  ),
  GetPublicResumeByUsernameUseCase: Symbol.for(
    "GetPublicResumeByUsernameUseCase",
  ),
  ListMyWorkExperiencesUseCase: Symbol.for("ListMyWorkExperiencesUseCase"),
  CreateWorkExperienceUseCase: Symbol.for("CreateWorkExperienceUseCase"),
  UpdateWorkExperienceUseCase: Symbol.for("UpdateWorkExperienceUseCase"),
  DeleteWorkExperienceUseCase: Symbol.for("DeleteWorkExperienceUseCase"),
  GetPublicWorkExperiencesByUsernameUseCase: Symbol.for(
    "GetPublicWorkExperiencesByUsernameUseCase",
  ),
  ParseResumeUseCase: Symbol.for("ParseResumeUseCase"),
  ApplyAiResumeImportUseCase: Symbol.for("ApplyAiResumeImportUseCase"),
  CreatePostUseCase: Symbol.for("CreatePostUseCase"),
  ListMyPostsUseCase: Symbol.for("ListMyPostsUseCase"),
  ListPublicPostsUseCase: Symbol.for("ListPublicPostsUseCase"),
  GetPostUseCase: Symbol.for("GetPostUseCase"),
  UpdatePostUseCase: Symbol.for("UpdatePostUseCase"),
  DeletePostUseCase: Symbol.for("DeletePostUseCase"),
  ApprovePostUseCase: Symbol.for("ApprovePostUseCase"),
  GetAgentPolicyUseCase: Symbol.for("GetAgentPolicyUseCase"),
  UpdateAgentPolicyUseCase: Symbol.for("UpdateAgentPolicyUseCase"),
  GetWorkContextUseCase: Symbol.for("GetWorkContextUseCase"),
  SetWorkExperienceDisclosureUseCase: Symbol.for(
    "SetWorkExperienceDisclosureUseCase",
  ),
  CreateApiTokenUseCase: Symbol.for("CreateApiTokenUseCase"),
  ListApiTokensUseCase: Symbol.for("ListApiTokensUseCase"),
  RevokeApiTokenUseCase: Symbol.for("RevokeApiTokenUseCase"),
  CreateGitConnectionUseCase: Symbol.for("CreateGitConnectionUseCase"),
  ListGitConnectionsUseCase: Symbol.for("ListGitConnectionsUseCase"),
  UpdateGitConnectionUseCase: Symbol.for("UpdateGitConnectionUseCase"),
  DeleteGitConnectionUseCase: Symbol.for("DeleteGitConnectionUseCase"),
  IngestActivityUseCase: Symbol.for("IngestActivityUseCase"),
  GetConnectionHealthUseCase: Symbol.for("GetConnectionHealthUseCase"),
  PreviewActivityDigestUseCase: Symbol.for("PreviewActivityDigestUseCase"),
  BuildCandidateEvidenceUseCase: Symbol.for("BuildCandidateEvidenceUseCase"),
  GenerateActivityDigestUseCase: Symbol.for("GenerateActivityDigestUseCase"),
  SweepDueActivityDigestsUseCase: Symbol.for("SweepDueActivityDigestsUseCase"),
} as const;

/**
 * Configure and register all dependencies in the DI container
 */
export function setupContainer() {
  // Register repositories
  container.register<IUsersRepository>(TOKENS.UsersRepository, {
    useClass: DrizzleUserRepository,
  });

  container.register<IUserPreferencesRepository>(
    TOKENS.UserPreferencesRepository,
    {
      useClass: DrizzleUserPreferencesRepository,
    },
  );

  container.register<ILinksRepository>(TOKENS.LinksRepository, {
    useClass: DrizzleLinksRepository,
  });

  container.register<IPostRepository>(TOKENS.PostsRepository, {
    useClass: DrizzlePostsRepository,
  });

  container.register<IApiTokenRepository>(TOKENS.ApiTokenRepository, {
    useClass: DrizzleApiTokenRepository,
  });

  container.register<IProfileTabsRepository>(TOKENS.ProfileTabsRepository, {
    useClass: DrizzleProfileTabsRepository,
  });

  container.register<IProfileBlocksRepository>(TOKENS.ProfileBlocksRepository, {
    useClass: DrizzleProfileBlocksRepository,
  });

  container.register<IRefreshTokenRepository>(TOKENS.RefreshTokenRepository, {
    useClass: DrizzleRefreshTokenRepository,
  });

  container.register<IEmailVerificationTokenRepository>(
    TOKENS.EmailVerificationTokenRepository,
    {
      useClass: DrizzleEmailVerificationTokenRepository,
    },
  );

  container.register<IPasswordResetTokenRepository>(
    TOKENS.PasswordResetTokenRepository,
    {
      useClass: DrizzlePasswordResetTokenRepository,
    },
  );

  container.register<IOAuthAccountRepository>(TOKENS.OAuthAccountRepository, {
    useClass: DrizzleOAuthAccountRepository,
  });

  container.register<IResumesRepository>(TOKENS.ResumesRepository, {
    useClass: DrizzleResumesRepository,
  });

  container.register<ISkillCatalogRepository>(TOKENS.SkillCatalogRepository, {
    useClass: DrizzleSkillCatalogRepository,
  });

  container.register<ITitleCatalogRepository>(TOKENS.TitleCatalogRepository, {
    useClass: DrizzleTitleCatalogRepository,
  });

  container.register<IResumeSkillRepository>(TOKENS.ResumeSkillRepository, {
    useClass: DrizzleResumeSkillRepository,
  });

  container.register<IResumeTitleRepository>(TOKENS.ResumeTitleRepository, {
    useClass: DrizzleResumeTitleRepository,
  });

  container.register<IResumeEmbeddingsRepository>(
    TOKENS.ResumeEmbeddingsRepository,
    {
      useClass: DrizzleResumeEmbeddingsRepository,
    },
  );

  container.register<IResumeSectionEmbeddingsRepository>(
    TOKENS.ResumeSectionEmbeddingsRepository,
    {
      useClass: DrizzleResumeSectionEmbeddingsRepository,
    },
  );

  container.register<IResumeSearchRepository>(TOKENS.ResumeSearchRepository, {
    useClass: DrizzleResumeSearchRepository,
  });

  container.register<ICandidateInteractionRepository>(
    TOKENS.CandidateInteractionRepository,
    {
      useClass: DrizzleCandidateInteractionRepository,
    },
  );

  container.register<IWorkExperienceRepository>(
    TOKENS.WorkExperienceRepository,
    {
      useClass: DrizzleWorkExperienceRepository,
    },
  );

  container.register<IGitConnectionRepository>(TOKENS.GitConnectionRepository, {
    useClass: DrizzleGitConnectionRepository,
  });

  container.register<IActivityEventRepository>(TOKENS.ActivityEventRepository, {
    useClass: DrizzleActivityEventRepository,
  });

  // Register providers
  container.register<IUnitOfWork>(TOKENS.UnitOfWork, {
    useClass: DrizzleUnitOfWork,
  });

  container.register<IHashProvider>(TOKENS.HashProvider, {
    useClass: Argon2HashProvider,
  });

  container.register<IJwtProvider>(TOKENS.JwtProvider, {
    useFactory: () => {
      return new JwtProvider({
        secret:
          process.env.JWT_SECRET || "your-secret-key-change-in-production",
        expiresIn: process.env.JWT_EXPIRES_IN || "15m", // Short-lived access token
      });
    },
  });

  container.register<ITokenProvider>(TOKENS.TokenProvider, {
    useClass: CryptoTokenProvider,
  });

  container.register<IWebhookSecretProvider>(TOKENS.WebhookSecretProvider, {
    useClass: CryptoWebhookSecretProvider,
  });

  /**
   * CACHED, and that is the whole point.
   *
   * This used to be a plain `register({ useFactory })`, which in tsyringe is
   * TRANSIENT: every `container.resolve(TOKENS.EmbeddingProvider)` — i.e. every
   * request and every job — built a brand new `CachedEmbeddingProvider` around
   * a brand new empty `Map`. The cache could never hit across two calls, so the
   * app paid OpenAI for an embedding of the same text every single time while
   * looking, from the code, like it had a cache.
   *
   * `instanceCachingFactory` keeps the env-driven branching (deterministic
   * provider when there is no API key) while handing out one shared instance.
   *
   * The TTL default is 24h rather than the previous 15 minutes: an embedding is
   * a pure function of (model, text), so a stale entry is not a thing that can
   * exist — the only reason to expire at all is to bound memory, which
   * `maxItems` already does.
   */
  container.register<IEmbeddingProvider>(TOKENS.EmbeddingProvider, {
    useFactory: instanceCachingFactory(() => {
      const apiKey = process.env.OPENAI_API_KEY;
      const ttlSeconds = Number(
        process.env.EMBEDDING_CACHE_TTL_SECONDS ?? "86400",
      );
      // 5000 entries: text-embedding-3-small returns 1536 floats, ~12.3 KB per
      // entry as a JS number[], so this bounds the cache at roughly 65 MB. On a
      // 4GB box shared with Postgres, Redis and two workers, 10k entries
      // (~130 MB) is not worth the extra hit rate.
      const maxItems = Number(process.env.EMBEDDING_CACHE_MAX_ITEMS ?? "5000");

      if (!apiKey) {
        return new CachedEmbeddingProvider(
          new DeterministicEmbeddingProvider(),
          ttlSeconds,
          maxItems,
        );
      }

      return new CachedEmbeddingProvider(
        new OpenAiEmbeddingProvider(apiKey),
        ttlSeconds,
        maxItems,
      );
    }),
  });

  // Singleton for the same reason `ActivityDigestQueue` below is: this owns a
  // Redis connection, and being transient meant one new socket per enqueue.
  // Under load that walks straight into Redis `maxclients`.
  container.registerSingleton<IResumeEmbeddingQueue>(
    TOKENS.ResumeEmbeddingQueue,
    BullMqResumeEmbeddingQueue,
  );

  // Registered as a singleton: it owns a Redis connection and the sweep's job
  // scheduler, and a fresh queue (plus a fresh socket) per resolution would leak
  // connections on every enqueue.
  container.registerSingleton<IActivityDigestQueue>(
    TOKENS.ActivityDigestQueue,
    BullMqActivityDigestQueue,
  );

  // Cached: each of these wraps an `OpenAI` client, which carries its own HTTP
  // agent and keep-alive pool. Rebuilding one per request threw that pool away
  // on every call and forced a fresh TLS handshake to api.openai.com.
  container.register<IRecruiterQueryConversionProvider>(
    TOKENS.RecruiterQueryConversionProvider,
    {
      useFactory: instanceCachingFactory(() => {
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
          return new DeterministicRecruiterQueryConversionProvider();
        }

        return new OpenAiRecruiterQueryConversionProvider(apiKey);
      }),
    },
  );

  container.register<IResumeParsingProvider>(TOKENS.ResumeParsingProvider, {
    useFactory: instanceCachingFactory(() => {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return new DeterministicResumeParsingProvider();
      }

      return new OpenAiResumeParsingProvider(apiKey);
    }),
  });

  // Cached: an `S3Client` holds a connection pool and was previously rebuilt on
  // every upload. Note the throw below still happens per resolution — nothing is
  // cached on the failure path — so the lazy "not configured" behaviour is
  // unchanged.
  container.register<IFileStorageProvider>(TOKENS.FileStorageProvider, {
    useFactory: instanceCachingFactory(() => {
      // Complete S3_* environment wins; nothing set in development falls back
      // to the MinIO service in docker-compose.dev.yml. Production is never
      // given that fallback — see `resolveFileStorageConfig`.
      const config = resolveFileStorageConfig();

      // Fail lazily (at request time) with a clear message instead of crashing
      // the whole server at boot when object storage isn't configured. The
      // message names the local fix because the overwhelmingly common way to
      // see this is a developer whose MinIO is not running.
      if (!config) {
        throw new InternalServerError(
          "Image storage is not configured. Set the S3_* variables, or run " +
            "`bash db-manage.sh start` to use the local MinIO.",
        );
      }

      return new S3FileStorageProvider(config);
    }),
  });

  /**
   * Cached: both implementations are stateful — for the in-memory one the Map
   * *is* the counter, so a transient registration would hand every request a
   * fresh, empty quota and the limit would never bind. Neither constructor
   * opens a socket (`RedisAiQuotaProvider` calls `getRedis()` lazily per
   * command), so this costs nothing at boot.
   */
  /**
   * Cached: `createImageOptimizerProvider()` probes whether sharp's native
   * binding actually loads and falls back to the passthrough implementation if
   * it does not, so the probe should happen once rather than per upload.
   */
  container.register<IImageOptimizerProvider>(TOKENS.ImageOptimizerProvider, {
    useFactory: instanceCachingFactory(() => createImageOptimizerProvider()),
  });

  container.register<IAiQuotaProvider>(TOKENS.AiQuotaProvider, {
    useFactory: instanceCachingFactory(() =>
      isRedisConfigured()
        ? new RedisAiQuotaProvider()
        : // No REDIS_URL: count per process. With N replicas that permits
          // N x limit, a weaker cap than the real thing but still a cap. The
          // guard is disabled outside production anyway.
          new InMemoryAiQuotaProvider(),
    ),
  });

  /**
   * Which mail implementation runs is decided by MAIL_TRANSPORT, the same way
   * "no OPENAI_API_KEY -> deterministic provider" is decided above: development
   * and test get `LogMailProvider`, which prints the verification link so the
   * whole flow works with no SMTP server anywhere.
   *
   * Cached, and this one MATTERS more than the others: `SmtpMailProvider` opens
   * a pooled SMTP connection, and a transient registration would build a fresh
   * pool — and a fresh TCP+TLS handshake — for every single email.
   * `assertProductionConfig()` refuses to boot production on the log transport,
   * so this cannot silently become a mail black hole in production.
   */
  container.register<IMailProvider>(TOKENS.MailProvider, {
    useFactory: instanceCachingFactory(() => {
      const mail = mailConfig();

      if (mail.transport === "smtp" && mail.smtp.host !== undefined) {
        return new SmtpMailProvider({
          host: mail.smtp.host,
          port: mail.smtp.port,
          secure: mail.smtp.secure,
          user: mail.smtp.user,
          password: mail.smtp.password,
          from: mail.from,
        });
      }

      return new LogMailProvider();
    }),
  });

  container.register<IGoogleOAuthProvider>(TOKENS.GoogleOAuthProvider, {
    useFactory: () => {
      return new GoogleOAuthProvider({
        clientId: process.env.GOOGLE_CLIENT_ID || "",
      });
    },
  });

  container.register<ILinkedInOAuthProvider>(TOKENS.LinkedInOAuthProvider, {
    useFactory: () => {
      const linkedInRedirectUri = process.env.LINKEDIN_REDIRECT_URI;

      if (!linkedInRedirectUri || linkedInRedirectUri.length === 0) {
        throw new Error("LINKEDIN_REDIRECT_URI is required");
      }

      return new LinkedInOAuthProvider({
        clientId: process.env.LINKEDIN_CLIENT_ID || "",
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
        redirectUri: linkedInRedirectUri,
      });
    },
  });

  // Register use cases
  container.register<CreateUserUseCase>(TOKENS.CreateUserUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const emailVerificationTokenRepository =
        c.resolve<IEmailVerificationTokenRepository>(
          TOKENS.EmailVerificationTokenRepository,
        );
      const hashProvider = c.resolve<IHashProvider>(TOKENS.HashProvider);
      const tokenProvider = c.resolve<ITokenProvider>(TOKENS.TokenProvider);
      const mailProvider = c.resolve<IMailProvider>(TOKENS.MailProvider);

      // Simple validator that passes through (Zod validation happens at controller level)
      const validator = passThroughValidator<ICreateUserUseCaseInput>();

      // No refresh-token repository and no JWT provider any more: registering
      // no longer mints a session.
      return new CreateUserUseCase(
        usersRepository,
        emailVerificationTokenRepository,
        hashProvider,
        tokenProvider,
        mailProvider,
        {
          appPublicUrl: appPublicUrl(),
          tokenTtlHours: emailVerificationConfig().tokenTtlHours,
        },
        validator,
      );
    },
  });

  container.register<LoginUseCase>(TOKENS.LoginUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const refreshTokenRepository = c.resolve<IRefreshTokenRepository>(
        TOKENS.RefreshTokenRepository,
      );
      const hashProvider = c.resolve<IHashProvider>(TOKENS.HashProvider);
      const jwtProvider = c.resolve<IJwtProvider>(TOKENS.JwtProvider);

      // Simple validator that passes through (Zod validation happens at controller level)
      const validator = passThroughValidator<ILoginUseCaseInput>();

      return new LoginUseCase(
        usersRepository,
        refreshTokenRepository,
        c.resolve<IOAuthAccountRepository>(TOKENS.OAuthAccountRepository),
        hashProvider,
        jwtProvider,
        validator,
      );
    },
  });

  container.register<OAuthSignInUseCase>(TOKENS.OAuthSignInUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const oauthAccountRepository = c.resolve<IOAuthAccountRepository>(
        TOKENS.OAuthAccountRepository,
      );
      const refreshTokenRepository = c.resolve<IRefreshTokenRepository>(
        TOKENS.RefreshTokenRepository,
      );
      const hashProvider = c.resolve<IHashProvider>(TOKENS.HashProvider);
      const jwtProvider = c.resolve<IJwtProvider>(TOKENS.JwtProvider);

      const validator = passThroughValidator<IOAuthSignInUseCaseInput>();

      return new OAuthSignInUseCase(
        usersRepository,
        oauthAccountRepository,
        refreshTokenRepository,
        hashProvider,
        jwtProvider,
        validator,
      );
    },
  });

  container.register<GoogleSignInUseCase>(TOKENS.GoogleSignInUseCase, {
    useFactory: (c) => {
      const googleOAuthProvider = c.resolve<IGoogleOAuthProvider>(
        TOKENS.GoogleOAuthProvider,
      );
      const oauthSignInUseCase = c.resolve<OAuthSignInUseCase>(
        TOKENS.OAuthSignInUseCase,
      );

      const validator = passThroughValidator<IGoogleSignInUseCaseInput>();

      return new GoogleSignInUseCase(
        googleOAuthProvider,
        oauthSignInUseCase,
        validator,
      );
    },
  });

  container.register<VerifyEmailUseCase>(TOKENS.VerifyEmailUseCase, {
    useFactory: (c) => {
      const validator = passThroughValidator<IVerifyEmailUseCaseInput>();

      return new VerifyEmailUseCase(
        c.resolve<IUsersRepository>(TOKENS.UsersRepository),
        c.resolve<IEmailVerificationTokenRepository>(
          TOKENS.EmailVerificationTokenRepository,
        ),
        c.resolve<IRefreshTokenRepository>(TOKENS.RefreshTokenRepository),
        c.resolve<ITokenProvider>(TOKENS.TokenProvider),
        c.resolve<IJwtProvider>(TOKENS.JwtProvider),
        validator,
      );
    },
  });

  container.register<ResendVerificationUseCase>(
    TOKENS.ResendVerificationUseCase,
    {
      useFactory: (c) => {
        const validator =
          passThroughValidator<IResendVerificationUseCaseInput>();

        return new ResendVerificationUseCase(
          c.resolve<IUsersRepository>(TOKENS.UsersRepository),
          c.resolve<IEmailVerificationTokenRepository>(
            TOKENS.EmailVerificationTokenRepository,
          ),
          c.resolve<IOAuthAccountRepository>(TOKENS.OAuthAccountRepository),
          c.resolve<ITokenProvider>(TOKENS.TokenProvider),
          c.resolve<IMailProvider>(TOKENS.MailProvider),
          {
            appPublicUrl: appPublicUrl(),
            tokenTtlHours: emailVerificationConfig().tokenTtlHours,
          },
          validator,
        );
      },
    },
  );

  container.register<RefreshSessionUseCase>(TOKENS.RefreshSessionUseCase, {
    useFactory: (c) => {
      const validator = passThroughValidator<IRefreshSessionUseCaseInput>();

      return new RefreshSessionUseCase(
        c.resolve<IRefreshTokenRepository>(TOKENS.RefreshTokenRepository),
        c.resolve<IJwtProvider>(TOKENS.JwtProvider),
        validator,
      );
    },
  });

  container.register<ForgotPasswordUseCase>(TOKENS.ForgotPasswordUseCase, {
    useFactory: (c) => {
      const validator = passThroughValidator<IForgotPasswordUseCaseInput>();

      return new ForgotPasswordUseCase(
        c.resolve<IUsersRepository>(TOKENS.UsersRepository),
        c.resolve<IPasswordResetTokenRepository>(
          TOKENS.PasswordResetTokenRepository,
        ),
        c.resolve<ITokenProvider>(TOKENS.TokenProvider),
        c.resolve<IMailProvider>(TOKENS.MailProvider),
        {
          appPublicUrl: appPublicUrl(),
          tokenTtlMinutes: passwordResetConfig().tokenTtlMinutes,
        },
        validator,
      );
    },
  });

  container.register<ResetPasswordUseCase>(TOKENS.ResetPasswordUseCase, {
    useFactory: (c) => {
      const validator = passThroughValidator<IResetPasswordUseCaseInput>();

      return new ResetPasswordUseCase(
        c.resolve<IUsersRepository>(TOKENS.UsersRepository),
        c.resolve<IPasswordResetTokenRepository>(
          TOKENS.PasswordResetTokenRepository,
        ),
        // The first real consumer of `deleteByUserId`: a reset revokes every
        // session the account has.
        c.resolve<IRefreshTokenRepository>(TOKENS.RefreshTokenRepository),
        c.resolve<IHashProvider>(TOKENS.HashProvider),
        c.resolve<ITokenProvider>(TOKENS.TokenProvider),
        validator,
      );
    },
  });

  container.register<ListUserLinksUseCase>(TOKENS.ListUserLinksUseCase, {
    useFactory: (c) => {
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new ListUserLinksUseCase(linksRepository);
    },
  });

  container.register<GetLinkByIdUseCase>(TOKENS.GetLinkByIdUseCase, {
    useFactory: (c) => {
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new GetLinkByIdUseCase(linksRepository);
    },
  });

  container.register<CreateLinkUseCase>(TOKENS.CreateLinkUseCase, {
    useFactory: (c) => {
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );

      return new CreateLinkUseCase(linksRepository, usersRepository);
    },
  });

  container.register<UpdateLinkUseCase>(TOKENS.UpdateLinkUseCase, {
    useFactory: (c) => {
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new UpdateLinkUseCase(linksRepository);
    },
  });

  container.register<DeleteLinkUseCase>(TOKENS.DeleteLinkUseCase, {
    useFactory: (c) => {
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new DeleteLinkUseCase(linksRepository);
    },
  });

  container.register<ReorderLinksUseCase>(TOKENS.ReorderLinksUseCase, {
    useFactory: (c) => {
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new ReorderLinksUseCase(linksRepository);
    },
  });

  container.register<ToggleLinkVisibilityUseCase>(
    TOKENS.ToggleLinkVisibilityUseCase,
    {
      useFactory: (c) => {
        const linksRepository = c.resolve<ILinksRepository>(
          TOKENS.LinksRepository,
        );

        return new ToggleLinkVisibilityUseCase(linksRepository);
      },
    },
  );

  container.register<GetLayoutUseCase>(TOKENS.GetLayoutUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );
      const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
        TOKENS.ProfileBlocksRepository,
      );
      const unitOfWork = c.resolve<IUnitOfWork>(TOKENS.UnitOfWork);

      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );

      return new GetLayoutUseCase(
        profileTabsRepository,
        profileBlocksRepository,
        unitOfWork,
        usersRepository,
      );
    },
  });

  container.register<SetTabsEnabledUseCase>(TOKENS.SetTabsEnabledUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );

      return new SetTabsEnabledUseCase(usersRepository);
    },
  });

  container.register<CreateTabUseCase>(TOKENS.CreateTabUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );

      return new CreateTabUseCase(profileTabsRepository);
    },
  });

  container.register<RenameTabUseCase>(TOKENS.RenameTabUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );

      return new RenameTabUseCase(profileTabsRepository);
    },
  });

  container.register<DeleteTabUseCase>(TOKENS.DeleteTabUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );
      const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
        TOKENS.ProfileBlocksRepository,
      );
      const unitOfWork = c.resolve<IUnitOfWork>(TOKENS.UnitOfWork);

      return new DeleteTabUseCase(
        profileTabsRepository,
        profileBlocksRepository,
        unitOfWork,
      );
    },
  });

  container.register<ReorderTabsUseCase>(TOKENS.ReorderTabsUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );

      return new ReorderTabsUseCase(profileTabsRepository);
    },
  });

  container.register<CreateBlockUseCase>(TOKENS.CreateBlockUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );
      const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
        TOKENS.ProfileBlocksRepository,
      );

      const unitOfWork = c.resolve<IUnitOfWork>(TOKENS.UnitOfWork);

      return new CreateBlockUseCase(
        profileTabsRepository,
        profileBlocksRepository,
        unitOfWork,
      );
    },
  });

  container.register<UpdateBlockUseCase>(TOKENS.UpdateBlockUseCase, {
    useFactory: (c) => {
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );
      const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
        TOKENS.ProfileBlocksRepository,
      );

      const unitOfWork = c.resolve<IUnitOfWork>(TOKENS.UnitOfWork);

      return new UpdateBlockUseCase(
        profileTabsRepository,
        profileBlocksRepository,
        unitOfWork,
      );
    },
  });

  container.register<DeleteBlockUseCase>(TOKENS.DeleteBlockUseCase, {
    useFactory: (c) => {
      const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
        TOKENS.ProfileBlocksRepository,
      );

      return new DeleteBlockUseCase(profileBlocksRepository);
    },
  });

  container.register<UpdateBlockPositionsUseCase>(
    TOKENS.UpdateBlockPositionsUseCase,
    {
      useFactory: (c) => {
        const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
          TOKENS.ProfileBlocksRepository,
        );

        return new UpdateBlockPositionsUseCase(profileBlocksRepository);
      },
    },
  );

  container.register<GetPublicProfileUseCase>(TOKENS.GetPublicProfileUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );
      const profileTabsRepository = c.resolve<IProfileTabsRepository>(
        TOKENS.ProfileTabsRepository,
      );
      const profileBlocksRepository = c.resolve<IProfileBlocksRepository>(
        TOKENS.ProfileBlocksRepository,
      );

      return new GetPublicProfileUseCase(
        usersRepository,
        linksRepository,
        profileTabsRepository,
        profileBlocksRepository,
      );
    },
  });

  container.register<GetMeProfileUseCase>(TOKENS.GetMeProfileUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new GetMeProfileUseCase(usersRepository, linksRepository);
    },
  });

  container.register<CheckUsernameAvailabilityUseCase>(
    TOKENS.CheckUsernameAvailabilityUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );

        return new CheckUsernameAvailabilityUseCase(usersRepository);
      },
    },
  );

  container.register<UpdateProfileUseCase>(TOKENS.UpdateProfileUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );

      return new UpdateProfileUseCase(usersRepository);
    },
  });

  container.register<GetUserPreferencesUseCase>(
    TOKENS.GetUserPreferencesUseCase,
    {
      useFactory: (c) => {
        const userPreferencesRepository = c.resolve<IUserPreferencesRepository>(
          TOKENS.UserPreferencesRepository,
        );

        return new GetUserPreferencesUseCase(userPreferencesRepository);
      },
    },
  );

  container.register<UpdateUserPreferencesUseCase>(
    TOKENS.UpdateUserPreferencesUseCase,
    {
      useFactory: (c) => {
        const userPreferencesRepository = c.resolve<IUserPreferencesRepository>(
          TOKENS.UserPreferencesRepository,
        );

        return new UpdateUserPreferencesUseCase(userPreferencesRepository);
      },
    },
  );

  container.register<GetMyResumeUseCase>(TOKENS.GetMyResumeUseCase, {
    useFactory: (c) => {
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const resumeSkillRepository = c.resolve<IResumeSkillRepository>(
        TOKENS.ResumeSkillRepository,
      );
      const resumeTitleRepository = c.resolve<IResumeTitleRepository>(
        TOKENS.ResumeTitleRepository,
      );

      return new GetMyResumeUseCase(
        resumesRepository,
        resumeSkillRepository,
        resumeTitleRepository,
      );
    },
  });

  container.register<EnqueueResumeEmbeddingUseCase>(
    TOKENS.EnqueueResumeEmbeddingUseCase,
    {
      useFactory: (c) => {
        const resumeEmbeddingQueue = c.resolve<IResumeEmbeddingQueue>(
          TOKENS.ResumeEmbeddingQueue,
        );

        return new EnqueueResumeEmbeddingUseCase(resumeEmbeddingQueue);
      },
    },
  );

  container.register<UpsertMyResumeUseCase>(TOKENS.UpsertMyResumeUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new UpsertMyResumeUseCase(
        usersRepository,
        resumesRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<ListSkillsCatalogUseCase>(
    TOKENS.ListSkillsCatalogUseCase,
    {
      useFactory: (c) => {
        const skillCatalogRepository = c.resolve<ISkillCatalogRepository>(
          TOKENS.SkillCatalogRepository,
        );

        return new ListSkillsCatalogUseCase(skillCatalogRepository);
      },
    },
  );

  container.register<CreateCustomSkillUseCase>(
    TOKENS.CreateCustomSkillUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const skillCatalogRepository = c.resolve<ISkillCatalogRepository>(
          TOKENS.SkillCatalogRepository,
        );

        return new CreateCustomSkillUseCase(
          usersRepository,
          skillCatalogRepository,
        );
      },
    },
  );

  container.register<AddSkillToResumeUseCase>(TOKENS.AddSkillToResumeUseCase, {
    useFactory: (c) => {
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const skillCatalogRepository = c.resolve<ISkillCatalogRepository>(
        TOKENS.SkillCatalogRepository,
      );
      const resumeSkillRepository = c.resolve<IResumeSkillRepository>(
        TOKENS.ResumeSkillRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new AddSkillToResumeUseCase(
        resumesRepository,
        skillCatalogRepository,
        resumeSkillRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<ListTitlesCatalogUseCase>(
    TOKENS.ListTitlesCatalogUseCase,
    {
      useFactory: (c) => {
        const titleCatalogRepository = c.resolve<ITitleCatalogRepository>(
          TOKENS.TitleCatalogRepository,
        );

        return new ListTitlesCatalogUseCase(titleCatalogRepository);
      },
    },
  );

  container.register<CreateCustomTitleUseCase>(
    TOKENS.CreateCustomTitleUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const titleCatalogRepository = c.resolve<ITitleCatalogRepository>(
          TOKENS.TitleCatalogRepository,
        );

        return new CreateCustomTitleUseCase(
          usersRepository,
          titleCatalogRepository,
        );
      },
    },
  );

  container.register<AddTitleToResumeUseCase>(TOKENS.AddTitleToResumeUseCase, {
    useFactory: (c) => {
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const titleCatalogRepository = c.resolve<ITitleCatalogRepository>(
        TOKENS.TitleCatalogRepository,
      );
      const resumeTitleRepository = c.resolve<IResumeTitleRepository>(
        TOKENS.ResumeTitleRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new AddTitleToResumeUseCase(
        resumesRepository,
        titleCatalogRepository,
        resumeTitleRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<SaveResumeSkillsBulkUseCase>(
    TOKENS.SaveResumeSkillsBulkUseCase,
    {
      useFactory: (c) => {
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const skillCatalogRepository = c.resolve<ISkillCatalogRepository>(
          TOKENS.SkillCatalogRepository,
        );
        const resumeSkillRepository = c.resolve<IResumeSkillRepository>(
          TOKENS.ResumeSkillRepository,
        );
        const enqueueResumeEmbeddingUseCase =
          c.resolve<EnqueueResumeEmbeddingUseCase>(
            TOKENS.EnqueueResumeEmbeddingUseCase,
          );

        return new SaveResumeSkillsBulkUseCase(
          resumesRepository,
          skillCatalogRepository,
          resumeSkillRepository,
          enqueueResumeEmbeddingUseCase,
        );
      },
    },
  );

  container.register<SaveResumeTitlesBulkUseCase>(
    TOKENS.SaveResumeTitlesBulkUseCase,
    {
      useFactory: (c) => {
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const titleCatalogRepository = c.resolve<ITitleCatalogRepository>(
          TOKENS.TitleCatalogRepository,
        );
        const resumeTitleRepository = c.resolve<IResumeTitleRepository>(
          TOKENS.ResumeTitleRepository,
        );
        const enqueueResumeEmbeddingUseCase =
          c.resolve<EnqueueResumeEmbeddingUseCase>(
            TOKENS.EnqueueResumeEmbeddingUseCase,
          );

        return new SaveResumeTitlesBulkUseCase(
          resumesRepository,
          titleCatalogRepository,
          resumeTitleRepository,
          enqueueResumeEmbeddingUseCase,
        );
      },
    },
  );

  container.register<ProcessResumeEmbeddingJobUseCase>(
    TOKENS.ProcessResumeEmbeddingJobUseCase,
    {
      useFactory: (c) => {
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const resumeSkillRepository = c.resolve<IResumeSkillRepository>(
          TOKENS.ResumeSkillRepository,
        );
        const resumeTitleRepository = c.resolve<IResumeTitleRepository>(
          TOKENS.ResumeTitleRepository,
        );
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const resumeEmbeddingsRepository =
          c.resolve<IResumeEmbeddingsRepository>(
            TOKENS.ResumeEmbeddingsRepository,
          );
        const embeddingProvider = c.resolve<IEmbeddingProvider>(
          TOKENS.EmbeddingProvider,
        );
        // Posts are a first-class search source, so the indexing job needs to
        // read them to build the `posts` section vector.
        const postRepository = c.resolve<IPostRepository>(
          TOKENS.PostsRepository,
        );
        const resumeSectionEmbeddingsRepository =
          c.resolve<IResumeSectionEmbeddingsRepository>(
            TOKENS.ResumeSectionEmbeddingsRepository,
          );

        return new ProcessResumeEmbeddingJobUseCase(
          resumesRepository,
          resumeSkillRepository,
          resumeTitleRepository,
          workExperienceRepository,
          resumeEmbeddingsRepository,
          embeddingProvider,
          postRepository,
          resumeSectionEmbeddingsRepository,
        );
      },
    },
  );

  container.register<SearchResumesByRecruiterQueryUseCase>(
    TOKENS.SearchResumesByRecruiterQueryUseCase,
    {
      useFactory: (c) => {
        const embeddingProvider = c.resolve<IEmbeddingProvider>(
          TOKENS.EmbeddingProvider,
        );
        const resumeSearchRepository = c.resolve<IResumeSearchRepository>(
          TOKENS.ResumeSearchRepository,
        );

        return new SearchResumesByRecruiterQueryUseCase(
          embeddingProvider,
          resumeSearchRepository,
        );
      },
    },
  );

  container.register<TransformRecruiterSearchInputUseCase>(
    TOKENS.TransformRecruiterSearchInputUseCase,
    {
      useFactory: (c) => {
        const queryConversionProvider =
          c.resolve<IRecruiterQueryConversionProvider>(
            TOKENS.RecruiterQueryConversionProvider,
          );
        const searchResumesByRecruiterQueryUseCase =
          c.resolve<SearchResumesByRecruiterQueryUseCase>(
            TOKENS.SearchResumesByRecruiterQueryUseCase,
          );

        const userPreferencesRepository = c.resolve<IUserPreferencesRepository>(
          TOKENS.UserPreferencesRepository,
        );

        return new TransformRecruiterSearchInputUseCase(
          queryConversionProvider,
          searchResumesByRecruiterQueryUseCase,
          userPreferencesRepository,
        );
      },
    },
  );

  container.register<RevealCandidateContactUseCase>(
    TOKENS.RevealCandidateContactUseCase,
    {
      useFactory: (c) => {
        const resumeSearchRepository = c.resolve<IResumeSearchRepository>(
          TOKENS.ResumeSearchRepository,
        );
        const candidateInteractionRepository =
          c.resolve<ICandidateInteractionRepository>(
            TOKENS.CandidateInteractionRepository,
          );

        return new RevealCandidateContactUseCase(
          resumeSearchRepository,
          candidateInteractionRepository,
        );
      },
    },
  );

  container.register<RecordCandidateInteractionUseCase>(
    TOKENS.RecordCandidateInteractionUseCase,
    {
      useFactory: (c) => {
        const candidateInteractionRepository =
          c.resolve<ICandidateInteractionRepository>(
            TOKENS.CandidateInteractionRepository,
          );
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );

        return new RecordCandidateInteractionUseCase(
          candidateInteractionRepository,
          {
            // Without this the self-interaction guard is INERT: the use case
            // makes `findResumeOwnerId` optional and silently skips the check
            // when it is absent, so rating your own profile — the cheapest way
            // to poison the ranking model — would sail straight through while
            // every other guardrail looked active.
            findResumeOwnerId: async (resumeId) =>
              (await resumesRepository.findById(resumeId))?.userId ?? null,
          },
        );
      },
    },
  );

  container.register<GetPublicResumeByUsernameUseCase>(
    TOKENS.GetPublicResumeByUsernameUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const resumeSkillRepository = c.resolve<IResumeSkillRepository>(
          TOKENS.ResumeSkillRepository,
        );
        const resumeTitleRepository = c.resolve<IResumeTitleRepository>(
          TOKENS.ResumeTitleRepository,
        );

        return new GetPublicResumeByUsernameUseCase(
          usersRepository,
          resumesRepository,
          resumeSkillRepository,
          resumeTitleRepository,
        );
      },
    },
  );

  container.register<ListMyWorkExperiencesUseCase>(
    TOKENS.ListMyWorkExperiencesUseCase,
    {
      useFactory: (c) => {
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );

        return new ListMyWorkExperiencesUseCase(workExperienceRepository);
      },
    },
  );

  container.register<CreateWorkExperienceUseCase>(
    TOKENS.CreateWorkExperienceUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const enqueueResumeEmbeddingUseCase =
          c.resolve<EnqueueResumeEmbeddingUseCase>(
            TOKENS.EnqueueResumeEmbeddingUseCase,
          );

        return new CreateWorkExperienceUseCase(
          usersRepository,
          workExperienceRepository,
          resumesRepository,
          enqueueResumeEmbeddingUseCase,
        );
      },
    },
  );

  container.register<UpdateWorkExperienceUseCase>(
    TOKENS.UpdateWorkExperienceUseCase,
    {
      useFactory: (c) => {
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const enqueueResumeEmbeddingUseCase =
          c.resolve<EnqueueResumeEmbeddingUseCase>(
            TOKENS.EnqueueResumeEmbeddingUseCase,
          );

        return new UpdateWorkExperienceUseCase(
          workExperienceRepository,
          resumesRepository,
          enqueueResumeEmbeddingUseCase,
        );
      },
    },
  );

  container.register<DeleteWorkExperienceUseCase>(
    TOKENS.DeleteWorkExperienceUseCase,
    {
      useFactory: (c) => {
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const enqueueResumeEmbeddingUseCase =
          c.resolve<EnqueueResumeEmbeddingUseCase>(
            TOKENS.EnqueueResumeEmbeddingUseCase,
          );

        return new DeleteWorkExperienceUseCase(
          workExperienceRepository,
          resumesRepository,
          enqueueResumeEmbeddingUseCase,
        );
      },
    },
  );

  container.register<GetPublicWorkExperiencesByUsernameUseCase>(
    TOKENS.GetPublicWorkExperiencesByUsernameUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );

        return new GetPublicWorkExperiencesByUsernameUseCase(
          usersRepository,
          workExperienceRepository,
        );
      },
    },
  );

  container.register<ParseResumeUseCase>(TOKENS.ParseResumeUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const skillCatalogRepository = c.resolve<ISkillCatalogRepository>(
        TOKENS.SkillCatalogRepository,
      );
      const titleCatalogRepository = c.resolve<ITitleCatalogRepository>(
        TOKENS.TitleCatalogRepository,
      );
      const resumeParsingProvider = c.resolve<IResumeParsingProvider>(
        TOKENS.ResumeParsingProvider,
      );

      const userPreferencesRepository = c.resolve<IUserPreferencesRepository>(
        TOKENS.UserPreferencesRepository,
      );

      return new ParseResumeUseCase(
        usersRepository,
        skillCatalogRepository,
        titleCatalogRepository,
        resumeParsingProvider,
        userPreferencesRepository,
      );
    },
  });

  container.register<ApplyAiResumeImportUseCase>(
    TOKENS.ApplyAiResumeImportUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const resumesRepository = c.resolve<IResumesRepository>(
          TOKENS.ResumesRepository,
        );
        const skillCatalogRepository = c.resolve<ISkillCatalogRepository>(
          TOKENS.SkillCatalogRepository,
        );
        const titleCatalogRepository = c.resolve<ITitleCatalogRepository>(
          TOKENS.TitleCatalogRepository,
        );
        const resumeSkillRepository = c.resolve<IResumeSkillRepository>(
          TOKENS.ResumeSkillRepository,
        );
        const resumeTitleRepository = c.resolve<IResumeTitleRepository>(
          TOKENS.ResumeTitleRepository,
        );
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const enqueueResumeEmbeddingUseCase =
          c.resolve<EnqueueResumeEmbeddingUseCase>(
            TOKENS.EnqueueResumeEmbeddingUseCase,
          );

        return new ApplyAiResumeImportUseCase(
          usersRepository,
          resumesRepository,
          skillCatalogRepository,
          titleCatalogRepository,
          resumeSkillRepository,
          resumeTitleRepository,
          workExperienceRepository,
          enqueueResumeEmbeddingUseCase,
        );
      },
    },
  );

  container.register<CreatePostUseCase>(TOKENS.CreatePostUseCase, {
    useFactory: (c) => {
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
        TOKENS.WorkExperienceRepository,
      );
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new CreatePostUseCase(
        postsRepository,
        usersRepository,
        workExperienceRepository,
        resumesRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<ListMyPostsUseCase>(TOKENS.ListMyPostsUseCase, {
    useFactory: (c) => {
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );

      return new ListMyPostsUseCase(postsRepository);
    },
  });

  container.register<ListPublicPostsUseCase>(TOKENS.ListPublicPostsUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );

      return new ListPublicPostsUseCase(usersRepository, postsRepository);
    },
  });

  container.register<GetPostUseCase>(TOKENS.GetPostUseCase, {
    useFactory: (c) => {
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );

      return new GetPostUseCase(postsRepository);
    },
  });

  container.register<UpdatePostUseCase>(TOKENS.UpdatePostUseCase, {
    useFactory: (c) => {
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
        TOKENS.WorkExperienceRepository,
      );
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new UpdatePostUseCase(
        postsRepository,
        usersRepository,
        workExperienceRepository,
        resumesRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<DeletePostUseCase>(TOKENS.DeletePostUseCase, {
    useFactory: (c) => {
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new DeletePostUseCase(
        postsRepository,
        resumesRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<ApprovePostUseCase>(TOKENS.ApprovePostUseCase, {
    useFactory: (c) => {
      const postsRepository = c.resolve<IPostRepository>(
        TOKENS.PostsRepository,
      );
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );
      const enqueueResumeEmbeddingUseCase =
        c.resolve<EnqueueResumeEmbeddingUseCase>(
          TOKENS.EnqueueResumeEmbeddingUseCase,
        );

      return new ApprovePostUseCase(
        postsRepository,
        resumesRepository,
        enqueueResumeEmbeddingUseCase,
      );
    },
  });

  container.register<GetAgentPolicyUseCase>(TOKENS.GetAgentPolicyUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
        TOKENS.WorkExperienceRepository,
      );

      return new GetAgentPolicyUseCase(
        usersRepository,
        workExperienceRepository,
      );
    },
  });

  container.register<UpdateAgentPolicyUseCase>(
    TOKENS.UpdateAgentPolicyUseCase,
    {
      useFactory: (c) => {
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );

        return new UpdateAgentPolicyUseCase(
          usersRepository,
          workExperienceRepository,
        );
      },
    },
  );

  container.register<GetWorkContextUseCase>(TOKENS.GetWorkContextUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
        TOKENS.WorkExperienceRepository,
      );

      return new GetWorkContextUseCase(
        usersRepository,
        workExperienceRepository,
      );
    },
  });

  container.register<SetWorkExperienceDisclosureUseCase>(
    TOKENS.SetWorkExperienceDisclosureUseCase,
    {
      useFactory: (c) => {
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );

        return new SetWorkExperienceDisclosureUseCase(workExperienceRepository);
      },
    },
  );

  container.register<CreateApiTokenUseCase>(TOKENS.CreateApiTokenUseCase, {
    useFactory: (c) => {
      const apiTokenRepository = c.resolve<IApiTokenRepository>(
        TOKENS.ApiTokenRepository,
      );
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const tokenProvider = c.resolve<ITokenProvider>(TOKENS.TokenProvider);

      return new CreateApiTokenUseCase(
        apiTokenRepository,
        usersRepository,
        tokenProvider,
      );
    },
  });

  container.register<ListApiTokensUseCase>(TOKENS.ListApiTokensUseCase, {
    useFactory: (c) => {
      const apiTokenRepository = c.resolve<IApiTokenRepository>(
        TOKENS.ApiTokenRepository,
      );

      return new ListApiTokensUseCase(apiTokenRepository);
    },
  });

  container.register<RevokeApiTokenUseCase>(TOKENS.RevokeApiTokenUseCase, {
    useFactory: (c) => {
      const apiTokenRepository = c.resolve<IApiTokenRepository>(
        TOKENS.ApiTokenRepository,
      );

      return new RevokeApiTokenUseCase(apiTokenRepository);
    },
  });

  container.register<CreateGitConnectionUseCase>(
    TOKENS.CreateGitConnectionUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        const webhookSecretProvider = c.resolve<IWebhookSecretProvider>(
          TOKENS.WebhookSecretProvider,
        );

        return new CreateGitConnectionUseCase(
          gitConnectionRepository,
          usersRepository,
          webhookSecretProvider,
        );
      },
    },
  );

  container.register<ListGitConnectionsUseCase>(
    TOKENS.ListGitConnectionsUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );

        return new ListGitConnectionsUseCase(gitConnectionRepository);
      },
    },
  );

  container.register<UpdateGitConnectionUseCase>(
    TOKENS.UpdateGitConnectionUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );

        return new UpdateGitConnectionUseCase(gitConnectionRepository);
      },
    },
  );

  container.register<DeleteGitConnectionUseCase>(
    TOKENS.DeleteGitConnectionUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );

        return new DeleteGitConnectionUseCase(gitConnectionRepository);
      },
    },
  );

  container.register<IngestActivityUseCase>(TOKENS.IngestActivityUseCase, {
    useFactory: (c) => {
      const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
        TOKENS.GitConnectionRepository,
      );
      const activityEventRepository = c.resolve<IActivityEventRepository>(
        TOKENS.ActivityEventRepository,
      );
      // Shared with the PAT lookup path on purpose: `hash()` is the one sha-256
      // in the process, so a fingerprint computed here and one computed by the
      // guard can never disagree.
      const tokenProvider = c.resolve<ITokenProvider>(TOKENS.TokenProvider);

      return new IngestActivityUseCase(
        gitConnectionRepository,
        activityEventRepository,
        tokenProvider,
      );
    },
  });

  container.register<GetConnectionHealthUseCase>(
    TOKENS.GetConnectionHealthUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );
        const activityEventRepository = c.resolve<IActivityEventRepository>(
          TOKENS.ActivityEventRepository,
        );

        return new GetConnectionHealthUseCase(
          gitConnectionRepository,
          activityEventRepository,
        );
      },
    },
  );

  container.register<PreviewActivityDigestUseCase>(
    TOKENS.PreviewActivityDigestUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        // NOT optional, for the same reason as on the digest generator: a
        // missing work-experience repository would not degrade to "no
        // enforcement" — it would preview a work connection's text at the
        // account default level.
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const buildCandidateEvidenceUseCase =
          c.resolve<BuildCandidateEvidenceUseCase>(
            TOKENS.BuildCandidateEvidenceUseCase,
          );

        return new PreviewActivityDigestUseCase(
          gitConnectionRepository,
          usersRepository,
          workExperienceRepository,
          buildCandidateEvidenceUseCase,
        );
      },
    },
  );

  container.register<BuildCandidateEvidenceUseCase>(
    TOKENS.BuildCandidateEvidenceUseCase,
    {
      useFactory: (c) => {
        const activityEventRepository = c.resolve<IActivityEventRepository>(
          TOKENS.ActivityEventRepository,
        );

        return new BuildCandidateEvidenceUseCase(activityEventRepository);
      },
    },
  );

  container.register<GenerateActivityDigestUseCase>(
    TOKENS.GenerateActivityDigestUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );
        const postsRepository = c.resolve<IPostRepository>(
          TOKENS.PostsRepository,
        );
        const usersRepository = c.resolve<IUsersRepository>(
          TOKENS.UsersRepository,
        );
        // NOT optional here, unlike on `CreatePostUseCase`. The digest resolves
        // its disclosure level through the work history, so a missing work
        // experience repository would not degrade to "no enforcement" — it
        // would publish a work connection's digest at the account default.
        const workExperienceRepository = c.resolve<IWorkExperienceRepository>(
          TOKENS.WorkExperienceRepository,
        );
        const buildCandidateEvidenceUseCase =
          c.resolve<BuildCandidateEvidenceUseCase>(
            TOKENS.BuildCandidateEvidenceUseCase,
          );
        // Reused rather than writing posts directly, so a digest goes through
        // the same creation path (and the same disclosure check) as an MCP
        // agent's post.
        const createPostUseCase = c.resolve<CreatePostUseCase>(
          TOKENS.CreatePostUseCase,
        );

        return new GenerateActivityDigestUseCase(
          gitConnectionRepository,
          postsRepository,
          usersRepository,
          workExperienceRepository,
          buildCandidateEvidenceUseCase,
          createPostUseCase,
        );
      },
    },
  );

  container.register<SweepDueActivityDigestsUseCase>(
    TOKENS.SweepDueActivityDigestsUseCase,
    {
      useFactory: (c) => {
        const gitConnectionRepository = c.resolve<IGitConnectionRepository>(
          TOKENS.GitConnectionRepository,
        );
        const activityDigestQueue = c.resolve<IActivityDigestQueue>(
          TOKENS.ActivityDigestQueue,
        );

        return new SweepDueActivityDigestsUseCase(
          gitConnectionRepository,
          activityDigestQueue,
        );
      },
    },
  );

  return container;
}

/**
 * Get a singleton instance from the container
 */
export function resolve<T>(token: symbol): T {
  return container.resolve<T>(token);
}
