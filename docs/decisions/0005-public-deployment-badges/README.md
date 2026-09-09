# 0005: Public metadata for deployment badges

Date: 2026-09-09
Status: Accepted
Issue: [#16](https://github.com/pyousefi/catoctin/issues/16)

## Context

The README should show the version actually deployed to prod and nonprod, following the badge style in `terptechpub/self-publish-ai-app`. GitHub’s image proxy and Shields need anonymously readable metadata even for a private repository. The existing Vercel deployments already display their version and short commit on the password screen.

## Decision

Use Shields endpoint badges backed by a dedicated public Vercel Blob store, `catoctin-deployment-badges` (`store_1byoCJTICV9nhWmX`). Its two JSON files contain only environment, release/preview version, short commit and badge presentation fields. No family photos, attribution, credentials or application configuration are published.

Keep photo stores private. The badge store has a distinct writer token, installed as the repository Actions secret `DEPLOYMENT_BADGE_TOKEN`; the publisher checks its store prefix before writing. Its development-only project connection uses the separate `DEPLOYMENT_BADGE` prefix and does not replace any photo-storage variables. The deployed application needs no badge-store credential.

Update only the corresponding environment’s file after Vercel deployment succeeds. The per-environment deployment concurrency lock also covers the badge update. Automatic workflow cancellation applies only to pull requests, so a new main push cannot interrupt a started deployment between cloud promotion and badge publication. Production requires an exact stable release version; nonprod accepts preview or a release candidate. Both require the full commit SHA as input. Failure to publish the badge fails the workflow visibly, while the already-successful application deployment remains live.

The README stays static and normal repository write permissions remain unchanged. This uses the existing storage provider and a narrowly scoped store token rather than giving CI a general GitHub credential or permission to rewrite main.

## Consequences

Versions and short commits are public, consistent with the site’s password screen. Badge caching can lag successful deployments by several minutes. A manual cancellation after cloud promotion or a publisher failure can leave the previous badge until publication is retried; workflow failure does not mean the application deployment was rolled back. Out-of-band deployments must explicitly update their badge using verified deployment metadata. A badge is an operational aid; the Vercel deployment and GitHub deployment record are the authoritative history. Nonprod links to that history because preview deployment URLs change.
