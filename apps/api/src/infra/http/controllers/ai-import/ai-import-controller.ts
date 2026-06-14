import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
  aiResumeImportParseResponseSchema,
  applyAiResumeImportInputSchema,
  parsedResumeDataSchema,
  type ApplyAiResumeImportInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { BadRequestError } from "../../../../core/errors/index.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { extractSearchAttachmentText } from "../../utils/extract-search-attachment-text.js";
import { ParseResumeUseCase } from "../../../../core/use-case/ai-import/parse-resume-use-case/parse-resume.use-case.js";
import { ApplyAiResumeImportUseCase } from "../../../../core/use-case/ai-import/apply-ai-resume-import-use-case/apply-ai-resume-import.use-case.js";

const MIN_RESUME_TEXT_LENGTH = 20;

const applyResponseSchema = z.object({
  skillsAdded: z.number().int(),
  titlesAdded: z.number().int(),
  workExperiencesAdded: z.number().int(),
});

export class AiImportController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/me/resume/ai-import/parse",
      {
        preHandler: authGuard,
        schema: {
          tags: ["AI Import"],
          summary: "Extract a structured profile from a resume file or text",
          response: {
            200: aiResumeImportParseResponseSchema,
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
        request: FastifyRequest<{ Body: Record<string, unknown> }>,
        reply,
      ) => {
        const resumeText = await resolveResumeText(request);

        if (!resumeText || resumeText.length < MIN_RESUME_TEXT_LENGTH) {
          throw new BadRequestError(
            "Provide a resume file or pasted text with enough content to parse.",
          );
        }

        const parseResumeUseCase = resolve<ParseResumeUseCase>(
          TOKENS.ParseResumeUseCase,
        );

        const parsed = await parseResumeUseCase.execute({
          userId: request.user!.id,
          resumeText,
        });

        reply.status(200).send({ parsed: parsedResumeDataSchema.parse(parsed) });
      },
    );

    app.post(
      "/me/resume/ai-import/apply",
      {
        preHandler: authGuard,
        schema: {
          tags: ["AI Import"],
          summary: "Apply a reviewed AI-extracted profile to the database",
          body: applyAiResumeImportInputSchema,
          response: {
            200: applyResponseSchema,
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
        request: FastifyRequest<{ Body: ApplyAiResumeImportInput }>,
        reply,
      ) => {
        const applyAiResumeImportUseCase =
          resolve<ApplyAiResumeImportUseCase>(
            TOKENS.ApplyAiResumeImportUseCase,
          );

        const result = await applyAiResumeImportUseCase.execute({
          userId: request.user!.id,
          ...request.body,
        });

        reply.status(200).send(result);
      },
    );
  }
}

type MultipartRequest = FastifyRequest & {
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

async function resolveResumeText(request: FastifyRequest): Promise<string> {
  const multipartRequest = request as MultipartRequest;

  if (multipartRequest.isMultipart?.() && multipartRequest.parts) {
    let fileText = "";
    let fieldText = "";

    for await (const part of multipartRequest.parts()) {
      if (part.type === "file") {
        fileText = await extractSearchAttachmentText(part);
        continue;
      }

      if (part.fieldname === "resumeText") {
        fieldText = String(part.value ?? "");
      }
    }

    return [fieldText, fileText]
      .filter((value) => Boolean(value))
      .join("\n\n")
      .trim();
  }

  const body = (request.body ?? {}) as { resumeText?: unknown };
  return typeof body.resumeText === "string" ? body.resumeText.trim() : "";
}
