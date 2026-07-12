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
  recruiterSearchInputSchema,
  recruiterSearchResultSchema,
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
  createInteractionInputSchema,
  interactionSchema,
  workExperienceSchema,
  publicWorkExperienceSchema,
  createWorkExperienceInputSchema,
  updateWorkExperienceInputSchema,
  aiResumeImportParseResponseSchema,
  applyAiResumeImportInputSchema,
  fullLayoutSchema,
  layoutSchema,
  profileTabSchema,
  profileBlockSchema,
  createTabSchemaInput,
  renameTabSchemaInput,
  reorderTabsSchemaInput,
  createBlockSchemaInput,
  updateBlockSchemaInput,
  updateBlockPositionsSchemaInput,
  type FullProfileLayout,
  type ProfileLayout,
  type ProfileTab,
  type ProfileBlock,
  type ProfileViewport,
  type CreateTabInput,
  type RenameTabInput,
  type ReorderTabsInput,
  type CreateBlockInput,
  type UpdateBlockInput,
  type UpdateBlockPositionsInput,
  type WorkExperienceResponse,
  type PublicWorkExperienceResponse,
  type CreateWorkExperienceInput,
  type UpdateWorkExperienceInput,
  type AiResumeImportParseResponse,
  type ApplyAiResumeImportInput,
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
  type RecruiterSearchInput,
  type CreateInteractionInput,
  type InteractionResponse,
} from "@repo/schemas";
import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { z } from "zod";
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
const recruiterSearchResponseSchema = z.object({
  input: z.object({
    semanticQuery: z.string().min(1),
    filters: z.record(z.string(), z.unknown()),
    semanticSkills: z.array(z.string()).optional(),
    semanticTitles: z.array(z.string()).optional(),
  }),
  candidates: recruiterSearchResultSchema.array(),
});

export type RecruiterSearchResponse = z.infer<
  typeof recruiterSearchResponseSchema
>;
export type RecruiterSearchPayload = RecruiterSearchInput & {
  attachmentFile?: File;
};
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

  const axiosHeaders = AxiosHeaders.from(Object.fromEntries(headers.entries()));

  if (config.data instanceof FormData) {
    axiosHeaders.delete("Content-Type");
  }

  return apiClient.request({
    ...config,
    url: path,
    headers: axiosHeaders,
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

/* ------------------------------------------------------------------ *
 * Profile layout studio (per-viewport tabs + freeform grid of blocks)
 * ------------------------------------------------------------------ */

export async function fetchLayout(): Promise<FullProfileLayout> {
  const response = await fetchWithTokens("/me/layout", { method: "GET" });
  return fullLayoutSchema.parse(response.data);
}

export async function fetchLayoutViewport(
  viewport: ProfileViewport,
): Promise<ProfileLayout> {
  const response = await fetchWithTokens(`/me/layout?viewport=${viewport}`, {
    method: "GET",
  });
  return layoutSchema.parse(response.data);
}

export async function createTab(payload: CreateTabInput): Promise<ProfileTab> {
  const body = createTabSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/layout/tabs", {
    method: "POST",
    data: body,
  });

  return profileTabSchema.parse(response.data);
}

export async function renameTab(
  tabId: string,
  payload: RenameTabInput,
): Promise<ProfileTab> {
  const body = renameTabSchemaInput.parse(payload);
  const response = await fetchWithTokens(`/me/layout/tabs/${tabId}`, {
    method: "PATCH",
    data: body,
  });

  return profileTabSchema.parse(response.data);
}

export async function deleteTab(
  tabId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(`/me/layout/tabs/${tabId}`, {
    method: "DELETE",
  });

  return response.data as { success: boolean };
}

export async function reorderTabs(
  payload: ReorderTabsInput,
): Promise<{ success: boolean }> {
  const body = reorderTabsSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/layout/tabs/reorder", {
    method: "PATCH",
    data: body,
  });

  return response.data as { success: boolean };
}

export async function createBlock(
  payload: CreateBlockInput,
): Promise<ProfileBlock> {
  const body = createBlockSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/layout/blocks", {
    method: "POST",
    data: body,
  });

  return profileBlockSchema.parse(response.data);
}

export async function updateBlock(
  blockId: string,
  payload: UpdateBlockInput,
): Promise<ProfileBlock> {
  const body = updateBlockSchemaInput.parse(payload);
  const response = await fetchWithTokens(`/me/layout/blocks/${blockId}`, {
    method: "PATCH",
    data: body,
  });

  return profileBlockSchema.parse(response.data);
}

export async function deleteBlock(
  blockId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(`/me/layout/blocks/${blockId}`, {
    method: "DELETE",
  });

  return response.data as { success: boolean };
}

export async function updateBlockPositions(
  payload: UpdateBlockPositionsInput,
): Promise<{ success: boolean }> {
  const body = updateBlockPositionsSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/layout/blocks/positions", {
    method: "PATCH",
    data: body,
  });

  return response.data as { success: boolean };
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

