import { describe, expect, it } from "vitest";
import { InMemoryAiQuotaProvider } from "./in-memory-ai-quota-provider.js";

/**
 * The semantics pinned here are the contract `RedisAiQuotaProvider` also has to
 * honour: increment-first, a hard UTC day boundary, and a refund that floors.
 */

function clockAt(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    set: (next: string) => {
      current = new Date(next);
    },
  };
}

describe("InMemoryAiQuotaProvider", () => {
  it("allows calls under the limit and counts them down", async () => {
    const clock = clockAt("2026-08-15T10:00:00.000Z");
    const sut = new InMemoryAiQuotaProvider({ now: clock.now });

    const first = await sut.consume("user-1", "resume_parse", 3);
    const second = await sut.consume("user-1", "resume_parse", 3);

    expect(first).toMatchObject({ allowed: true, used: 1, remaining: 2 });
    expect(second).toMatchObject({ allowed: true, used: 2, remaining: 1 });
  });

  it("allows exactly `limit` calls, then rejects with the next UTC midnight", async () => {
    const clock = clockAt("2026-08-15T17:48:00.000Z");
    const sut = new InMemoryAiQuotaProvider({ now: clock.now });

    await sut.consume("user-1", "resume_parse", 2);
    const atLimit = await sut.consume("user-1", "resume_parse", 2);
    const overLimit = await sut.consume("user-1", "resume_parse", 2);

    expect(atLimit.allowed).toBe(true);
    expect(atLimit.remaining).toBe(0);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
    expect(overLimit.resetAt.toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("keeps operations and users independent", async () => {
    const clock = clockAt("2026-08-15T10:00:00.000Z");
    const sut = new InMemoryAiQuotaProvider({ now: clock.now });

    await sut.consume("user-1", "resume_parse", 1);

    expect(
      (await sut.consume("user-1", "recruiter_search", 1)).allowed,
    ).toBe(true);
    expect((await sut.consume("user-2", "resume_parse", 1)).allowed).toBe(true);
    expect((await sut.consume("user-1", "resume_parse", 1)).allowed).toBe(false);
  });

  it("resets when the UTC day rolls over", async () => {
    const clock = clockAt("2026-08-15T23:59:59.000Z");
    const sut = new InMemoryAiQuotaProvider({ now: clock.now });

    await sut.consume("user-1", "resume_parse", 1);
    expect((await sut.consume("user-1", "resume_parse", 1)).allowed).toBe(false);

    // One second later — a different UTC day, so a fresh budget.
    clock.set("2026-08-16T00:00:00.000Z");

    const afterMidnight = await sut.consume("user-1", "resume_parse", 1);

    expect(afterMidnight.allowed).toBe(true);
    expect(afterMidnight.used).toBe(1);
    expect(afterMidnight.resetAt.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("does NOT reset on local midnight in a non-UTC timezone", async () => {
    // 2026-08-15T23:00Z is already the 16th in São Paulo-plus-3 style offsets
    // and still the 15th in UTC. The counter must follow UTC only.
    const clock = clockAt("2026-08-15T23:00:00.000Z");
    const sut = new InMemoryAiQuotaProvider({ now: clock.now });

    await sut.consume("user-1", "resume_parse", 1);
    clock.set("2026-08-15T23:30:00.000Z");

    expect((await sut.consume("user-1", "resume_parse", 1)).allowed).toBe(false);
  });

  it("refunds a unit, and never below zero", async () => {
    const clock = clockAt("2026-08-15T10:00:00.000Z");
    const sut = new InMemoryAiQuotaProvider({ now: clock.now });

    await sut.consume("user-1", "resume_parse", 2);
    await sut.consume("user-1", "resume_parse", 2);
    await sut.refund("user-1", "resume_parse");

    expect(sut.usedToday("user-1", "resume_parse")).toBe(1);

    await sut.refund("user-1", "resume_parse");
    await sut.refund("user-1", "resume_parse");

    expect(sut.usedToday("user-1", "resume_parse")).toBe(0);
    expect((await sut.consume("user-1", "resume_parse", 2)).allowed).toBe(true);
  });
});
