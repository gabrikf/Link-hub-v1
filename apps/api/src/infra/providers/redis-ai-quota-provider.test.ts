import { describe, expect, it } from "vitest";
import {
  AiQuotaRedis,
  AiQuotaRedisPipeline,
  RedisAiQuotaProvider,
} from "./redis-ai-quota-provider.js";

/**
 * Driven against a fake rather than a live Redis: the behaviour that matters
 * here is the command ordering (INCR before the comparison), the UTC key shape,
 * the TTL, and — above all — that a broken Redis lets the request through. A
 * real server can demonstrate none of the failure paths without being killed
 * mid-test.
 */

type Command = { name: string; args: unknown[] };

class FakeRedis implements AiQuotaRedis {
  readonly store = new Map<string, number>();
  readonly ttls = new Map<string, number>();
  readonly commands: Command[] = [];
  /** When set, every command rejects — stands in for a dead socket. */
  failure: Error | null = null;
  /** When true, exec() resolves with the tuple shape ioredis uses on error. */
  pipelineCommandError: Error | null = null;

  pipeline(): AiQuotaRedisPipeline {
    const queued: Command[] = [];

    // `exec` is an arrow function so it closes over the FakeRedis instance's
    // own `this` lexically — `incr`/`expire` don't need instance state, so
    // they stay as plain methods returning `chain`.
    const exec = async (): Promise<Array<[Error | null, unknown]>> => {
      if (this.failure) {
        throw this.failure;
      }

      const results: Array<[Error | null, unknown]> = [];

      for (const command of queued) {
        this.commands.push(command);

        if (command.name === "incr") {
          if (this.pipelineCommandError) {
            results.push([this.pipelineCommandError, null]);
            continue;
          }
          const key = command.args[0] as string;
          const next = (this.store.get(key) ?? 0) + 1;
          this.store.set(key, next);
          results.push([null, next]);
          continue;
        }

        const [key, seconds] = command.args as [string, number];
        this.ttls.set(key, seconds);
        results.push([null, 1]);
      }

      return results;
    };

    const chain: AiQuotaRedisPipeline = {
      incr(key: string) {
        queued.push({ name: "incr", args: [key] });
        return chain;
      },
      expire(key: string, seconds: number) {
        queued.push({ name: "expire", args: [key, seconds] });
        return chain;
      },
      exec,
    };

    return chain;
  }

  async incr(key: string): Promise<number> {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push({ name: "incr", args: [key] });
    const next = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, next);
    return next;
  }

  async decr(key: string): Promise<number> {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push({ name: "decr", args: [key] });
    const next = (this.store.get(key) ?? 0) - 1;
    this.store.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push({ name: "expire", args: [key, seconds] });
    this.ttls.set(key, seconds);
    return 1;
  }
}

function buildSut(iso = "2026-08-15T17:48:00.000Z") {
  const redis = new FakeRedis();
  let current = new Date(iso);

  const sut = new RedisAiQuotaProvider({
    redis: () => redis,
    now: () => current,
  });

  return {
    sut,
    redis,
    travelTo: (next: string) => {
      current = new Date(next);
    },
  };
}

