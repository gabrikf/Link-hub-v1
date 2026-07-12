import { randomUUID } from "node:crypto";
import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { uploadImageResponseSchema } from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { BadRequestError } from "../../../../core/errors/index.js";
import { IFileStorageProvider } from "../../../../core/providers/storage/file-storage-provider.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import {
  detectImageMimeType,
  extensionForImageMimeType,
  isAllowedImageMimeType,
  MAX_IMAGE_SIZE_BYTES,
} from "../../utils/validate-image.js";

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

export class UploadsController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/me/uploads",
      {
        preHandler: authGuard,
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
          throw new BadRequestError("Image is too large. Maximum size is 5 MB.");
        }

        if (filePart.file.truncated || buffer.length > MAX_IMAGE_SIZE_BYTES) {
          throw new BadRequestError("Image is too large. Maximum size is 5 MB.");
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

        const storage = resolve<IFileStorageProvider>(
          TOKENS.FileStorageProvider,
        );

        const extension = extensionForImageMimeType(detectedMimeType);
        const key = `uploads/${request.user!.id}/${randomUUID()}.${extension}`;

        const { url } = await storage.upload({
          body: buffer,
          contentType: detectedMimeType,
          key,
        });

        reply.status(201).send(uploadImageResponseSchema.parse({ url }));
      },
    );
  }
}
