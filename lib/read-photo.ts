const READ_CHUNK_BYTES = 8 * 1024 * 1024;

export const PHOTO_READ_REASONS = [
  "not_readable",
  "not_found",
  "permission_denied",
  "aborted",
  "size_mismatch",
  "unknown",
] as const;
type ReadReason = (typeof PHOTO_READ_REASONS)[number];
type ReadFailures = Partial<Record<"stream" | "file_reader", ReadReason>>;

export class PhotoReadError extends Error {
  constructor(readonly readFailures: ReadFailures = {}) {
    super(
      "This photo couldn’t be read. Choose it again from your photo picker, then retry.",
    );
    this.name = "PhotoReadError";
  }
}

function readReason(error: unknown): ReadReason {
  if (!(error instanceof Error)) return "unknown";
  switch (error.name) {
    case "NotReadableError":
      return "not_readable";
    case "NotFoundError":
      return "not_found";
    case "NotAllowedError":
    case "SecurityError":
      return "permission_denied";
    case "AbortError":
      return "aborted";
    default:
      return "unknown";
  }
}

async function readNative(file: File): Promise<ReadableStream<Uint8Array>> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let offset = 0;
  const stop = async () => {
    try {
      await reader?.cancel();
    } catch {
      // An errored stream rejects cancellation; retain the original read failure.
    } finally {
      reader?.releaseLock();
    }
  };
  const next = async () => {
    const part = await reader!.read();
    if (part.done) {
      if (offset !== file.size)
        throw new PhotoReadError({ stream: "size_mismatch" });
    } else {
      offset += part.value.byteLength;
      if (offset > file.size)
        throw new PhotoReadError({ stream: "size_mismatch" });
    }
    return part;
  };
  const failure = (error: unknown) =>
    error instanceof PhotoReadError
      ? error
      : new PhotoReadError({ stream: readReason(error) });
  try {
    // Keep one provider handle open: Android content URIs need not support seeking.
    reader = file.stream().getReader();
    let first: ReadableStreamReadResult<Uint8Array> | undefined = await next();
    return new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            const part = first ?? (await next());
            first = undefined;
            if (part.done) {
              reader!.releaseLock();
              controller.close();
            } else {
              controller.enqueue(part.value);
            }
          } catch (error) {
            await stop();
            controller.error(failure(error));
          }
        },
        async cancel() {
          first = undefined;
          await stop();
        },
      },
      { highWaterMark: 0 },
    );
  } catch (error) {
    await stop();
    throw failure(error);
  }
}

function readChunk(
  file: File,
  start: number,
  signal: AbortSignal,
  streamFailure?: ReadReason,
): Promise<Uint8Array> {
  const end = Math.min(start + READ_CHUNK_BYTES, file.size);
  return new Promise((resolve, reject) => {
    let cleanup = () => {};
    const fail = (reason: ReadReason) => {
      cleanup();
      reject(
        new PhotoReadError({
          stream: streamFailure,
          file_reader: reason,
        }),
      );
    };
    if (signal.aborted) {
      fail("aborted");
      return;
    }
    let reader: FileReader;
    try {
      reader = new FileReader();
    } catch (error) {
      fail(readReason(error));
      return;
    }
    const abort = () => {
      reader.abort();
      fail("aborted");
    };
    cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    reader.onerror = () => fail(readReason(reader.error));
    reader.onabort = () => fail("aborted");
    reader.onload = () => {
      if (
        !(reader.result instanceof ArrayBuffer) ||
        reader.result.byteLength !== end - start
      ) {
        fail("size_mismatch");
        return;
      }
      cleanup();
      resolve(new Uint8Array(reader.result));
    };
    try {
      reader.readAsArrayBuffer(
        start === 0 && end === file.size ? file : file.slice(start, end),
      );
    } catch (error) {
      fail(readReason(error));
    }
  });
}

export async function readPhotoForUpload(
  file: File,
): Promise<ReadableStream<Uint8Array>> {
  if (!file.size) throw new PhotoReadError();
  let streamFailure: ReadReason | undefined;
  try {
    return await readNative(file);
  } catch (error) {
    streamFailure =
      error instanceof PhotoReadError ? error.readFailures.stream : "unknown";
  }
  // Fall back only before emitting bytes, so readers can never mix versions of a file.
  const abort = new AbortController();
  let first: Uint8Array | undefined = await readChunk(
    file,
    0,
    abort.signal,
    streamFailure,
  );
  let offset = 0;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const chunk =
            first ??
            (await readChunk(file, offset, abort.signal, streamFailure));
          first = undefined;
          offset += chunk.byteLength;
          controller.enqueue(chunk);
          if (offset === file.size) controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        first = undefined;
        abort.abort();
      },
    },
    { highWaterMark: 0 },
  );
}
