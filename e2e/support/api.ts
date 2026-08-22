import { API_URL } from "./accounts";

export type Tokens = { accessToken: string; refreshToken: string };
export type LoginUser = { id?: string; login?: string; name?: string; email?: string };
export type LoginResult = Tokens & { user?: LoginUser };

/**
 * Logging in over HTTP rather than through the form is deliberate for *setup*.
 * The login form itself is journey 1 and is walked through the UI there; every
 * other journey would otherwise re-test it and inherit its flakiness.
 */
export async function apiLogin(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `login failed for ${email}: HTTP ${response.status} ${body.slice(0, 300)}\n` +
        `Is the database seeded? bash db-manage.sh seed-all`,
    );
  }
  const payload = (await response.json()) as LoginResult;
  if (!payload?.accessToken || !payload?.refreshToken) {
    throw new Error(`login response for ${email} carried no tokens — did the auth contract change?`);
  }
  return payload;
}

export async function apiGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}
