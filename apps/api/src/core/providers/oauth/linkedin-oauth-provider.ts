export interface LinkedInUserInfo {
  linkedInId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface ILinkedInOAuthProvider {
  buildAuthorizationUrl(state: string): string;
  getUserFromAuthorizationCode(code: string): Promise<LinkedInUserInfo>;
}
