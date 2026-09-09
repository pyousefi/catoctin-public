import { S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

it("includes the exact part length in a real S3 signature without network access", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const url = new URL(
    await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: "catoctin",
        Key: "r2/preview/photos/2026/test.jpg",
        UploadId: "test-upload",
        PartNumber: 1,
        ContentLength: 3,
      }),
      { expiresIn: 3600, signableHeaders: new Set(["content-length"]) },
    ),
  );
  expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain(
    "content-length",
  );
  expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
  expect(url.searchParams.get("uploadId")).toBe("test-upload");
  expect(url.searchParams.get("partNumber")).toBe("1");
  client.destroy();
});
