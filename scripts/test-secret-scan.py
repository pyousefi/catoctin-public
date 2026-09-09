#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent.parent


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


def commit(repo, content):
    (repo / "fixture.txt").write_text(content)
    git(repo, "add", "fixture.txt")
    git(repo, "commit", "--quiet", "-m", "Synthetic scanner fixture")


def scan(binary, repo, expected_rules):
    report = repo / "report.json"
    result = subprocess.run(
        [
            binary, "git", str(repo), "--config", str(ROOT / ".gitleaks.toml"),
            "--gitleaks-ignore-path", str(repo / ".gitleaksignore"),
            "--log-opts=--full-history -m HEAD", "--redact=100", "--ignore-gitleaks-allow",
            "--no-banner", "--report-format=json", "--report-path", str(report),
        ],
        capture_output=True,
        text=True,
    )
    expected_exit = 1 if expected_rules else 0
    if result.returncode != expected_exit:
        raise AssertionError(f"Scanner exit {result.returncode}; expected {expected_exit}")
    findings = json.loads(report.read_text())
    if {finding["RuleID"] for finding in findings} != expected_rules:
        raise AssertionError("Scanner returned unexpected rule IDs")
    if any(finding["Secret"] != "REDACTED" for finding in findings):
        raise AssertionError("Scanner report was not fully redacted")
    return findings


def fixture(directory, name):
    repo = directory / name
    repo.mkdir()
    git(repo, "init", "--quiet")
    git(repo, "config", "user.name", "Scanner fixture")
    git(repo, "config", "user.email", "scanner@example.invalid")
    git(repo, "config", "commit.gpgsign", "false")
    (repo / ".gitleaksignore").write_text("")
    return repo


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gitleaks", required=True)
    args = parser.parse_args()
    binary = str(Path(args.gitleaks).resolve())
    with tempfile.TemporaryDirectory(prefix="catoctin-secret-scan-") as temp:
        directory = Path(temp)
        allowed = fixture(directory, "allowed")
        commit(allowed, "\n".join(
            "https://photos.app.goo.gl/" + value
            for value in ["test", "test2026", "test2025", "test2024", "test2010"]
        ))
        scan(binary, allowed, set())

        links = fixture(directory, "links")
        commit(links, "https://photos.app.goo.gl/" + "SyntheticForbiddenLink01")
        commit(links, "Removed from the current tree; ancestry must still fail.")
        scan(binary, links, {"google-photos-shared-link"})

        merge = fixture(directory, "merge")
        commit(merge, "Base fixture.\n")
        base_branch = git(merge, "symbolic-ref", "--short", "HEAD")
        git(merge, "checkout", "--quiet", "-b", "feature")
        (merge / "branch.txt").write_text("Independent branch change.\n")
        git(merge, "add", "branch.txt")
        git(merge, "commit", "--quiet", "-m", "Synthetic branch")
        git(merge, "checkout", "--quiet", base_branch)
        commit(merge, "Main fixture change.\n")
        git(merge, "merge", "--no-ff", "--no-commit", "feature")
        commit(merge, "https://photos.app.goo.gl/" + "SyntheticMergeOnlyLink")
        scan(binary, merge, {"google-photos-shared-link"})

        long_links = fixture(directory, "long-links")
        commit(long_links, "https://photos.google.com/share/" + "SyntheticAlbum01?key=SyntheticAccessKey")
        scan(binary, long_links, {"google-photos-shared-link"})

        altered_fixture = fixture(directory, "altered-fixture")
        commit(altered_fixture, "https://photos.app.goo.gl/" + "test2026Extra")
        scan(binary, altered_fixture, {"google-photos-shared-link"})

        credentials = fixture(directory, "credentials")
        commit(credentials, 'token = "' + "ghp_" + "0123456789abcdef" * 2 + '0123"\n')
        scan(binary, credentials, {"github-pat"})

        digest = fixture(directory, "digest")
        public_digest = hashlib.sha256(b"Synthetic public verification digest").hexdigest()
        commit(digest, "access controls. SHA-256: `" + public_digest + "`\n")
        findings = scan(binary, digest, {"generic-api-key"})
        (digest / ".gitleaksignore").write_text(findings[0]["Fingerprint"] + "\n")
        scan(binary, digest, set())
        commit(digest, "Different access controls. SHA-256: `" + public_digest + "`\n")
        scan(binary, digest, {"generic-api-key"})
    print("Secret scan checks passed: synthetic allowlist, short/long links, history and merge commits, credentials, exact fingerprint scope, redaction.")


if __name__ == "__main__":
    main()
