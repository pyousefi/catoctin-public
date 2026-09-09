import { put } from "@vercel/blob";
import { db } from "./db";
import { deleteR2 } from "./r2";

export async function deletePhoto(id: string) {
  const sql = db();
  for (let attempt = 0; attempt < 3; attempt++) {
    const [photo] =
      await sql`SELECT pathname, status FROM photos WHERE id = ${id}`;
    if (!photo) return "deleted";
    if (photo.status !== "ready") return "not-ready";

    if (photo.pathname.startsWith("r2/")) {
      // Part URLs cannot recreate a completed upload; only the server can complete it.
      await deleteR2(photo.pathname);
    } else {
      // Keep legacy paths occupied while their original upload tokens remain valid.
      await put(photo.pathname, Buffer.alloc(0), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/octet-stream",
      });
    }

    // Only the request that removes the row releases its reservation.
    const [result] = await sql`WITH removed AS (
    DELETE FROM photos WHERE id = ${id} AND pathname = ${photo.pathname}
      AND status = 'ready' RETURNING size
  )
  UPDATE storage_budget
    SET reserved_bytes = reserved_bytes - COALESCE((SELECT SUM(size) FROM removed), 0)
    WHERE id = 1 RETURNING (SELECT COUNT(*)::int FROM removed) AS removed_count`;
    if (result?.removed_count === 1) return "deleted";
  }
  throw new Error("Photo changed during deletion. Please retry.");
}
