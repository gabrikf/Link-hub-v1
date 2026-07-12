import { describe, expect, it, vi } from "vitest";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  S3FileStorageProvider,
  readS3StorageConfigFromEnv,
} from "./s3-file-storage-provider.js";

function makeConfig() {
  return {
    endpoint: "https://account.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "media",
    accessKeyId: "key",
    secretAccessKey: "secret",
    publicBaseUrl: "https://cdn.example.com",
  };
}

describe("S3FileStorageProvider", () => {
  it("uploads via PutObjectCommand and returns the public URL", async () => {
    const send = vi.fn().mockResolvedValue({});
    const fakeClient = { send } as unknown as S3Client;
    const provider = new S3FileStorageProvider(makeConfig(), fakeClient);

    const result = await provider.upload({
      body: Buffer.from("hello"),
      contentType: "image/png",
      key: "uploads/user-1/abc.png",
    });

    expect(result.url).toBe("https://cdn.example.com/uploads/user-1/abc.png");
    expect(send).toHaveBeenCalledTimes(1);

    const command = send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "media",
      Key: "uploads/user-1/abc.png",
      ContentType: "image/png",
    });
  });

  it("normalizes trailing/leading slashes when building the URL", async () => {
    const send = vi.fn().mockResolvedValue({});
    const fakeClient = { send } as unknown as S3Client;
    const provider = new S3FileStorageProvider(
      { ...makeConfig(), publicBaseUrl: "https://cdn.example.com/" },
      fakeClient,
    );

    const result = await provider.upload({
      body: Buffer.from("x"),
      contentType: "image/jpeg",
      key: "/uploads/user-2/x.jpg",
    });

    expect(result.url).toBe("https://cdn.example.com/uploads/user-2/x.jpg");
  });
});

describe("readS3StorageConfigFromEnv", () => {
  const fullEnv = {
    S3_ENDPOINT: "https://s3.example.com",
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_PUBLIC_BASE_URL: "https://cdn.example.com",
  } satisfies NodeJS.ProcessEnv;

  it("returns config with region defaulting to 'auto'", () => {
    expect(readS3StorageConfigFromEnv({ ...fullEnv })).toEqual({
      endpoint: "https://s3.example.com",
      region: "auto",
      bucket: "media",
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicBaseUrl: "https://cdn.example.com",
    });
  });

  it("honors an explicit S3_REGION", () => {
    const config = readS3StorageConfigFromEnv({
      ...fullEnv,
      S3_REGION: "us-east-1",
    });
    expect(config?.region).toBe("us-east-1");
  });

  it("returns null when a required variable is missing", () => {
    const { S3_BUCKET, ...withoutBucket } = fullEnv;
    void S3_BUCKET;
    expect(readS3StorageConfigFromEnv(withoutBucket)).toBeNull();
    expect(readS3StorageConfigFromEnv({})).toBeNull();
  });
});
