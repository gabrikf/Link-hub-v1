import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  addResumeSkillInputSchema,
  addResumeTitleInputSchema,
  bulkResumeSkillsInputSchema,
  bulkResumeTitlesInputSchema,
  candidateContactSchema,
  catalogItemSchema,
  createCatalogItemInputSchema,
  publicResumeSchema,
  recruiterSearchInputSchema,
  recruiterSearchResponseSchema,
  resumeSchema,
  resumeSkillSchema,
  resumeTitleSchema,
  revealCandidateContactInputSchema,
  revealCandidateContactParamsSchema,
  searchSourceSchema,
  upsertResumeInputSchema,
  usernameParamsSchema,
  type SearchSource,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { aiQuotaGuard } from "../../middleware/ai-quota-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { searchesTotal } from "../../../observability/metrics.js";
import { extractSearchAttachmentText } from "../../utils/extract-search-attachment-text.js";
import { GetMyResumeUseCase } from "../../../../core/use-case/resumes/get-my-resume-use-case/get-my-resume.use-case.js";
import { UpsertMyResumeUseCase } from "../../../../core/use-case/resumes/upsert-my-resume-use-case/upsert-my-resume.use-case.js";
import { ListSkillsCatalogUseCase } from "../../../../core/use-case/resumes/list-skills-catalog-use-case/list-skills-catalog.use-case.js";
import { CreateCustomSkillUseCase } from "../../../../core/use-case/resumes/create-custom-skill-use-case/create-custom-skill.use-case.js";
import { AddSkillToResumeUseCase } from "../../../../core/use-case/resumes/add-skill-to-resume-use-case/add-skill-to-resume.use-case.js";
import { ListTitlesCatalogUseCase } from "../../../../core/use-case/resumes/list-titles-catalog-use-case/list-titles-catalog.use-case.js";
import { CreateCustomTitleUseCase } from "../../../../core/use-case/resumes/create-custom-title-use-case/create-custom-title.use-case.js";
import { AddTitleToResumeUseCase } from "../../../../core/use-case/resumes/add-title-to-resume-use-case/add-title-to-resume.use-case.js";
import { GetPublicResumeByUsernameUseCase } from "../../../../core/use-case/resumes/get-public-resume-by-username-use-case/get-public-resume-by-username.use-case.js";
import { SaveResumeSkillsBulkUseCase } from "../../../../core/use-case/resumes/save-resume-skills-bulk-use-case/save-resume-skills-bulk.use-case.js";
import { SaveResumeTitlesBulkUseCase } from "../../../../core/use-case/resumes/save-resume-titles-bulk-use-case/save-resume-titles-bulk.use-case.js";
import { TransformRecruiterSearchInputUseCase } from "../../../../core/use-case/resumes/transform-recruiter-search-input-use-case/transform-recruiter-search-input.use-case.js";
import { RevealCandidateContactUseCase } from "../../../../core/use-case/resumes/reveal-candidate-contact-use-case/reveal-candidate-contact.use-case.js";

// NOTE: the search response schema is imported from @repo/schemas, not
// redeclared here. A local copy used to shadow it, and because Fastify
// serialises the reply *through the schema*, every field added to the shared
// schema (`sourceSimilarity`, most recently) was silently stripped off the wire
// while the types said it was there (defect F30).

function parseStringArrayField(raw?: unknown): string[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }

  const asString = String(raw).trim();
  if (!asString) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(asString) as unknown;
    if (!Array.isArray(parsed)) {
      return asString
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return asString
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}

