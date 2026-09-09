"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CircleAlert,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { years } from "@/lib/albums";
import { formatBytes, photoType } from "@/lib/uploads";
import {
  PHOTO_ACCEPT,
  selectPhotos,
  uploadFailureMessage,
} from "@/lib/photo-selection";
type Item = {
  id: string;
  file: File;
  state: "waiting" | "uploading" | "confirming" | "done" | "error";
  progress: number;
  error?: string;
  pathname?: string;
};
export function UploadForm() {
  const router = useRouter();
  const [year, setYear] = useState(2026);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const update = (id: string, patch: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  function choose(files: FileList | null) {
    if (!files || busy) return;
    const selection = selectPhotos(
      items.map((item) => item.file),
      Array.from(files),
    );
    setItems((current) => [
      ...current,
      ...selection.files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        state: "waiting" as const,
        progress: 0,
      })),
    ]);
    setNotice(selection.notice);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    const data = new FormData(event.currentTarget);
    const contributor = String(data.get("contributor") ?? "").trim();
    if (!contributor) {
      setNotice("Please enter your name so we know who to thank.");
      setBusy(false);
      return;
    }
    const caption = String(data.get("caption") ?? "").trim();
    const leaveWarning = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", leaveWarning);
    for (const item of items.filter((item) => item.state !== "done")) {
      let pathname = item.pathname;
      try {
        if (!pathname) {
          update(item.id, {
            state: "uploading",
            error: undefined,
            progress: 0,
          });
          const extension = item.file.name.split(".").pop()!.toLowerCase();
          const target = `photos/${year}/${crypto.randomUUID()}.${extension}`;
          const blob = await upload(target, item.file, {
            access: "private",
            contentType: photoType(item.file.name)!,
            handleUploadUrl: "/api/uploads",
            multipart: true,
            clientPayload: JSON.stringify({
              year,
              name: item.file.name,
              size: item.file.size,
              contributor,
              caption,
            }),
            onUploadProgress: ({ percentage }) =>
              update(item.id, { progress: percentage }),
          });
          pathname = blob.pathname;
          update(item.id, { pathname });
        }
        update(item.id, { state: "confirming", progress: 100 });
        const response = await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pathname }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error);
        }
        update(item.id, { state: "done", progress: 100 });
      } catch (error) {
        update(item.id, {
          state: "error",
          pathname,
          error: uploadFailureMessage(error, Boolean(pathname)),
        });
      }
    }
    window.removeEventListener("beforeunload", leaveWarning);
    setBusy(false);
    router.refresh();
  }
  const done = items.filter((item) => item.state === "done").length;
  const complete = items.length > 0 && done === items.length;
  const locked = busy || items.some((item) => item.pathname);
  return (
    <form ref={formRef} className="upload-form" onSubmit={send}>
      <div className="form-row">
        <div>
          <label htmlFor="year">Which camp year?</label>
          <select
            id="year"
            value={year}
            disabled={locked}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
                {value === 2026 ? " · This summer" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="contributor">Your name</label>
          <input
            id="contributor"
            name="contributor"
            required
            maxLength={80}
            placeholder="So we know who to thank"
            autoComplete="name"
            readOnly={locked}
          />
        </div>
      </div>
      <div
        className={`drop-zone ${busy ? "disabled" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files);
        }}
      >
        <span className="upload-circle">
          <Camera size={27} />
        </span>
        <h3>Your view of the weekend</h3>
        <p>Pick photos from your phone or computer.</p>
        <input
          ref={fileInput}
          type="file"
          id="photos"
          multiple
          accept={PHOTO_ACCEPT}
          className="visually-hidden"
          disabled={busy || complete}
          onChange={(event) => choose(event.target.files)}
        />
        <button
          className="button secondary"
          type="button"
          disabled={busy || complete}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={18} /> Choose photos
        </button>
        <span className="drop-note">
          Or drop them here · Up to 50 photos, 200 MB each
        </span>
      </div>
      <p className="muted">
        Choosing from Google Photos or another cloud app? Wait for the originals
        to download. If selection fails, try 5–10 photos at a time, or download
        them to your phone and choose them from Files or Gallery.
      </p>
      <label htmlFor="caption">
        A little story to go with them{" "}
        <span className="optional">(optional)</span>
      </label>
      <textarea
        id="caption"
        name="caption"
        maxLength={500}
        rows={2}
        readOnly={locked}
        placeholder="The hike, the cookout, that very competitive card game…"
      />
      {notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
      {items.length > 0 && (
        <div className="file-list" aria-label="Selected photos">
          {items.map((item) => (
            <div className="file-row" key={item.id}>
              <div className="file-status">
                {item.state === "done" ? (
                  <Check size={20} />
                ) : item.state === "error" ? (
                  <CircleAlert size={20} />
                ) : busy && ["uploading", "confirming"].includes(item.state) ? (
                  <LoaderCircle size={20} className="spin" />
                ) : (
                  <Camera size={20} />
                )}
              </div>
              <div className="file-info">
                <strong>{item.file.name}</strong>
                <span>
                  {formatBytes(item.file.size)} ·{" "}
                  {item.state === "done"
                    ? "Shared. Thank you!"
                    : item.state === "uploading"
                      ? `Uploading ${Math.round(item.progress)}%`
                      : item.state === "confirming"
                        ? "Saving your photo…"
                        : item.state === "error"
                          ? item.error
                          : "Ready to share"}
                </span>
                {item.state === "uploading" && (
                  <progress
                    value={item.progress}
                    max={100}
                    aria-label={`Uploading ${item.file.name}`}
                  />
                )}
              </div>
              {!busy && item.state !== "done" && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((value) => value.id !== item.id),
                    )
                  }
                >
                  <X size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div aria-live="polite">
        {complete && (
          <p className="success">
            <Check size={20} /> All {done}{" "}
            {done === 1 ? "photo is" : "photos are"} shared. Thanks for adding
            to our memories!
          </p>
        )}
        {busy && (
          <p className="muted">
            {done} of {items.length} shared. Keep this page open until we’re
            finished.
          </p>
        )}
      </div>
      {complete ? (
        <button
          className="button primary full"
          type="button"
          onClick={() => {
            setItems([]);
            formRef.current?.reset();
          }}
        >
          Share more photos <Camera size={18} />
        </button>
      ) : (
        <button
          className="button primary full"
          disabled={busy || items.length === 0}
        >
          {busy ? (
            <>
              <LoaderCircle className="spin" size={18} /> Sharing your photos…
            </>
          ) : (
            <>
              <Upload size={18} />{" "}
              {items.some((item) => item.state === "error")
                ? "Retry unfinished photos"
                : `Share ${items.length || "your"} photo${items.length === 1 ? "" : "s"}`}
            </>
          )}
        </button>
      )}
      <p className="privacy-note">
        Original quality, always. No Google account needed.
      </p>
    </form>
  );
}
