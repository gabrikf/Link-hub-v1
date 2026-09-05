import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ingestActivitySchemaInput,
  type IngestActivityEventInput,
} from "@repo/schemas";
import { GitConnectionEntity } from "../../../core/entity/git-connection/git-connection-entity.js";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../../../core/errors/index.js";
import { IGitConnectionRepository } from "../../../core/repositories/git-connection/git-connection-repository.js";
import { IngestActivityUseCase } from "../../../core/use-case/activity/ingest-activity-use-case/ingest-activity.use-case.js";
import { resolve, TOKENS } from "../../di/container.js";
import {
  mapGithubDelivery,
  mapGitlabDelivery,
  type MappedForgeEvent,
} from "../webhooks/forge-payload-mapper.js";
import {
  verifyGithubSignature,
  verifyGitlabPlaintextToken,
  verifyGitlabSignature,
} from "../webhooks/webhook-signature.js";
import { toAsyncHook } from "../to-async-hook.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The body EXACTLY as it arrived. Signatures are computed over these bytes;
     * a re-serialised body would reorder keys and invalidate every signature.
     */
    rawBody?: Buffer | null;
    /** Set by the verification hook once the delivery is authenticated. */
    webhookConnection?: GitConnectionEntity | null;
  }
}

/**
 * A forge delivery is small — GitHub's own limit is 25 MB but a push payload is
 * kilobytes — and this parser buffers the whole thing in memory before anything
 * is authenticated. 5 MB is generous for real payloads and cheap to absorb from
 * an unauthenticated caller.
 */
const WEBHOOK_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Inbound forge webhooks.
 *
 * Registered ONCE (see `routes/index.ts`), unlike every other route module: a
 * webhook URL that resolves at two paths is two ways to deliver the same event,
 * and the second one is the one nobody remembers to rotate the secret for.
 *
 * The whole module is one Fastify plugin so the raw-body content-type parser
 * below is ENCAPSULATED. The rest of the API keeps Fastify's default JSON
 * parsing and never pays for buffering it does not need.
 */
export async function webhooksRoutes(server: FastifyInstance) {
  /**
   * Fastify 5 REJECTS reference-type defaults in `decorateRequest` (they would
   * be shared across every request), so both decorators start as `null` and are
   * assigned per request.
   */
  server.decorateRequest("rawBody", null);
  server.decorateRequest("webhookConnection", null);

  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: WEBHOOK_BODY_LIMIT_BYTES },
    (request, body, done) => {
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
      request.rawBody = raw;

      if (raw.length === 0) {
        done(null, {});
        return;
      }

      try {
        done(null, JSON.parse(raw.toString("utf8")));
      } catch {
        // Deliberately NOT an error. Parsing happens before authentication, and
        // a 400 here would answer an unsigned request about the shape of our
        // parser. An authenticated-but-unparseable delivery maps to zero events
        // and is acknowledged with a 202 further down.
        done(null, null);
      }
    },
  );

  server.post(
    "/webhooks/github/:connectionId",
    { preValidation: toAsyncHook(verifyGithubDelivery) },
    handleGithubDelivery,
  );

  server.post(
    "/webhooks/gitlab/:connectionId",
    { preValidation: toAsyncHook(verifyGitlabDelivery) },
    handleGitlabDelivery,
  );
}

/**
 * `preValidation` on a route-options object is typed against Fastify's
 * callback-style hook signature — `(request, reply, done) => void` — not the
 * async one, so an `async` guard assigned there is a Promise-returning
 * function where a void return is expected. Bridging it through `done` keeps
 * the guard itself as a plain `async` function (readable, and testable on its
 * own) while handing Fastify the shape it actually resolves for this option.
 */

/**
 * Verification runs in `preValidation`, NOT `preHandler`.
 *
 * The lifecycle is parsing → preValidation → SCHEMA VALIDATION → preHandler. A
 * zod `schema.body` therefore runs BEFORE `preHandler`, so an unsigned request
 * with a malformed body would be answered with a 400 describing our schema
 * before anyone checked whether the sender was allowed to ask. Authenticating
 * first is the only ordering where an unauthenticated caller learns nothing.
 */
async function verifyGithubDelivery(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const connection = await loadConnection(request, "github");
  const rawBody = requireRawBody(request);

  const signature = firstHeader(request.headers["x-hub-signature-256"]);

  if (!verifyGithubSignature(rawBody, connection.webhookSecret!, signature)) {
    throw new UnauthorizedError("Invalid webhook signature");
  }

  request.webhookConnection = connection;
}

/**
 * GitLab ships TWO verification mechanisms and both are live in the field, so
 * both are implemented:
 *
 * (a) legacy `X-Gitlab-Token` — the configured secret echoed back verbatim;
 * (b) GitLab 19.0+ `webhook-signature` — Standard-Webhooks HMAC over
 *     `{webhook-id}.{webhook-timestamp}.{rawBody}`.
 *
 * The signed path is preferred whenever its header is present: it binds the
 * body and a timestamp, where the plaintext token proves only that the sender
 * once saw the secret and is replayable forever.
 */
async function verifyGitlabDelivery(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const connection = await loadConnection(request, "gitlab");
  const rawBody = requireRawBody(request);
  const secret = connection.webhookSecret!;

  const signature = firstHeader(request.headers["webhook-signature"]);

  if (signature) {
    const verified = verifyGitlabSignature(rawBody, secret, {
      id: firstHeader(request.headers["webhook-id"]),
      timestamp: firstHeader(request.headers["webhook-timestamp"]),
      signature,
    });

    if (!verified) {
      throw new UnauthorizedError("Invalid webhook signature");
    }

    request.webhookConnection = connection;
    return;
  }

  const token = firstHeader(request.headers["x-gitlab-token"]);

  if (!verifyGitlabPlaintextToken(secret, token)) {
    throw new UnauthorizedError("Invalid webhook token");
  }

  request.webhookConnection = connection;
}

