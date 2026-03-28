import "reflect-metadata";
import { container } from "tsyringe";
import { IUsersRepository } from "../../core/repositories/user/user-repository.js";
import { IRefreshTokenRepository } from "../../core/repositories/refresh-token/refresh-token-repository.js";
import { IOAuthAccountRepository } from "../../core/repositories/oauth-account/oauth-account-repository.js";
import { IHashProvider } from "../../core/providers/hash/hash-provider.js";
import { IJwtProvider } from "../../core/providers/jwt/jwt-provider.js";
import { IGoogleOAuthProvider } from "../../core/providers/oauth/google-oauth-provider.js";
import { ILinkedInOAuthProvider } from "../../core/providers/oauth/linkedin-oauth-provider.js";
import { DrizzleUserRepository } from "../database/drizzle/repositories/user.repository.js";
import { DrizzleRefreshTokenRepository } from "../database/drizzle/repositories/refresh-token.repository.js";
import { DrizzleOAuthAccountRepository } from "../database/drizzle/repositories/oauth-account.repository.js";
import { Argon2HashProvider } from "../providers/argon2-hash-provider.js";
import { JwtProvider } from "../providers/jwt-provider.js";
import { GoogleOAuthProvider } from "../providers/google-oauth-provider.js";
import { LinkedInOAuthProvider } from "../providers/linkedin-oauth-provider.js";
import { CreateUserUseCase } from "../../core/use-case/create-user-use-case/create-user.use-case.js";
import { LoginUseCase } from "../../core/use-case/login-use-case/login.use-case.js";
import { GoogleSignInUseCase } from "../../core/use-case/google-sign-in-use-case/google-sign-in.use-case.js";
import { OAuthSignInUseCase } from "../../core/use-case/oauth-sign-in-use-case/oauth-sign-in.use-case.js";

// Tokens for dependency injection
export const TOKENS = {
  UsersRepository: Symbol.for("UsersRepository"),
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
} as const;

/**
 * Configure and register all dependencies in the DI container
 */
export function setupContainer() {
  // Register repositories
  container.register<IUsersRepository>(TOKENS.UsersRepository, {
    useClass: DrizzleUserRepository,
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

  return container;
}

/**
 * Get a singleton instance from the container
 */
export function resolve<T>(token: symbol): T {
  return container.resolve<T>(token);
}
