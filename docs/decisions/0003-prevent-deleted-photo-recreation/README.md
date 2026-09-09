# 0003: Prevent deleted originals from being recreated

- Date: 2026-09-09
- Status: Accepted
- Context: [Issue #9](https://github.com/pyousefi/catoctin/issues/9), superseding the storage deletion mechanics in [ADR 0002](../0002-admin-permanent-photo-deletion/README.md).

## Evidence

A live, synthetic nonproduction test uploaded an original, deleted it through the administrator endpoint, and then successfully recreated it with the original client upload token. Upload tokens remain valid for one hour and are scoped to one pathname with `allowOverwrite: false`; removing that path makes it available again. A database-only deletion record cannot revoke an already issued storage token.

## Decision

Atomically overwrite the stored original with a zero-byte, private `application/octet-stream` marker using the server's storage credential. Keep the same pathname, explicitly disable random suffixes and permit this server-side overwrite. There is no delete-then-create gap. Client tokens cannot overwrite the occupied path, including after the original's database row is removed.

Only after the marker is stored do we atomically remove the metadata and release the original's reserved capacity. Repeated writes of the empty marker are harmless. Storage failures retain the metadata and reservation for retry; database failures after replacement also retain them. The UI says the original is removed and cannot be restored, while documentation discloses the marker. No photo bytes or attribution remain in the marker; only its randomly assigned path and generic storage metadata remain.

## Consequences

Empty markers remain indefinitely; no cleanup job or database migration is required. They consume object metadata but zero original bytes, and are excluded from the original-byte budget. Do not remove them casually or replace this operation with `del`: doing so would reopen the path to still-valid upload tokens. A future cleanup policy would require expiry evidence and protection against in-flight multipart completion.

Confirm against live storage that replay is rejected and the marker has size zero and generic content type. Test the ordinary signed-client upload and a multipart upload initiated before deletion. Keep the original authorization, confirmation and at-most-once accounting tests.
