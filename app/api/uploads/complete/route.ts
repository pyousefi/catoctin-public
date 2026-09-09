import { z } from "zod";
import { session, sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { completeUpload } from "@/lib/complete-upload";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const current = await session();
  if (!current)
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const { pathname } = z
      .object({ pathname: z.string().max(200) })
      .parse(await request.json());
    const sql = db();
    const rows =
      await sql`SELECT id FROM photos WHERE pathname = ${pathname} AND session_id = ${current.id}`;
    if (!rows.length)
      return Response.json({ error: "Photo not found." }, { status: 404 });
    if (!(await completeUpload(rows[0].id, current.id)))
      throw new Error("Upload not ready");
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error:
          "Your photo is still being saved. Please try confirming it again.",
      },
      { status: 503 },
    );
  }
}
