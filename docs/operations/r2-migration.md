# R2 setup, verification, and cutover

Tracked in [issue #19](https://github.com/pyousefi/catoctin/issues/19); decision: [ADR 0006](../decisions/0006-private-r2-originals/README.md).

## Configuration

Keep the app on Vercel and the metadata databases on Neon. Set these server-side values in each Vercel environment:

| Variable                | Value                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `R2_ENDPOINT`           | `https://5fdfcf94759d7740311baa0d897374d0.r2.cloudflarestorage.com`                    |
| `R2_BUCKET`             | `catoctin`                                                                             |
| `R2_PREFIX`             | `preview` in Preview; `production` in Production                                       |
| `R2_ACCESS_KEY_ID`      | R2 Object Read & Write credential restricted to this bucket                            |
| `R2_SECRET_ACCESS_KEY`  | Matching secret, stored only in private env files/Vercel                               |
| `BLOB_READ_WRITE_TOKEN` | Keep each environment's legacy private token until migration and source cleanup finish |

The endpoint has no `/catoctin` path; the bucket is a separate SDK parameter. Do not enable `r2.dev` or a public custom domain. Prefix separation is enforced by application code; this bucket-scoped credential is not restricted to one prefix.

Set explicit `MAX_STORAGE_BYTES` budgets across both environments, considering total account usage. For example, 9 GiB production (`9663676416`) and 1 GiB preview (`1073741824`) split a 10 GiB application budget. This is a reservation limit, not a billing or free-tier guarantee. Unfinished multipart uploads and copies awaiting migration also count toward storage.

Browser CORS policy for this private bucket:

```json
{
  "rules": [
    {
      "id": "catoctin-signed-upload-parts",
      "allowed": {
        "origins": ["*"],
        "methods": ["PUT"],
        "headers": ["content-type"]
      },
      "maxAgeSeconds": 3600
    }
  ]
}
```

The wildcard supports changing preview deployment origins. It grants no object-read access; every upload still requires a short-lived signed part URL issued through authenticated same-origin application requests. Do not share those URLs or include them in logs.

Before deploying, validate each private environment file and run the additive schema setup against its database:

```bash
node --env-file=.env.local scripts/check-env.mjs
node --env-file=.env.local scripts/setup-db.mjs
```

Schema setup adds nullable `photos.r2_upload_id`; old deployments ignore it. Keep production credentials out of preview. Vercel CI validation accepts explicit secret redaction, while local validation needs actual values.

## Verify Preview first

Use synthetic originals only. Verify signed-out photo access returns 401 and ordinary family sessions cannot call admin endpoints. Upload a small JPEG, a photo larger than 8 MiB, and a physical-device HEIC. Check per-part progress, interrupted transfer retry, and confirmation-only retry. Download originals and a ZIP and compare SHA-256 hashes with the source files.

Check that unsigned R2 object reads are denied. Delete a synthetic ready photo, verify it disappears from metadata and R2, and verify the old part URLs and completion request cannot recreate it. Cancel an unfinished upload and verify its parts are aborted before capacity is released. Finally, run the legacy migration below against synthetic Blob originals and verify authenticated reads and deletion after the path switch.

Unit and browser tests mock external services. They do not establish live R2 signature acceptance, credential permissions, storage CORS behavior, or device-provider behavior. Production cutover follows a successful live Preview check.

## Copy legacy originals

Retain a database backup and the source originals. Run one migrator per environment, starting with a dry run:

```bash
node --env-file=.env.local scripts/migrate-photos-to-r2.mjs
node --env-file=.env.local scripts/migrate-photos-to-r2.mjs --apply
```

Dry run reports counts and IDs without reading original bytes or making writes. Apply processes one original at a time, with at most one 200 MiB source in memory plus transport chunks. It copies to R2 only if the target is absent, rereads the target, checks MIME/size/SHA-256, and conditionally updates metadata. Existing targets are verified rather than overwritten. Family photos must stay in production; use the matching database, legacy token, and R2 prefix.

On a concurrent deletion, a newly copied target is removed only if its metadata row is absent or archived. If another migrator already switched the row to that target, the copy is reverified and retained. Other active-state changes stop the command and retain the copy for review. A process crash can leave a target copy; rerun before declaring migration complete. Never delete an unexplained object merely because it is absent from one inventory snapshot.

Migration does not delete Blob sources. After cutover, verify all ready-photo database paths and compare original/ZIP hashes in production. Source cleanup is a separate, explicitly approved operation using a reviewed inventory of verified migrated originals. Until it runs, Blob usage will not fall even though new photos go to R2. A Blob-only application rollback is unsafe after R2 paths enter the database; retain an R2-aware build or perform a separately verified metadata rollback while source copies still exist.

## Reconcile abandoned uploads

```bash
node --env-file=.env.local scripts/reconcile-uploads.mjs
node --env-file=.env.local scripts/reconcile-uploads.mjs --apply
```

Reservations older than 48 hours are inspected using their actual provider. Matching completed originals are recovered. For missing R2 objects, apply aborts the stored multipart upload, rechecks for concurrent completion, and releases capacity only when the object is still absent. Authentication/service failures stop reconciliation and preserve reservations. Mismatches require review. R2's default lifecycle also expires incomplete multipart uploads after seven days; this does not replace database reconciliation.
