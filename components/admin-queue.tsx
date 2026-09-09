"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
import type { Photo } from "@/lib/db";
import { canPreview, formatBytes } from "@/lib/uploads";
export function AdminQueue({
  photos: initialPhotos,
}: {
  photos: (Photo & { hidden?: boolean })[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Photo | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
  }, [deleting]);
  const photos = initialPhotos.filter((photo) => !deleted.includes(photo.id));
  const bytes = photos
    .filter((photo) => selected.includes(photo.id))
    .reduce((sum, p) => sum + Number(p.size), 0);
  async function update(
    id: string,
    patch: { transferred?: boolean; hidden?: boolean },
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Update failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removePhoto() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/photos/${deleting.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setDeleted((current) => [...current, deleting.id]);
      setSelected((current) => current.filter((id) => id !== deleting.id));
      setDeleting(null);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Deletion failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-queue">
      <form action="/api/admin/download" method="post">
        <div className="queue-toolbar">
          <label className="check-label">
            <input
              type="checkbox"
              checked={photos.length > 0 && selected.length === photos.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? photos.map((photo) => photo.id) : [],
                )
              }
            />{" "}
            Select this page
          </label>
          <button
            className="button primary"
            disabled={!selected.length || bytes > 1024 * 1024 * 1024}
          >
            <Download size={18} /> Download{" "}
            {selected.length ? `${selected.length} originals` : "selected"}
          </button>
        </div>
        {bytes > 1024 * 1024 * 1024 && (
          <p className="error">
            Please select less than 1 GB per ZIP download.
          </p>
        )}
        {selected.length > 0 && (
          <p className="muted">
            ZIP download · {formatBytes(bytes)} · Photos stay here after
            downloading.
          </p>
        )}
        {photos.map((photo) => (
          <article className="admin-photo" key={photo.id}>
            <input
              type="checkbox"
              name="id"
              value={photo.id}
              checked={selected.includes(photo.id)}
              aria-label={`Select ${photo.name}`}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, photo.id]
                    : current.filter((id) => id !== photo.id),
                )
              }
            />
            <div className="admin-thumbnail">
              {canPreview(photo.content_type) ? (
                <img src={`/api/photos/${photo.id}`} alt="" loading="lazy" />
              ) : (
                <ImageIcon size={28} />
              )}
            </div>
            <div className="admin-photo-info">
              <strong>{photo.name}</strong>
              <p>
                {photo.contributor} · {formatBytes(Number(photo.size))}
              </p>
              {photo.caption && <p>{photo.caption}</p>}
              <span
                className={`status-pill ${photo.transferred_at ? "transferred" : ""}`}
              >
                {photo.transferred_at
                  ? "Added to Google Photos"
                  : "Waiting for Google Photos"}
              </span>
              {photo.hidden && (
                <span className="status-pill">Hidden from family</span>
              )}
            </div>
            <div className="admin-actions">
              <a
                className="text-link"
                href={`/api/photos/${photo.id}?download=1`}
              >
                <Download size={17} /> Download
              </a>
              <button
                className="text-link"
                type="button"
                disabled={busy}
                onClick={() =>
                  update(photo.id, { transferred: !photo.transferred_at })
                }
              >
                <Check size={17} />
                {photo.transferred_at ? "Mark as waiting" : "Mark as added"}
              </button>
              <button
                className="text-link"
                type="button"
                disabled={busy}
                onClick={() => update(photo.id, { hidden: !photo.hidden })}
              >
                {photo.hidden ? <Eye size={17} /> : <EyeOff size={17} />}{" "}
                {photo.hidden ? "Show to family" : "Hide from family"}
              </button>
              <button
                className="text-link"
                type="button"
                disabled={busy || deleting !== null}
                aria-label={`Delete ${photo.name}`}
                onClick={() => {
                  setError("");
                  setDeleting(photo);
                }}
              >
                Delete permanently
              </button>
            </div>
          </article>
        ))}
      </form>
      {deleting && (
        <dialog
          ref={deleteDialog}
          className="delete-dialog"
          aria-labelledby="delete-photo-heading"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) {
              setDeleting(null);
              setError("");
            }
          }}
        >
          <h3 id="delete-photo-heading">Permanently delete {deleting.name}?</h3>
          <p>
            This removes the original from this site and frees{" "}
            {formatBytes(Number(deleting.size))} of storage. It cannot be
            undone. Copies already downloaded or added to Google Photos are
            unaffected.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => {
              setDeleting(null);
              setError("");
            }}
          >
            Cancel deletion
          </button>{" "}
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={removePhoto}
          >
            {busy ? "Deleting…" : "Yes, permanently delete"}
          </button>
        </dialog>
      )}
      {error && !deleting && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {photos.length === 0 && (
        <div className="empty-state">
          <ImageIcon size={32} />
          <h3>No photos waiting here yet.</h3>
          <p>Photos uploaded by the family will appear here automatically.</p>
        </div>
      )}
    </div>
  );
}
