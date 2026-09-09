import { neon } from "@neondatabase/serverless";
import { head, BlobNotFoundError } from "@vercel/blob";
import { pathToFileURL } from "node:url";

export async function reconcilePending(sql, inspectBlob, apply = false) {
  const photos = await sql`SELECT id, pathname, size, content_type FROM photos
    WHERE status = 'pending' AND created_at < now() - interval '48 hours' ORDER BY created_at`;
  const results = [];
  for (const photo of photos) {
    try {
      const blob = await inspectBlob(photo.pathname);
      if (
        Number(photo.size) !== blob.size ||
        photo.content_type !== blob.contentType
      ) {
        results.push({
          id: photo.id,
          action: "manual-review",
          reason: "Stored file differs from reservation; capacity retained.",
        });
        continue;
      }
      if (apply)
        await sql`UPDATE photos SET status = 'ready' WHERE id = ${photo.id} AND status = 'pending'`;
      results.push({
        id: photo.id,
        action: apply ? "recovered" : "would-recover",
      });
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
      if (apply)
        await sql`WITH released AS (
        UPDATE photos SET status = 'archived' WHERE id = ${photo.id} AND status = 'pending'
          AND created_at < now() - interval '48 hours' RETURNING size
        ) UPDATE storage_budget SET reserved_bytes = reserved_bytes - COALESCE((SELECT SUM(size) FROM released), 0) WHERE id = 1`;
      results.push({
        id: photo.id,
        action: apply
          ? "released-missing-reservation"
          : "would-release-missing-reservation",
      });
    }
  }
  return results;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error("DATABASE_URL and BLOB_READ_WRITE_TOKEN are required");
  if (process.argv.slice(2).some((arg) => arg !== "--apply"))
    throw new Error(
      "Only --apply is supported. Without it, this command is a dry run.",
    );
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "Applying reconciliation; no stored files will be deleted."
      : "Dry run; no data will change.",
  );
  const results = await reconcilePending(
    neon(process.env.DATABASE_URL),
    head,
    apply,
  );
  for (const result of results) console.log(JSON.stringify(result));
  console.log(`Inspected ${results.length} reservations older than 48 hours.`);
}
