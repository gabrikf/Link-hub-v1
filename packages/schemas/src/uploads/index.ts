import { z } from "zod/v4";

/**
 * Response returned by `POST /me/uploads` after an image has been stored in
 * object storage. `url` is the public, directly-embeddable URL of the object.
 */
export const uploadImageResponseSchema = z.object({
  url: z.string().url(),
});

export type UploadImageResponse = z.infer<typeof uploadImageResponseSchema>;
