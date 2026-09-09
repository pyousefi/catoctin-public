# Mobile uploads and administrator deletion — 2026-09-09

Related: [upload issue #7](https://github.com/pyousefi/catoctin/issues/7), [deletion issue #9](https://github.com/pyousefi/catoctin/issues/9), [PR #10](https://github.com/pyousefi/catoctin/pull/10), [ADR 0003](../decisions/0003-prevent-deleted-photo-recreation/README.md).

Verified implementation: `089559ab27f10421f36c024bcf6d6c154d1d894d`.
Nonproduction deployment: <https://catoctin-6cl08krgw-pouyadata.vercel.app>.

## Evidence

[CI run 34357688033](https://github.com/pyousefi/catoctin/actions/runs/34357688033) passed formatting, TypeScript, production build, 87 unit/integration tests and 52 browser checks across desktop Chromium, iPhone Chromium emulation, Android Chromium emulation and iPhone WebKit emulation.

A live Playwright run used a Chromium Android profile, dedicated nonproduction credentials/storage and only newly generated synthetic PNGs. It established:

- A **27,050,893-byte** original uploaded through the actual multipart Blob path. One part request was deliberately aborted; the SDK retried it successfully.
- One save-confirmation request was deliberately answered with 503. “Retry unfinished photos” completed confirmation without another upload-token request or file transfer.
- The large original's downloaded SHA-256 matched its input bytes.
- Family and foreign-origin administrator DELETE requests returned 403.
- The administrator dialog named the original; cancellation left it downloadable. A simulated deletion 503 was visible inside the dialog, and retry succeeded.
- After deletion, the photo API returned 404. Repeating the DELETE returned 204.
- The original client token was refused when trying to recreate the deleted pathname. A multipart upload initiated and supplied with a part before deletion was also refused at completion. Both failures were checked for an explicit occupied-path/overwrite error, rather than treating an arbitrary network failure as proof.
- Storage HEAD verified a zero-byte marker with `application/octet-stream` content type.
- Selecting **51 photos** retained 50 and reported exactly one omitted photo. All 50 retained photos uploaded successfully; every downloaded SHA-256 matched its input bytes.
- Deleting only this run's uniquely named fixtures restored the initial `reserved_bytes` total. Existing nonproduction fixtures and all production family photos were untouched.

The initial plain-delete implementation failed the live token-replay test before this correction: its still-valid upload token successfully recreated the original after the database row was removed. This is why permanent deletion retains an empty marker instead of removing the storage path. The independent review raised this test and found no further concrete code defect after the corrected strategy was exercised.

## Boundaries

This verifies actual storage transfers, application recovery and deletion with synthetic originals. It does not exercise native Google Photos, Apple Photos, Files, Gallery or Drive pickers on physical phones; cloud-only preparation and iOS background execution remain unverified. Use [the device/source matrix](../testing/mobile-uploads.md) on the affected phone. The cause of the originally reported native-provider failure has not been established.

The destructive review points are `lib/delete-photo.ts` (empty-marker overwrite and atomic accounting), `app/api/admin/photos/[id]/route.ts` (administrator/origin checks) and `components/admin-queue.tsx` (confirmation). There is no database migration. Empty markers contain no original bytes or attribution and remain indefinitely to block token reuse.
