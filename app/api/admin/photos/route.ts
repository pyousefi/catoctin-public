import { z } from "zod";
import { session } from "@/lib/auth";
import { years } from "@/lib/albums";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  if ((await session())?.role !== "admin")
    return Response.json({ error: "Admin sign-in required." }, { status: 403 });
  const year = z.coerce
    .number()
    .int()
    .refine((value) => years.includes(value as (typeof years)[number]))
    .safeParse(new URL(request.url).searchParams.get("year"));
  if (!year.success)
    return Response.json(
      { error: "Choose a valid camp year." },
      { status: 400 },
    );
  try {
    const sql = db();
    const photos = await sql`SELECT id, name, size FROM photos
      WHERE year = ${year.data} AND status = 'ready' ORDER BY created_at DESC, id DESC`;
    return Response.json(
      {
        photos: photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          size: Number(photo.size),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Couldn’t select all photos. Please retry." },
      { status: 503 },
    );
  }
}
