# 0001: Private family access and original photo storage

- Date: 2026-09-08
- Status: Accepted
- Context: Initial Catoctin camp website request; repository started empty. Tracked in [issue #2](https://github.com/pyousefi/catoctin/issues/2) and implemented by [PR #1](https://github.com/pyousefi/catoctin/pull/1).

## Decision

Use a shared family password and a separate organizer password, as requested. Server-signed expiring role cookies gate every protected page and photo API. Store salted scrypt password hashes and the signing secret only in environment configuration. Enforce same-origin mutations and durable IP-based login throttling; fail closed when dependencies are unavailable.

Store originals in private Vercel Blob, with metadata and atomic storage reservations in Neon Postgres. Browsers upload directly using authenticated, path-scoped, size-limited Blob tokens. The signed Blob callback or authenticated client completion verifies storage metadata before publishing the photo. Authorized downloads stream the original bytes without redirecting to public storage. Reject active file types such as SVG/HTML. Sharing preserves original metadata, including any embedded location information.

Read shared Google album URLs from server-only environment configuration, never client imports or committed fixtures. Use manual admin download/add/confirm for the existing Google albums. Google’s post-March-2025 Library API limits album operations to app-created content. The user explicitly chose to retain the existing albums rather than create new API-managed albums.

Follow trunk-based delivery. Main goes to nonprod; published semantic version releases from main go to prod; `-rc.N` prereleases go to nonprod. Deployment mechanics follow Zahra’s Vercel CLI pipeline, while deliberately replacing its long-lived dev branch and main-to-prod trigger with the requested promotion model.

## Consequences

Anyone with the family password can view/download the family gallery. Shared credentials do not provide per-person identity or individual revocation. Seven-day cookies are revoked collectively by rotating the signing secret. The organizer password grants broader access and must differ from the family password.

No uploaded original is deleted automatically. Admin transfer markers are confirmations, not Google API receipts. Private storage and metadata require separate backups and separate resources across environments. Missing configuration disables sign-in. Pending upload reservations intentionally fail conservatively and require reconciliation before reclaiming budget.

Production release authorization, branch protection, cloud integration, and real-device behavior require verification after account access is available. Application authentication and private-storage routes are the highest-risk review surfaces.

## Sources

- https://developers.google.com/photos/support/updates
- https://developers.google.com/photos/library/guides/manage-albums
- Sibling `zahra/.github/workflows/deploy-preview.yml` and `deploy-production.yml`, inspected 2026-09-08.
