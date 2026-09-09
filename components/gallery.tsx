import Link from "next/link";
import { Camera, Download } from "lucide-react";
import { canPreview } from "@/lib/uploads";
import type { Photo } from "@/lib/db";
export function Gallery({
  photos,
  year,
  unavailable,
  page,
}: {
  photos: Photo[];
  year: number;
  unavailable: boolean;
  page: number;
}) {
  return (
    <section id="camp-photos" className="section gallery-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM OUR CAMP FAMILY</span>
          <h2>Fresh from the camera roll.</h2>
          <p>Photos shared here for {year}. Yours could be next.</p>
        </div>
        <Link className="text-link" href="#share">
          Add your photos ↗
        </Link>
      </div>
      {unavailable ? (
        <div className="empty-state">
          <Camera size={32} />
          <h3>Our photo shelf is taking a moment.</h3>
          <p>
            Please refresh shortly. You can still enjoy the Google albums above.
          </p>
        </div>
      ) : photos.length === 0 ? (
        <div className="empty-state">
          <Camera size={32} />
          <h3>
            {page > 1
              ? "You’ve reached the end."
              : "Every memory starts with someone sharing."}
          </h3>
          <p>
            {page > 1
              ? "Head back to see the earlier photos."
              : "Be the first to add photos here. The Google albums are ready to enjoy above."}
          </p>
          <Link href="#share" className="text-link">
            Share a few favorites ↗
          </Link>
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map((photo) => (
            <article className="photo-card" key={photo.id}>
              <a
                href={`/api/photos/${photo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="photo-preview"
                aria-label={`Open ${photo.name}`}
              >
                {canPreview(photo.content_type) ? (
                  <img
                    src={`/api/photos/${photo.id}`}
                    alt={
                      photo.caption ||
                      `Camp photo shared by ${photo.contributor}`
                    }
                    loading="lazy"
                  />
                ) : (
                  <div className="format-placeholder">
                    <Camera size={34} />
                    <span>
                      {photo.name.split(".").pop()?.toUpperCase()} original
                    </span>
                    <small>Download to view</small>
                  </div>
                )}
              </a>
              <div className="photo-info">
                <div>
                  <strong>{photo.contributor}</strong>
                  {photo.caption && <p>{photo.caption}</p>}
                </div>
                <a
                  className="icon-button"
                  href={`/api/photos/${photo.id}?download=1`}
                  aria-label={`Download ${photo.name}`}
                >
                  <Download size={19} />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        {page > 1 && (
          <Link
            className="button secondary"
            href={`/?year=${year}&page=${page - 1}#camp-photos`}
          >
            ← Previous photos
          </Link>
        )}
        {photos.length === 24 && (
          <Link
            className="button secondary"
            href={`/?year=${year}&page=${page + 1}#camp-photos`}
          >
            More photos →
          </Link>
        )}
      </div>
    </section>
  );
}
