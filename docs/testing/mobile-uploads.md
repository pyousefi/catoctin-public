# Mobile photo upload verification

Tracking: [issue #7](https://github.com/pyousefi/catoctin/issues/7).

Reported symptom: large photos or large selections from Google Photos fail. The device, browser, file sizes, count, exact error and failure stage have not yet been confirmed. The changes accompanying this procedure improve selection and recovery guidance; they do not establish the cause or prove native-provider reliability.

## Immediate workaround

Keep the browser visible and the phone awake. Start with 5–10 photos on reliable Wi-Fi. For a cloud-only original, download it to the phone first, then select it through Files or Gallery. Each file must be at most 200 MiB (shown as 200 MB in the UI); a batch can hold 50 photos. Complete one batch before choosing the next. A file above the limit needs a smaller exported copy; the application does not compress originals automatically.

If transfer fails, keep the page open and use **Retry unfinished photos**. Completed photos are skipped. A file whose upload succeeded but whose confirmation failed is confirmed again without retransferring it. Refreshing or closing the page loses the local queue and retry state; background recovery and resumable uploads across reloads are not implemented.

## Device and source matrix

Run on a dedicated nonproduction deployment with synthetic photos and its own storage. Record the deployment SHA, phone model, OS, browser and source-app versions. An app is tested only where the OS exposes it in the browser's picker. Record unavailable routes as N/A. Sharing from an app's Share menu into the website is not a supported import route.

| Device/browser                    | Sources selected from the website's photo button                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Actual iPhone / Safari            | Apple Photos, Google Photos where exposed, Files → On My iPhone, Files → iCloud Drive; Google Drive or Dropbox if installed and exposed |
| Actual iPhone / Chrome            | Repeat the supported routes, including downloading from Google Photos and then choosing through Photos/Files                            |
| Actual Android / Chrome           | Google Photos, system photo picker, OEM Gallery (Samsung where available), Files/Downloads, Google Drive or Dropbox if exposed          |
| Actual Samsung / Samsung Internet | Google Photos, Samsung Gallery, Files/Downloads                                                                                         |

For each supported source/browser pair, compare the **same original** stored locally and available only in the cloud. First test 1 ordinary JPEG and 5 mixed JPEG/HEIC/PNG files. Then prioritize the reported failing combination for the full boundary matrix:

| Dimension         | Cases                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-photo size    | 1 MB, 5 MB, 9 MB (crosses the SDK's current 8 MiB part boundary), 25 MB, 50 MB, exactly 200 MiB, 200 MiB + 1 byte                               |
| Selection count   | 1, 10, 49, 50, 51, 100; add 2 more to an existing 49-photo queue                                                                                |
| Total bytes       | 10 × 25 MB and 50 × 5 MB to separate count from total-byte effects; avoid 50 × 200 MiB stress until the smaller cases pass                      |
| Provider metadata | Uppercase extensions, zero-byte/unavailable originals, unsupported or absent extensions, repeated selections, mixed supported/unsupported files |
| Connection        | Wi-Fi, cellular, throttled/slow connection; disconnect during a part and reconnect; interrupt confirmation after transfer                       |
| App lifecycle     | Lock/unlock, background/foreground during selection and upload, session expiry, explicit reload                                                 |

The picker MIME hints are advisory. Filename-based server validation still requires a supported extension. Mobile providers may prepare or transcode assets before the website receives them: compare downloaded bytes with the file **delivered to the browser**, and separately record any source-provider conversion from the original.

## Locate the failing stage

1. **Before the selected-file list appears:** record picker count, cloud-download indicator, elapsed time and whether the browser receives any files. This occurs before an upload API call. Compare a locally downloaded copy and a smaller selection. The application cannot retry a provider download that never returned a file.
2. **During selection validation:** record received file count, sizes, MIME types and extensions using synthetic fixtures. Oversized/empty/unsupported files must be named; valid neighbors must remain. A 51-file selection must queue 50 and explicitly say 1 was not added. Duplicates must not consume another slot.
3. **During transfer:** inspect `/api/uploads` token requests and Blob multipart control/part requests using Safari's remote Web Inspector or Chrome's remote device debugging. Record HTTP status, timing and browser error names. Check connection/CSP errors, session expiry and storage quota independently. Bytes go directly to Blob, so the application-function body limit is not the photo-size limit.
4. **During confirmation:** check `/api/uploads/complete` and the photo's final availability. Retry must confirm the existing pathname without another file transfer. The UI reaching 100% transfer alone is not proof of success.
5. **After success:** download every synthetic photo and compare SHA-256/size with the browser-selected input. Check expected photo count and attribution and look for duplicates. For failed/abandoned transfers, inspect pending reservations using the existing reconciliation dry run; retrying a failed transfer can leave an older reservation until reconciliation.

Do not attach family photos, credentials, signed Blob URLs, session cookies or raw HAR files to issues. Use synthetic fixtures and sanitized status/timing summaries. Keep production credentials out of this test deployment.

## Acceptance and evidence

Record one row per case; never mark a device/source as passing solely from emulation:

| SHA / device / OS / browser / source versions | Local or cloud-only | Sizes / count | Network / lifecycle | Failure stage / sanitized error | Queued / saved / rejected counts | Download hash matches | Pass / fail / N/A |
| --------------------------------------------- | ------------------- | ------------- | ------------------- | ------------------------------- | -------------------------------- | --------------------- | ----------------- |
| Pending actual-device execution               |                     |               |                     |                                 |                                  |                       |                   |

Within limits, every selected supported file must either finish and download unchanged or show an actionable per-file error without preventing later files from being attempted. Invalid and overflow files must be explained. Retrying a completed transfer's confirmation must not reupload it. Interrupted or refreshed sessions must not falsely claim success.

The browser harness requires OpenSSL and creates a temporary, self-signed localhost certificate outside the repository. Playwright trusts this certificate only in its test configuration. Production cookie security remains unchanged.

Automated coverage: `npm test` checks exact size boundaries, partial/full queues, duplicate filtering, invalid files and recovery messages. `npm run build && npm run test:e2e` runs desktop Chromium, iPhone Chromium emulation, Android Chromium emulation and iPhone WebKit emulation. Browser tests check picker configuration, 51-file selection, retry metadata, a 9 MiB file requesting multipart mode and continuation after a token failure. These mocked transfer tests do **not** prove successful large Blob transfers, native picker behavior, real network recovery, iOS background execution or byte preservation. Execute the device matrix to establish those results.

## Remedy according to evidence

- Provider preparation failure: local download first, smaller picker selections, provider/OS update; a website cannot control the native provider's download queue.
- Oversize original: clearly reject it and export a smaller copy. Increase the product limit only after real-device, storage-budget and timeout tests justify it.
- Part/network failure: confirm SDK retries and eventual failure behavior on the affected device before changing transfer logic. Consider persisted resumable uploads only if interruption remains a reproduced problem.
- Confirmation failure: retry confirmation using the existing pathname and investigate the completion service/status.
- Quota failure: inspect reserved capacity and reconcile abandoned attempts before treating it as a photo-size issue.
