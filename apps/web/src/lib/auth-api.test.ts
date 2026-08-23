import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests drive the *real* axios instance created inside `auth-api`, with
 * only the transport adapter swapped out. That matters: the bug they guard
 * against lives in axios' header-merging + `transformRequest` pipeline, so any
 * test that mocked axios itself would pass while the app stayed broken.
 */

type CapturedRequest = {
  url?: string;
  method?: string;
  contentType: string | null;
  headers: Record<string, string>;
  data: unknown;
};

let captured: CapturedRequest[] = [];
let nextResponseData: unknown = {};

/** Records the fully-merged, post-`transformRequest` outgoing request. */
const recordingAdapter = async (
  config: AxiosRequestConfig,
): Promise<AxiosResponse> => {
  const headers = config.headers as unknown as {
    getContentType?: () => string | null | undefined;
    toJSON?: () => Record<string, string>;
  };

  captured.push({
    url: config.url,
    method: config.method,
    contentType: headers?.getContentType?.() ?? null,
    headers: headers?.toJSON?.() ?? {},
    data: config.data,
  });

  return {
    data: nextResponseData,
    status: 200,
    statusText: "OK",
    headers: {},
    config: config as AxiosResponse["config"],
  };
};

async function loadApi() {
  vi.resetModules();
  // Must be assigned *before* the module under test calls `axios.create`,
  // because `create` snapshots `axios.defaults` (adapter included).
  axios.defaults.adapter = recordingAdapter;
  return import("./auth-api");
}

beforeEach(() => {
  captured = [];
  nextResponseData = {};
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  delete (axios.defaults as { adapter?: unknown }).adapter;
});

describe("fetchWithTokens", () => {
  it("sends FormData as multipart, not as JSON", async () => {
    const { fetchWithTokens } = await loadApi();

    const formData = new FormData();
    formData.append("file", new File(["binary"], "avatar.png", { type: "image/png" }));

    await fetchWithTokens("/me/uploads", { method: "POST", data: formData });

    const [request] = captured;
    expect(request).toBeDefined();

    // Regression: `AxiosHeaders.delete("Content-Type")` did not override the
    // client's `application/json` default. axios then took the
    // `isFormData && hasJSONContentType` branch of `transformRequest`, replaced
    // the body with `JSON.stringify(formDataToJSON(data))` — dropping the file
    // — and the API rejected it with "Request must be multipart/form-data with
    // an image file."
    expect(request.contentType ?? "").not.toContain("application/json");
    expect(request.data).toBeInstanceOf(FormData);
    expect(typeof request.data).not.toBe("string");
  });

  it("still sends plain object bodies as JSON", async () => {
    const { fetchWithTokens } = await loadApi();

    await fetchWithTokens("/links", { method: "POST", data: { title: "hi" } });

    const [request] = captured;
    expect(request.contentType).toMatch(/application\/json/);
    expect(request.data).toBe(JSON.stringify({ title: "hi" }));
  });

  it("attaches stored auth headers", async () => {
    const { fetchWithTokens } = await loadApi();
    const { setAuthTokens } = await import("./auth-tokens");

    setAuthTokens({ accessToken: "access-123", refreshToken: "refresh-456" });

    await fetchWithTokens("/me", { method: "GET" });

    expect(captured[0]?.url).toBe("/me");
    expect(captured[0]?.headers).toMatchObject({
      authorization: "Bearer access-123",
      "x-refresh-token": "refresh-456",
    });
  });

  it("keeps auth headers on multipart uploads", async () => {
    const { fetchWithTokens } = await loadApi();
    const { setAuthTokens } = await import("./auth-tokens");

    setAuthTokens({ accessToken: "access-123", refreshToken: "refresh-456" });

    const formData = new FormData();
    formData.append("file", new File(["binary"], "a.png", { type: "image/png" }));
    await fetchWithTokens("/me/uploads", { method: "POST", data: formData });

    expect(captured[0]?.headers).toMatchObject({
      authorization: "Bearer access-123",
    });
    expect(captured[0]?.contentType ?? "").not.toContain("application/json");
  });
});

describe("public profile readers encode the handle", () => {
  /**
   * BUG-20260823-handle-slash-breaks-profile.
   *
   * The route param reaches the page already decoded, so a handle holding a
   * character that is significant in a URL path (`/`, `?`, `#`) changed the
   * *shape* of the outgoing request when it was interpolated raw: the api saw
   * `/profile/a/b/c` instead of `/profile/a%2Fb%2Fc` and answered 404, and the
   * visitor got "Profile not found." on a profile the api serves perfectly at
   * the encoded path.
   *
   * All four public readers are asserted together on purpose. Encoding only
   * `fetchPublicProfile` still leaves the resume, work-experience and posts
   * panels of that same page broken.
   */
  const HANDLE = "dev/with?path#chars";
  const ENCODED = "dev%2Fwith%3Fpath%23chars";

  const PROFILE_PAYLOAD = {
    username: HANDLE,
    name: "Dev With Path Chars",
    description: null,
    userPhoto: null,
    backgroundImageUrl: null,
    bannerImageUrl: null,
    themeAccent: null,
    themePreset: null,
    openToWork: false,
    location: null,
    persona: null,
    links: [],
  };

  const RESUME_PAYLOAD = {
    headlineTitle: null,
    summary: null,
    totalYearsExperience: null,
    location: null,
    seniorityLevel: null,
    workModel: null,
    contractType: null,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    spokenLanguages: [],
    noticePeriod: null,
    openToRelocation: false,
    skills: [],
    titles: [],
  };

  it("fetchPublicProfile requests the encoded handle", async () => {
    const { fetchPublicProfile } = await loadApi();
    nextResponseData = PROFILE_PAYLOAD;

    await fetchPublicProfile(HANDLE);

    expect(captured[0]?.url).toBe(`/profile/${ENCODED}`);
  });

  it("fetchPublicResume requests the encoded handle", async () => {
    const { fetchPublicResume } = await loadApi();
    nextResponseData = RESUME_PAYLOAD;

    await fetchPublicResume(HANDLE);

    expect(captured[0]?.url).toBe(`/profile/${ENCODED}/resume`);
  });

  it("fetchPublicWorkExperiences requests the encoded handle", async () => {
    const { fetchPublicWorkExperiences } = await loadApi();
    nextResponseData = [];

    await fetchPublicWorkExperiences(HANDLE);

    expect(captured[0]?.url).toBe(`/profile/${ENCODED}/work-experiences`);
  });

  it("leaves an ordinary handle untouched", async () => {
    const { fetchPublicProfile } = await loadApi();
    nextResponseData = { ...PROFILE_PAYLOAD, username: "gabrielkochf" };

    await fetchPublicProfile("gabrielkochf");

    expect(captured[0]?.url).toBe("/profile/gabrielkochf");
  });
});

describe("uploadImage", () => {
  it("posts the file to /me/uploads as multipart and returns the stored URL", async () => {
    await loadApi();
    const { uploadImage } = await import("./upload-api");

    nextResponseData = { url: "https://cdn.example.com/uploads/u1/abc.png" };

    const url = await uploadImage(
      new File(["binary"], "avatar.png", { type: "image/png" }),
    );

    expect(url).toBe("https://cdn.example.com/uploads/u1/abc.png");

    const [request] = captured;
    expect(request.url).toBe("/me/uploads");
    expect(request.method).toBe("post");
    expect(request.data).toBeInstanceOf(FormData);
    expect((request.data as FormData).get("file")).toBeInstanceOf(File);
    expect(request.contentType ?? "").not.toContain("application/json");
  });
});
