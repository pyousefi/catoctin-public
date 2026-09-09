import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoReadError, readPhotoForUpload } from "@/lib/read-photo";

const MiB = 1024 * 1024;
const read = vi.fn();
const abort = vi.fn();
class Reader {
  result: unknown;
  error: unknown;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  abort() {
    abort();
    this.onabort?.();
  }
  readAsArrayBuffer(blob: Blob) {
    read(blob).then(
      (result: unknown) => {
        this.result = result;
        this.onload?.();
      },
      (error: unknown) => {
        this.error = error;
        this.onerror?.();
      },
    );
  }
}
beforeEach(() => {
  vi.stubGlobal("FileReader", Reader);
  abort.mockReset();
  read.mockReset().mockImplementation((blob: Blob) => blob.arrayBuffer());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function failStream(file: File) {
  vi.spyOn(file, "stream").mockImplementation(() => {
    throw new DOMException("private provider detail", "NotReadableError");
  });
}

describe("reading mobile originals before transfer", () => {
  it("reads a provider file continuously without slicing or reopening it", async () => {
    const original = new Uint8Array(17 * MiB).fill(7);
    const file = new File([original], "camera.jpg");
    const stream = vi.spyOn(file, "stream");
    const slice = vi.spyOn(file, "slice").mockImplementation(() => {
      throw new DOMException("Provider cannot seek", "NotReadableError");
    });
    const body = await readPhotoForUpload(file);
    expect(
      Buffer.compare(
        Buffer.from(await new Response(body).arrayBuffer()),
        Buffer.from(original),
      ),
    ).toBe(0);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(slice).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it("falls back to an unsliced FileReader for an ordinary photo", async () => {
    const file = new File([new Uint8Array([255, 216, 1, 2, 3])], "phone.jpg");
    failStream(file);
    const slice = vi.spyOn(file, "slice").mockImplementation(() => {
      throw new Error("cannot seek");
    });
    const body = await readPhotoForUpload(file);
    expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 1, 2, 3]),
    );
    expect(read).toHaveBeenCalledWith(file);
    expect(slice).not.toHaveBeenCalled();
  });
  it("falls back when the stream rejects its first asynchronous read", async () => {
    const file = new File(["original"], "camera.jpg");
    vi.spyOn(file, "stream").mockReturnValue(
      new ReadableStream({
        pull(controller) {
          controller.error(new DOMException("private", "NotReadableError"));
        },
      }),
    );
    const body = await readPhotoForUpload(file);
    expect(await new Response(body).text()).toBe("original");
    expect(read).toHaveBeenCalledWith(file);
  });
  it("retains only allowlisted failure reasons when neither reader works", async () => {
    const file = new File(["original"], "cloud.jpg");
    failStream(file);
    read.mockRejectedValue(new DOMException("private URI", "SecurityError"));
    await expect(readPhotoForUpload(file)).rejects.toMatchObject({
      name: "PhotoReadError",
      readFailures: {
        stream: "not_readable",
        file_reader: "permission_denied",
      },
    });
  });
  it("rejects empty photos before opening a reader", async () => {
    await expect(
      readPhotoForUpload(new File([], "empty.jpg")),
    ).rejects.toBeInstanceOf(PhotoReadError);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects truncated fallback reads", async () => {
    const file = new File(["original"], "cloud.jpg");
    failStream(file);
    read.mockResolvedValue(new ArrayBuffer(1));
    await expect(readPhotoForUpload(file)).rejects.toMatchObject({
      readFailures: { file_reader: "size_mismatch" },
    });
  });
  it("keeps fallback reads lazy and bounded to eight MiB", async () => {
    const original = new Uint8Array(17 * MiB).fill(7);
    const file = new File([original], "large.jpg");
    failStream(file);
    const body = await readPhotoForUpload(file);
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
      8 * MiB,
      8 * MiB,
      MiB,
    ]);
  });
  it("does not reopen a file after emitting native bytes or hide a later failure", async () => {
    const file = new File(["original"], "large.jpg");
    let calls = 0;
    vi.spyOn(file, "stream").mockReturnValue(
      new ReadableStream(
        {
          pull(controller) {
            if (calls++ === 0) controller.enqueue(new Uint8Array([1, 2]));
            else controller.error(new DOMException("private", "NotFoundError"));
          },
        },
        { highWaterMark: 0 },
      ),
    );
    const reader = (await readPhotoForUpload(file)).getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]));
    await expect(reader.read()).rejects.toMatchObject({
      readFailures: { stream: "not_found" },
    });
    expect(read).not.toHaveBeenCalled();
  });
  it.each([1, 9])(
    "rejects a native stream whose %i bytes disagree with its selected size",
    async (length) => {
      const file = new File(["original"], "camera.jpg");
      vi.spyOn(file, "stream").mockReturnValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(length));
            controller.close();
          },
        }),
      );
      read.mockResolvedValue(new ArrayBuffer(length));
      await expect(
        (async () =>
          new Response(await readPhotoForUpload(file)).arrayBuffer())(),
      ).rejects.toBeInstanceOf(PhotoReadError);
    },
  );
  it("cancels and releases the native provider when the upload is cancelled", async () => {
    const file = new File(["original"], "camera.jpg");
    const cancel = vi.fn();
    const source = new ReadableStream(
      {
        pull(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    vi.spyOn(file, "stream").mockReturnValue(source);
    await (await readPhotoForUpload(file)).cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(source.locked).toBe(false);
  });
  it("aborts an in-flight fallback read when the upload is cancelled", async () => {
    const file = new File([new Uint8Array(9 * MiB)], "large.jpg");
    failStream(file);
    const reader = (await readPhotoForUpload(file)).getReader();
    await reader.read();
    read.mockImplementation(() => new Promise(() => {}));
    const pending = reader.read();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await reader.cancel();
    expect(abort).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toMatchObject({ done: true });
  });
  it("identifies later fallback failures and stops reading after cancellation", async () => {
    const file = new File([new Uint8Array(9 * MiB)], "large.jpg");
    failStream(file);
    const reader = (await readPhotoForUpload(file)).getReader();
    await reader.read();
    read.mockRejectedValue(new DOMException("private", "AbortError"));
    await expect(reader.read()).rejects.toMatchObject({
      readFailures: { file_reader: "aborted" },
    });
    read.mockImplementation((blob: Blob) => blob.arrayBuffer());
    const body = await readPhotoForUpload(file);
    const count = read.mock.calls.length;
    await body.cancel();
    expect(read).toHaveBeenCalledTimes(count);
  });
});
