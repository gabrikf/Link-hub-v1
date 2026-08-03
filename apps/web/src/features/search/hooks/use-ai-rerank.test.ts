import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecruiterSearchResult } from "@repo/schemas";

/**
 * A worker double we can make succeed or fail on demand. The real one downloads
 * ~1.4 MB of TensorFlow and a model from a CDN — the failure modes this file
 * exists to cover are exactly the ones that happen when that download does not
 * arrive.
 */
class FakeWorker {
  private listeners = new Map<string, Set<(event: unknown) => void>>();
  behaviour: "success" | "worker-error" | "message-error" = "success";

  addEventListener(type: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  private emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  postMessage(message: {
    payload: { candidates: RecruiterSearchResult[] };
  }) {
    queueMicrotask(() => {
      if (this.behaviour === "worker-error") {
        this.emit("error", new Event("error"));
        return;
      }

      if (this.behaviour === "message-error") {
        this.emit("message", {
          data: {
            type: "RERANK_ERROR",
            payload: {
              message:
                'Preprocessing config version "v1" does not match the runtime version "v3".',
              code: "PREPROCESSING_INCOMPATIBLE",
            },
          },
        });
        return;
      }

      this.emit("message", {
        data: {
          type: "RERANK_RESULT",
          payload: {
            candidates: message.payload.candidates.map((candidate, index) => ({
              ...candidate,
              aiScore: 1 - index * 0.1,
            })),
          },
        },
      });
    });
  }
}

const worker = new FakeWorker();

vi.mock("../../../lib/reranker-worker-singleton", () => ({
  getRerankerWorker: () => worker,
  terminateRerankerWorker: () => {},
}));

const { useAiRerank } = await import("./use-ai-rerank");

function candidate(resumeId: string): RecruiterSearchResult {
  return {
    userId: `user-${resumeId}`,
    resumeId,
    username: resumeId,
    name: `Candidate ${resumeId}`,
    userPhoto: null,
    profileDescription: null,
    similarity: 0.5,
    email: null,
    headlineTitle: "Engineer",
    summary: null,
    totalYearsExperience: 5,
    location: "lisbon",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    skills: ["React"],
    titles: ["Engineer"],
    workExperiences: [],
    workEvidence: [],
  } as RecruiterSearchResult;
}

const candidates = ["a", "b", "c"].map(candidate);

describe("F15 — a rerank failure must not cost the recruiter their results", () => {
  beforeEach(() => {
    worker.behaviour = "success";
  });

  it("ranks normally when the worker answers", async () => {
    const { result } = renderHook(() => useAiRerank());

    let outcome!: Awaited<ReturnType<typeof result.current.rerank>>;
    await act(async () => {
      outcome = await result.current.rerank({
        candidates,
        semanticQuery: "react engineer",
      });
    });

    expect(outcome.degraded).toBe(false);
    expect(outcome.reason).toBeNull();
    expect(outcome.candidates).toHaveLength(3);
    expect(outcome.candidates[0]!.aiScore).toBe(1);
  });

  it("returns every candidate, in API order, when the model fails to load", async () => {
    // `rerank()` used to be awaited inside the search mutation, so this threw
    // and the recruiter saw an error page — on top of 50 perfectly good
    // candidates the API had already returned.
    worker.behaviour = "message-error";
    const { result } = renderHook(() => useAiRerank());

    let outcome!: Awaited<ReturnType<typeof result.current.rerank>>;
    await act(async () => {
      outcome = await result.current.rerank({
        candidates,
        semanticQuery: "react engineer",
      });
    });

    expect(outcome.degraded).toBe(true);
    expect(outcome.reason).toContain("does not match the runtime version");
    expect(outcome.candidates.map((c) => c.resumeId)).toEqual(["a", "b", "c"]);
    // No invented percentage: the raw cosine is not a match score.
    expect(outcome.candidates.every((c) => c.aiScore === null)).toBe(true);
  });

  it("degrades the same way when the worker itself blows up", async () => {
    worker.behaviour = "worker-error";
    const { result } = renderHook(() => useAiRerank());

    let outcome!: Awaited<ReturnType<typeof result.current.rerank>>;
    await act(async () => {
      outcome = await result.current.rerank({
        candidates,
        semanticQuery: "react engineer",
      });
    });

    expect(outcome.degraded).toBe(true);
    expect(outcome.candidates).toHaveLength(3);
  });

  it("clears the loading flag on the failure path too", async () => {
    worker.behaviour = "worker-error";
    const { result } = renderHook(() => useAiRerank());

    await act(async () => {
      await result.current.rerank({ candidates, semanticQuery: "x" });
    });

    expect(result.current.isModelLoading).toBe(false);
  });

  it("leaks no listeners across repeated searches, successful or not", async () => {
    const { result } = renderHook(() => useAiRerank());

    for (const behaviour of ["success", "worker-error", "success"] as const) {
      worker.behaviour = behaviour;
      await act(async () => {
        await result.current.rerank({ candidates, semanticQuery: "x" });
      });
    }

    expect(worker.listenerCount("message")).toBe(0);
    expect(worker.listenerCount("error")).toBe(0);
  });

  it("short-circuits an empty result set without touching the worker", async () => {
    const { result } = renderHook(() => useAiRerank());

    let outcome!: Awaited<ReturnType<typeof result.current.rerank>>;
    await act(async () => {
      outcome = await result.current.rerank({
        candidates: [],
        semanticQuery: "x",
      });
    });

    expect(outcome).toEqual({ candidates: [], degraded: false, reason: null });
  });
});
