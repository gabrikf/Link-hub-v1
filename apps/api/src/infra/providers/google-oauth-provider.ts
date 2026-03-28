import { OAuth2Client } from "google-auth-library";
import {
  GoogleUserInfo,
  IGoogleOAuthProvider,
} from "../../core/providers/oauth/google-oauth-provider.js";

interface GoogleOAuthProviderOptions {
  clientId: string;
}

export class GoogleOAuthProvider implements IGoogleOAuthProvider {
  private oauthClient: OAuth2Client;

  constructor(private options: GoogleOAuthProviderOptions) {
    this.oauthClient = new OAuth2Client(options.clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    if (!this.options.clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not configured");
    }

    const ticket = await this.oauthClient.verifyIdToken({
      idToken,
      audience: this.options.clientId,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      throw new Error("Invalid Google token payload");
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      avatarUrl: payload.picture || null,
      emailVerified: payload.email_verified === true,
    };
  }
}
