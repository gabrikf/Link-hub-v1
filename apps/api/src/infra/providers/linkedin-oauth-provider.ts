import {
  ILinkedInOAuthProvider,
  LinkedInUserInfo,
} from "../../core/providers/oauth/linkedin-oauth-provider.js";

type LinkedInOAuthProviderOptions = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type LinkedInTokenResponse = {
  access_token: string;
};

type LinkedInUserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

const LINKEDIN_AUTHORIZE_URL =
  "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_ACCESS_TOKEN_URL =
  "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USER_INFO_URL = "https://api.linkedin.com/v2/userinfo";

export class LinkedInOAuthProvider implements ILinkedInOAuthProvider {
  constructor(private options: LinkedInOAuthProviderOptions) {}

  buildAuthorizationUrl(state: string): string {
    if (!this.options.clientId || !this.options.redirectUri) {
      throw new Error("LinkedIn OAuth configuration is incomplete");
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      scope: "openid profile email",
      state,
    });

    return `${LINKEDIN_AUTHORIZE_URL}?${params.toString()}`;
  }

  async getUserFromAuthorizationCode(code: string): Promise<LinkedInUserInfo> {
    if (!this.options.clientSecret) {
      throw new Error("LINKEDIN_CLIENT_SECRET is not configured");
    }

    const tokenResponse = await fetch(LINKEDIN_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.options.redirectUri,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Unable to exchange LinkedIn authorization code");
    }

    const tokenJson =
      (await tokenResponse.json()) as Partial<LinkedInTokenResponse>;

    if (!tokenJson.access_token) {
      throw new Error("LinkedIn access token is missing");
    }

    const userInfoResponse = await fetch(LINKEDIN_USER_INFO_URL, {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      throw new Error("Unable to fetch LinkedIn user info");
    }

    const linkedInUser =
      (await userInfoResponse.json()) as LinkedInUserInfoResponse;

    if (!linkedInUser.sub || !linkedInUser.email) {
      throw new Error("Invalid LinkedIn user info payload");
    }

    const nameParts = [
      linkedInUser.given_name,
      linkedInUser.family_name,
    ].filter(Boolean);

    const derivedName =
      linkedInUser.name ||
      (nameParts.length > 0
        ? nameParts.join(" ")
        : linkedInUser.email.split("@")[0]);

    return {
      linkedInId: linkedInUser.sub,
      email: linkedInUser.email,
      name: derivedName,
      avatarUrl: linkedInUser.picture || null,
      emailVerified: linkedInUser.email_verified !== false,
    };
  }
}
