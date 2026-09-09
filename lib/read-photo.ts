const READ_CHUNK_BYTES = 8 * 1024 * 1024;

export class PhotoReadError extends Error {
  constructor() {
    super(
      "Your phone couldn’t read this photo. Download the original to your phone, then choose it again from Files or Gallery.",
    );
    this.name = "PhotoReadError";
  }
}

function readChunk(file: Blob, start: number): Promise<Uint8Array> {
  const end = Math.min(start + READ_CHUNK_BYTES, file.size);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reader.onabort = () => reject(new PhotoReadError());
    reader.onload = () => {
      if (
        !(reader.result instanceof ArrayBuffer) ||
        reader.result.byteLength !== end - start
      ) {
        reject(new PhotoReadError());
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    try {
      reader.readAsArrayBuffer(file.slice(start, end));
    } catch {
      reject(new PhotoReadError());
    }
  });
}

export async function readPhotoForUpload(
  file: File,
): Promise<ReadableStream<Uint8Array>> {
  if (!file.size) throw new PhotoReadError();
  // Read before requesting a token: Android providers can expose metadata for unreadable files.
  let first: Uint8Array | undefined = await readChunk(file, 0);
  let offset = 0;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const chunk = first ?? (await readChunk(file, offset));
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
      },
    },
    { highWaterMark: 0 },
  );
}
