import { head } from "@vercel/blob";
import { db, type Photo } from "./db";
export async function completeUpload(id: string, sessionId?: string) {
  const sql = db();
  const rows =
    (await sql`SELECT * FROM photos WHERE id = ${id} AND (${sessionId ?? null}::uuid IS NULL OR session_id = ${sessionId ?? null}::uuid)`) as Photo[];
  const photo = rows[0];
  if (!photo) return false;
  if (photo.status === "ready") return true;
  if (photo.status !== "pending") return false;
  const blob = await head(photo.pathname);
  if (
    blob.size !== Number(photo.size) ||
    blob.contentType !== photo.content_type
  )
    throw new Error("Uploaded file does not match its reservation");
  await sql`UPDATE photos SET status = 'ready' WHERE id = ${id} AND status = 'pending'`;
  return true;
}
