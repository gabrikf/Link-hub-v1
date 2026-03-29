import { UnauthorizedError } from "../../../errors/index.js";
import { IGoogleOAuthProvider } from "../../../providers/oauth/google-oauth-provider.js";
import { IGoogleSignInUseCaseInput } from "../../types.js";
import { OAuthSignInUseCase } from "../oauth-sign-in-use-case/oauth-sign-in.use-case.js";

export class GoogleSignInUseCase {
  constructor(
    private googleOAuthProvider: IGoogleOAuthProvider,
    private oauthSignInUseCase: OAuthSignInUseCase,
    private validator: (input: unknown) => IGoogleSignInUseCaseInput,
  ) {}

  async execute(input: IGoogleSignInUseCaseInput) {
    const data = this.validator(input);

    let googleUserInfo;

    try {
      if (data.idToken) {
        googleUserInfo = await this.googleOAuthProvider.verifyIdToken(
          data.idToken,
        );
      } else if (data.accessToken) {
        googleUserInfo = await this.googleOAuthProvider.verifyAccessToken(
          data.accessToken,
        );
      } else {
        throw new Error("Missing Google token");
      }
    } catch {
      throw new UnauthorizedError("Invalid Google token");
    }

    return this.oauthSignInUseCase.execute({
      provider: "google",
      providerAccountId: googleUserInfo.googleId,
      email: googleUserInfo.email,
      name: googleUserInfo.name,
      avatarUrl: googleUserInfo.avatarUrl,
      emailVerified: googleUserInfo.emailVerified,
    });
  }
}