function parseObjectField(raw?: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  const asString = String(raw).trim();
  if (!asString) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(asString) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseTopK(raw?: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }

  const parsed = Number(String(raw));
  if (!Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

/**
 * `sources` arrives as a real array over JSON but as a comma-separated string
 * over multipart, and an unknown value must not 400 the whole search — an
 * unrecognised source is dropped and the search falls back to the blended
 * vector, which is the safe default.
 */
function parseSourcesField(raw?: unknown): SearchSource[] | undefined {
  const values = parseStringArrayField(raw);

  if (!values) {
    return undefined;
  }

  const parsed = values.flatMap((value) => {
    const result = searchSourceSchema.safeParse(value.trim());
    return result.success ? [result.data] : [];
  });

  return parsed.length > 0 ? parsed : undefined;
}

function normalizeSearchInputBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...body,
    semanticSkills: parseStringArrayField(body.semanticSkills),
    semanticTitles: parseStringArrayField(body.semanticTitles),
    topK: parseTopK(body.topK),
    sources: parseSourcesField(body.sources),
    whereQuery: parseObjectField(body.whereQuery),
    filters: parseObjectField(body.filters),
  };
}

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

    app.put(
      "/resume/skills/bulk",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Replace all skills in current resume",
          body: bulkResumeSkillsInputSchema,
          response: {
            200: resumeSkillSchema.array(),
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
            items: Array<{
              skillId: string;
              yearsExperience?: number | null;
            }>;
          };
        }>,
        reply,
      ) => {
        const saveResumeSkillsBulkUseCase =
          resolve<SaveResumeSkillsBulkUseCase>(
            TOKENS.SaveResumeSkillsBulkUseCase,
          );

        const result = await saveResumeSkillsBulkUseCase.execute({
          userId: request.user!.id,
          items: request.body.items,
        });

        reply.status(200).send(result);
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

    app.put(
      "/resume/titles/bulk",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Replace all titles in current resume",
          body: bulkResumeTitlesInputSchema,
          response: {
            200: resumeTitleSchema.array(),
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
            items: Array<{
              titleId: string;
              isPrimary?: boolean;
            }>;
          };
        }>,
        reply,
      ) => {
        const saveResumeTitlesBulkUseCase =
          resolve<SaveResumeTitlesBulkUseCase>(
            TOKENS.SaveResumeTitlesBulkUseCase,
          );

        const result = await saveResumeTitlesBulkUseCase.execute({
          userId: request.user!.id,
          items: request.body.items,
        });

        reply.status(200).send(result);
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

    app.post(
      "/resumes/search",
      {
        // Quota-guarded: every search converts the recruiter's prompt with a
        // model call and then embeds it.
        preHandler: [authGuard, aiQuotaGuard("recruiter_search")],
        schema: {
          tags: ["Resume"],
          summary: "Recruiter search by semantic query and resume filters",
          response: {
            200: recruiterSearchResponseSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Body: Record<string, unknown>;
        }>,
        reply,
      ) => {
        const transformRecruiterSearchInputUseCase =
          resolve<TransformRecruiterSearchInputUseCase>(
            TOKENS.TransformRecruiterSearchInputUseCase,
          );

        const multipartRequest = request as FastifyRequest & {
          isMultipart?: () => boolean;
          parts?: () => AsyncIterable<{
            type: "file" | "field";
            fieldname: string;
            value?: unknown;
            filename: string;
            mimetype: string;
            toBuffer: () => Promise<Buffer>;
          }>;
        };

        let rawBody: Record<string, unknown>;

        if (multipartRequest.isMultipart?.() && multipartRequest.parts) {
          const fields: Record<string, string> = {};
          let attachmentText = "";

          for await (const part of multipartRequest.parts()) {
            if (part.type === "file") {
              attachmentText = await extractSearchAttachmentText(part);
              continue;
            }

            fields[part.fieldname] = String(part.value ?? "");
          }

          rawBody = {
            query: fields.query,
            chatPrompt: fields.chatPrompt,
            attachmentText: [fields.attachmentText, attachmentText]
              .filter((value): value is string => Boolean(value))
              .join("\n\n")
              .trim(),
            semanticSkills: parseStringArrayField(fields.semanticSkills),
            semanticTitles: parseStringArrayField(fields.semanticTitles),
            topK: parseTopK(fields.topK),
            sources: parseSourcesField(fields.sources),
            whereQuery: parseObjectField(fields.whereQuery),
            filters: parseObjectField(fields.filters),
          };
        } else {
          rawBody = normalizeSearchInputBody(request.body);
        }

        const parsedInput = recruiterSearchInputSchema.parse(rawBody);

        const result = await transformRecruiterSearchInputUseCase.execute({
          query: parsedInput.query,
          chatPrompt: parsedInput.chatPrompt,
          attachmentText: parsedInput.attachmentText,
          semanticSkills: parsedInput.semanticSkills,
          semanticTitles: parsedInput.semanticTitles,
          topK: parsedInput.topK,
          sources: parsedInput.sources,
          whereQuery: parsedInput.whereQuery,
          filters: parsedInput.filters,
        });

        // Counted after the search resolves, so a 400 on a malformed query does
        // not inflate the number. No query text, recruiter id or result count
        // goes near a label — this is a bare count.
        searchesTotal.add(1);

        reply.status(200).send(result);
      },
    );

    app.post(
      "/resumes/:resumeId/contact",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Resume"],
          summary: "Reveal one candidate's contact details",
          description:
            "Returns the email address for a single candidate and records a " +
            "CONTACT_CLICK interaction. Search listings never include emails.",
          params: revealCandidateContactParamsSchema,
          body: revealCandidateContactInputSchema,
          response: {
            200: candidateContactSchema,
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
          Params: { resumeId: string };
          Body?: {
            queryText?: string;
            semanticSimilarity?: number;
            rankPosition?: number;
            searchSessionId?: string;
          };
        }>,
        reply,
      ) => {
        const revealCandidateContactUseCase =
          resolve<RevealCandidateContactUseCase>(
            TOKENS.RevealCandidateContactUseCase,
          );

        const result = await revealCandidateContactUseCase.execute({
          resumeId: request.params.resumeId,
          recruiterId: request.user!.id,
          queryText: request.body?.queryText,
          semanticSimilarity: request.body?.semanticSimilarity,
          rankPosition: request.body?.rankPosition,
          searchSessionId: request.body?.searchSessionId,
        });

        reply.status(200).send(result);
      },
    );
  }
}
