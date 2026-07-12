import "reflect-metadata";
import { container } from "tsyringe";
import fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { TOKENS } from "../../di/container.js";
import { errorHandler } from "../middleware/global-error-handler.js";
import { UserEntity } from "../../../core/entity/user/user-entity.js";
import { InMemoryUsersRepository } from "../../../core/repositories/user/in-memory-users-repository.js";
import { InMemoryPostsRepository } from "../../../core/repositories/post/in-memory-posts-repository.js";
import { InMemoryApiTokenRepository } from "../../../core/repositories/api-token/in-memory-api-token-repository.js";
import { CryptoTokenProvider } from "../../providers/crypto-token-provider.js";
import { JwtProvider } from "../../providers/jwt-provider.js";
import { CreatePostUseCase } from "../../../core/use-case/posts/create-post-use-case/create-post.use-case.js";
import { ListMyPostsUseCase } from "../../../core/use-case/posts/list-my-posts-use-case/list-my-posts.use-case.js";
import { ListPublicPostsUseCase } from "../../../core/use-case/posts/list-public-posts-use-case/list-public-posts.use-case.js";
import { GetPostUseCase } from "../../../core/use-case/posts/get-post-use-case/get-post.use-case.js";
import { UpdatePostUseCase } from "../../../core/use-case/posts/update-post-use-case/update-post.use-case.js";
import { DeletePostUseCase } from "../../../core/use-case/posts/delete-post-use-case/delete-post.use-case.js";
import { CreateApiTokenUseCase } from "../../../core/use-case/api-tokens/create-api-token-use-case/create-api-token.use-case.js";
import { ListApiTokensUseCase } from "../../../core/use-case/api-tokens/list-api-tokens-use-case/list-api-tokens.use-case.js";
import { RevokeApiTokenUseCase } from "../../../core/use-case/api-tokens/revoke-api-token-use-case/revoke-api-token.use-case.js";
import { PostsController } from "../controllers/posts/posts-controller.js";
import { ApiTokensController } from "../controllers/api-tokens/api-tokens-controller.js";

/**
 * Deterministic JWT secret for e2e tests. The same JwtProvider instance is
 * registered into the DI container AND used to mint tokens, so the guard's
 * real verify() path is exercised against tokens we signed.
 */
export const TEST_JWT_SECRET = "e2e-test-secret";

export interface TestAppHandles {
  app: FastifyInstance;
  usersRepository: InMemoryUsersRepository;
  postsRepository: InMemoryPostsRepository;
  apiTokenRepository: InMemoryApiTokenRepository;
  tokenProvider: CryptoTokenProvider;
  jwtProvider: JwtProvider;
  /** Mint a real, verifiable JWT access token for the given user id. */
  signJwt(userId: string): Promise<string>;
  /** Convenience: create + persist an in-memory user, returning the entity. */
  seedUser(overrides?: Partial<SeedUserInput>): Promise<UserEntity>;
}

interface SeedUserInput {
  email: string;
  login: string;
  name: string;
  password: string;
}

let seedCounter = 0;

/**
 * Build a fully DB-free Fastify app for e2e tests.
 *
 * The controllers + guards resolve their collaborators through the shared
 * tsyringe `container` via `resolve(TOKENS.*)`. We reset that container and
 * register IN-MEMORY repositories and real (but hermetic) providers as
 * instances, then register the use-cases wired to those repos. No database
 * plugin, no Redis, no OpenAI — requests flow through the exact same zod
 * validation, guards, controllers and global error handler as production.
 */
export async function buildTestApp(): Promise<TestAppHandles> {
  container.reset();

  const usersRepository = new InMemoryUsersRepository();
  const postsRepository = new InMemoryPostsRepository();
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const tokenProvider = new CryptoTokenProvider();
  const jwtProvider = new JwtProvider({
    secret: TEST_JWT_SECRET,
    expiresIn: "15m",
  });

  // Repositories + providers the guards and use-cases resolve.
  container.registerInstance(TOKENS.UsersRepository, usersRepository);
  container.registerInstance(TOKENS.PostsRepository, postsRepository);
  container.registerInstance(TOKENS.ApiTokenRepository, apiTokenRepository);
  container.registerInstance(TOKENS.TokenProvider, tokenProvider);
  container.registerInstance(TOKENS.JwtProvider, jwtProvider);

  // Use-cases (wired to the in-memory repos above).
  container.registerInstance(
    TOKENS.CreatePostUseCase,
    new CreatePostUseCase(postsRepository, usersRepository),
  );
  container.registerInstance(
    TOKENS.ListMyPostsUseCase,
    new ListMyPostsUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.ListPublicPostsUseCase,
    new ListPublicPostsUseCase(usersRepository, postsRepository),
  );
  container.registerInstance(
    TOKENS.GetPostUseCase,
    new GetPostUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.UpdatePostUseCase,
    new UpdatePostUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.DeletePostUseCase,
    new DeletePostUseCase(postsRepository),
  );
  container.registerInstance(
    TOKENS.CreateApiTokenUseCase,
    new CreateApiTokenUseCase(apiTokenRepository, usersRepository, tokenProvider),
  );
  container.registerInstance(
    TOKENS.ListApiTokensUseCase,
    new ListApiTokensUseCase(apiTokenRepository),
  );
  container.registerInstance(
    TOKENS.RevokeApiTokenUseCase,
    new RevokeApiTokenUseCase(apiTokenRepository),
  );

  const app = fastify();

  app.setErrorHandler(errorHandler);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  PostsController.handle(app);
  ApiTokensController.handle(app);

  await app.ready();

  return {
    app,
    usersRepository,
    postsRepository,
    apiTokenRepository,
    tokenProvider,
    jwtProvider,
    signJwt: (userId: string) => jwtProvider.sign({ sub: userId }),
    async seedUser(overrides?: Partial<SeedUserInput>) {
      seedCounter += 1;
      const user = UserEntity.create({
        email: overrides?.email ?? `user${seedCounter}@example.com`,
        login: overrides?.login ?? `user${seedCounter}`,
        name: overrides?.name ?? `User ${seedCounter}`,
        password: overrides?.password ?? "hashed-password",
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(user);
      return user;
    },
  };
}
