import { z } from "zod";
import { session, sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletePhoto } from "@/lib/delete-photo";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if ((await session())?.role !== "admin")
    return Response.json({ error: "Admin sign-in required." }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    if ((await deletePhoto(id)) === "not-ready")
      return Response.json(
        { error: "This photo is not ready for deletion." },
        { status: 409 },
      );
    return new Response(null, { status: 204 });
  } catch {
    return Response.json(
      {
        error:
          "Couldn’t finish deleting this photo. Please retry. Storage is released only when deletion finishes.",
      },
      { status: 503 },
    );
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if ((await session())?.role !== "admin")
    return Response.json({ error: "Admin sign-in required." }, { status: 403 });
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      return Response.json({ error: "Not found" }, { status: 404 });
    const input = z
      .object({
        transferred: z.boolean().optional(),
        hidden: z.boolean().optional(),
      })
      .refine(
        (value) =>
          value.transferred !== undefined || value.hidden !== undefined,
      )
      .parse(await request.json());
    const sql = db();
    const rows = await sql`UPDATE photos SET
      transferred_at = CASE WHEN ${input.transferred === undefined} THEN transferred_at WHEN ${input.transferred ?? false} THEN now() ELSE NULL END,
      hidden = COALESCE(${input.hidden ?? null}::boolean, hidden)
      WHERE id = ${id} AND status = 'ready' RETURNING id`;
    return rows.length
      ? Response.json({ ok: true })
      : Response.json({ error: "Not found" }, { status: 404 });
  } catch {
    return Response.json(
      { error: "Couldn’t update this photo. Please try again." },
      { status: 400 },
    );
  }
}
