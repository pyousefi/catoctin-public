import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Gallery } from "../../../components/gallery";
import { AdminQueue } from "../../../components/admin-queue";
import "../../../app/globals.css";

const query = new URLSearchParams(window.location.search);
const photos = ["first.png", "second.png", "original.heic", "missing.png"].map(
  (name, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    year: 2026,
    name,
    contributor: `Camper ${index + 1}`,
    caption: `Camp memory ${index + 1}`,
    content_type: name.endsWith("heic") ? "image/heic" : "image/png",
    size: 100,
    pathname: `photos/${name}`,
    status: "ready" as const,
    hidden: false,
    created_at: "2026-09-09T00:00:00Z",
    transferred_at: null,
  }),
);
const visible = query.has("single") ? photos.slice(0, 1) : photos;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <button type="button">Outside viewer</button>
      {query.has("admin") ? (
        <AdminQueue year={2026} photos={visible} />
      ) : (
        <Gallery year={2026} photos={visible} unavailable={false} page={1} />
      )}
    </main>
  </StrictMode>,
);
