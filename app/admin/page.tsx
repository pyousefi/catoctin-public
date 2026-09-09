import { albumUrl } from "@/lib/album-url";
import Link from "next/link";
import { ArrowUpRight, FolderHeart } from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { albums } from "@/lib/albums";
import { listPhotos, type Photo } from "@/lib/db";
import { Header, Footer } from "@/components/header";
import { AdminQueue } from "@/components/admin-queue";
export const dynamic = "force-dynamic";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; page?: string }>;
}) {
  await requirePageSession("admin");
  const query = await searchParams;
  const album =
    albums.find((album) => album.year === Number(query.year)) ?? albums[0];
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.page) || 1)),
  );
  let photos: Photo[] = [],
    unavailable = false;
  try {
    photos = await listPhotos(album.year, true, page, 24);
  } catch {
    unavailable = true;
  }
  return (
    <>
      <Header admin />
      <main className="main-content admin-main">
        <span className="eyebrow">
          <FolderHeart size={18} /> THE ORGANIZER’S CORNER
        </span>
        <h1>Bring the memories together.</h1>
        <p className="intro">
          Download the originals, add them to the matching Google album, then
          mark them as added.
        </p>
        <div className="admin-instructions">
          <strong>Your three-step photo handoff</strong>
          <ol>
            <li>
              Select photos below and download the ZIP. Open it on your computer
              to extract the originals.
            </li>
            <li>
              Open this year’s Google album, sign in as its owner or a
              contributor, and use “Add photos” to upload the files.
            </li>
            <li>
              After they appear in Google Photos, return here and tap “Mark as
              added.”
            </li>
          </ol>
          <p>
            Downloads preserve the original files and embedded metadata. Marking
            a photo does not upload it to Google or delete it here.
          </p>
        </div>
        <div className="admin-year-bar">
          <nav aria-label="Camp year">
            {albums.map((item) => (
              <Link
                className={
                  item.year === album.year ? "year-tab active" : "year-tab"
                }
                aria-current={item.year === album.year ? "page" : undefined}
                href={`/admin?year=${item.year}`}
                key={item.year}
              >
                {item.year}
              </Link>
            ))}
          </nav>
          <a
            className="button secondary"
            href={albumUrl(album.year)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {album.year} Google album <ArrowUpRight size={18} />
          </a>
        </div>
        {unavailable ? (
          <p className="notice" role="alert">
            Photo storage is unavailable. Check the database connection and try
            again.
          </p>
        ) : (
          <AdminQueue key={album.year} year={album.year} photos={photos} />
        )}
        <div className="pagination">
          {page > 1 && (
            <Link
              className="button secondary"
              href={`/admin?year=${album.year}&page=${page - 1}`}
            >
              ← Previous
            </Link>
          )}
          {photos.length === 24 && (
            <Link
              className="button secondary"
              href={`/admin?year=${album.year}&page=${page + 1}`}
            >
              Next photos →
            </Link>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
