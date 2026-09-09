import { randomUUID } from "node:crypto";
import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { session, sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { completeUpload } from "@/lib/complete-upload";
import { photoType, uploadInput } from "@/lib/uploads";
import { startR2Upload, cancelR2Upload } from "@/lib/r2-uploads";
export const DELETE = cancelR2Upload;
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.action === "r2.create") return await startR2Upload(request, body);
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (process.env.R2_BUCKET)
          throw new Error("Reload this page to upload to R2");
        if (!sameOrigin(request)) throw new Error("Invalid origin");
        const current = await session();
        if (!current) throw new Error("Sign in to upload photos");
        const input = uploadInput.parse(JSON.parse(clientPayload ?? "{}"));
        const contentType = photoType(input.name);
        if (!contentType) throw new Error("Unsupported photo format");
        if (
          !new RegExp(`^photos/${input.year}/[a-f0-9-]{36}\\.[a-z0-9]+$`).test(
            pathname,
          )
        )
          throw new Error("Invalid upload path");
        if (photoType(pathname) !== contentType)
          throw new Error("Photo format mismatch");
        const maxStorage = Number(process.env.MAX_STORAGE_BYTES ?? 53687091200);
        if (!Number.isSafeInteger(maxStorage) || maxStorage <= 0)
          throw new Error("Invalid storage budget");
        const sql = db();
        const id = randomUUID();
        const inserted = await sql`WITH budget AS (
          UPDATE storage_budget SET reserved_bytes = reserved_bytes + ${input.size}
          WHERE id = 1 AND reserved_bytes + ${input.size} <= ${maxStorage} RETURNING id
        ) INSERT INTO photos(id, year, name, contributor, caption, size, content_type, pathname, session_id)
          SELECT ${id}, ${input.year}, ${input.name}, ${input.contributor}, ${input.caption}, ${input.size}, ${contentType}, ${pathname}, ${current.id} FROM budget RETURNING id`;
        if (!inserted.length)
          throw new Error(
            "Camp storage is full. Please contact the organizer.",
          );
        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: input.size,
          validUntil: Date.now() + 60 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ id, pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const data = JSON.parse(tokenPayload ?? "{}");
        if (typeof data.id !== "string" || data.pathname !== blob.pathname)
          throw new Error("Invalid upload receipt");
        await completeUpload(data.id);
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    // The Blob SDK requires an error response for token and signed callback failures.
    console.error(
      "Upload request failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "We couldn’t accept that photo. Check that you’re signed in and try again. If this continues, contact the camp organizer.",
      },
      { status: 400 },
    );
  }
}