describe("RedisAiQuotaProvider — consume", () => {
  it("writes a UTC-dated key under the ai-quota namespace", async () => {
    const { sut, redis } = buildSut("2026-08-15T23:59:00.000Z");

    await sut.consume("user-1", "resume_parse", 5);

    expect([...redis.store.keys()]).toEqual([
      "ai-quota:resume_parse:user-1:2026-08-15",
    ]);
  });

  it("increments before comparing, and expires the key at the reset boundary", async () => {
    const { sut, redis } = buildSut("2026-08-15T23:59:00.000Z");

    const result = await sut.consume("user-1", "resume_parse", 5);

    expect(redis.commands.map((command) => command.name)).toEqual([
      "incr",
      "expire",
    ]);
    expect(result.used).toBe(1);

    // 60s to midnight + the 60s grace.
    expect(redis.ttls.get("ai-quota:resume_parse:user-1:2026-08-15")).toBe(120);
  });

  it("allows exactly `limit` calls and then rejects", async () => {
    const { sut } = buildSut();

    expect((await sut.consume("user-1", "resume_parse", 2)).allowed).toBe(true);
    expect((await sut.consume("user-1", "resume_parse", 2)).allowed).toBe(true);

    const rejected = await sut.consume("user-1", "resume_parse", 2);

    expect(rejected.allowed).toBe(false);
    expect(rejected.used).toBe(3);
    expect(rejected.remaining).toBe(0);
    expect(rejected.resetAt.toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("leaves the counter above the limit instead of compensating", async () => {
    const { sut, redis } = buildSut();
    const key = "ai-quota:resume_parse:user-1:2026-08-15";

    await sut.consume("user-1", "resume_parse", 1);
    await sut.consume("user-1", "resume_parse", 1);
    await sut.consume("user-1", "resume_parse", 1);

    // A rejected call still counts. Decrementing it back would reopen the race
    // the INCR-first ordering exists to close.
    expect(redis.store.get(key)).toBe(3);
    expect(redis.commands.some((command) => command.name === "decr")).toBe(
      false,
    );
  });

  it("starts a fresh budget on the next UTC day", async () => {
    const { sut, travelTo } = buildSut("2026-08-15T23:59:59.000Z");

    await sut.consume("user-1", "resume_parse", 1);
    expect((await sut.consume("user-1", "resume_parse", 1)).allowed).toBe(
      false,
    );

    travelTo("2026-08-16T00:00:01.000Z");

    const tomorrow = await sut.consume("user-1", "resume_parse", 1);

    expect(tomorrow.allowed).toBe(true);
    expect(tomorrow.used).toBe(1);
  });

  it("keeps operations independent", async () => {
    const { sut } = buildSut();

    await sut.consume("user-1", "resume_parse", 1);

    expect((await sut.consume("user-1", "recruiter_search", 1)).allowed).toBe(
      true,
    );
  });
});

describe("RedisAiQuotaProvider — Redis failure", () => {
  it("fails OPEN when the connection throws", async () => {
    const { sut, redis } = buildSut();
    redis.failure = new Error("ECONNREFUSED");

    const result = await sut.consume("user-1", "resume_parse", 5);

    // Redis being down must not take the AI routes offline — a few unmetered
    // OpenAI calls are cheaper than a product outage.
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(5);
    expect(result.resetAt.toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("fails OPEN when the pipeline reports a per-command error", async () => {
    const { sut, redis } = buildSut();
    redis.pipelineCommandError = new Error("READONLY");

    // ioredis does not reject exec() for a failed command inside the pipeline —
    // the error arrives in the result tuple, so it has to be unpacked.
    expect((await sut.consume("user-1", "resume_parse", 5)).allowed).toBe(true);
  });

  it("swallows a failing refund", async () => {
    const { sut, redis } = buildSut();
    redis.failure = new Error("ECONNREFUSED");

    await expect(sut.refund("user-1", "resume_parse")).resolves.toBeUndefined();
  });
});

describe("RedisAiQuotaProvider — refund", () => {
  it("gives the unit back", async () => {
    const { sut, redis } = buildSut();
    const key = "ai-quota:resume_parse:user-1:2026-08-15";

    await sut.consume("user-1", "resume_parse", 2);
    await sut.consume("user-1", "resume_parse", 2);
    await sut.refund("user-1", "resume_parse");

    expect(redis.store.get(key)).toBe(1);
    expect((await sut.consume("user-1", "resume_parse", 2)).allowed).toBe(true);
  });

  it("floors at zero and re-arms the TTL when the key was absent", async () => {
    const { sut, redis } = buildSut();
    const key = "ai-quota:resume_parse:user-1:2026-08-15";

    await sut.refund("user-1", "resume_parse");

    // DECR would otherwise leave -1 behind, with no expiry, granting a free
    // unit for the rest of the day.
    expect(redis.store.get(key)).toBe(0);
    expect(redis.ttls.get(key)).toBeGreaterThan(0);
  });
});
