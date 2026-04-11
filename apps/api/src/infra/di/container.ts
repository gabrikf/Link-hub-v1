import "reflect-metadata";
import { container } from "tsyringe";
import { IUsersRepository } from "../../core/repositories/user/user-repository.js";
import { ILinksRepository } from "../../core/repositories/link/link-repository.js";
import { IRefreshTokenRepository } from "../../core/repositories/refresh-token/refresh-token-repository.js";
import { IOAuthAccountRepository } from "../../core/repositories/oauth-account/oauth-account-repository.js";
import { IResumesRepository } from "../../core/repositories/resume/resume-repository.js";
import { ISkillCatalogRepository } from "../../core/repositories/skill-catalog/skill-catalog-repository.js";
import { ITitleCatalogRepository } from "../../core/repositories/title-catalog/title-catalog-repository.js";
import { IResumeSkillRepository } from "../../core/repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../core/repositories/resume-title/resume-title-repository.js";
import { IHashProvider } from "../../core/providers/hash/hash-provider.js";
import { IJwtProvider } from "../../core/providers/jwt/jwt-provider.js";
import { IGoogleOAuthProvider } from "../../core/providers/oauth/google-oauth-provider.js";
import { ILinkedInOAuthProvider } from "../../core/providers/oauth/linkedin-oauth-provider.js";
import { DrizzleUserRepository } from "../database/drizzle/repositories/user.repository.js";
import { DrizzleLinksRepository } from "../database/drizzle/repositories/link.repository.js";
import { DrizzleRefreshTokenRepository } from "../database/drizzle/repositories/refresh-token.repository.js";
import { DrizzleOAuthAccountRepository } from "../database/drizzle/repositories/oauth-account.repository.js";
import { DrizzleResumesRepository } from "../database/drizzle/repositories/resume.repository.js";
import { DrizzleSkillCatalogRepository } from "../database/drizzle/repositories/skill-catalog.repository.js";
import { DrizzleTitleCatalogRepository } from "../database/drizzle/repositories/title-catalog.repository.js";
import { DrizzleResumeSkillRepository } from "../database/drizzle/repositories/resume-skill.repository.js";
import { DrizzleResumeTitleRepository } from "../database/drizzle/repositories/resume-title.repository.js";
import { Argon2HashProvider } from "../providers/argon2-hash-provider.js";
import { JwtProvider } from "../providers/jwt-provider.js";
import { GoogleOAuthProvider } from "../providers/google-oauth-provider.js";
import { LinkedInOAuthProvider } from "../providers/linkedin-oauth-provider.js";
import { CreateUserUseCase } from "../../core/use-case/auth/create-user-use-case/create-user.use-case.js";
import { LoginUseCase } from "../../core/use-case/auth/login-use-case/login.use-case.js";
import { GoogleSignInUseCase } from "../../core/use-case/auth/google-sign-in-use-case/google-sign-in.use-case.js";
import { OAuthSignInUseCase } from "../../core/use-case/auth/oauth-sign-in-use-case/oauth-sign-in.use-case.js";
import { ListUserLinksUseCase } from "../../core/use-case/links/list-user-links-use-case/list-user-links.use-case.js";
import { GetLinkByIdUseCase } from "../../core/use-case/links/get-link-by-id-use-case/get-link-by-id.use-case.js";
import { CreateLinkUseCase } from "../../core/use-case/links/create-link-use-case/create-link.use-case.js";
import { UpdateLinkUseCase } from "../../core/use-case/links/update-link-use-case/update-link.use-case.js";
import { DeleteLinkUseCase } from "../../core/use-case/links/delete-link-use-case/delete-link.use-case.js";
import { ReorderLinksUseCase } from "../../core/use-case/links/reorder-links-use-case/reorder-links.use-case.js";
import { ToggleLinkVisibilityUseCase } from "../../core/use-case/links/toggle-link-visibility-use-case/toggle-link-visibility.use-case.js";
import { GetPublicProfileUseCase } from "../../core/use-case/profiles/get-public-profile-use-case/get-public-profile.use-case.js";
import { GetMeProfileUseCase } from "../../core/use-case/profiles/get-me-profile-use-case/get-me-profile.use-case.js";
import { UpdateProfileUseCase } from "../../core/use-case/profiles/update-profile-use-case/update-profile.use-case.js";
import { GetMyResumeUseCase } from "../../core/use-case/resumes/get-my-resume-use-case/get-my-resume.use-case.js";
import { UpsertMyResumeUseCase } from "../../core/use-case/resumes/upsert-my-resume-use-case/upsert-my-resume.use-case.js";
import { ListSkillsCatalogUseCase } from "../../core/use-case/resumes/list-skills-catalog-use-case/list-skills-catalog.use-case.js";
import { CreateCustomSkillUseCase } from "../../core/use-case/resumes/create-custom-skill-use-case/create-custom-skill.use-case.js";
import { AddSkillToResumeUseCase } from "../../core/use-case/resumes/add-skill-to-resume-use-case/add-skill-to-resume.use-case.js";
import { ListTitlesCatalogUseCase } from "../../core/use-case/resumes/list-titles-catalog-use-case/list-titles-catalog.use-case.js";
import { CreateCustomTitleUseCase } from "../../core/use-case/resumes/create-custom-title-use-case/create-custom-title.use-case.js";
import { AddTitleToResumeUseCase } from "../../core/use-case/resumes/add-title-to-resume-use-case/add-title-to-resume.use-case.js";
import { GetPublicResumeByUsernameUseCase } from "../../core/use-case/resumes/get-public-resume-by-username-use-case/get-public-resume-by-username.use-case.js";

