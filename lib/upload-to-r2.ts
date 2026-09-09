type UploadDetails = {
  year: number;
  name: string;
  size: number;
  contributor: string;
  caption: string;
};

async function uploadPart(url: string, bytes: Uint8Array<ArrayBuffer>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: bytes,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (response.ok) return;
      if (response.status < 500 && ![408, 429].includes(response.status))
        throw new Error("Photo transfer was rejected. Please try again.");
      if (attempt === 2)
        throw new Error("Photo transfer is temporarily unavailable.");
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === 2) throw error;
    }
  }
}

export async function uploadToR2(
  body: ReadableStream<Uint8Array>,
  details: UploadDetails,
  onProgress: (loaded: number) => void,
) {
  const reader = body.getReader();
  let pathname: string | undefined;
  let succeeded = false;
  try {
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "r2.create", ...details }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Couldn’t start this upload.");
    pathname = result.pathname;
    const partBytes: number = result.partBytes;
    const urls: string[] = result.urls;
    if (
      !pathname ||
      !Number.isSafeInteger(partBytes) ||
      partBytes !== 8 * 1024 * 1024 ||
      !Array.isArray(urls) ||
      urls.length !== Math.ceil(details.size / partBytes)
    )
      throw new Error("Invalid upload reservation");
    let carried: Uint8Array = new Uint8Array();
    let loaded = 0;
    for (const url of urls) {
      const bytes = new Uint8Array(Math.min(partBytes, details.size - loaded));
      let offset = 0;
      while (offset < bytes.length) {
        if (!carried.length) {
          const next = await reader.read();
          if (next.done)
            throw new Error(
              "The photo ended before all its bytes could be read.",
            );
          carried = next.value;
        }
        const count = Math.min(carried.length, bytes.length - offset);
        bytes.set(carried.subarray(0, count), offset);
        carried = carried.subarray(count);
        offset += count;
      }
      if (
        loaded + bytes.length === details.size &&
        (carried.length || !(await reader.read()).done)
      )
        throw new Error("The photo contains more bytes than expected.");
      await uploadPart(url, bytes);
      loaded += bytes.length;
      onProgress(loaded);
    }
    succeeded = true;
    return { pathname };
  } finally {
    await reader
      .cancel()
      .catch(() => console.warn("Photo reader cleanup failed"));
    reader.releaseLock();
    if (pathname && !succeeded) {
      try {
        const cleanup = await fetch("/api/uploads", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pathname }),
        });
        if (!cleanup.ok) console.warn("Upload cleanup needs reconciliation");
      } catch {
        console.warn("Upload cleanup needs reconciliation");
      }
    }
  }
}
