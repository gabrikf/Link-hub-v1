import { FastifyInstance } from "fastify";
import { resolve, TOKENS } from "../../../di/container.js";
import { ILinkedInOAuthProvider } from "../../../../core/providers/oauth/linkedin-oauth-provider.js";
import { OAuthSignInUseCase } from "../../../../core/use-case/auth/oauth-sign-in-use-case/oauth-sign-in.use-case.js";

const LINKEDIN_STATE_COOKIE = "linkhub.linkedin.oauth.state";
const OAUTH_STATE_TTL_SECONDS = 60 * 10;

const readWebAppUrl = (): string => {
  const configuredWebAppUrl = process.env.WEB_APP_URL;

  if (!configuredWebAppUrl || configuredWebAppUrl.length === 0) {
    throw new Error("WEB_APP_URL is required");
  }

  return configuredWebAppUrl;
};

const buildFrontEndRedirectUrl = (
  params: Record<string, string>,
  webAppUrl: string,
): string => {
  const redirectTarget = new URL("/", webAppUrl);

  Object.entries(params).forEach(([key, value]) => {
    redirectTarget.searchParams.set(key, value);
  });

  return redirectTarget.toString();
};

export class LinkedInSignInController {
  static async handle(server: FastifyInstance) {
    server.get(
      "/linkedin",
      {
        schema: {
          tags: ["Auth"],
          summary: "Start LinkedIn sign-in",
          description: "Redirects to LinkedIn OAuth consent screen",
          response: {
            302: {
              type: "null",
              description: "Redirects to LinkedIn",
            },
          },
        },
      },
      async (_request, reply) => {
        const linkedInOAuthProvider = resolve<ILinkedInOAuthProvider>(
          TOKENS.LinkedInOAuthProvider,
        );

        const state = crypto.randomUUID();
        reply.setCookie(LINKEDIN_STATE_COOKIE, state, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: OAUTH_STATE_TTL_SECONDS,
        });

        return reply.redirect(
          linkedInOAuthProvider.buildAuthorizationUrl(state),
        );
      },
    );

    server.get(
      "/linkedin/callback",
      {
        schema: {
          tags: ["Auth"],
          summary: "LinkedIn OAuth callback",
          description: "Handles LinkedIn OAuth callback and signs in user",
          response: {
            302: {
              type: "null",
              description: "Redirects to web app with OAuth result",
            },
          },
        },
      },
      async (request, reply) => {
        const webAppUrl = readWebAppUrl();
        const query =
          typeof request.query === "object" && request.query !== null
            ? (request.query as Record<string, string>)
            : {};
        const code = query.code;
        const state = query.state;
        const linkedInError = query.error;
        const linkedInErrorDescription = query.error_description;

        if (linkedInError) {
          const redirectUrl = buildFrontEndRedirectUrl(
            {
              oauthProvider: "linkedin",
              oauthError: linkedInErrorDescription || linkedInError,
            },
            webAppUrl,
          );

          return reply.redirect(redirectUrl);
        }

        const cookieState = request.cookies[LINKEDIN_STATE_COOKIE];

        if (!code || !state || !cookieState || state !== cookieState) {
          const redirectUrl = buildFrontEndRedirectUrl(
            {
              oauthProvider: "linkedin",
              oauthError: "Invalid LinkedIn OAuth state",
            },
            webAppUrl,
          );

          return reply.redirect(redirectUrl);
        }

        reply.clearCookie(LINKEDIN_STATE_COOKIE, { path: "/" });

        const linkedInOAuthProvider = resolve<ILinkedInOAuthProvider>(
          TOKENS.LinkedInOAuthProvider,
        );
        const oauthSignInUseCase = resolve<OAuthSignInUseCase>(
          TOKENS.OAuthSignInUseCase,
        );

        try {
          const linkedInUser =
            await linkedInOAuthProvider.getUserFromAuthorizationCode(code);

          const result = await oauthSignInUseCase.execute({
            provider: "linkedin",
            providerAccountId: linkedInUser.linkedInId,
            email: linkedInUser.email,
            name: linkedInUser.name,
            avatarUrl: linkedInUser.avatarUrl,
            emailVerified: linkedInUser.emailVerified,
          });

          const redirectUrl = buildFrontEndRedirectUrl(
            {
              oauthProvider: "linkedin",
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              user: Buffer.from(JSON.stringify(result.user), "utf8").toString(
                "base64url",
              ),
            },
            webAppUrl,
          );

          return reply.redirect(redirectUrl);
        } catch (error) {
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "LinkedIn sign-in failed";

          const redirectUrl = buildFrontEndRedirectUrl(
            {
              oauthProvider: "linkedin",
              oauthError: message,
            },
            webAppUrl,
          );

          return reply.redirect(redirectUrl);
        }
      },
    );
  }
}
