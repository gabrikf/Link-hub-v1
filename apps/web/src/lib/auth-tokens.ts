export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type HeaderSetter = {
  set(name: string, value: string): unknown;
};

const AUTH_TOKENS_STORAGE_KEY = "linkhub.auth.tokens";

export function getAuthTokens(): AuthTokens | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(AUTH_TOKENS_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<AuthTokens>;

    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string"
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}

export function setAuthTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKENS_STORAGE_KEY);
}

export function applyAuthHeaders(
  headers: HeaderSetter,
  tokens: AuthTokens,
): HeaderSetter {
  headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  headers.set("x-refresh-token", tokens.refreshToken);
  return headers;
}
