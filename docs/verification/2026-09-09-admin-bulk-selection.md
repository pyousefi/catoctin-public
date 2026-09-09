# Admin bulk selection verification — 2026-09-09

## Automated checks

[PR #12 CI](https://github.com/pyousefi/catoctin/actions/runs/34362019465) passed formatting, TypeScript, the production build, 100 unit/integration tests and 52 browser checks across desktop Chromium, mobile Chromium, Android Chromium and iPhone WebKit. Independent source review found no blocking defect.

The new unit/integration coverage verifies administrator access, supported-year validation, no-store responses, all ready originals across pages (including hidden originals), sequential deletion, deduplication, progress, mixed failures and retrying only failures.

## Live preview

Preview `https://catoctin-7lh6otmtw-pouyadata.vercel.app` was exercised using Playwright with a Pixel 7 profile and real nonproduction SQL/Blob services. The harness refused database or Blob credentials matching production and required an empty camp year. All mutations used uniquely named synthetic PNGs; cleanup deleted only that run's fixtures through the protected endpoint.

- Uploaded 51 originals and hid one from family view. Select all included all 51 IDs across pages, including the hidden original. Download was disabled above the existing 50-original ZIP limit while Delete remained enabled.
- Navigated to page two and deselected two originals. All 49 remaining IDs appeared exactly once in the hidden ZIP form fields. The actual downloaded ZIP contained exactly the expected 49 entries with the original fixture byte lengths.
- Cancelled bulk confirmation and observed zero DELETE requests.
- Changed years and verified selection cleared. Delayed a Select-all request, switched years before releasing its response, and verified no IDs carried into the new year.
- Confirmed 49 originals, then uploaded another fixture before executing deletion. Injected a single 503 response: 48 deletions succeeded, the failed ID remained selected, and retry sent only that ID. The two unselected originals and the newly uploaded original survived.
- Verified the admin layout stayed within the Pixel 7 viewport. Removed the remaining run-owned fixtures after verification.

Initial harness assertions were adjusted for asynchronous checkbox state, the existing year/ID prefix in ZIP filenames, and waiting for year navigation before clicking the next control. These were test synchronization/expectation corrections; live verification required no implementation changes.

## Review boundary

Review `components/admin-queue.tsx` for the frozen confirmation list and year selection, and `lib/delete-selected-photos.ts` for sequential partial-failure handling. Per-original authorization, private empty markers and atomic capacity accounting remain as verified in ADR 0003 and the prior deletion verification.

This is browser and cloud-service evidence. Physical-phone Google Photos, Files and Gallery handoff remains unverified and tracked in [#7](https://github.com/pyousefi/catoctin/issues/7).
