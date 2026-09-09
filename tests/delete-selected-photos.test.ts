import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteSelectedPhotos } from "@/lib/delete-selected-photos";

afterEach(() => vi.unstubAllGlobals());

describe("bulk deletion queue", () => {
  it("deletes selected IDs once, sequentially, and reports progress", async () => {
    let active = 0;
    const fetch = vi.fn(async () => {
      expect(++active).toBe(1);
      await Promise.resolve();
      active--;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetch);
    const deleted = vi.fn();
    const progress = vi.fn();
    expect(
      await deleteSelectedPhotos(
        ["first", "second", "first"],
        deleted,
        progress,
      ),
    ).toEqual([]);
    expect(fetch.mock.calls).toHaveLength(2);
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/admin/photos/first", {
      method: "DELETE",
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/admin/photos/second", {
      method: "DELETE",
    });
    expect(deleted.mock.calls).toEqual([["first"], ["second"]]);
    expect(progress.mock.calls).toEqual([[1], [2]]);
  });

  it("keeps failed IDs for retry while removing later successes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Please retry." }, { status: 503 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetch);
    const deleted = vi.fn();
    const progress = vi.fn();
    const failures = await deleteSelectedPhotos(
      ["first", "second", "third"],
      deleted,
      progress,
    );
    expect(failures).toEqual([
      { id: "first", error: "Please retry." },
      { id: "third", error: "Network unavailable" },
    ]);
    expect(deleted.mock.calls).toEqual([["second"]]);
    expect(progress).toHaveBeenLastCalledWith(3);
    fetch.mockClear().mockResolvedValue(new Response(null, { status: 204 }));
    await deleteSelectedPhotos(
      failures.map((failure) => failure.id),
      deleted,
      progress,
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/photos/first",
      "/api/admin/photos/third",
    ]);
  });

  it("gives a usable error for an HTML service failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Unavailable", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    expect(await deleteSelectedPhotos(["first"], vi.fn(), vi.fn())).toEqual([
      { id: "first", error: "Deletion failed. Please retry." },
    ]);
  });

  it("does nothing for an empty selection", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await deleteSelectedPhotos([], vi.fn(), vi.fn())).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
