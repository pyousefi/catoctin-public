# Next

## 2026-09-09 — Select all originals in a year and delete selected originals (#11)

- Replace page-only selection with an explicit year-wide snapshot across pages, including hidden originals; reset selection when changing years.
- Show counted Download and Delete actions, submit off-page selections to ZIP downloads, and explain the existing 50-original/1 GiB ZIP limits.
- Confirm the exact deletion set and process it sequentially through the existing protected deletion endpoint. Remove successful items immediately and retain failures for retry.
- Cover selection authorization, year/status filters, progress, failure handling and retry; record scope and irreversible-operation semantics in ADR 0004.
- Verify 100 unit/integration tests and 52 browser checks; live preview confirms 51-photo selection, exact 49-file ZIP scope, year-change races, cancellation, frozen confirmation and retry-only failures. Record evidence in `docs/verification/2026-09-09-admin-bulk-selection.md`.

## 2026-09-09 — Let organizers permanently delete photos (#9)

- Add a named, explicit confirmation separate from hiding. Restrict deletion to same-origin administrator requests and ready photos.
- Replace the private original with an empty marker before atomically removing metadata and releasing its reserved capacity; the SDK receives an empty Node buffer, and the marker blocks replay of unexpired upload tokens. Preserve retry information after partial failure and release capacity only once under concurrent requests.
- Verify 87 unit/integration tests and 52 browser checks. Live nonproduction tests cover a 27 MB interrupted multipart upload, confirmation-only retry, 50 uploaded originals with matching download hashes, deletion cancellation/retry and rejection of ordinary/preinitiated token replay.
- Exercise authorization, service failures, repeated/concurrent requests and database rollback with mocked services and PGlite. Record the irreversible-deletion decision in ADR 0002 and its replay-resistant storage strategy in ADR 0003.

## 2026-09-09 — Improve mobile photo selection and recovery (#7)

- Add MIME picker hints, deduplicate selections within a batch, report omitted photo counts, and give local-download guidance for empty/unreadable provider files. Preserve direct multipart transfer and original bytes.
- Distinguish failed save confirmation from failed transfer, with retry instructions that retain the current page state.
- Run the production browser-test server over temporary local HTTPS so WebKit exercises secure-cookie logout under the same transport as deployments.
- Exclude local token-tool cache files from formatting checks.
- Cover size/count boundaries and multipart request/queue continuation; add Android Chromium and iPhone WebKit browser projects and an actual-device/source test matrix. Native Google Photos handoff and live large-file recovery remain to be verified.

## 2026-09-08 — Add Vercel Speed Insights (#3)

- Install `@vercel/speed-insights` and render its Next.js component beside Analytics in the root layout to collect page performance measurements.
- Verify formatting, TypeScript, the production build, unit/integration tests, and all 24 desktop/mobile UI checks.

## 2026-09-08 — Fix browser logout rejecting its own form (#2)

- Use a same-origin referrer policy so native internal POST forms send their origin and pass the existing CSRF check. The previous no-referrer policy sent an opaque origin and produced a 403 on logout; external destinations still receive no referrer.
- Add browser regressions for family/organizer logout, session removal, and continued rejection of foreign/opaque origins. Capture failure screenshots alongside Playwright traces in CI.
- Exercise unavailable-storage sign-in, empty-photo rejection, the 50-photo batch limit, and retry preserving year/contributor. Use localhost consistently for local dev/start and the browser runner so the browser and Next.js agree on the request origin.
- Confirm both logout regressions fail with 403 before the fix, then exercise the full checks and live preview after the fix.

## 2026-09-08 — Make the CI deployment target explicit (#2)

- Pass the selected preview/production environment directly to Vercel deployment, matching the verified prebuilt preview command instead of relying on the CLI default.
- Validate the workflow with actionlint; the real pinned-CLI preview deployment was inspected as Preview / Ready. Production promotion remains unverified and requires owner approval.

## 2026-09-08 — Reverify launch readiness (#2)

- Record the private repository, repository-level Vercel CI token, and missing enforced GitHub protections on the current plan.
- Reverify the analytics preview, original/ZIP integrity, access controls, and empty independent production storage; document remaining human/device and CI deployment checks.

## 2026-09-08 — Add Vercel Web Analytics (#2)

- Install `@vercel/analytics` and render its Next.js component in the root layout so analytics loads across the app.
- Verify formatting, TypeScript, production build, and desktop/mobile browser checks after integration.

## 2026-09-08 — Prepare isolated launch environments (#2)

- Provision separate free Neon databases, private Blob stores, and distinct access/session secrets for nonprod and production; initialize both schemas and confirm production contains no photos.
- Configure GitHub environment project identifiers and require the owner’s review for production deployments. Hold release for repository-privacy resolution, a project-scoped CI token, and security review.

## 2026-09-08 — Permit authenticated direct Blob uploads (#2)

- Allow the Blob SDK control-plane API in the browser connection policy while keeping third-party access restricted.
- Verify a real 6,763,537-byte preview upload, byte-identical original/ZIP downloads, admin-only writes, transfer marking, and hidden-photo authorization. Add a network-policy regression test.

## 2026-09-08 — Validate redacted Vercel build configuration (#2)

- Allow Vercel’s `[SENSITIVE]` placeholders only in the explicit CI validation mode while retaining required-key and unredacted-value checks. Runtime secrets remain resolved by Vercel.
- Keep strict validation for locally supplied environment values; cover missing secrets, malformed values, and redacted secrets with isolated tests.

## 2026-09-08 — Keep shared album links private (#2)

- Read real Google album URLs only from server-side environment configuration; client components and browser tests use year metadata or synthetic URLs.
- Fail closed on missing/invalid album destinations. Verify production JavaScript bundles contain none of the real links.

## 2026-09-08 — Private Catoctin family camp scrapbook

- Feature 2026 and preserve supplied Google album links for 2025, 2024, and 2010, with large mobile controls and simple viewing/upload instructions.
- Add separate family/organizer password access, signed role sessions, same-origin mutation checks, and durable login throttling.
- Collect original JPEG, PNG, HEIC/HEIF, WebP, AVIF, TIFF, and DNG files in private Vercel Blob with Postgres metadata and an atomic storage budget.
- Add a dry-run-first recovery command for abandoned upload reservations; recover completed originals and reclaim only confirmed-missing storage.
- Add progress, retry and completion confirmation, family galleries, original-file downloads, admin ZIP exports, hide/show controls, and manual Google transfer tracking.
- Add trunk-based CI/CD: main and release candidates to nonprod, explicitly published stable releases from main to prod via pinned Vercel CLI.
- Add security/storage decision, environment/schema setup scripts, isolated behavior tests, and desktop/mobile browser checks. Live cloud verification remains required before launch.
