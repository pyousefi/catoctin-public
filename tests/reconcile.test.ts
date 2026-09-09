import { describe, expect, it, vi } from "vitest";
import { BlobNotFoundError } from "@vercel/blob";
import { reconcilePending } from "../scripts/reconcile-uploads.mjs";
const photo = {
  id: "9e067844-189c-415a-9868-b0de1987cc67",
  pathname: "photos/2026/original.jpg",
  size: 20,
  content_type: "image/jpeg",
};
describe("abandoned upload recovery", () => {
  it("is read-only by default, even when a reservation has no blob", async () => {
    const sql = vi.fn().mockResolvedValue([photo]);
    const inspect = vi.fn().mockRejectedValue(new BlobNotFoundError());
    expect(await reconcilePending(sql, inspect)).toEqual([
      { id: photo.id, action: "would-release-missing-reservation" },
    ]);
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("recovers matching originals instead of removing their reservation", async () => {
    const sql = vi.fn().mockResolvedValueOnce([photo]).mockResolvedValue([]);
    const inspect = vi
      .fn()
      .mockResolvedValue({ size: 20, contentType: "image/jpeg" });
    expect(await reconcilePending(sql, inspect, true)).toEqual([
      { id: photo.id, action: "recovered" },
    ]);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1][0].join("")).toContain("status = 'ready'");
  });
  it("retains capacity for mismatching files and reports manual review", async () => {
    const sql = vi.fn().mockResolvedValue([photo]);
    const inspect = vi
      .fn()
      .mockResolvedValue({ size: 19, contentType: "image/jpeg" });
    expect((await reconcilePending(sql, inspect, true))[0].action).toBe(
      "manual-review",
    );
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("never interprets an access or service failure as an absent original", async () => {
    const sql = vi.fn().mockResolvedValue([photo]);
    const inspect = vi
      .fn()
      .mockRejectedValue(new Error("Storage authentication failed"));
    await expect(reconcilePending(sql, inspect, true)).rejects.toThrow(
      "authentication failed",
    );
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("atomically archives and releases only a confirmed missing reservation", async () => {
    const sql = vi.fn().mockResolvedValueOnce([photo]).mockResolvedValue([]);
    const inspect = vi.fn().mockRejectedValue(new BlobNotFoundError());
    expect((await reconcilePending(sql, inspect, true))[0].action).toBe(
      "released-missing-reservation",
    );
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1][0].join("")).toContain("RETURNING size");
  });
});

const r2Photo = {
  ...photo,
  pathname: `r2/production/${photo.pathname}`,
  r2_upload_id: "multipart-id",
};
const missingR2 = () =>
  Object.assign(new Error("missing"), { name: "NotFound" });
const completeR2 = { ContentLength: 20, ContentType: "image/jpeg" };

function r2Setup() {
  return {
    sql: vi.fn().mockResolvedValueOnce([r2Photo]).mockResolvedValue([]),
    inspectBlob: vi.fn(),
    r2: { bucket: "catoctin", s3: { send: vi.fn() } },
  };
}

describe("abandoned R2 multipart upload recovery", () => {
  it("inspects R2 directly and does not abort missing uploads in dry run", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send.mockRejectedValue(missingR2());
    expect(await reconcilePending(sql, inspectBlob, false, r2)).toEqual([
      { id: photo.id, action: "would-release-missing-reservation" },
    ]);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(inspectBlob).not.toHaveBeenCalled();
    expect(r2.s3.send).toHaveBeenCalledTimes(1);
    expect(r2.s3.send.mock.calls[0][0].constructor.name).toBe(
      "HeadObjectCommand",
    );
  });

  it("recovers a completed matching original and clears its multipart ID", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send.mockResolvedValue(completeR2);
    expect(await reconcilePending(sql, inspectBlob, true, r2)).toEqual([
      { id: photo.id, action: "recovered" },
    ]);
    expect(r2.s3.send).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[1][0].join("")).toContain("r2_upload_id = NULL");
    expect(inspectBlob).not.toHaveBeenCalled();
  });

  it("aborts the recorded multipart upload before atomically releasing capacity", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    const order: string[] = [];
    r2.s3.send.mockImplementation(async (command) => {
      order.push(command.constructor.name);
      if (command.constructor.name === "HeadObjectCommand") throw missingR2();
      return {};
    });
    sql
      .mockReset()
      .mockResolvedValueOnce([r2Photo])
      .mockImplementationOnce(async () => {
        order.push("release");
        return [];
      });
    await reconcilePending(sql, inspectBlob, true, r2);
    expect(order).toEqual([
      "HeadObjectCommand",
      "AbortMultipartUploadCommand",
      "HeadObjectCommand",
      "release",
    ]);
    expect(r2.s3.send.mock.calls[1][0].input).toEqual({
      Bucket: "catoctin",
      Key: r2Photo.pathname,
      UploadId: "multipart-id",
    });
    expect(sql.mock.calls[1][0].join("")).toContain(
      "r2_upload_id IS NOT DISTINCT FROM",
    );
    expect(sql.mock.calls[1][0].join("")).toContain("RETURNING size");
  });

  it("tolerates only a confirmed already-absent multipart upload", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send
      .mockRejectedValueOnce(missingR2())
      .mockRejectedValueOnce(
        Object.assign(new Error("absent upload"), { name: "NoSuchUpload" }),
      )
      .mockRejectedValueOnce(missingR2());
    expect((await reconcilePending(sql, inspectBlob, true, r2))[0].action).toBe(
      "released-missing-reservation",
    );
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("recovers an original completed concurrently with abort", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send
      .mockRejectedValueOnce(missingR2())
      .mockRejectedValueOnce(
        Object.assign(new Error("completed upload"), { name: "NoSuchUpload" }),
      )
      .mockResolvedValueOnce(completeR2);
    expect((await reconcilePending(sql, inspectBlob, true, r2))[0].action).toBe(
      "recovered",
    );
    expect(sql.mock.calls[1][0].join("")).toContain("status = 'ready'");
  });

  it("retains capacity when multipart abort fails", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send
      .mockRejectedValueOnce(missingR2())
      .mockRejectedValueOnce(new Error("Access denied"));
    await expect(reconcilePending(sql, inspectBlob, true, r2)).rejects.toThrow(
      "Access denied",
    );
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("never falls back to Blob or releases capacity on R2 access errors", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send.mockRejectedValue(new Error("R2 access denied"));
    await expect(reconcilePending(sql, inspectBlob, true, r2)).rejects.toThrow(
      "R2 access denied",
    );
    expect(sql).toHaveBeenCalledTimes(1);
    expect(inspectBlob).not.toHaveBeenCalled();
  });

  it("retains capacity for mismatched completed R2 originals", async () => {
    const { sql, inspectBlob, r2 } = r2Setup();
    r2.s3.send.mockResolvedValue({ ...completeR2, ContentLength: 19 });
    expect((await reconcilePending(sql, inspectBlob, true, r2))[0].action).toBe(
      "manual-review",
    );
    expect(sql).toHaveBeenCalledTimes(1);
    expect(r2.s3.send).toHaveBeenCalledTimes(1);
  });
});
