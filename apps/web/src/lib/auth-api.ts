import {
  createUserSchemaInput,
  createUserSchemaOutput,
  googleSignInSchemaInput,
  googleSignInSchemaOutput,
  loginSchemaInput,
  loginSchemaOutput,
  type CreateUserInput,
  type CreateUserOutput,
  type GoogleSignInInput,
  type GoogleSignInOutput,
  type LoginInput,
  type LoginOutput,
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
