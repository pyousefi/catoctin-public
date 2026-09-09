# Catoctin family & friends camp

[![prod](https://img.shields.io/endpoint?url=https%3A%2F%2F1byocjticv9nhwmx.public.blob.vercel-storage.com%2Fprod.json)](https://www.campcatoctin.org)
[![nonprod](https://img.shields.io/endpoint?url=https%3A%2F%2F1byocjticv9nhwmx.public.blob.vercel-storage.com%2Fnonprod.json)](https://github.com/pyousefi/catoctin/deployments/nonprod)

A private, mobile-friendly photo scrapbook for Labor Day camp. Features 2026 and links the supplied Google albums for 2025, 2024, and 2010. Family members use one shared password; the organizer uses a separate password.

## What families can do

- Open the existing Google albums with plain-language help.
- Share up to 50 original photos per batch without a Google account or available Google storage.
- Choose the camp year, add their name and an optional story, and watch upload progress.
- Retry unfinished uploads and download photos shared on this site.

Supported formats: JPEG, PNG, HEIC/HEIF, WebP, AVIF, TIFF, and DNG, up to 200 MB per file. Stored bytes and embedded metadata are unchanged. Browser-compatible formats preview on the site; others download for viewing. Originals are not deleted after transfer.

The organizer can download individual originals or ZIP batches (up to 50 photos / 1 GB), hide photos from the family gallery, and mark them as added to Google Photos. Both galleries paginate at 24 photos.

**Google transfer is manual, by design.** Google’s Library API now manages app-created content and cannot add these uploads to your existing shared albums. Download a batch, extract it, add the files to the correct Google album, then mark them as added here. A mark records your confirmation; it does not perform an upload. [Google’s API changes](https://developers.google.com/photos/support/updates) and [album restrictions](https://developers.google.com/photos/library/guides/manage-albums).

## Local development

Requires Node.js 24 and npm. This is a personal `pyousefi` repository; it is not a consumer of Verjson organization release contracts.

```bash
npm ci
cp .env.example .env.local
npm run password:hash
# Generate separate family/admin hashes, and put them in .env.local.
openssl rand -hex 32
# Put the generated random value in SESSION_SECRET.
# Add a Neon DATABASE_URL and private R2 credentials,
# and the four GOOGLE_ALBUM_<year>_URL values from the organizer.
npm run db:setup
node --env-file=.env.local scripts/check-env.mjs
npm run dev
```

The password helper reads hidden terminal input. Never put plaintext passwords in source or command-line arguments. Give family and admin different passwords (12+ characters). Nonproduction must use different passwords, signing secrets, databases, and R2 prefixes from production. With missing configuration, sign-in fails closed and displays a setup message.

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests replace external services. SQL integration tests use PGlite (an in-memory PostgreSQL runtime) to exercise the actual schema, reservation constraints, and upload ownership without contacting Neon. PGlite is a development-only dependency; it does not replace Neon at runtime. Browser tests use signed test sessions and deliberately unavailable storage, exercising the mobile/desktop UI and failure states without accessing family photos. They do not prove live Neon or R2 integration. Before production, run the cloud smoke test below.

## Launch and deployment status

[PR #1](https://github.com/pyousefi/catoctin/pull/1) implements [issue #2](https://github.com/pyousefi/catoctin/issues/2). [Launch verification](docs/verification/2026-09-08-nonprod.md) and [mobile/deletion evidence](docs/verification/2026-09-09-mobile-and-deletion.md) record local and live nonproduction checks. See [GitHub releases](https://github.com/pyousefi/catoctin/releases) and [deployment runs](https://github.com/pyousefi/catoctin/actions) for the current production version and deployment outcome.

The repository is private. GitHub `nonprod`/`prod` environments contain project/team identifiers and inherit the repository-level `VERCEL_TOKEN`. Each environment uses a separate Neon database. This migration keeps legacy private Blob resources readable while adopting separate R2 prefixes. Production is served at `https://www.campcatoctin.org`; the apex redirects there.

On the current GitHub plan, private-repository rulesets are unavailable: `main` is unprotected and `prod` has no required reviewer. Publishing a stable GitHub release is the explicit production promotion action. The owner authorized the initial merge and production release after requesting the additional UI coverage and logout fix. Do not mistake the environment name for an enforced approval gate.

Vercel Web Analytics is enabled and the root layout renders `@vercel/analytics/next`. Playwright runs desktop/mobile Chromium journeys and retains traces and screenshots on failure. To inspect a downloaded CI report, run `npx playwright show-report <report-directory>`; to record a new journey, use `npx playwright codegen http://localhost:3000` against local test data, then add assertions and remove recorded credentials before committing.

Local CLI calls in this setup use `env -u VERCEL_TOKEN npx --yes vercel@59.12.0 ...` because a stale exported token overrides interactive login. CI intentionally uses its configured token.

## Vercel setup

Use the Vercel CLI, following the deployment mechanics used by the sibling Zahra project. CLI version 59.12.0 is pinned in CI.

1. Run `vercel login`, then `vercel link` for this directory. Use a Vercel address initially unless a custom domain is chosen.
2. Connect separate Neon databases for nonprod/prod and the private Cloudflare R2 `catoctin` bucket. Set `R2_PREFIX=preview` for Preview and `R2_PREFIX=production` for Production. Keep public bucket access disabled; use a bucket-scoped Object Read & Write R2 token. The app remains hosted on Vercel.
3. Configure all variables in `.env.example` in Vercel **Preview** and **Production**. Leave production values out of Preview. Use `vercel env add <NAME> preview` / `production` interactively, or the Vercel dashboard; never paste secrets into chat or commit them.
4. Pull each environment to an ignored env file, validate it with `scripts/check-env.mjs`, and apply `scripts/schema.sql` with `scripts/setup-db.mjs`. Vercel pulls sensitive Preview/Production values as `[SENSITIVE]`. CI uses `scripts/check-env.mjs --allow-redacted` to verify required keys and any unredacted values; the runtime receives the actual secrets from Vercel. Strict local validation requires the original private values. The setup is additive and idempotent. Back up the database before future schema changes; schema changes are not auto-applied during app builds.
5. Create GitHub environments `nonprod` and `prod`. Set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as environment secrets. Project and organization IDs come from `.vercel/project.json`. Add a required human reviewer to `prod` and protect `main` with the `check` job. These settings require authenticated GitHub administration and are not created by a YAML file.
6. `vercel.json` disables automatic Git deployments, so GitHub Actions controls promotion. Vercel's account-level deployment protection can remain enabled for nonprod. For the family-facing production address, use the app’s password gate instead of requiring a Vercel account.

**Direct uploads:** The browser receives one-hour signed R2 part URLs after authenticated, same-origin reservation. Originals transfer in 8 MiB parts; the server verifies part sizes and completes the upload. Keep the page open until confirmation succeeds. Legacy Blob callbacks remain supported for in-flight uploads; configured R2 deployments refuse new Blob tokens. See [R2 migration and cutover](docs/operations/r2-migration.md).

## Trunk-based CI/CD and releases

Use short-lived `feat/*` / `fix/*` branches and PRs into `main`. There is no long-lived `dev` branch. The first empty repository needs a baseline `main` commit before GitHub can create a PR.

| Event                            | Checks                                                                | Deployment                        |
| -------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| PR into `main`                   | Typecheck, unit tests, production build, desktop/mobile browser tests | None                              |
| Merge/push to `main`             | Same checks                                                           | Vercel Preview / GitHub `nonprod` |
| Publish prerelease `v1.2.3-rc.1` | Same checks + tag format and ancestry                                 | Vercel Preview / GitHub `nonprod` |
| Publish stable release `v1.2.3`  | Same checks + tag format and ancestry                                 | Vercel Production / GitHub `prod` |

Releases must point to commits already on `main`. Creating a tag alone does not deploy; publishing the GitHub release does. Main merges do not publish to production. Use the same tested commit for an RC and its stable release. Tags are immutable; never move an existing release tag. Package.json describes the application package; the Git release tag identifies the deployed release.

```bash
# Once the PR is merged and nonprod is verified:
git fetch origin main
CAMP_RELEASE_SHA=$(git rev-parse origin/main)
gh release create v0.1.0-rc.1 --target "$CAMP_RELEASE_SHA" --prerelease --generate-notes
# Verify the RC, then explicitly publish the same commit to production:
gh release create v0.1.0 --target "$CAMP_RELEASE_SHA" --generate-notes
```

For an application rollback, use Vercel’s supported rollback to the previous production deployment after checking schema compatibility. Do not change tags, delete originals, or roll back data as part of an app rollback.

## Live smoke test before inviting the family

Use synthetic photos in nonprod; do not copy family originals there.

1. Verify signed-out requests redirect to `/login`; direct `/api/photos/<id>` returns 401; family sessions cannot access `/admin` or admin APIs.
2. Upload a JPEG and an iPhone HEIC to 2026, plus a photo to an older year. Test a file larger than 4.5 MB to exercise direct R2 multipart upload. Confirm progress, retry after disconnect, and successful completion after refresh.
3. Download each original and a ZIP. Compare SHA-256 hashes to the sources. Confirm filenames and embedded photo metadata are intact.
4. Verify unsigned R2 object URLs are inaccessible. Hide a photo as admin and verify a family session can no longer retrieve its ID directly.
5. Add a test photo to the intended Google album manually, confirm it there, and only then mark it as added on the site.
6. Confirm release logs contain the intended SHA/environment and production uses its own secrets and stores. Test on an actual iPhone and Android phone; Chromium mobile emulation is not an iOS Safari test.

## Administrator photo deletion

“Select all” selects every ready original in the chosen camp year across all pages, including hidden photos. Download and Delete show the selected count. ZIP downloads remain limited to 50 originals and 1 GB; larger selections can still be deleted after confirmation. Selection resets when changing years.

“Hide from family” keeps the original and its storage reservation. “Delete permanently” requires confirmation, removes the original from this site and frees reserved storage. It cannot be undone and does not affect copies in Google Photos or files someone has downloaded. Bulk deletion confirms the selected filenames, processes them one at a time and retains failed items for retry. Keep the page open until it finishes. A failed deletion can be retried; capacity is released only when cleanup finishes. An empty private marker remains at the old storage path to prevent unexpired upload tokens from recreating the original. See [the deletion decision](docs/decisions/0002-admin-permanent-photo-deletion/README.md).

## Mobile upload troubleshooting

For Google Photos and other phone apps, see the [device/source matrix, recovery steps and evidence checklist](docs/testing/mobile-uploads.md). Use small batches and locally downloaded originals as an immediate workaround. Automated browser tests include Android Chromium and iPhone WebKit; native app handoffs still require actual-device testing.

## Operations and limits

- Session cookies are HTTP-only, Secure in production, SameSite=Lax, and expire in seven days. Rotate `SESSION_SECRET` to revoke all existing sessions. Changing a password alone prevents new sign-ins but does not revoke existing sessions.
- Password attempts are limited to 15 per IP per 15 minutes in Postgres; database failure blocks sign-in. Expired `rate_limits` rows can be pruned during maintenance.
- `MAX_STORAGE_BYTES` defaults to 10 GiB of reserved originals. Atomic database reservations prevent concurrent uploads from exceeding this cap. It is not a billing cap: reads, transfer, and database usage can still incur charges. Configure provider spend alerts as appropriate.
- Failed/abandoned uploads retain pending reservations until reconciliation. Run `node --env-file=.env.local scripts/reconcile-uploads.mjs` to inspect reservations older than 48 hours; add `--apply` after reviewing the dry run. It recovers matching originals and atomically releases only reservations confirmed absent by the relevant storage provider. Authentication/service errors stop the command; mismatched originals retain capacity for manual review. For missing R2 objects, reconciliation aborts pending multipart uploads before releasing capacity and rechecks for concurrent completion. It does not delete completed originals. Administrator-confirmed deletion is separate; no automatic retention runs.
- The gallery loads originals lazily, so large originals can use substantial bandwidth. Introduce separately stored thumbnails when actual usage justifies that additional image-processing surface; preserve the original as the source of truth.
- Back up Postgres and private originals independently. The site is a sharing tool, not the sole backup of family memories.
- Real shared-album URLs belong only in the server-only `GOOGLE_ALBUM_<year>_URL` environment variables. Never commit them, include them in client imports, or copy them into test fixtures. Keep the repository private while historical commits contain links.
- The family password protects this site and its stored photos. Existing Google albums remain governed by Google’s own sharing settings. Anyone who already has a shared Google album link may still view it outside this site.

See [the security/storage decision](docs/decisions/0001-private-family-photo-storage/README.md) and [running log](NEXT.md).

Upload recovery prefers a continuous provider stream, falling back to FileReader for providers that cannot stream. The first read precedes storage authorization, so immediately unreadable files do not reserve capacity. Reselecting failed originals replaces stale handles and preserves confirmed items. Direct R2 transfer uses one 8 MiB buffer, retains it for part retries, and cancels the provider on failure. Authenticated diagnostics include only attempt UUID, phase, byte count, and fixed error category; filenames, attribution, raw errors, credentials, and signed URLs stay out of logs. Physical Android/iOS provider handoffs still require device testing.

The footer and password screen show the deployed version and short commit ID. CI embeds `NEXT_PUBLIC_APP_VERSION` from the release tag (or `preview` on main) and `NEXT_PUBLIC_APP_COMMIT` from the checked-out commit during the build. Manual preview builds should set both values; unconfigured local builds display `development`.

README deployment badges update after a successful deployment and show that environment’s release/preview version plus short commit ID. Nonprod links to its GitHub deployment history, where each new deployment includes its site URL. Badge data is public version metadata in a dedicated Blob store; R2 photo storage remains private. CDN/badge caches can delay updates by several minutes. Manual/out-of-band deployments must also run `scripts/publish-deployment-badge.mjs` with the verified environment, version, commit and dedicated `DEPLOYMENT_BADGE_TOKEN`; never use a photo-store token.
