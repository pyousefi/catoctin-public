import { get } from "@vercel/blob";
import { z } from "zod";
import { session } from "@/lib/auth";
import { db, type Photo } from "@/lib/db";
import { canPreview } from "@/lib/uploads";
export const maxDuration = 300;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const current = await session();
  if (!current) return new Response("Please sign in.", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });
  try {
    const sql = db();
    const rows =
      (await sql`SELECT * FROM photos WHERE id = ${id} AND status = 'ready' AND (${current.role === "admin"} OR hidden = false)`) as Photo[];
    if (!rows.length) return new Response("Not found", { status: 404 });
    const photo = rows[0];
    const result = await get(photo.pathname, {
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200)
      return new Response("Not found", { status: 404 });
    const download =
      new URL(request.url).searchParams.has("download") ||
      !canPreview(photo.content_type);
    return new Response(result.stream, {
      headers: {
        "Content-Type": photo.content_type,
        "Content-Length": String(result.blob.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(photo.name).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Photo temporarily unavailable", { status: 503 });
  }
}
