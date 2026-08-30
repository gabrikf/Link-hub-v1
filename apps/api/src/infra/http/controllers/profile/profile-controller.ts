import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  profileSchema,
  updateProfileSchemaInput,
  updateProfileSchemaOutput,
  usernameAvailabilityQuerySchema,
  usernameAvailabilitySchema,
  type ProfileAppearance,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { GetPublicProfileUseCase } from "../../../../core/use-case/profiles/get-public-profile-use-case/get-public-profile.use-case.js";
import { CheckUsernameAvailabilityUseCase } from "../../../../core/use-case/profiles/check-username-availability-use-case/check-username-availability.use-case.js";
import { GetMeProfileUseCase } from "../../../../core/use-case/profiles/get-me-profile-use-case/get-me-profile.use-case.js";
import { UpdateProfileUseCase } from "../../../../core/use-case/profiles/update-profile-use-case/update-profile.use-case.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { IJwtProvider } from "../../../../core/providers/jwt/jwt-provider.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { profilesPublishedTotal } from "../../../observability/metrics.js";

/**
 * The viewer's id when the request happens to carry a valid session, and
 * `undefined` otherwise.
 *
 * Deliberately NOT `authGuard`: that middleware's job is to REFUSE, and this
 * route must answer an anonymous caller. Every failure here — no header, a
 * malformed one, a signature that does not verify, an expired token — resolves
 * to "anonymous", because none of them changes whether the handle is free.
 */
async function readOptionalViewerId(
  request: FastifyRequest,
): Promise<string | undefined> {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    return undefined;
  }

  try {
    const jwtProvider = resolve<IJwtProvider>(TOKENS.JwtProvider);
    const payload = await jwtProvider.verify(token);
    const sub =
      payload && typeof payload === "object" && "sub" in payload
        ? payload.sub
        : undefined;

    return typeof sub === "string" && sub.length > 0 ? sub : undefined;
  } catch {
    return undefined;
  }
}

export class ProfileController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/profile/:username",
      {
        schema: {
          tags: ["Profile"],
          summary: "Get public profile",
          response: {
            200: profileSchema,
            ...commonErrorResponses(["notFound", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Params: { username: string } }>,
        reply,
      ) => {
        const getPublicProfileUseCase = resolve<GetPublicProfileUseCase>(
          TOKENS.GetPublicProfileUseCase,
        );

        const result = await getPublicProfileUseCase.execute(
          request.params.username,
        );

        reply.status(200).send(result);
      },
    );

    /**
     * Declared BEFORE `/profile/:username` for readability only — Fastify's
     * radix router ranks the static segment above the parameter regardless, so
     * this can never be swallowed by a profile lookup.
     *
     * NO GUARD, and the leak that implies is already public: `GET
     * /profile/:username` tells any stranger whether a handle exists. What this
     * adds over that endpoint is the reserved-name verdict, which is a constant
     * shipped in the browser bundle. The register form needs it with no session
     * at all, so requiring one would leave the form that creates the collision
     * unable to warn about it.
     *
     * It DOES read the bearer token when there is one, and only to answer the
     * one question an anonymous check gets wrong: a person editing their
     * profile must not be told their own handle is taken. Missing, malformed or
     * expired credentials are ignored rather than rejected — the answer is
     * simply the anonymous one.
     */
    app.get(
      "/username-available",
      {
        /**
         * A per-IP ceiling, because this route is a cheaper existence oracle
         * than the one it sits next to. `GET /profile/:username` already tells
         * a stranger whether a handle exists — so this leaks nothing new — but
         * that endpoint assembles links, tabs and two viewports of blocks per
         * call, while this is one indexed lookup and ~80 bytes. Enumerating the
         * whole handle namespace through it would be materially cheaper, and
         * the global limit alone treats it like any other read.
         *
         * 60 in a minute is far above a person typing (the browser debounces to
         * roughly one request per handle) and far below a useful sweep. Inert
         * when @fastify/rate-limit is not registered — as in the hermetic test
         * app — which is why the number is generous rather than tight.
         */
        config: {
          rateLimit: {
            max: 60,
            timeWindow: "1 minute",
          },
        },
        schema: {
          tags: ["Profile"],
          summary: "Check whether a username can be claimed",
          querystring: usernameAvailabilityQuerySchema,
          response: {
            200: usernameAvailabilitySchema,
            ...commonErrorResponses(["badRequest", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Querystring: { username: string } }>,
        reply,
      ) => {
        const checkUsernameAvailabilityUseCase =
          resolve<CheckUsernameAvailabilityUseCase>(
            TOKENS.CheckUsernameAvailabilityUseCase,
          );

        const result = await checkUsernameAvailabilityUseCase.execute(
          request.query.username,
          await readOptionalViewerId(request),
        );

        reply.status(200).send(result);
      },
    );

    app.get(
      "/me",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile"],
          summary: "Get current user profile",
          response: {
            200: profileSchema,
            ...commonErrorResponses([
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const getMeProfileUseCase = resolve<GetMeProfileUseCase>(
          TOKENS.GetMeProfileUseCase,
        );

        const result = await getMeProfileUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.put(
      "/profile",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile"],
          summary: "Update current user profile",
          body: updateProfileSchemaInput,
          response: {
            200: updateProfileSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "conflict",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            username: string;
            name?: string;
            description?: string | null;
            userPhoto?: string | null;
            backgroundImageUrl?: string | null;
            bannerImageUrl?: string | null;
            themeAccent?: string | null;
            themePreset?: string | null;
            appearance?: ProfileAppearance;
            openToWork?: boolean;
            location?: string | null;
            persona?: string | null;
            personaOther?: string | null;
          };
        }>,
        reply,
      ) => {
        const updateProfileUseCase = resolve<UpdateProfileUseCase>(
          TOKENS.UpdateProfileUseCase,
        );

        const result = await updateProfileUseCase.execute({
          userId: request.user!.id,
          username: request.body.username,
          name: request.body.name,
          description: request.body.description,
          userPhoto: request.body.userPhoto,
          backgroundImageUrl: request.body.backgroundImageUrl,
          bannerImageUrl: request.body.bannerImageUrl,
          themeAccent: request.body.themeAccent,
          themePreset: request.body.themePreset,
          appearance: request.body.appearance,
          openToWork: request.body.openToWork,
          location: request.body.location,
          persona: request.body.persona,
          personaOther: request.body.personaOther,
        });

        /**
         * "Profile published" in the funnel sense. There is no separate publish
         * route — a CraftHub profile is public as soon as it has a username, and
         * `PUT /profile` is the only way to set or change one. So this counts
         * profile publishes AND subsequent edits; read it as "profile write
         * activity", not as distinct users who have ever published.
         */
        profilesPublishedTotal.add(1);

        reply.status(200).send(result);
      },
    );
  }
}