async function handleGithubDelivery(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const connection = request.webhookConnection!;
  const deliveryId = firstHeader(request.headers["x-github-delivery"]);
  const eventName = firstHeader(request.headers["x-github-event"]);

  if (!deliveryId) {
    // Without the forge's own delivery id there is no idempotency key, so a
    // retry would append a second copy of the same event. Refusing is safer
    // than duplicating history.
    throw new BadRequestError("Missing X-GitHub-Delivery header");
  }

  const events = eventName
    ? mapGithubDelivery(eventName, request.body, connection.externalAccountId)
    : [];

  await acknowledge(request, reply, connection, "github", deliveryId, events);
}

async function handleGitlabDelivery(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const connection = request.webhookConnection!;
  // `X-Gitlab-Event-UUID` on every version; `webhook-id` is the Standard
  // Webhooks id that 19.0+ also signs over. Either identifies the delivery.
  const deliveryId =
    firstHeader(request.headers["x-gitlab-event-uuid"]) ??
    firstHeader(request.headers["webhook-id"]);
  const eventName = firstHeader(request.headers["x-gitlab-event"]);

  if (!deliveryId) {
    throw new BadRequestError("Missing X-Gitlab-Event-UUID header");
  }

  const events = eventName
    ? mapGitlabDelivery(eventName, request.body, connection.externalAccountId)
    : [];

  await acknowledge(request, reply, connection, "gitlab", deliveryId, events);
}

/**
 * verify → append (on-conflict-do-nothing) → reply 202. Nothing else.
 *
 * gitlab.com times a delivery out at 10 seconds, does NOT retry a failed one,
 * and disables the hook after four consecutive failures — so a 500 from here
 * does not merely delay an event, it loses it permanently and eventually turns
 * the integration off. Everything expensive (digest generation, embedding,
 * posting) belongs to a later workstream reading this log, never to this
 * handler; and any failure inside it is logged and still acknowledged, because
 * the alternative is a forge that stops talking to us.
 */
async function acknowledge(
  request: FastifyRequest,
  reply: FastifyReply,
  connection: GitConnectionEntity,
  source: "github" | "gitlab",
  deliveryId: string,
  mapped: MappedForgeEvent[],
) {
  if (mapped.length === 0) {
    reply.status(202).send({ recorded: 0, duplicates: 0 });
    return;
  }

  const events: IngestActivityEventInput[] = mapped.map((event, index) => ({
    ...event,
    // One delivery can legitimately expand into several events; the suffix keeps
    // each one's idempotency key distinct while still deriving from the forge's
    // id, so a redelivery collides with the same rows it did the first time.
    externalDeliveryId: index === 0 ? deliveryId : `${deliveryId}:${index}`,
  }));

  const envelope = ingestActivitySchemaInput.safeParse({
    connectionId: connection.id,
    source,
    events,
  });

  if (!envelope.success) {
    // The schema is the thing that keeps un-modelled forge fields out of the
    // database, so a mapping that fails it is a bug in the mapper — logged, and
    // still acknowledged rather than retried into the same failure.
    request.log.warn(
      { connectionId: connection.id, source, deliveryId },
      "Webhook payload did not satisfy the ingestion contract",
    );
    reply.status(202).send({ recorded: 0, duplicates: 0 });
    return;
  }

  try {
    const ingestActivityUseCase = resolve<IngestActivityUseCase>(
      TOKENS.IngestActivityUseCase,
    );

    const result = await ingestActivityUseCase.execute({
      userId: connection.userId,
      connectionId: connection.id,
      source,
      events: envelope.data.events,
    });

    reply.status(202).send(result);
  } catch (error) {
    request.log.error(
      { err: error, connectionId: connection.id, source, deliveryId },
      "Failed to append webhook delivery to the activity log",
    );
    reply.status(202).send({ recorded: 0, duplicates: 0 });
  }
}

/**
 * Which connection a delivery belongs to comes from the URL, not the payload:
 * the path is the half of the webhook URL the user pasted into the forge, and
 * it is verified against that connection's own stored secret below. Trusting a
 * repository or account id out of the body instead would let anyone who can
 * guess an account name pick whose log they write into.
 */
async function loadConnection(
  request: FastifyRequest,
  provider: "github" | "gitlab",
): Promise<GitConnectionEntity> {
  const { connectionId } = request.params as { connectionId?: string };

  // Params are not schema-validated yet at `preValidation` time, and handing a
  // non-uuid to Postgres would raise a 500 out of the driver.
  if (!connectionId || !UUID_PATTERN.test(connectionId)) {
    throw new NotFoundError("Webhook endpoint not found");
  }

  const gitConnectionRepository = resolve<IGitConnectionRepository>(
    TOKENS.GitConnectionRepository,
  );

  const connection = await gitConnectionRepository.findById(connectionId);

  // Wrong provider, no connection and no configured secret are all the same
  // answer: there is nothing here that can authenticate a delivery, and saying
  // which of the three it was would confirm the id to an unauthenticated caller.
  if (
    !connection ||
    connection.provider !== provider ||
    !connection.webhookSecret
  ) {
    throw new NotFoundError("Webhook endpoint not found");
  }

  return connection;
}

function requireRawBody(request: FastifyRequest): Buffer {
  if (!request.rawBody) {
    throw new BadRequestError("Missing request body");
  }

  return request.rawBody;
}

/** Fastify hands duplicated headers back as an array; a signature is one value. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
