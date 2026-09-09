import { PhotoReadError } from "./read-photo";

export type UploadPhase = "reading" | "transfer" | "confirmation";
export function uploadFailureCode(error: unknown) {
  if (error instanceof PhotoReadError) return "photo_unreadable";
  if (
    error instanceof Error &&
    ["NetworkError", "TypeError", "BlobServiceNotAvailable"].includes(
      error.name,
    )
  )
    return "network_or_service";
  return "upload_failed";
}
export async function reportUploadFailure(
  attemptId: string,
  phase: UploadPhase,
  bytes: number,
  error: unknown,
) {
  try {
    await fetch("/api/uploads/failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        phase,
        bytes,
        code: uploadFailureCode(error),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Diagnostics must not prevent the remaining photos from uploading while offline.
  }
}
