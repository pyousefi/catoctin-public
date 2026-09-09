import { albumUrl } from "@/lib/album-url";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Camera,
  Heart,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trees,
} from "lucide-react";
import { requirePageSession } from "@/lib/auth";
import { albums, years } from "@/lib/albums";
import { listPhotos, type Photo } from "@/lib/db";
import { Header, Footer } from "@/components/header";
import { CampScene } from "@/components/camp-scene";
import { UploadForm } from "@/components/upload-form";
import { Gallery } from "@/components/gallery";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; page?: string }>;
}) {
  const current = await requirePageSession();
  const query = await searchParams;
  const year = years.includes(Number(query.year) as (typeof years)[number])
    ? Number(query.year)
    : 2026;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.page) || 1)),
  );
  let photos: Photo[] = [],
    unavailable = false;
  try {
    photos = await listPhotos(year, false, page, 24);
  } catch {
    unavailable = true;
  }
  return (
    <>
      <Header admin={current.role === "admin"} />
      <main className="main-content">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-sun" /> LABOR DAY WEEKEND · 2026
            </span>
            <h1>
              Camp ends.
              <br />
              The memories
              <br />
              <em>come home.</em>
            </h1>
            <p>
              Another weekend in the woods, another year of stories. A little
              place to relive it all — and share the moments you caught along
              the way.
            </p>
            <div className="hero-actions">
              <a
                className="button primary"
                href={albumUrl(2026)}
                target="_blank"
                rel="noopener noreferrer"
              >
                See the 2026 photos <ArrowUpRight size={19} />
              </a>
              <Link className="button quiet" href="#share">
                Share your photos <ArrowDown size={18} />
              </Link>
            </div>
            <div className="hero-location">
              <MapPin size={16} />
              <span>Catoctin Mountain Park, Maryland</span>
            </div>
          </div>
          <div className="hero-art">
            <CampScene />
            <div className="art-stamp">
              <Trees size={27} />
              <span>
                HAPPY CAMPERS
                <br />
                <strong>SINCE WAY BACK</strong>
              </span>
            </div>
            <div className="photo-label">
              Same time. Same place. Our people. <Heart size={16} />
            </div>
          </div>
        </section>
        <div className="welcome-strip">
          <span className="welcome-heart">
            <Heart size={22} />
          </span>
          <p>
            <strong>2026 is a wrap. What a weekend.</strong> Thanks for the
            laughs, the food, and the memories. Let’s keep them all in one
            place.
          </p>
          <span className="handwritten">Until next summer.</span>
        </div>
        <section className="section" id="memories">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                THE YEARS GO BY. THE STORIES STAY.
              </span>
              <h2>Our camp scrapbook.</h2>
            </div>
            <p>Different summers. The same good company.</p>
          </div>
          <div className="album-grid">
            {albums.map((album, index) => (
              <article key={album.year} className={`album-card album-${index}`}>
                <div className="album-art">
                  <Trees size={index === 3 ? 59 : 72} strokeWidth={1} />
                  <span className="album-year">{album.year}</span>
                  {index === 0 && (
                    <span className="latest-badge">LATEST SUMMER</span>
                  )}
                </div>
                <div className="album-details">
                  <h3>{album.label}</h3>
                  <a
                    href={albumUrl(album.year)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Google album <ArrowUpRight size={17} />
                  </a>
                  <Link
                    className="local-album-link"
                    href={`/?year=${album.year}#camp-photos`}
                  >
                    See photos shared here →
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="album-help">
            <span>New to Google Photos?</span> Tap “Open Google album” to look
            through the photos. You can view a shared album in your browser
            without installing the app.
          </p>
        </section>
        <section className="share-section section" id="share">
          <div className="share-copy">
            <span className="eyebrow">
              THE BEST PHOTOS ARE THE ONES WE SHARE
            </span>
            <h2>
              You were there.
              <br />
              <em>Show us your side.</em>
            </h2>
            <p>
              The blurry laughs. The perfect sunset. Everyone squeezed around
              the table. We want your memories, too.
            </p>
            <ol className="steps">
              <li>
                <span>1</span>
                <div>
                  <h3>Pick the year. Add your name.</h3>
                  <p>Let us know which camp these belong to.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <h3>Choose your photos.</h3>
                  <p>Straight from your phone or computer.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <h3>Tap share. We’ll take it from here.</h3>
                  <p>Our organizer will add them to the Google album.</p>
                </div>
              </li>
            </ol>
            <div className="quality-note">
              <ShieldCheck size={25} />
              <p>
                <strong>No Google account? No room left?</strong>
                <br />
                You can still share here. We keep your photos in their original
                quality.
              </p>
            </div>
          </div>
          <UploadForm />
        </section>
        <Gallery
          photos={photos}
          year={year}
          unavailable={unavailable}
          page={page}
        />
        <section className="help-section section" id="help">
          <div>
            <span className="eyebrow">A LITTLE HELP, IF YOU NEED IT</span>
            <h2>Let’s make this easy.</h2>
          </div>
          <div className="faq">
            <details>
              <summary>How do I look at the Google photos?</summary>
              <p>
                Tap “See the 2026 photos” or choose a year above. The album
                opens in a new tab. If your phone asks you to install Google
                Photos, look for the option to continue in your browser. Tap a
                photo to make it bigger, then swipe or use the arrows. Close
                that tab to return here.
              </p>
            </details>
            <details>
              <summary>Do I need a Google account to share here?</summary>
              <p>
                No. Enter your name, choose the camp year, and select photos
                from your device. Tap “Share” and keep this page open until
                every photo says “Shared. Thank you!” It won’t use your Google
                storage.
              </p>
            </details>
            <details>
              <summary>Where will my photos go?</summary>
              <p>
                They are stored privately on this site in their original
                quality. People with the family password can see and download
                them. The organizer can then download them and add them to the
                matching Google album.
              </p>
            </details>
            <details>
              <summary>What if an upload doesn’t finish?</summary>
              <p>
                Keep this page open and check your connection. Tap “Retry
                unfinished photos.” Photos that already say “Shared” won’t
                upload again. Large photos may take a few minutes on a slow
                connection.
              </p>
            </details>
          </div>
        </section>
        <div className="closing-note">
          <Sparkles size={22} />
          <p>Here’s to the moments between the photos.</p>
          <span>And to doing it all again.</span>
        </div>
      </main>
      <Footer />
    </>
  );
}
