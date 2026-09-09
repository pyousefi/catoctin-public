import { randomUUID } from "node:crypto";
import { session, sameOrigin } from "./auth";
import { db } from "./db";
import { uploadInput, photoType } from "./uploads";
import {
  abortR2,
  createR2Upload,
  r2Config,
  headR2,
  isMissingObject,
} from "./r2";
import { z } from "zod";

export async function startR2Upload(request: Request, body: unknown) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const current = await session();
  if (!current)
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  const input = uploadInput.parse(body);
  const contentType = photoType(input.name);
  if (!contentType) throw new Error("Unsupported photo format");
  const config = r2Config();
  const maxStorage = Number(process.env.MAX_STORAGE_BYTES ?? 10737418240);
  if (!Number.isSafeInteger(maxStorage) || maxStorage <= 0)
    throw new Error("Invalid storage budget");
  const id = randomUUID();
  const pathname = `r2/${config.prefix}/photos/${input.year}/${id}.${input.name.split(".").pop()!.toLowerCase()}`;
  const sql = db();
  const inserted = await sql`WITH budget AS (
    UPDATE storage_budget SET reserved_bytes = reserved_bytes + ${input.size}
    WHERE id = 1 AND reserved_bytes + ${input.size} <= ${maxStorage} RETURNING id
  ) INSERT INTO photos(id, year, name, contributor, caption, size, content_type, pathname, session_id)
    SELECT ${id}, ${input.year}, ${input.name}, ${input.contributor}, ${input.caption}, ${input.size}, ${contentType}, ${pathname}, ${current.id}
    FROM budget RETURNING id`;
  if (!inserted.length)
    return Response.json(
      { error: "Camp storage is full. Please contact the organizer." },
      { status: 409 },
    );
  let uploadId: string | undefined;
  try {
    const upload = await createR2Upload(pathname, input.size, contentType);
    uploadId = upload.uploadId;
    await sql`UPDATE photos SET r2_upload_id = ${uploadId} WHERE id = ${id} AND status = 'pending'`;
    return Response.json({
      pathname,
      urls: upload.urls,
      partBytes: upload.partBytes,
    });
  } catch (error) {
    if (uploadId) await abortR2(pathname, uploadId);
    await sql`WITH removed AS (DELETE FROM photos WHERE id = ${id} AND status = 'pending' RETURNING size)
      UPDATE storage_budget SET reserved_bytes = reserved_bytes - COALESCE((SELECT SUM(size) FROM removed), 0) WHERE id = 1`;
    throw error;
  }
}

export async function cancelR2Upload(request: Request) {
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
    const [photo] =
      await sql`SELECT id, pathname, r2_upload_id FROM photos WHERE pathname = ${pathname}
      AND session_id = ${current.id} AND status = 'pending'`;
    if (photo?.r2_upload_id) {
      await abortR2(photo.pathname, photo.r2_upload_id);
      try {
        await headR2(photo.pathname);
        throw new Error(
          "Completed original needs confirmation, not cancellation",
        );
      } catch (error) {
        if (!isMissingObject(error)) throw error;
      }
      await sql`WITH released AS (UPDATE photos SET status = 'archived' WHERE id = ${photo.id} AND status = 'pending' RETURNING size)
        UPDATE storage_budget SET reserved_bytes = reserved_bytes - COALESCE((SELECT SUM(size) FROM released), 0) WHERE id = 1`;
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Upload cleanup needs a retry." },
      { status: 503 },
    );
  }
}
