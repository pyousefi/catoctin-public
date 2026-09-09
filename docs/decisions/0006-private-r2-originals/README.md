# 0006 — Store private photo originals in Cloudflare R2

Status: accepted for implementation; live cutover requires verification.

## Context

[Issue #19](https://github.com/pyousefi/catoctin/issues/19) records the owner's request to move originals out of Vercel Blob because storage is running out. This supersedes the original-storage choice in [ADR 0001](../0001-private-family-photo-storage/README.md) and the R2 portion of the deletion strategy in [ADR 0003](../0003-prevent-deleted-photo-recreation/README.md). Authentication, Neon metadata, Vercel hosting, and legacy Blob deletion protection continue to apply.

## Decision

Use the owner's private `catoctin` R2 bucket through the standard AWS S3 SDK. The SDK and presigner provide Cloudflare-supported signing, streaming reads, multipart operations, and typed commands; implementing signature cryptography locally would add unnecessary risk.

Store R2 originals under `r2/production/photos/` or `r2/preview/photos/`. Existing `photos/` database paths continue to use private Blob access. Each deployment rejects R2 paths outside its configured environment. Prefixes prevent accidental application crossover; the bucket-scoped credential can access both prefixes, so they are not an IAM boundary. Keep production photos out of preview databases and test with synthetic originals.

Only authenticated same-origin requests may reserve capacity and start uploads. The server stores the multipart upload ID in an additive nullable database column. Browsers receive one-hour signed `UploadPart` URLs with signed content lengths. The browser reads continuously and assembles one 8 MiB transfer buffer at a time. Failed parts reuse buffered bytes. Only the server can complete uploads after checking authoritative part counts, order, sizes, and ETags, followed by final object size and content type.

Downloads remain authenticated server streams with private/no-store caching. Neither public bucket URLs nor public read access are enabled. CORS permits only `PUT` from browser origins, with `content-type` allowed. Wildcard origin supports immutable Vercel preview URLs; it does not authorize object access. Each write still needs its signed part capability, and browser requests omit credentials and referrers.

R2 deletion removes completed originals. Signed part URLs cannot recreate a completed multipart upload. Completion also requires the original session's database row. Legacy Blob paths retain their empty-marker replay protection. Deletion retries when a concurrent migration changes a pathname. Cancellation and reconciliation abort pending parts before releasing capacity, and check for a completion that won the race.

Migration verifies size, MIME type, and SHA-256 after copying and before a conditional metadata switch. Source Blob originals are retained. An existing target must match rather than being overwritten. If concurrent deletion removes or archives the metadata row, migration cleans that unreferenced R2 copy; other unexpected active states fail with the copy retained for review. Process interruption can still leave an unreferenced copy, so rerun/inspect migration before source cleanup.

## Consequences

New originals no longer consume Vercel Blob capacity. Legacy credentials remain necessary until source migration and approved cleanup finish. Public deployment badges continue to use their independent, tiny Blob metadata store.

R2 and Neon cannot share an atomic transaction. The implementation uses conditional database changes, storage inspection, idempotent operations, and reconciliation. The application's reservation cap is not a billing cap or a guarantee of remaining inside the account-wide R2 free allowance. Preview and production share that allowance, and temporary migration copies and unfinished multipart uploads also consume storage.

Application rollback must preserve R2-aware reads once metadata references R2; reverting to an older Blob-only deployment would make migrated photos unavailable. Do not delete source originals as part of deployment or rollback.
