import { FastifyRequest } from "fastify";
import { structuredLoggingEnabled } from "../../config/app-config.js";
import { captureApiException } from "../../observability/sentry.js";

/**
 * Make a handler answer after a FIXED amount of time, whatever it did inside.
 *
 * WHY THIS EXISTS
 *
 * `/auth/forgot-password` and `/auth/resend-verification` take an address from
 * an unauthenticated caller and answer `200 { status: "sent" }` for every one:
 * a registered address, an unknown one, an OAuth-only account, one still inside
 * the cooldown. Status, body and headers are byte-identical by design.
 *
 * The clock was not. The "this account exists" branch generates a token, writes
 * a row and hands a message to the mail transport; the "no such account" branch
 * generates a token and throws it away. Measured against a running API on this
 * machine, that was ~9 ms vs ~2 ms with `MAIL_TRANSPORT=log` and ~50 ms vs
 * ~2 ms with SMTP pointed at a mail catcher on localhost — with a real relay,
 * hundreds of milliseconds. The two distributions never overlapped. A stopwatch
 * answered the question the response body refused to, on the FIRST probe, which
 * is the only one an attacker needs (the 60-second per-email cooldown only
 * flattens repeats).
 *
 * The cost asymmetry cannot be removed: you cannot write a reset row for a user
 * that does not exist, and you must not send mail to an address nobody
 * registered. So the observable time is decoupled from the work instead.
 *
 * WHAT IT GUARANTEES
 *
 * The handler resolves when `floorMs` has elapsed — not when `work` finishes.
 *
 * - Work faster than the floor (every healthy request): the response still
 *   waits out the floor.
 * - Work slower than the floor (a struggling SMTP relay): the response goes out
 *   ON the floor anyway and the work carries on detached. A slow transport
 *   cannot stretch the response, so it cannot re-open the oracle it would
 *   otherwise re-open by making the "account exists" branch visibly longer.
 * - The failure of the detached work never reaches the client. It is logged and
 *   reported to Sentry instead. This is a deliberate change: letting it become
 *   a 500 would move the oracle from the clock to the status code, because only
 *   the branch with a real account can fail that way.
 *
 * The rejection handler is attached in the same tick the promise is created, so
 * a failure that lands after the reply has gone out is caught rather than
 * becoming an unhandled rejection.
 *
 * WHAT IT DOES NOT GUARANTEE
 *
 * - Schema-validation failures never get here. Fastify rejects a malformed body
 *   before the handler runs, so a 400 answers immediately. That is correct: the
 *   answer "that is not an email address" is not a secret and does not depend on
 *   who has an account.
 * - Sub-millisecond jitter remains. After the floor fires, a request whose
 *   detached work is still in flight competes for the event loop with one that
 *   has nothing left to do. The difference is orders of magnitude below the
 *   network noise any remote attacker measures through, and it is not a
 *   function of the branch in any way a timer can resolve — but "constant time"
 *   here means "the floor dominates", not "identical to the nanosecond".
 * - It says nothing about OTHER endpoints. Anything else that answers
 *   differently for a known address is its own oracle and its own fix.
 */
export interface ResponseTimeFloorOptions {
  /** The request being served. Used only for log/Sentry correlation. */
  request: FastifyRequest;
  /** Wall-clock milliseconds every response must take. */
  floorMs: number;
  /** The real work. Its result is dropped; its failure is logged, never sent. */
  work: () => Promise<unknown>;
}

export async function withResponseTimeFloor({
  request,
  floorMs,
  work,
}: ResponseTimeFloorOptions): Promise<void> {
  const floor = new Promise<void>((resolve) => {
    setTimeout(resolve, floorMs);
  });

  /**
   * The async wrapper turns a SYNCHRONOUS throw from `work()` into a rejection,
   * so both failure shapes land on the same handler instead of escaping past
   * the floor and answering early — an early error would be a timing signal of
   * its own.
   */
  const supervised = (async () => work())();

  void supervised.catch((error: unknown) => {
    reportSuppressedFailure(request, error);
  });

  await floor;
}

/**
 * Record a failure the client will never be told about.
 *
 * Silence here would turn a broken mail transport into an endpoint that
 * cheerfully reports success forever, so this is loud on the server side. It
 * carries the route and the request id and NOTHING from the request body — that
 * body is an email address, and the whole point of the endpoint is not to
 * disclose which ones exist. Writing one into a log line, or into a Sentry
 * event, would hand out through the back door exactly what the front door is
 * built to withhold.
 */
function reportSuppressedFailure(request: FastifyRequest, error: unknown): void {
  const details = {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    route: request.routeOptions?.url,
    method: request.method,
    requestId: request.id,
  };

  // Same fallback as the global error handler: development runs Fastify with
  // `logger: false`, whose no-op logger would swallow this line entirely.
  if (structuredLoggingEnabled()) {
    request.log.error(
      details,
      "Auth email work failed after the response was already sent",
    );
  } else {
    console.error(
      "Auth email work failed after the response was already sent:",
      details,
    );
  }

  captureApiException(error, {
    route: request.routeOptions?.url,
    method: request.method,
    statusCode: 200,
    requestId: request.id,
  });
}
