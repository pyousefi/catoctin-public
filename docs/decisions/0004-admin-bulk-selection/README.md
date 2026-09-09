# 0004: Explicit year-scoped bulk selection

- Date: 2026-09-09
- Status: Accepted
- Context: [Issue #11](https://github.com/pyousefi/catoctin/issues/11). The owner requested “Select all” and a counted bulk Delete action alongside Download. The gallery is paginated, so a page-only selection must not be presented as the entire set.

## Decision

“Select all” fetches a metadata-only snapshot of every ready original in the chosen camp year, including hidden originals and other pages. The endpoint requires administrator authentication and sends no-store responses. Selection survives pagination in that year and resets when changing years. Newly uploaded photos are not automatically included in an existing selection or confirmation.

Download and Delete show the selected count. Download submits all selected IDs, including off-page selections, while preserving the existing maximum of 50 originals and 1 GiB per ZIP. The UI explains these limits when a larger selection disables Download; deletion remains available.

Bulk deletion requires a separate confirmation showing the exact selected count and filenames. It sends sequential requests through the existing administrator-only DELETE route, preserving ADR 0003's private empty markers and at-most-once storage accounting. Successful IDs are removed immediately; failures remain selected and can be retried without repeating successful requests. Selection is locked during loading, confirmation and execution. This is an individually committed operation, not an all-or-nothing transaction; closing the browser may interrupt the remaining queue.

## Verification

Mocked route and queue tests cover authorization, invalid years, request failures and retry. PGlite verifies that selection spans pages while excluding other years and non-ready records. Live nonproduction UI verification uses only uniquely named synthetic originals, checks cross-page ZIP selection, confirmation/cancellation, partial failure and retry, and confirms that originals not in the confirmation remain intact.
