import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { get } from "@vercel/blob";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const MAX_PHOTO_BYTES = 200 * 1024 * 1024;

class MigrationError extends Error {}

function fail(photo, reason) {
  throw new MigrationError(`Photo ${photo.id}: ${reason}`);
}

async function fingerprint(body, photo, collect = false) {
  if (!body) fail(photo, "missing object body");
  const bytes = collect ? Buffer.alloc(Number(photo.size)) : undefined;
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of body) {
    const data = Buffer.from(chunk);
    size += data.length;
    if (size > Number(photo.size)) fail(photo, "object size mismatch");
    if (bytes) data.copy(bytes, size - data.length);
    hash.update(data);
  }
  if (size !== Number(photo.size)) fail(photo, "object size mismatch");
  return { bytes, sha256: hash.digest("hex") };
}

async function verifyTarget(target, photo, sha256) {
  if (
    target.ContentLength !== Number(photo.size) ||
    target.ContentType !== photo.content_type
  ) {
    target.Body?.destroy?.();
    fail(photo, "target metadata mismatch");
  }
  const actual = await fingerprint(target.Body, photo);
  if (actual.sha256 !== sha256) fail(photo, "target checksum mismatch");
}

async function readTarget(s3, bucket, key) {
  try {
    return await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function migratePhotos({
  sql,
  readBlob,
  s3,
  bucket,
  prefix,
  apply = false,
  report = () => {},
}) {
  if (!["production", "preview"].includes(prefix))
    throw new MigrationError("R2_PREFIX must be production or preview");
  if (!bucket) throw new MigrationError("R2_BUCKET is required");
  const counts = { inspected: 0, planned: 0, migrated: 0 };
  let cursor = null;
  while (true) {
    const [photo] =
      await sql`SELECT id, pathname, size, content_type FROM photos
      WHERE status = 'ready' AND pathname LIKE 'photos/%'
        AND (${cursor}::uuid IS NULL OR id > ${cursor}::uuid)
      ORDER BY id LIMIT 1`;
    if (!photo) return counts;
    cursor = photo.id;
    counts.inspected++;
    if (
      !Number.isSafeInteger(Number(photo.size)) ||
      Number(photo.size) <= 0 ||
      Number(photo.size) > MAX_PHOTO_BYTES ||
      !photo.pathname.startsWith("photos/")
    )
      fail(photo, "invalid source metadata");
    if (!apply) {
      counts.planned++;
      report({ id: photo.id, action: "would-migrate" });
      continue;
    }
    const key = `r2/${prefix}/${photo.pathname}`;
    const source = await readBlob(photo.pathname, { access: "private" });
    if (
      !source ||
      source.statusCode !== 200 ||
      source.blob.size !== Number(photo.size) ||
      source.blob.contentType !== photo.content_type
    ) {
      await source?.stream?.cancel();
      fail(photo, "source metadata mismatch");
    }
    // One original (at most 200 MiB) is retained; target verification streams.
    const original = await fingerprint(source.stream, photo, true);
    let target = await readTarget(s3, bucket, key);
    if (!target) {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: original.bytes,
            ContentLength: Number(photo.size),
            ContentType: photo.content_type,
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        // Another migration may have created this key after our read.
        if (error.$metadata?.httpStatusCode !== 412) throw error;
      }
      target = await readTarget(s3, bucket, key);
    }
    if (!target) fail(photo, "target missing after copy");
    await verifyTarget(target, photo, original.sha256);
    const updated = await sql`UPDATE photos SET pathname = ${key}
      WHERE id = ${photo.id} AND pathname = ${photo.pathname} AND status = 'ready'
      RETURNING id`;
    if (updated.length !== 1) {
      const [current] =
        await sql`SELECT pathname, status FROM photos WHERE id = ${photo.id}`;
      if (!current || current.status === "archived") {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        fail(
          photo,
          "photo deleted concurrently; R2 copy removed, Blob source retained",
        );
      }
      if (current.status === "ready" && current.pathname === key) {
        const referenced = await readTarget(s3, bucket, key);
        if (!referenced)
          fail(photo, "referenced target missing after concurrent migration");
        await verifyTarget(referenced, photo, original.sha256);
        counts.migrated++;
        report({ id: photo.id, action: "already-migrated" });
        continue;
      }
      fail(photo, "concurrent database change; source and R2 copy retained");
    }
    counts.migrated++;
    report({ id: photo.id, action: "migrated" });
  }
}

async function main() {
  if (process.argv.slice(2).some((argument) => argument !== "--apply"))
    throw new MigrationError(
      "Only --apply is supported; dry run is the default",
    );
  for (const name of [
    "DATABASE_URL",
    "BLOB_READ_WRITE_TOKEN",
    "R2_ENDPOINT",
    "R2_BUCKET",
    "R2_PREFIX",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ]) {
    if (!process.env[name]) throw new MigrationError(`${name} is required`);
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
    throw new MigrationError("R2_ENDPOINT must be an R2 account S3 endpoint");
  const s3 = new S3Client({
    region: "auto",
    endpoint: endpoint.origin,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  try {
    const counts = await migratePhotos({
      sql: neon(process.env.DATABASE_URL),
      readBlob: get,
      s3,
      bucket: process.env.R2_BUCKET,
      prefix: process.env.R2_PREFIX,
      apply: process.argv.includes("--apply"),
      report: (event) => console.log(JSON.stringify(event)),
    });
    console.log(JSON.stringify(counts));
  } finally {
    s3.destroy();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    console.error(
      error instanceof MigrationError
        ? error.message
        : "Migration failed; no source objects were deleted. Check service access and retry.",
    );
    process.exitCode = 1;
  });
}
