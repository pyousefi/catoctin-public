import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { getPhotoObject as get } from "@/lib/photo-storage";
import { z } from "zod";
import { session, sameOrigin } from "@/lib/auth";
import { db, type Photo } from "@/lib/db";
import { MAX_DOWNLOAD_BYTES, MAX_DOWNLOAD_PHOTOS } from "@/lib/admin-selection";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if ((await session())?.role !== "admin")
    return Response.json({ error: "Admin sign-in required." }, { status: 403 });
  try {
    const form = await request.formData();
    const ids = z
      .array(z.uuid())
      .min(1)
      .max(MAX_DOWNLOAD_PHOTOS)
      .parse(form.getAll("id"));
    const sql = db();
    const photos =
      (await sql`SELECT * FROM photos WHERE id = ANY(${ids}::uuid[]) AND status = 'ready' ORDER BY year DESC, created_at`) as Photo[];
    if (photos.length !== new Set(ids).size)
      return Response.json(
        { error: "Some photos are no longer available." },
        { status: 404 },
      );
    if (photos.reduce((sum, p) => sum + Number(p.size), 0) > MAX_DOWNLOAD_BYTES)
      return Response.json(
        { error: "Please select less than 1 GB at a time." },
        { status: 400 },
      );
    const archive = new ZipArchive({ store: true });
    const output = new PassThrough();
    archive.on("error", (error) => output.destroy(error));
    archive.on("warning", (error) => output.destroy(error));
    archive.pipe(output);
    request.signal.addEventListener("abort", () => {
      archive.abort();
      output.destroy();
    });
    void (async () => {
      try {
        for (const photo of photos) {
          const blob = await get(photo.pathname, {
            access: "private",
            useCache: false,
          });
          if (!blob || blob.statusCode !== 200)
            throw new Error("Photo unavailable");
          const name = `${photo.year}/${photo.id.slice(0, 8)}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const entryComplete = new Promise<void>((resolve, reject) => {
            archive.once("entry", () => {
              archive.off("error", reject);
              resolve();
            });
            archive.once("error", reject);
          });
          const source = Readable.fromWeb(
            blob.stream as import("node:stream/web").ReadableStream,
          );
          source.on("error", (error) => archive.destroy(error));
          archive.append(source, { name });
          await entryComplete;
        }
        await archive.finalize();
      } catch (error) {
        output.destroy(
          error instanceof Error ? error : new Error("Download failed"),
        );
        archive.abort();
      }
    })();
    return new Response(Readable.toWeb(output) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="catoctin-originals.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Couldn’t prepare the download. Please select up to 50 photos and try again.",
      },
      { status: 400 },
    );
  }
}
