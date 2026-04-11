import {
  addResumeSkillInputSchema,
  addResumeTitleInputSchema,
  bulkResumeSkillsInputSchema,
  bulkResumeTitlesInputSchema,
  catalogItemSchema,
  createCatalogItemInputSchema,
  createLinkSchemaInput,
  createUserSchemaInput,
  createUserSchemaOutput,
  googleSignInSchemaInput,
  googleSignInSchemaOutput,
  linkSchema,
  loginSchemaInput,
  loginSchemaOutput,
  publicResumeSchema,
  profileSchema,
  reorderLinksSchemaInput,
  resumeSchema,
  resumeSkillSchema,
  resumeTitleSchema,
  seniorityLevelSchema,
  contractTypeSchema,
  workModelSchema,
  toggleLinkVisibilitySchemaInput,
  upsertResumeInputSchema,
  updateLinkSchemaInput,
  updateProfileSchemaInput,
  updateProfileSchemaOutput,
  type ResumeResponse,
  type CreateUserInput,
  type CreateUserOutput,
  type CreateLinkInput,
  type GoogleSignInInput,
  type GoogleSignInOutput,
  type LinkResponse,
  type LoginInput,
  type LoginOutput,
  type ProfileResponse,
  type ReorderLinksInput,
  type ToggleLinkVisibilityInput,
  type UpdateLinkInput,
  type UpdateProfileInput,
  type UpdateProfileOutput,
} from "@repo/schemas";
import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import type { z } from "zod";
import { applyAuthHeaders, getAuthTokens } from "./auth-tokens";

const DEFAULT_API_BASE_URL = "http://localhost:3333";

const getApiBaseUrl = (): string => {
  const configuredBaseUrl = import.meta.env.VITE_API_URL;
  return configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : DEFAULT_API_BASE_URL;
};

export const getLinkedInSignInUrl = (): string => {
  const apiBaseUrl = getApiBaseUrl();
  return `${apiBaseUrl}/auth/linkedin`;
};

type ApiErrorShape = {
  message?: string;
};

export type UpsertResumeInput = z.input<typeof upsertResumeInputSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CreateCatalogItemInput = z.input<
  typeof createCatalogItemInputSchema
>;
export type AddResumeSkillInput = z.input<typeof addResumeSkillInputSchema>;
export type AddResumeTitleInput = z.input<typeof addResumeTitleInputSchema>;
export type BulkResumeSkillsInput = z.input<typeof bulkResumeSkillsInputSchema>;
export type BulkResumeTitlesInput = z.input<typeof bulkResumeTitlesInputSchema>;
export type ResumeSkill = z.infer<typeof resumeSkillSchema>;
export type ResumeTitle = z.infer<typeof resumeTitleSchema>;
export type PublicResumeResponse = z.infer<typeof publicResumeSchema>;
export type ResumeFormEnums = {
  seniorityLevel: z.infer<typeof seniorityLevelSchema>;
  workModel: z.infer<typeof workModelSchema>;
  contractType: z.infer<typeof contractTypeSchema>;
};

const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

const readErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as ApiErrorShape | undefined;
    if (
      responseData &&
      typeof responseData.message === "string" &&
      responseData.message.length > 0
    ) {
      return responseData.message;
    }

    return error.response?.status === 401
      ? "Invalid email or password."
      : "Request failed. Please try again.";
  }

  return "Request failed. Please try again.";
};

export async function loginRequest(
  credentials: LoginInput,
): Promise<LoginOutput> {
  const body = loginSchemaInput.parse(credentials);

  try {
    const response = await apiClient.post("/auth/login", body);
    return loginSchemaOutput.parse(response.data);
  } catch (error) {
    throw new Error(readErrorMessage(error));
  }
}

export async function registerRequest(
  payload: CreateUserInput,
): Promise<CreateUserOutput> {
  const body = createUserSchemaInput.parse(payload);

  try {
    const response = await apiClient.post("/auth/register", body);
    return createUserSchemaOutput.parse(response.data);
  } catch (error) {
    throw new Error(readErrorMessage(error));
  }
}

export async function googleSignInRequest(
  payload: GoogleSignInInput,
): Promise<GoogleSignInOutput> {
  const body = googleSignInSchemaInput.parse(payload);

  try {
    const response = await apiClient.post("/auth/google", body);
    return googleSignInSchemaOutput.parse(response.data);
  } catch (error) {
    throw new Error(readErrorMessage(error));
  }
}

export async function fetchWithTokens(
  path: string,
  config: AxiosRequestConfig = {},
): Promise<AxiosResponse> {
  const headers = new Headers(config.headers as HeadersInit | undefined);
  const storedTokens = getAuthTokens();

  if (storedTokens) {
    applyAuthHeaders(headers, storedTokens);
  }

  return apiClient.request({
    ...config,
    url: path,
    headers: AxiosHeaders.from(Object.fromEntries(headers.entries())),
  });
}

export async function fetchMyProfile(): Promise<ProfileResponse> {
  const response = await fetchWithTokens("/me", { method: "GET" });
  return profileSchema.parse(response.data);
}

export async function fetchPublicProfile(
  username: string,
): Promise<ProfileResponse> {
  const response = await apiClient.get(`/profile/${username}`);
  return profileSchema.parse(response.data);
}

