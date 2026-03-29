import {
  createLinkSchemaInput,
  createUserSchemaInput,
  createUserSchemaOutput,
  googleSignInSchemaInput,
  googleSignInSchemaOutput,
  linkSchema,
  loginSchemaInput,
  loginSchemaOutput,
  profileSchema,
  reorderLinksSchemaInput,
  toggleLinkVisibilitySchemaInput,
  updateLinkSchemaInput,
  updateProfileSchemaInput,
  updateProfileSchemaOutput,
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
