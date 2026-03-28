export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface IGoogleOAuthProvider {
  verifyIdToken(idToken: string): Promise<GoogleUserInfo>;
}
