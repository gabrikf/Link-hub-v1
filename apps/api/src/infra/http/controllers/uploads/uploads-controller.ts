import { randomUUID } from "node:crypto";
import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { uploadImageResponseSchema } from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { BadRequestError } from "../../../../core/errors/index.js";
import { IImageOptimizerProvider } from "../../../../core/providers/image-optimizer/image-optimizer-provider.js";
import { IFileStorageProvider } from "../../../../core/providers/storage/file-storage-provider.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import {
  AllowedImageMimeType,
  detectImageMimeType,
  extensionForImageMimeType,
  isAllowedImageMimeType,
  MAX_IMAGE_SIZE_BYTES,
} from "../../utils/validate-image.js";
import { toAsyncHook } from "../../to-async-hook.js";

type MultipartFile = {
  filename: string;
  mimetype: string;
  file: { truncated: boolean };
  toBuffer: () => Promise<Buffer>;
};

type MultipartRequest = FastifyRequest & {
  isMultipart?: () => boolean;
  file?: (options?: {
    limits?: { fileSize?: number };
  }) => Promise<MultipartFile | undefined>;
};

/**
 * Fastify's typed `preHandler` property resolves to the callback-style hook
 * signature (`(request, reply, done) => void`), never the promise-returning
 * one — `preHandlerMetaHookHandler`'s `Return` generic always defaults to
 * `void` at that property, regardless of how the guard function passed in is
 * itself typed. Adapting an async guard to the callback form here keeps the
 * guard itself a plain `async` function with no behaviour change: a
 * rejection becomes `done(error)`, which Fastify routes to the same error
 * handler an async hook's rejection would.
 */

export class UploadsController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/me/uploads",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Uploads"],
          summary: "Upload an image and get its public URL",
          consumes: ["multipart/form-data"],
          response: {
            201: uploadImageResponseSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const multipartRequest = request as MultipartRequest;

        if (!multipartRequest.isMultipart?.() || !multipartRequest.file) {
          throw new BadRequestError(
            "Request must be multipart/form-data with an image file.",
          );
        }

        const filePart = await multipartRequest.file({
          limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
        });

        if (!filePart) {
          throw new BadRequestError("No image file was provided.");
        }

        // Reject on the declared content-type first (cheap), then confirm with
        // magic bytes below (authoritative).
        if (!isAllowedImageMimeType(filePart.mimetype)) {
          throw new BadRequestError(
            "Unsupported file type. Upload a JPEG, PNG, WebP, GIF, or AVIF image.",
          );
        }

        let buffer: Buffer;
        try {
          buffer = await filePart.toBuffer();
        } catch {
          throw new BadRequestError(
            "Image is too large. Maximum size is 5 MB.",
          );
        }

        if (filePart.file.truncated || buffer.length > MAX_IMAGE_SIZE_BYTES) {
          throw new BadRequestError(
            "Image is too large. Maximum size is 5 MB.",
          );
        }

        if (buffer.length === 0) {
          throw new BadRequestError("Uploaded file is empty.");
        }

        // Don't trust the header: sniff magic bytes to confirm it is really an
        // image, and use the *detected* type as the stored content type.
        const detectedMimeType = detectImageMimeType(buffer);
        if (!detectedMimeType) {
          throw new BadRequestError(
            "File does not appear to be a valid image.",
          );
        }

        // Shrink before the bytes reach the bucket: a 4 MB phone photo uploaded
        // to be shown as a 96px avatar is paid for on storage and again on
        // every page view. Runs after the magic-byte check so the optimiser is
        // only ever handed something we already believe to be an image, and
        // before the upload so only the optimised bytes are ever stored.
        // The optimiser never throws — a failed optimisation returns the
        // original buffer — so no validation branch or error below changes.
        const imageOptimizer = resolve<IImageOptimizerProvider>(
          TOKENS.ImageOptimizerProvider,
        );

        const optimized = await imageOptimizer.optimize({
          buffer,
          contentType: detectedMimeType,
        });

        const storage = resolve<IFileStorageProvider>(
          TOKENS.FileStorageProvider,
        );

        // The *returned* content type drives both the stored object and the
        // key's extension, so the two can never disagree if the optimiser ever
        // hands back a different format. If it ever reported a type we have no
        // extension for, storing the untouched original is better than labelling
        // bytes with a type that is not theirs.
        let storedBuffer = buffer;
        let storedContentType: AllowedImageMimeType = detectedMimeType;

        if (isAllowedImageMimeType(optimized.contentType)) {
          storedBuffer = optimized.buffer;
          storedContentType = optimized.contentType;
        }

        const extension = extensionForImageMimeType(storedContentType);
        const key = `uploads/${request.user!.id}/${randomUUID()}.${extension}`;

        const { url } = await storage.upload({
          body: storedBuffer,
          contentType: storedContentType,
          key,
        });

        reply.status(201).send(uploadImageResponseSchema.parse({ url }));
      },
    );
  }
}
