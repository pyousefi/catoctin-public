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
