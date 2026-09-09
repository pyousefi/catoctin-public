import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    send = mocks.send;
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import {
  r2Config,
  r2Object,
  createR2Upload,
  finishR2Upload,
  abortR2,
  getR2,
  PART_BYTES,
} from "@/lib/r2";
const pathname = "r2/preview/photos/2026/test.jpg";
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({
    R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    R2_BUCKET: "catoctin",
    R2_PREFIX: "preview",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "secret",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
describe("private R2 originals", () => {
  it("rejects paths from another environment before accessing storage", () => {
    expect(() => r2Object("r2/production/photos/2026/test.jpg")).toThrow(
      "Invalid R2 photo path",
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    "http://example.com",
    `https://${"a".repeat(32)}.r2.cloudflarestorage.com/catoctin`,
    `https://user@${"a".repeat(32)}.r2.cloudflarestorage.com`,
  ])("rejects unsafe endpoint %s", (endpoint) => {
    vi.stubEnv("R2_ENDPOINT", endpoint);
    expect(r2Config).toThrow();
  });
  it("signs only fixed-size part writes, never client completion", async () => {
    mocks.send.mockResolvedValue({ UploadId: "upload" });
    mocks.sign.mockResolvedValue("https://signed.example");
    const upload = await createR2Upload(pathname, PART_BYTES + 3, "image/jpeg");
    expect(upload.urls).toHaveLength(2);
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(
      CreateMultipartUploadCommand,
    );
    const commands = mocks.sign.mock.calls.map((call) => call[1]);
    expect(
      commands.every((command) => command instanceof UploadPartCommand),
    ).toBe(true);
    expect(commands.map((command) => command.input.ContentLength)).toEqual([
      PART_BYTES,
      3,
    ]);
    expect(mocks.sign.mock.calls[0][2].signableHeaders).toEqual(
      new Set(["content-length"]),
    );
  });
  it("aborts the multipart upload if signing fails", async () => {
    mocks.send.mockResolvedValue({ UploadId: "upload" });
    mocks.sign.mockRejectedValue(new Error("signing failed"));
    await expect(createR2Upload(pathname, 3, "image/jpeg")).rejects.toThrow(
      "signing failed",
    );
    expect(mocks.send.mock.calls.at(-1)![0]).toBeInstanceOf(
      AbortMultipartUploadCommand,
    );
  });
  it("completes only authoritative storage parts of the reserved size", async () => {
    mocks.send
      .mockRejectedValueOnce(Object.assign(new Error(), { name: "NotFound" }))
      .mockResolvedValueOnce({
        Parts: [
          { PartNumber: 1, ETag: "a", Size: PART_BYTES },
          { PartNumber: 2, ETag: "b", Size: 3 },
        ],
      })
      .mockResolvedValueOnce({});
    await finishR2Upload(pathname, "upload", PART_BYTES + 3, "image/jpeg");
    expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(ListPartsCommand);
    expect(mocks.send.mock.calls[2][0]).toBeInstanceOf(
      CompleteMultipartUploadCommand,
    );
  });
  it.each([
    { Parts: [] },
    { Parts: [{ PartNumber: 1, ETag: "a", Size: 4 }] },
    { Parts: [{ PartNumber: 2, ETag: "a", Size: 3 }] },
    { Parts: [{ PartNumber: 1, Size: 3 }] },
    { IsTruncated: true, Parts: [{ PartNumber: 1, ETag: "a", Size: 3 }] },
  ])(
    "refuses incomplete, oversized, or unexpected parts: %j",
    async (result) => {
      mocks.send
        .mockRejectedValueOnce(Object.assign(new Error(), { name: "NotFound" }))
        .mockResolvedValueOnce(result);
      await expect(
        finishR2Upload(pathname, "upload", 3, "image/jpeg"),
      ).rejects.toThrow("parts do not match");
      expect(mocks.send).toHaveBeenCalledTimes(2);
    },
  );
  it("recovers a completed transfer without replaying completion", async () => {
    mocks.send.mockResolvedValue({
      ContentLength: 3,
      ContentType: "image/jpeg",
    });
    await finishR2Upload(pathname, "upload", 3, "image/jpeg");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched completed originals", async () => {
    mocks.send.mockResolvedValue({
      ContentLength: 4,
      ContentType: "image/jpeg",
    });
    await expect(
      finishR2Upload(pathname, "upload", 3, "image/jpeg"),
    ).rejects.toThrow("does not match");
  });
  it("does not treat access failure as an absent original", async () => {
    mocks.send.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "AccessDenied" }),
    );
    await expect(getR2(pathname)).rejects.toThrow("denied");
    await expect(
      finishR2Upload(pathname, "upload", 3, "image/jpeg"),
    ).rejects.toThrow("denied");
  });
  it("tolerates an already-aborted upload but propagates access errors", async () => {
    mocks.send
      .mockRejectedValueOnce(
        Object.assign(new Error(), { name: "NoSuchUpload" }),
      )
      .mockRejectedValueOnce(new Error("denied"));
    await expect(abortR2(pathname, "upload")).resolves.toBeUndefined();
    await expect(abortR2(pathname, "upload")).rejects.toThrow("denied");
  });
});