// Tokens for dependency injection
export const TOKENS = {
  UsersRepository: Symbol.for("UsersRepository"),
  LinksRepository: Symbol.for("LinksRepository"),
  RefreshTokenRepository: Symbol.for("RefreshTokenRepository"),
  OAuthAccountRepository: Symbol.for("OAuthAccountRepository"),
  ResumesRepository: Symbol.for("ResumesRepository"),
  SkillCatalogRepository: Symbol.for("SkillCatalogRepository"),
  TitleCatalogRepository: Symbol.for("TitleCatalogRepository"),
  ResumeSkillRepository: Symbol.for("ResumeSkillRepository"),
  ResumeTitleRepository: Symbol.for("ResumeTitleRepository"),
  HashProvider: Symbol.for("HashProvider"),
  JwtProvider: Symbol.for("JwtProvider"),
  GoogleOAuthProvider: Symbol.for("GoogleOAuthProvider"),
  LinkedInOAuthProvider: Symbol.for("LinkedInOAuthProvider"),
  CreateUserUseCase: Symbol.for("CreateUserUseCase"),
  LoginUseCase: Symbol.for("LoginUseCase"),
  OAuthSignInUseCase: Symbol.for("OAuthSignInUseCase"),
  GoogleSignInUseCase: Symbol.for("GoogleSignInUseCase"),
  ListUserLinksUseCase: Symbol.for("ListUserLinksUseCase"),
  GetLinkByIdUseCase: Symbol.for("GetLinkByIdUseCase"),
  CreateLinkUseCase: Symbol.for("CreateLinkUseCase"),
  UpdateLinkUseCase: Symbol.for("UpdateLinkUseCase"),
  DeleteLinkUseCase: Symbol.for("DeleteLinkUseCase"),
  ReorderLinksUseCase: Symbol.for("ReorderLinksUseCase"),
  ToggleLinkVisibilityUseCase: Symbol.for("ToggleLinkVisibilityUseCase"),
  GetPublicProfileUseCase: Symbol.for("GetPublicProfileUseCase"),
  GetMeProfileUseCase: Symbol.for("GetMeProfileUseCase"),
  UpdateProfileUseCase: Symbol.for("UpdateProfileUseCase"),
  GetMyResumeUseCase: Symbol.for("GetMyResumeUseCase"),
  UpsertMyResumeUseCase: Symbol.for("UpsertMyResumeUseCase"),
  ListSkillsCatalogUseCase: Symbol.for("ListSkillsCatalogUseCase"),
  CreateCustomSkillUseCase: Symbol.for("CreateCustomSkillUseCase"),
  AddSkillToResumeUseCase: Symbol.for("AddSkillToResumeUseCase"),
  ListTitlesCatalogUseCase: Symbol.for("ListTitlesCatalogUseCase"),
  CreateCustomTitleUseCase: Symbol.for("CreateCustomTitleUseCase"),
  AddTitleToResumeUseCase: Symbol.for("AddTitleToResumeUseCase"),
  GetPublicResumeByUsernameUseCase: Symbol.for(
    "GetPublicResumeByUsernameUseCase",
  ),
} as const;

/**
 * Configure and register all dependencies in the DI container
 */
export function setupContainer() {
  // Register repositories
  container.register<IUsersRepository>(TOKENS.UsersRepository, {
    useClass: DrizzleUserRepository,
  });

  container.register<ILinksRepository>(TOKENS.LinksRepository, {
    useClass: DrizzleLinksRepository,
  });

  container.register<IRefreshTokenRepository>(TOKENS.RefreshTokenRepository, {
    useClass: DrizzleRefreshTokenRepository,
  });

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

  // Register providers
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
      const refreshTokenRepository = c.resolve<IRefreshTokenRepository>(
        TOKENS.RefreshTokenRepository,
      );
      const hashProvider = c.resolve<IHashProvider>(TOKENS.HashProvider);
      const jwtProvider = c.resolve<IJwtProvider>(TOKENS.JwtProvider);

      // Simple validator that passes through (Zod validation happens at controller level)
      const validator = (input: unknown) => input as any;

      return new CreateUserUseCase(
        usersRepository,
        refreshTokenRepository,
        hashProvider,
        jwtProvider,
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
      const validator = (input: unknown) => input as any;

      return new LoginUseCase(
        usersRepository,
        refreshTokenRepository,
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

      const validator = (input: unknown) => input as any;

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

      const validator = (input: unknown) => input as any;

      return new GoogleSignInUseCase(
        googleOAuthProvider,
        oauthSignInUseCase,
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

  container.register<GetPublicProfileUseCase>(TOKENS.GetPublicProfileUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const linksRepository = c.resolve<ILinksRepository>(
        TOKENS.LinksRepository,
      );

      return new GetPublicProfileUseCase(usersRepository, linksRepository);
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

  container.register<UpdateProfileUseCase>(TOKENS.UpdateProfileUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );

      return new UpdateProfileUseCase(usersRepository);
    },
  });

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

  container.register<UpsertMyResumeUseCase>(TOKENS.UpsertMyResumeUseCase, {
    useFactory: (c) => {
      const usersRepository = c.resolve<IUsersRepository>(
        TOKENS.UsersRepository,
      );
      const resumesRepository = c.resolve<IResumesRepository>(
        TOKENS.ResumesRepository,
      );

      return new UpsertMyResumeUseCase(usersRepository, resumesRepository);
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

      return new AddSkillToResumeUseCase(
        resumesRepository,
        skillCatalogRepository,
        resumeSkillRepository,
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

      return new AddTitleToResumeUseCase(
        resumesRepository,
        titleCatalogRepository,
        resumeTitleRepository,
      );
    },
  });

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

  return container;
}

/**
 * Get a singleton instance from the container
 */
export function resolve<T>(token: symbol): T {
  return container.resolve<T>(token);
}
