#!/usr/bin/env python3
"""Collect newly submitted GitHub issues for a fixed digest window via gh."""

import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path
import re
import subprocess
import sys


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Issue window timestamps must include a timezone")
    return parsed


def collect(repo_url, since, until):
    match = re.fullmatch(r"https://github\.com/([\w.-]+/[\w.-]+)/?", repo_url)
    if not match:
        raise ValueError("Expected a GitHub repository URL: https://github.com/owner/repo")
    repository = match.group(1)
    start, end = timestamp(since), timestamp(until)
    if start >= end:
        raise ValueError("Issue window start must precede its end")

    # The REST issues endpoint also returns PRs. 'since' filters updated_at,
    # so filter created_at locally after fetching every page (without a cap).
    # GitHub's 'since' is exclusive; include issues exactly on our lower bound.
    api_since = (start - timedelta(seconds=1)).isoformat()
    result = subprocess.run(
        [
            "gh", "api", "--method", "GET", "--paginate",
            f"repos/{repository}/issues",
            "-f", "state=all", "-f", f"since={api_since}",
            "-f", "sort=created", "-f", "direction=asc",
            "-F", "per_page=100",
        ],
        check=True, capture_output=True, text=True,
    )
    # Older GitHub CLI versions support --paginate but not --slurp. Decode
    # the successive JSON page arrays directly, including pretty-printed pages.
    decoder = json.JSONDecoder()
    pages = []
    offset = 0
    while offset < len(result.stdout):
        if result.stdout[offset].isspace():
            offset += 1
            continue
        page, offset = decoder.raw_decode(result.stdout, offset)
        if not isinstance(page, list) or not all(isinstance(item, dict) for item in page):
            raise ValueError("Expected issue arrays from GitHub")
        pages.append(page)
    if not pages:
        raise ValueError("GitHub returned no issue pages")

    issues = {}
    for page in pages:
        for issue in page:
            if "pull_request" in issue:
                continue
            if not start <= timestamp(issue["created_at"]) <= end:
                continue
            if issue["state"] not in ("open", "closed"):
                raise ValueError("Unexpected issue state")
            number = issue["number"]
            issues[number] = {
                "number": number,
                "url": f"https://github.com/{repository}/issues/{number}",
                "title": issue["title"],
                "body": issue.get("body") or "",
                "author": (issue.get("user") or {}).get("login"),
                "state": issue["state"],
                "state_reason": issue.get("state_reason"),
                "created_at": issue["created_at"],
                "labels": [label["name"] for label in issue.get("labels", [])],
            }
    return {
        "repository": repository,
        "scope": "created",
        "since": since,
        "until": until,
        "issues": sorted(issues.values(), key=lambda item: (item["created_at"], item["number"])),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-url", required=True)
    parser.add_argument("--since", required=True)
    parser.add_argument("--until", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        data = collect(args.repo_url, args.since, args.until)
        args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
        print(f"Issue collection failed; digest generation must stop: {exc}", file=sys.stderr)
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            print(exc.stderr, file=sys.stderr)
        return 1
    print(f"==> Collected {len(data['issues'])} newly submitted issue(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
