"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { Photo } from "@/lib/db";
import { canPreview } from "@/lib/uploads";

type ViewerPhoto = Pick<
  Photo,
  "id" | "name" | "caption" | "contributor" | "content_type"
>;

function PhotoPreview({ photo }: { photo: ViewerPhoto }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!canPreview(photo.content_type) || failed)
    return (
      <div className="viewer-placeholder" role="status">
        <Camera size={40} aria-hidden="true" />
        <p>
          {failed
            ? "This preview could not be loaded. Try downloading the original."
            : "Download the original to view this photo format."}
        </p>
      </div>
    );
  return (
    <>
      {!loaded && (
        <p className="viewer-loading" role="status">
          Loading photo…
        </p>
      )}
      <img
        src={`/api/photos/${photo.id}`}
        alt={photo.caption || photo.name}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        draggable={false}
      />
    </>
  );
}

export function PhotoViewer({
  photos,
  initialId,
  onClose,
}: {
  photos: ViewerPhoto[];
  initialId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState(initialId);
  const index = Math.max(
    0,
    photos.findIndex((photo) => photo.id === selectedId),
  );
  const photo = photos[index];
  const hasPhoto = Boolean(photo);

  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [hasPhoto]);

  function navigate(offset: number) {
    const next = photos[index + offset];
    if (next) setSelectedId(next.id);
  }

  if (!photo) return null;
  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label="Photo viewer"
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          navigate(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className="viewer-toolbar">
        <p aria-live="polite" aria-atomic="true">
          Photo {index + 1} of {photos.length} on this page
        </p>
        <button
          type="button"
          className="viewer-button"
          aria-label="Close photo viewer"
          autoFocus
          onClick={() => dialog.current?.close()}
        >
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <div
        className="viewer-image"
        onTouchStart={(event) => {
          touch.current =
            event.touches.length === 1
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
              : null;
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (
            !start ||
            event.touches.length ||
            event.changedTouches.length !== 1 ||
            (window.visualViewport?.scale ?? 1) > 1
          )
            return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2)
            navigate(dx < 0 ? 1 : -1);
        }}
      >
        <PhotoPreview key={photo.id} photo={photo} />
      </div>
      <div className="viewer-details">
        <strong>{photo.contributor}</strong>
        {photo.caption && <p>{photo.caption}</p>}
        <p className="viewer-filename">{photo.name}</p>
      </div>
      <div className="viewer-controls">
        {/* Keep boundary controls focusable so arrow-key navigation still works. */}
        <button
          type="button"
          className="viewer-button"
          aria-label="Previous photo"
          aria-disabled={index === 0}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft size={24} aria-hidden="true" /> Previous
        </button>
        <a
          className="viewer-button"
          href={`/api/photos/${photo.id}?download=1`}
          aria-label={`Download original ${photo.name}`}
        >
          <Download size={20} aria-hidden="true" /> Original
        </a>
        <button
          type="button"
          className="viewer-button"
          aria-label="Next photo"
          aria-disabled={index === photos.length - 1}
          onClick={() => navigate(1)}
        >
          Next <ChevronRight size={24} aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}
