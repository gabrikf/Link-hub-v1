export interface ICreateUserUseCaseInput {
  email: string;
  login: string;
  password: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  persona?: string | null;
}

export interface ILoginUseCaseInput {
  email: string;
  password: string;
}

export interface IVerifyEmailUseCaseInput {
  /** The raw token from the emailed link, not its hash. */
  token: string;
}

export interface IResendVerificationUseCaseInput {
  email: string;
}

export interface IRefreshSessionUseCaseInput {
  refreshToken: string;
}

export interface IForgotPasswordUseCaseInput {
  email: string;
}

export interface IResetPasswordUseCaseInput {
  /** The raw token from the emailed link, not its hash. */
  token: string;
  /** The new PLAINTEXT password. Hashed by the use case, never stored as-is. */
  password: string;
}

export interface IGoogleSignInUseCaseInput {
  idToken?: string;
  accessToken?: string;
}

export interface IOAuthSignInUseCaseInput {
  provider: string;
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface ICreateUserUseCaseOutput {
  user: {
    id: string;
    email: string;
    login: string;
    name: string;
    description?: string | null;
    avatarUrl?: string | null;
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
  };
  token: string;
}
