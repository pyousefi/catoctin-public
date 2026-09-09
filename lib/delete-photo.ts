import { put } from "@vercel/blob";
import { db } from "./db";

export async function deletePhoto(id: string) {
  const sql = db();
  const [photo] =
    await sql`SELECT pathname, status FROM photos WHERE id = ${id}`;
  if (!photo) return "deleted";
  if (photo.status !== "ready") return "not-ready";

  // Keep the path occupied: unexpired upload tokens cannot overwrite this marker.
  await put(photo.pathname, Buffer.alloc(0), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });

  // Only the request that removes the row releases its reservation.
  await sql`WITH removed AS (
    DELETE FROM photos WHERE id = ${id} AND pathname = ${photo.pathname}
      AND status = 'ready' RETURNING size
  )
  UPDATE storage_budget
    SET reserved_bytes = reserved_bytes - COALESCE((SELECT SUM(size) FROM removed), 0)
    WHERE id = 1`;
  return "deleted";
}
