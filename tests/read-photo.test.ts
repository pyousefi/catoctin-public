import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoReadError, readPhotoForUpload } from "@/lib/read-photo";

const read = vi.fn();
class Reader {
  result: unknown;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  readAsArrayBuffer(blob: Blob) {
    read(blob).then(
      (result: unknown) => {
        this.result = result;
        this.onload?.();
      },
      () => this.onerror?.(),
    );
  }
}
beforeEach(() => {
  vi.stubGlobal("FileReader", Reader);
  read.mockReset().mockImplementation((blob: Blob) => blob.arrayBuffer());
});
afterEach(() => vi.unstubAllGlobals());

describe("reading mobile originals before transfer", () => {
  it("reads original bytes without relying on the provider File.stream implementation", async () => {
    const file = new File([new Uint8Array([255, 216, 1, 2, 3])], "phone.jpg");
    vi.spyOn(file, "stream").mockImplementation(() => {
      throw new DOMException("A network error occurred", "NetworkError");
    });
    const body = await readPhotoForUpload(file);
    expect(read).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 1, 2, 3]),
    );
    expect(file.stream).not.toHaveBeenCalled();
  });
  it("reports an unreadable source before returning a body or requesting storage", async () => {
    read.mockRejectedValue(
      new DOMException("A network error occurred", "NetworkError"),
    );
    await expect(
      readPhotoForUpload(new File(["original"], "cloud.jpg")),
    ).rejects.toBeInstanceOf(PhotoReadError);
  });
  it("rejects empty and truncated provider reads", async () => {
    await expect(
      readPhotoForUpload(new File([], "empty.jpg")),
    ).rejects.toBeInstanceOf(PhotoReadError);
    read.mockResolvedValue(new ArrayBuffer(1));
    await expect(
      readPhotoForUpload(new File(["original"], "cloud.jpg")),
    ).rejects.toBeInstanceOf(PhotoReadError);
  });
  it("reads large originals lazily in chunks no larger than eight MiB", async () => {
    const original = new Uint8Array(17 * 1024 * 1024).fill(7);
    const body = await readPhotoForUpload(new File([original], "large.jpg"));
    expect(read).toHaveBeenCalledTimes(1);
    const reader = body.getReader();
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      expect(part.value.every((value) => value === 7)).toBe(true);
      bytes += part.value.length;
    }
    expect(bytes).toBe(original.length);
    expect(read.mock.calls.map(([blob]) => blob.size)).toEqual([
      8 * 1024 * 1024,
      8 * 1024 * 1024,
      1024 * 1024,
    ]);
  });
  it("identifies later provider read failures separately from network transfer", async () => {
    const body = await readPhotoForUpload(
      new File([new Uint8Array(9 * 1024 * 1024)], "large.jpg"),
    );
    const reader = body.getReader();
    await reader.read();
    read.mockRejectedValue(new Error("provider unavailable"));
    await expect(reader.read()).rejects.toBeInstanceOf(PhotoReadError);
  });
  it("does not keep reading after cancellation", async () => {
    const body = await readPhotoForUpload(
      new File([new Uint8Array(9 * 1024 * 1024)], "large.jpg"),
    );
    await body.cancel();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