export async function fetchLinks(): Promise<LinkResponse[]> {
  const response = await fetchWithTokens("/links", { method: "GET" });
  return linkSchema.array().parse(response.data);
}

export async function fetchLinkById(linkId: string): Promise<LinkResponse> {
  const response = await fetchWithTokens(`/links/${linkId}`, { method: "GET" });
  return linkSchema.parse(response.data);
}

export async function createLink(
  payload: CreateLinkInput,
): Promise<LinkResponse> {
  const body = createLinkSchemaInput.parse(payload);
  const response = await fetchWithTokens("/links", {
    method: "POST",
    data: body,
  });

  return linkSchema.parse(response.data);
}

export async function updateLink(
  linkId: string,
  payload: UpdateLinkInput,
): Promise<LinkResponse> {
  const body = updateLinkSchemaInput.parse(payload);
  const response = await fetchWithTokens(`/links/${linkId}`, {
    method: "PUT",
    data: body,
  });

  return linkSchema.parse(response.data);
}

export async function deleteLink(
  linkId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(`/links/${linkId}`, {
    method: "DELETE",
  });

  return response.data as { success: boolean };
}

export async function reorderLinks(
  payload: ReorderLinksInput,
): Promise<{ success: boolean }> {
  const body = reorderLinksSchemaInput.parse(payload);
  const response = await fetchWithTokens("/links/reorder", {
    method: "PATCH",
    data: body,
  });

  return response.data as { success: boolean };
}

export async function toggleLinkVisibility(
  linkId: string,
  payload: ToggleLinkVisibilityInput,
): Promise<LinkResponse> {
  const body = toggleLinkVisibilitySchemaInput.parse(payload);
  const response = await fetchWithTokens(`/links/${linkId}/visibility`, {
    method: "PATCH",
    data: body,
  });

  return linkSchema.parse(response.data);
}

export async function updateProfile(
  payload: UpdateProfileInput,
): Promise<UpdateProfileOutput> {
  const body = updateProfileSchemaInput.parse(payload);
  const response = await fetchWithTokens("/profile", {
    method: "PUT",
    data: body,
  });

  return updateProfileSchemaOutput.parse(response.data);
}

export async function fetchMyResume(): Promise<ResumeResponse> {
  const response = await fetchWithTokens("/me/resume", { method: "GET" });
  return resumeSchema.parse(response.data);
}

export async function upsertResume(
  payload: UpsertResumeInput,
): Promise<ResumeResponse> {
  const body = upsertResumeInputSchema.parse(payload);
  const response = await fetchWithTokens("/me/resume", {
    method: "PUT",
    data: body,
  });

  return resumeSchema.parse(response.data);
}

export async function fetchSkillsCatalog(): Promise<CatalogItem[]> {
  const response = await fetchWithTokens("/resume/catalog/skills", {
    method: "GET",
  });

  return catalogItemSchema.array().parse(response.data);
}

export async function createSkillCatalogItem(
  payload: CreateCatalogItemInput,
): Promise<CatalogItem> {
  const body = createCatalogItemInputSchema.parse(payload);
  const response = await fetchWithTokens("/resume/catalog/skills", {
    method: "POST",
    data: body,
  });

  return catalogItemSchema.parse(response.data);
}

export async function addResumeSkill(
  payload: AddResumeSkillInput,
): Promise<ResumeSkill> {
  const body = addResumeSkillInputSchema.parse(payload);
  const response = await fetchWithTokens("/resume/skills", {
    method: "POST",
    data: body,
  });

  return resumeSkillSchema.parse(response.data);
}

export async function saveResumeSkillsBulk(
  payload: BulkResumeSkillsInput,
): Promise<ResumeSkill[]> {
  const body = bulkResumeSkillsInputSchema.parse(payload);
  const response = await fetchWithTokens("/resume/skills/bulk", {
    method: "PUT",
    data: body,
  });

  return resumeSkillSchema.array().parse(response.data);
}

export async function fetchTitlesCatalog(): Promise<CatalogItem[]> {
  const response = await fetchWithTokens("/resume/catalog/titles", {
    method: "GET",
  });

  return catalogItemSchema.array().parse(response.data);
}

export async function createTitleCatalogItem(
  payload: CreateCatalogItemInput,
): Promise<CatalogItem> {
  const body = createCatalogItemInputSchema.parse(payload);
  const response = await fetchWithTokens("/resume/catalog/titles", {
    method: "POST",
    data: body,
  });

  return catalogItemSchema.parse(response.data);
}

export async function addResumeTitle(
  payload: AddResumeTitleInput,
): Promise<ResumeTitle> {
  const body = addResumeTitleInputSchema.parse(payload);
  const response = await fetchWithTokens("/resume/titles", {
    method: "POST",
    data: body,
  });

  return resumeTitleSchema.parse(response.data);
}

export async function saveResumeTitlesBulk(
  payload: BulkResumeTitlesInput,
): Promise<ResumeTitle[]> {
  const body = bulkResumeTitlesInputSchema.parse(payload);
  const response = await fetchWithTokens("/resume/titles/bulk", {
    method: "PUT",
    data: body,
  });

  return resumeTitleSchema.array().parse(response.data);
}

export async function fetchPublicResume(
  username: string,
): Promise<PublicResumeResponse> {
  const response = await apiClient.get(`/profile/${username}/resume`);
  return publicResumeSchema.parse(response.data);
}
