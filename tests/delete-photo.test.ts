import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  put: vi.fn(),
  deleteR2: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  put: mocks.put,
}));
vi.mock("@/lib/r2", () => ({ deleteR2: mocks.deleteR2 }));
import { deletePhoto } from "@/lib/delete-photo";
const photo = { pathname: "photos/2026/test.jpg", status: "ready" };
beforeEach(() => vi.resetAllMocks());
describe("permanent photo deletion", () => {
  it("replaces only the stored pathname with an empty marker before releasing capacity", async () => {
    mocks.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 1 }]);
    await expect(deletePhoto("photo-id")).resolves.toBe("deleted");
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
      photo.pathname,
      Buffer.alloc(0),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/octet-stream",
      },
    );
    expect(mocks.put.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sql.mock.invocationCallOrder[1],
    );
  });
  it("treats an already removed photo as success without touching storage", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    await expect(deletePhoto("photo-id")).resolves.toBe("deleted");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it.each(["pending", "archived"])("refuses a %s photo", async (status) => {
    mocks.sql.mockResolvedValueOnce([{ ...photo, status }]);
    await expect(deletePhoto("photo-id")).resolves.toBe("not-ready");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("keeps metadata and reserved capacity on a Blob service failure", async () => {
    mocks.sql.mockResolvedValueOnce([photo]);
    mocks.put.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(deletePhoto("photo-id")).rejects.toThrow(
      "Storage unavailable",
    );
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("writes the marker even when retrying after the original was already removed", async () => {
    mocks.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 1 }]);
    await expect(deletePhoto("photo-id")).resolves.toBe("deleted");
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it("allows retry after the database fails following Blob deletion", async () => {
    mocks.sql
      .mockResolvedValueOnce([photo])
      .mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(deletePhoto("photo-id")).rejects.toThrow(
      "Database unavailable",
    );
    mocks.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 1 }]);
    await expect(deletePhoto("photo-id")).resolves.toBe("deleted");
  });
  it("retries against the R2 path if migration changes the path during deletion", async () => {
    const migrated = {
      pathname: "r2/preview/photos/2026/test.jpg",
      status: "ready",
    };
    mocks.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 0 }])
      .mockResolvedValueOnce([migrated])
      .mockResolvedValueOnce([{ removed_count: 1 }]);
    await expect(deletePhoto("photo-id")).resolves.toBe("deleted");
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.deleteR2).toHaveBeenCalledExactlyOnceWith(migrated.pathname);
  });
  it("reports a retry instead of false success when the path keeps changing", async () => {
    mocks.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 0 }])
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 0 }])
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ removed_count: 0 }]);
    await expect(deletePhoto("photo-id")).rejects.toThrow(
      "Photo changed during deletion",
    );
  });
});
