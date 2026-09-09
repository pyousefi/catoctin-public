import { neon } from "@neondatabase/serverless";
import { head, BlobNotFoundError } from "@vercel/blob";
import {
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";

async function inspectR2(r2, pathname) {
  if (!r2) throw new Error("R2 storage configuration is required");
  try {
    const object = await r2.s3.send(
      new HeadObjectCommand({ Bucket: r2.bucket, Key: pathname }),
    );
    return { size: object.ContentLength, contentType: object.ContentType };
  } catch (error) {
    if (error.name === "NotFound" || error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function reconcilePending(sql, inspectBlob, apply = false, r2) {
  const photos =
    await sql`SELECT id, pathname, size, content_type, r2_upload_id FROM photos
    WHERE status = 'pending' AND created_at < now() - interval '48 hours' ORDER BY created_at`;
  const results = [];
  for (const photo of photos) {
    const usesR2 = photo.pathname.startsWith("r2/");
    let object;
    if (usesR2) {
      object = await inspectR2(r2, photo.pathname);
      if (!object && apply && photo.r2_upload_id) {
        try {
          await r2.s3.send(
            new AbortMultipartUploadCommand({
              Bucket: r2.bucket,
              Key: photo.pathname,
              UploadId: photo.r2_upload_id,
            }),
          );
        } catch (error) {
          if (error.name !== "NoSuchUpload") throw error;
        }
        // Completion can win the race with abort; retain that original's reservation.
        object = await inspectR2(r2, photo.pathname);
      }
    } else {
      try {
        object = await inspectBlob(photo.pathname);
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
        object = null;
      }
    }
    if (object) {
      if (
        Number(photo.size) !== object.size ||
        photo.content_type !== object.contentType
      ) {
        results.push({
          id: photo.id,
          action: "manual-review",
          reason: "Stored file differs from reservation; capacity retained.",
        });
        continue;
      }
      if (apply)
        await sql`UPDATE photos SET status = 'ready', r2_upload_id = NULL
          WHERE id = ${photo.id} AND pathname = ${photo.pathname} AND status = 'pending'
          AND r2_upload_id IS NOT DISTINCT FROM ${photo.r2_upload_id ?? null}`;
      results.push({
        id: photo.id,
        action: apply ? "recovered" : "would-recover",
      });
      continue;
    }
    if (apply)
      await sql`WITH released AS (
        UPDATE photos SET status = 'archived', r2_upload_id = NULL
        WHERE id = ${photo.id} AND pathname = ${photo.pathname} AND status = 'pending'
        AND r2_upload_id IS NOT DISTINCT FROM ${photo.r2_upload_id ?? null}
        AND created_at < now() - interval '48 hours' RETURNING size
      ) UPDATE storage_budget SET reserved_bytes = reserved_bytes - COALESCE((SELECT SUM(size) FROM released), 0) WHERE id = 1`;
    results.push({
      id: photo.id,
      action: apply
        ? "released-missing-reservation"
        : "would-release-missing-reservation",
    });
  }
  return results;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (process.argv.slice(2).some((arg) => arg !== "--apply"))
    throw new Error("Only --apply is supported; dry run is the default");
  let r2;
  if (process.env.R2_ENDPOINT) {
    for (const name of [
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ]) {
      if (!process.env[name]) throw new Error(`${name} is required`);
    }
    const endpoint = new URL(process.env.R2_ENDPOINT);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.port ||
      endpoint.pathname !== "/" ||
      !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)
    )
      throw new Error("R2_ENDPOINT must be an R2 account S3 endpoint");
    r2 = {
      bucket: process.env.R2_BUCKET,
      s3: new S3Client({
        region: "auto",
        endpoint: endpoint.origin,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      }),
    };
  }
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "Applying verified pending-upload recovery."
      : "Dry run; no writes or multipart aborts.",
  );
  try {
    const results = await reconcilePending(
      neon(process.env.DATABASE_URL),
      head,
      apply,
      r2,
    );
    for (const result of results) console.log(JSON.stringify(result));
    console.log(
      `Inspected ${results.length} pending uploads older than 48 hours.`,
    );
  } finally {
    r2?.s3.destroy();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch(() => {
    console.error(
      "Recovery failed. Check database and storage configuration/access before retrying.",
    );
    process.exitCode = 1;
  });
}
