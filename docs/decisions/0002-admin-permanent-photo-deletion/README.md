# 0002: Confirmed administrator photo deletion

- Date: 2026-09-09
- Status: Superseded in its storage deletion mechanics by [ADR 0003](../0003-prevent-deleted-photo-recreation/README.md); authorization and confirmation requirements remain accepted.
- Context: [Issue #9](https://github.com/pyousefi/catoctin/issues/9). The owner requested admin deletion and authorized completing the remaining work and deploying to production. Hiding retains originals and does not release storage.

## Decision

Keep “Hide from family” as the reversible visibility control. Add a separate, explicitly confirmed permanent delete action for an administrator. A same-origin, authenticated DELETE request identifies a ready photo by UUID; the server resolves its stored pathname. Family sessions cannot delete photos. The confirmation names the file, explains irreversibility and clarifies that downloaded or Google Photos copies are unaffected.

Delete the private Blob original before deleting metadata. Remove the metadata and decrement its reserved bytes together in one PostgreSQL statement, deriving the decrement only from rows actually deleted. Repeated or concurrent requests therefore release capacity at most once. Reject pending or archived upload entries, whose reservation lifecycle belongs to upload reconciliation.

Blob and PostgreSQL cannot share a transaction. A Blob failure retains metadata and capacity. A database failure after Blob deletion may temporarily leave a broken original in the admin list, but retains the pathname and reservation so a retry can finish. An already absent Blob is a successful storage deletion; other service errors remain errors. A request for already removed metadata is idempotently successful.

## Consequences and verification

Deletion is irreversible through the application; it is never automatic. This extends the manual organizer controls in ADR 0001 without adding a retention policy or changing Google albums. No database migration is required.

Mocked service/route tests cover authorization, origin checks, invalid IDs, service failures and retry. PGlite exercises the actual SQL for repeated/concurrent deletion and rollback of metadata when accounting fails. Live verification uses only uniquely named synthetic photos, checks confirmation/cancellation, downloaded bytes, access after deletion and storage reclamation. Existing family photos are never deletion fixtures.