export async function searchRecruiterResumes(
  payload: RecruiterSearchPayload,
): Promise<RecruiterSearchResponse> {
  const { attachmentFile, ...searchInput } = payload;

  const hasTextSemanticInput = Boolean(
    searchInput.query || searchInput.chatPrompt || searchInput.attachmentText,
  );

  // When search is attachment-only, semantic text is produced on the server
  // after file extraction, so client-side full schema validation must be skipped.
  const body = hasTextSemanticInput
    ? recruiterSearchInputSchema.parse(searchInput)
    : searchInput;

  const formData = new FormData();

  if (body.query) {
    formData.append("query", body.query);
  }

  if (body.chatPrompt) {
    formData.append("chatPrompt", body.chatPrompt);
  }

  if (body.attachmentText) {
    formData.append("attachmentText", body.attachmentText);
  }

  if (body.semanticSkills?.length) {
    formData.append("semanticSkills", JSON.stringify(body.semanticSkills));
  }

  if (body.semanticTitles?.length) {
    formData.append("semanticTitles", JSON.stringify(body.semanticTitles));
  }

  if (body.topK !== undefined) {
    formData.append("topK", String(body.topK));
  }

  if (body.whereQuery) {
    formData.append("whereQuery", JSON.stringify(body.whereQuery));
  }

  if (body.filters) {
    formData.append("filters", JSON.stringify(body.filters));
  }

  if (attachmentFile) {
    formData.append("attachment", attachmentFile);
  }

  const headers = new Headers();
  const storedTokens = getAuthTokens();

  if (storedTokens) {
    applyAuthHeaders(headers, storedTokens);
  }

  const response = await fetch(`${getApiBaseUrl()}/resumes/search`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = (await response.json()) as unknown;

  if (!response.ok) {
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
    ) {
      throw new Error((data as { message: string }).message);
    }

    throw new Error("Search failed. Try again.");
  }

  if (Array.isArray(data)) {
    return {
      input: {
        semanticQuery:
          body.query ??
          body.chatPrompt ??
          body.attachmentText ??
          "recruiter search",
        filters: body.whereQuery ?? body.filters ?? {},
      },
      candidates: recruiterSearchResultSchema.array().parse(data),
    };
  }

  return recruiterSearchResponseSchema.parse(data);
}

export async function trackInteraction(
  payload: CreateInteractionInput,
): Promise<InteractionResponse> {
  const body = createInteractionInputSchema.parse(payload);
  const response = await fetchWithTokens("/interactions", {
    method: "POST",
    data: body,
  });

  return interactionSchema.parse(response.data);
}

export async function fetchMyWorkExperiences(): Promise<
  WorkExperienceResponse[]
> {
  const response = await fetchWithTokens("/me/work-experiences", {
    method: "GET",
  });

  return workExperienceSchema.array().parse(response.data);
}

export async function createWorkExperience(
  payload: CreateWorkExperienceInput,
): Promise<WorkExperienceResponse> {
  const body = createWorkExperienceInputSchema.parse(payload);
  const response = await fetchWithTokens("/me/work-experiences", {
    method: "POST",
    data: body,
  });

  return workExperienceSchema.parse(response.data);
}

export async function updateWorkExperience(
  workExperienceId: string,
  payload: UpdateWorkExperienceInput,
): Promise<WorkExperienceResponse> {
  const body = updateWorkExperienceInputSchema.parse(payload);
  const response = await fetchWithTokens(
    `/me/work-experiences/${workExperienceId}`,
    {
      method: "PUT",
      data: body,
    },
  );

  return workExperienceSchema.parse(response.data);
}

export async function deleteWorkExperience(
  workExperienceId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(
    `/me/work-experiences/${workExperienceId}`,
    {
      method: "DELETE",
    },
  );

  return response.data as { success: boolean };
}

export async function fetchPublicWorkExperiences(
  username: string,
): Promise<PublicWorkExperienceResponse[]> {
  const response = await apiClient.get(
    `/profile/${username}/work-experiences`,
  );

  return publicWorkExperienceSchema.array().parse(response.data);
}

export async function parseResumeImport(input: {
  file?: File;
  resumeText?: string;
}): Promise<AiResumeImportParseResponse> {
  const formData = new FormData();

  if (input.resumeText) {
    formData.append("resumeText", input.resumeText);
  }

  if (input.file) {
    formData.append("attachment", input.file);
  }

  // Use raw fetch (not the axios client) so the browser sets the multipart
  // boundary. The axios instance forces a JSON content-type which would
  // serialize the FormData away and drop the file.
  const headers = new Headers();
  const storedTokens = getAuthTokens();

  if (storedTokens) {
    applyAuthHeaders(headers, storedTokens);
  }

  const response = await fetch(`${getApiBaseUrl()}/me/resume/ai-import/parse`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = (await response.json()) as unknown;

  if (!response.ok) {
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
    ) {
      throw new Error((data as { message: string }).message);
    }

    throw new Error("Could not parse the resume. Try again.");
  }

  return aiResumeImportParseResponseSchema.parse(data);
}

export async function applyResumeImport(
  payload: ApplyAiResumeImportInput,
): Promise<{
  skillsAdded: number;
  titlesAdded: number;
  workExperiencesAdded: number;
}> {
  const body = applyAiResumeImportInputSchema.parse(payload);
  const response = await fetchWithTokens("/me/resume/ai-import/apply", {
    method: "POST",
    data: body,
  });

  return response.data as {
    skillsAdded: number;
    titlesAdded: number;
    workExperiencesAdded: number;
  };
}
