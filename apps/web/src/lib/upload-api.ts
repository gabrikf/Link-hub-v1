import { uploadImageResponseSchema } from "@repo/schemas";
import axios from "axios";
import i18n from "../i18n";
import { fetchWithTokens } from "./auth-api";
import { reportError } from "./report-error";

/**
 * Upload a single image file to the API's object-storage backend and return the
 * resulting public URL (the value that gets persisted in the DB).
 *
 * Uses {@link fetchWithTokens}, which attaches the auth headers and — because
 * the body is a `FormData` — lets the browser set the `multipart/form-data`
 * boundary itself.
 */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetchWithTokens("/me/uploads", {
      method: "POST",
      data: formData,
    });

    return uploadImageResponseSchema.parse(response.data).url;
  } catch (error) {
    reportError(error, {
      action: "upload.image",
      // File name is the user's own and can be personal — size and type are
      // what actually explain a rejected upload.
      extra: { fileSize: file.size, fileType: file.type },
    });
    throw new Error(readUploadErrorMessage(error));
  }
}

function readUploadErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const serverMessage = (error.response?.data as { message?: string } | undefined)
      ?.message;

    if (status === 400) {
      return serverMessage ?? i18n.t("errors.imageUnsupportedOrTooLarge");
    }

    if (status === 401) {
      return i18n.t("errors.sessionHasExpired");
    }

    if (serverMessage && serverMessage.length > 0) {
      return serverMessage;
    }
  }

  return i18n.t("errors.imageUploadFailed");
}
