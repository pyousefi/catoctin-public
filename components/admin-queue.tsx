"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import type { Photo } from "@/lib/db";
import { canPreview, formatBytes } from "@/lib/uploads";
import {
  MAX_DOWNLOAD_BYTES,
  MAX_DOWNLOAD_PHOTOS,
  type SelectedPhoto,
} from "@/lib/admin-selection";
import { deleteSelectedPhotos } from "@/lib/delete-selected-photos";
import { PhotoViewer } from "./photo-viewer";
export function AdminQueue({
  photos: initialPhotos,
  year,
}: {
  photos: (Photo & { hidden?: boolean })[];
  year: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedPhoto[]>([]);
  const [allIds, setAllIds] = useState<string[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SelectedPhoto[] | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const selectedIds = new Set(selected.map((photo) => photo.id));
  const remainingIds = allIds?.filter((id) => !deleted.includes(id)) ?? [];
  const allSelected =
    remainingIds.length > 0 && remainingIds.every((id) => selectedIds.has(id));
  const locked = busy || selecting || deleting !== null;
  useEffect(() => {
    if (deleting && !deleteDialog.current?.open)
      deleteDialog.current?.showModal();
  }, [deleting]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);
  useEffect(() => {
    if (!busy || !deleting) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, deleting]);
  const photos = initialPhotos.filter((photo) => !deleted.includes(photo.id));
  const bytes = selected.reduce((sum, photo) => sum + Number(photo.size), 0);
  const downloadTooLarge =
    selected.length > MAX_DOWNLOAD_PHOTOS || bytes > MAX_DOWNLOAD_BYTES;
  async function chooseAll(checked: boolean) {
    if (!checked) {
      setSelected([]);
      return;
    }
    setSelecting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/photos?year=${year}`);
      if (!response.ok)
        throw new Error("Couldn’t select all photos. Please retry.");
      const data: { photos: SelectedPhoto[] } = await response.json();
      const available = data.photos.filter(
        (photo) => !deleted.includes(photo.id),
      );
      setAllIds(available.map((photo) => photo.id));
      setSelected(available);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Selection failed. Please retry.",
      );
    } finally {
      setSelecting(false);
    }
  }
  function confirmDeletion(photos: SelectedPhoto[]) {
    if (!photos.length || locked) return;
    setError("");
    setNotice("");
    setProgress({ completed: 0, total: photos.length });
    setDeleting([...photos]);
  }
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
  async function removePhotos() {
    if (!deleting || busy) return;
    const targets = deleting;
    setBusy(true);
    setError("");
    setProgress({ completed: 0, total: targets.length });
    try {
      const failures = await deleteSelectedPhotos(
        targets.map((photo) => photo.id),
        (id) => {
          setDeleted((current) => [...current, id]);
          setSelected((current) => current.filter((photo) => photo.id !== id));
        },
        (completed) => setProgress({ completed, total: targets.length }),
      );
      if (failures.length) {
        setDeleting(
          targets.filter((photo) =>
            failures.some((failure) => failure.id === photo.id),
          ),
        );
        setError(
          `${targets.length - failures.length} deleted; ${failures.length} could not be deleted. ${failures[0].error} Retry the remaining selection.`,
        );
      } else {
        setDeleting(null);
        setNotice(
          `${targets.length} original${targets.length === 1 ? "" : "s"} deleted.`,
        );
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-queue">
      <form action="/api/admin/download" method="post">
        {selected.map((photo) => (
          <input key={photo.id} type="hidden" name="id" value={photo.id} />
        ))}
        <div className="queue-toolbar">
          <label className="check-label">
            <input
              ref={selectAll}
              type="checkbox"
              checked={allSelected}
              disabled={locked}
              onChange={(event) => chooseAll(event.target.checked)}
            />{" "}
            {selecting ? "Selecting…" : "Select all"}
          </label>
          <div className="queue-actions">
            <button
              className="button primary"
              disabled={locked || !selected.length || downloadTooLarge}
            >
              <Download size={18} /> Download{" "}
              {selected.length
                ? `${selected.length} original${selected.length === 1 ? "" : "s"}`
                : "selected"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={locked || !selected.length}
              onClick={() => confirmDeletion(selected)}
            >
              <Trash2 size={18} /> Delete{" "}
              {selected.length
                ? `${selected.length} original${selected.length === 1 ? "" : "s"}`
                : "selected"}
            </button>
          </div>
        </div>
        <p className="muted" aria-live="polite">
          {selected.length} original{selected.length === 1 ? "" : "s"} selected
          in {year} · {formatBytes(bytes)}. Select all includes every page in
          this camp year, including hidden originals.
        </p>
        {downloadTooLarge && (
          <p className="error">
            ZIP downloads support up to 50 originals and 1 GB. Select fewer
            originals to download; deletion is still available.
          </p>
        )}
        {selected.length > 0 && (
          <p className="muted">Photos stay here after downloading.</p>
        )}
        {photos.map((photo) => (
          <article className="admin-photo" key={photo.id}>
            <input
              type="checkbox"
              value={photo.id}
              checked={selectedIds.has(photo.id)}
              disabled={locked}
              aria-label={`Select ${photo.name}`}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current.filter((item) => item.id !== photo.id), photo]
                    : current.filter((item) => item.id !== photo.id),
                )
              }
            />
            <button
              type="button"
              className="admin-thumbnail"
              aria-label={`Open ${photo.name}`}
              disabled={locked}
              onClick={(event) => {
                event.currentTarget.focus();
                setViewerId(photo.id);
              }}
            >
              {canPreview(photo.content_type) ? (
                <img src={`/api/photos/${photo.id}`} alt="" loading="lazy" />
              ) : (
                <ImageIcon size={28} />
              )}
            </button>
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
                disabled={locked}
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
                disabled={locked}
                onClick={() => update(photo.id, { hidden: !photo.hidden })}
              >
                {photo.hidden ? <Eye size={17} /> : <EyeOff size={17} />}{" "}
                {photo.hidden ? "Show to family" : "Hide from family"}
              </button>
              <button
                className="text-link"
                type="button"
                disabled={locked}
                aria-label={`Delete ${photo.name}`}
                onClick={() => confirmDeletion([photo])}
              >
                Delete permanently
              </button>
            </div>
          </article>
        ))}
      </form>
      {viewerId && (
        <PhotoViewer
          key={viewerId}
          photos={photos}
          initialId={viewerId}
          onClose={() => setViewerId(null)}
        />
      )}
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
          <h3 id="delete-photo-heading">
            {deleting.length === 1
              ? `Permanently delete ${deleting[0].name}?`
              : `Permanently delete ${deleting.length} originals from ${year}?`}
          </h3>
          {deleting.length > 1 && (
            <ul className="delete-file-list">
              {deleting.map((photo) => (
                <li key={photo.id}>{photo.name}</li>
              ))}
            </ul>
          )}
          <p>
            This removes the selected original{deleting.length === 1 ? "" : "s"}{" "}
            from this site and frees{" "}
            {formatBytes(
              deleting.reduce((sum, photo) => sum + Number(photo.size), 0),
            )}{" "}
            of storage. It cannot be undone. Copies already downloaded or added
            to Google Photos are unaffected.
          </p>
          {busy && (
            <p role="status">Keep this page open until deletion finishes.</p>
          )}
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
            onClick={removePhotos}
          >
            {busy
              ? `Deleting… ${progress.completed} of ${progress.total} processed`
              : deleting.length === 1
                ? "Yes, permanently delete"
                : `Yes, delete ${deleting.length} originals`}
          </button>
        </dialog>
      )}
      {error && !deleting && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
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
