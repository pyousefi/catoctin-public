# Repository public-readiness

Tracked by [issue #20](https://github.com/pyousefi/catoctin/issues/20). This remains open until the historical exposure is resolved.

Real family Google Photos shared links appeared in earlier pull-request history. GitHub can retain PR #1 head/merge references and cached views after the main branch is cleaned. A clean checkout or a successful scan of current HEAD ancestry does not establish that every hosted reference is safe to publish.

Before making this repository public, revoke or replace the exposed album sharing links in Google Photos, verify that the old links no longer grant access, and update the private deployment configuration with the replacements. Alternatively, ask GitHub Support to remove the retained pull-request references and cached sensitive views, then verify the affected references are inaccessible. Keep the repository private while this remains unresolved. Do not paste live links, credentials, or unredacted scanner reports into issues or pull requests.

## Prevention and verification

The separate `Secret scan` workflow uses Gitleaks v8.30.1 with a hard-coded archive SHA-256, its default credential rules, and an additional rule for Google Photos short and shared-album URLs. It checks the full ancestry reachable from HEAD on pull requests and main pushes, with complete redaction. It does not scan every remote or retained GitHub reference and does not rewrite history or revoke links.

Only the existing synthetic album IDs (`test`, `test2026`, `test2025`, `test2024`, `test2010`) are exempted from the shared-link rule. No test directory is excluded. `.gitleaksignore` exempts one historical finding: a public original-file SHA-256 in the verification report, scoped to its exact commit/path/rule/line fingerprint. New findings require investigation; do not broadly allowlist a path or rule to clear CI.

Run `python3 scripts/test-secret-scan.py --gitleaks /path/to/gitleaks` to exercise disposable Git fixtures. The checks prove allowed synthetic links pass, forbidden links and credentials fail, removal from the current tree does not hide a historical finding, and a digest fingerprint exception does not exempt another commit.

Run the repository scan with:

```sh
gitleaks git . --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore \
  --log-opts="--full-history -m HEAD" --redact=100 --ignore-gitleaks-allow --no-banner
```

The new check should be required by branch protection before relying on it as a merge gate. CI helps detect new exposure; it cannot remove the existing retained references described above.
