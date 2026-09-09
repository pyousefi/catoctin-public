import { z } from "zod";
import { session, sameOrigin } from "@/lib/auth";
import { MAX_FILE_BYTES } from "@/lib/uploads";

const failureInput = z
  .object({
    attemptId: z.uuid(),
    phase: z.enum(["reading", "transfer", "confirmation"]),
    bytes: z.number().int().positive().max(MAX_FILE_BYTES),
    code: z.enum(["photo_unreadable", "network_or_service", "upload_failed"]),
  })
  .strict();

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (!(await session())) return new Response(null, { status: 401 });
  if (Number(request.headers.get("content-length")) > 1024)
    return new Response(null, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 1024) return new Response(null, { status: 413 });
    const failure = failureInput.parse(JSON.parse(body));
    console.warn("Photo upload failed", failure);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
