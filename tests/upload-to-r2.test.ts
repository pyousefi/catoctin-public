import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadToR2 } from "@/lib/upload-to-r2";
const fetchMock = vi.fn();
const partBytes = 8 * 1024 * 1024;
const details = {
  year: 2026,
  name: "camp.jpg",
  size: 3,
  contributor: "Camper",
  caption: "",
};
const reservation = (urls = ["https://r2.example/part1"]) =>
  Response.json({
    pathname: "r2/preview/photos/2026/test.jpg",
    partBytes,
    urls,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
function stream(chunks: Uint8Array[], cancel = vi.fn()) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
    cancel,
  });
}
describe("direct multipart photo transfer", () => {
  it("preserves exact bytes across irregular reader chunks and reports progress", async () => {
    const bytes = new Uint8Array(partBytes + 3).fill(19);
    fetchMock
      .mockResolvedValueOnce(
        reservation(["https://r2.example/1", "https://r2.example/2"]),
      )
      .mockResolvedValue(new Response());
    const progress = vi.fn();
    await uploadToR2(
      stream([bytes.subarray(0, 7), bytes.subarray(7)]),
      { ...details, size: bytes.length },
      progress,
    );
    const uploaded = createHash("sha256");
    uploaded.update(fetchMock.mock.calls[1][1].body);
    uploaded.update(fetchMock.mock.calls[2][1].body);
    expect(uploaded.digest("hex")).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(fetchMock.mock.calls[1][1].body.byteLength).toBe(partBytes);
    expect(fetchMock.mock.calls[2][1].body.byteLength).toBe(3);
    expect(progress.mock.calls).toEqual([[partBytes], [partBytes + 3]]);
    expect(fetchMock.mock.calls[1][1].credentials).toBe("omit");
  });
  it("releases provider handles when authorization fails before transfer", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    fetchMock.mockResolvedValue(
      Response.json({ error: "Please sign in" }, { status: 401 }),
    );
    await expect(uploadToR2(body, details, vi.fn())).rejects.toThrow(
      "Please sign in",
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([2, 4])(
    "aborts without accepting a reader yielding %s bytes for a 3-byte photo",
    async (size) => {
      fetchMock
        .mockResolvedValueOnce(reservation())
        .mockResolvedValue(new Response());
      await expect(
        uploadToR2(stream([new Uint8Array(size)]), details, vi.fn()),
      ).rejects.toThrow();
      expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
    },
  );
  it("retries a failed part with the same bytes without rereading the provider", async () => {
    fetchMock
      .mockResolvedValueOnce(reservation())
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response());
    await uploadToR2(stream([new Uint8Array([1, 2, 3])]), details, vi.fn());
    expect(fetchMock.mock.calls[1][1].body).toBe(
      fetchMock.mock.calls[2][1].body,
    );
  });
  it("does not retry rejected signatures and aborts the reserved upload", async () => {
    fetchMock
      .mockResolvedValueOnce(reservation())
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response());
    await expect(
      uploadToR2(stream([new Uint8Array(3)]), details, vi.fn()),
    ).rejects.toThrow("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });
});
