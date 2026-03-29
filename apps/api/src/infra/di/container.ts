import "reflect-metadata";
import { container } from "tsyringe";
import { IUsersRepository } from "../../core/repositories/user/user-repository.js";
import { ILinksRepository } from "../../core/repositories/link/link-repository.js";
import { IRefreshTokenRepository } from "../../core/repositories/refresh-token/refresh-token-repository.js";
import { IOAuthAccountRepository } from "../../core/repositories/oauth-account/oauth-account-repository.js";
import { IHashProvider } from "../../core/providers/hash/hash-provider.js";
import { IJwtProvider } from "../../core/providers/jwt/jwt-provider.js";
import { IGoogleOAuthProvider } from "../../core/providers/oauth/google-oauth-provider.js";
import { ILinkedInOAuthProvider } from "../../core/providers/oauth/linkedin-oauth-provider.js";
import { DrizzleUserRepository } from "../database/drizzle/repositories/user.repository.js";
import { DrizzleLinksRepository } from "../database/drizzle/repositories/link.repository.js";
import { DrizzleRefreshTokenRepository } from "../database/drizzle/repositories/refresh-token.repository.js";
import { DrizzleOAuthAccountRepository } from "../database/drizzle/repositories/oauth-account.repository.js";
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

// Tokens for dependency injection
export const TOKENS = {
  UsersRepository: Symbol.for("UsersRepository"),
  LinksRepository: Symbol.for("LinksRepository"),
  RefreshTokenRepository: Symbol.for("RefreshTokenRepository"),
  OAuthAccountRepository: Symbol.for("OAuthAccountRepository"),
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

  return container;
}

/**
 * Get a singleton instance from the container
 */
export function resolve<T>(token: symbol): T {
  return container.resolve<T>(token);
}
