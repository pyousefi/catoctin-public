# Next

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
