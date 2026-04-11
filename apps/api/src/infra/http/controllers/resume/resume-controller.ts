import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  addResumeSkillInputSchema,
  addResumeTitleInputSchema,
  catalogItemSchema,
  createCatalogItemInputSchema,
  publicResumeSchema,
  resumeSchema,
  resumeSkillSchema,
  resumeTitleSchema,
  upsertResumeInputSchema,
  usernameParamsSchema,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { GetMyResumeUseCase } from "../../../../core/use-case/resumes/get-my-resume-use-case/get-my-resume.use-case.js";
import { UpsertMyResumeUseCase } from "../../../../core/use-case/resumes/upsert-my-resume-use-case/upsert-my-resume.use-case.js";
import { ListSkillsCatalogUseCase } from "../../../../core/use-case/resumes/list-skills-catalog-use-case/list-skills-catalog.use-case.js";
import { CreateCustomSkillUseCase } from "../../../../core/use-case/resumes/create-custom-skill-use-case/create-custom-skill.use-case.js";
import { AddSkillToResumeUseCase } from "../../../../core/use-case/resumes/add-skill-to-resume-use-case/add-skill-to-resume.use-case.js";
import { ListTitlesCatalogUseCase } from "../../../../core/use-case/resumes/list-titles-catalog-use-case/list-titles-catalog.use-case.js";
import { CreateCustomTitleUseCase } from "../../../../core/use-case/resumes/create-custom-title-use-case/create-custom-title.use-case.js";
import { AddTitleToResumeUseCase } from "../../../../core/use-case/resumes/add-title-to-resume-use-case/add-title-to-resume.use-case.js";
import { GetPublicResumeByUsernameUseCase } from "../../../../core/use-case/resumes/get-public-resume-by-username-use-case/get-public-resume-by-username.use-case.js";

export class ResumeController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/resume",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Get current user resume",
          response: {
            200: resumeSchema,
            ...commonErrorResponses([
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const getMyResumeUseCase = resolve<GetMyResumeUseCase>(
          TOKENS.GetMyResumeUseCase,
        );

        const result = await getMyResumeUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.put(
      "/me/resume",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Create or update current user resume",
          body: upsertResumeInputSchema,
          response: {
            200: resumeSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            headlineTitle?: string | null;
            summary?: string | null;
            totalYearsExperience?: number | null;
            location?: string | null;
            seniorityLevel?:
              | "intern"
              | "junior"
              | "mid"
              | "senior"
              | "staff"
              | "principal"
              | null;
            workModel?: "remote" | "hybrid" | "on-site" | null;
            contractType?:
              | "clt"
              | "pj"
              | "freelance"
              | "contract"
              | "full-time"
              | "part-time"
              | null;
            salaryExpectationMin?: number | null;
            salaryExpectationMax?: number | null;
            spokenLanguages?: string[];
            noticePeriod?: string | null;
            openToRelocation?: boolean;
          };
        }>,
        reply,
      ) => {
        const upsertMyResumeUseCase = resolve<UpsertMyResumeUseCase>(
          TOKENS.UpsertMyResumeUseCase,
        );
        const getMyResumeUseCase = resolve<GetMyResumeUseCase>(
          TOKENS.GetMyResumeUseCase,
        );

        await upsertMyResumeUseCase.execute({
          userId: request.user!.id,
          ...request.body,
        });

        const result = await getMyResumeUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.get(
      "/resume/catalog/skills",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "List default and custom skills",
          response: {
            200: catalogItemSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const listSkillsCatalogUseCase = resolve<ListSkillsCatalogUseCase>(
          TOKENS.ListSkillsCatalogUseCase,
        );

        const result = await listSkillsCatalogUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.post(
      "/resume/catalog/skills",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Create custom skill",
          body: createCatalogItemInputSchema,
          response: {
            201: catalogItemSchema,
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
            name: string;
          };
        }>,
        reply,
      ) => {
        const createCustomSkillUseCase = resolve<CreateCustomSkillUseCase>(
          TOKENS.CreateCustomSkillUseCase,
        );

        const result = await createCustomSkillUseCase.execute({
          userId: request.user!.id,
          name: request.body.name,
        });

        reply.status(201).send(result);
      },
    );

    app.post(
      "/resume/skills",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Add skill to current resume",
          body: addResumeSkillInputSchema,
          response: {
            201: resumeSkillSchema,
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
            skillId: string;
            yearsExperience?: number | null;
          };
        }>,
        reply,
      ) => {
        const addSkillToResumeUseCase = resolve<AddSkillToResumeUseCase>(
          TOKENS.AddSkillToResumeUseCase,
        );

        const result = await addSkillToResumeUseCase.execute({
          userId: request.user!.id,
          skillId: request.body.skillId,
          yearsExperience: request.body.yearsExperience,
        });

        reply.status(201).send(result);
      },
    );

    app.get(
      "/resume/catalog/titles",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "List default and custom titles",
          response: {
            200: catalogItemSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const listTitlesCatalogUseCase = resolve<ListTitlesCatalogUseCase>(
          TOKENS.ListTitlesCatalogUseCase,
        );

        const result = await listTitlesCatalogUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.post(
      "/resume/catalog/titles",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Create custom title",
          body: createCatalogItemInputSchema,
          response: {
            201: catalogItemSchema,
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
            name: string;
          };
        }>,
        reply,
      ) => {
        const createCustomTitleUseCase = resolve<CreateCustomTitleUseCase>(
          TOKENS.CreateCustomTitleUseCase,
        );

        const result = await createCustomTitleUseCase.execute({
          userId: request.user!.id,
          name: request.body.name,
        });

        reply.status(201).send(result);
      },
    );

    app.post(
      "/resume/titles",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Add title to current resume",
          body: addResumeTitleInputSchema,
          response: {
            201: resumeTitleSchema,
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
            titleId: string;
            isPrimary?: boolean;
          };
        }>,
        reply,
      ) => {
        const addTitleToResumeUseCase = resolve<AddTitleToResumeUseCase>(
          TOKENS.AddTitleToResumeUseCase,
        );

        const result = await addTitleToResumeUseCase.execute({
          userId: request.user!.id,
          titleId: request.body.titleId,
          isPrimary: request.body.isPrimary,
        });

        reply.status(201).send(result);
      },
    );

    app.get(
      "/profile/:username/resume",
      {
        schema: {
          tags: ["Resume"],
          summary: "Get public resume by username",
          params: usernameParamsSchema,
          response: {
            200: publicResumeSchema,
            ...commonErrorResponses(["notFound", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: {
            username: string;
          };
        }>,
        reply,
      ) => {
        const getPublicResumeByUsernameUseCase =
          resolve<GetPublicResumeByUsernameUseCase>(
            TOKENS.GetPublicResumeByUsernameUseCase,
          );

        const result = await getPublicResumeByUsernameUseCase.execute(
          request.params.username,
        );

        reply.status(200).send(result);
      },
    );
  }
}
