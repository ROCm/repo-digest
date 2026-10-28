#!/usr/bin/env bash
# Publish one digest to a dedicated branch in a disposable, clean checkout.
# Usage: bash scripts/publish-digest.sh <artifact-dir> <checkout-dir> <project>
# The checkout's origin must be the report destination, not the monitored repo.
set -euo pipefail

if [[ $# -ne 3 || ! "$3" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "Usage: $0 <artifact-dir> <checkout-dir> <project-slug>" >&2
  exit 2
fi

artifact_dir="$(realpath "$1")"
checkout_dir="$(realpath "$2")"
project="$3"
branch=digest-reports

shopt -s nullglob
reports=("$artifact_dir"/digest-????-??-??.md)
if [[ ${#reports[@]} -ne 1 || ! -s "${reports[0]}" ]]; then
  echo "Expected exactly one nonempty dated digest in $artifact_dir" >&2
  exit 1
fi
report="${reports[0]}"
report_date="$(basename "$report" .md)"
report_date="${report_date#digest-}"
if [[ ! "$report_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Invalid digest date: $report_date" >&2
  exit 1
fi
if [[ "$artifact_dir/" == "$checkout_dir/"* ]]; then
  echo "Artifact directory must be outside the publication checkout" >&2
  exit 1
fi
if [[ -n "$(git -C "$checkout_dir" status --porcelain)" ]]; then
  echo "Publication requires a clean, disposable checkout" >&2
  exit 1
fi

# Keep the report readable on the run page even if branch permissions block push.
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat "$report" >> "$GITHUB_STEP_SUMMARY"
fi

# A failed remote lookup must fail the job, not be treated as a missing branch.
remote_ref="$(git -C "$checkout_dir" ls-remote --heads origin "refs/heads/$branch")"
if [[ -n "$remote_ref" ]]; then
  git -C "$checkout_dir" fetch origin "$branch"
  git -C "$checkout_dir" switch -C "$branch" FETCH_HEAD
else
  git -C "$checkout_dir" switch --orphan "$branch"
fi

report_dir="reports/$project"
mkdir -p "$checkout_dir/$report_dir"
cp "$report" "$checkout_dir/$report_dir/$report_date.md"
cp "$report" "$checkout_dir/$report_dir/latest.md"

git -C "$checkout_dir" config user.name 'github-actions[bot]'
git -C "$checkout_dir" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C "$checkout_dir" add -- "$report_dir/$report_date.md" "$report_dir/latest.md"
if ! git -C "$checkout_dir" diff --cached --quiet; then
  git -C "$checkout_dir" commit -m "docs: update $project digest for $report_date"
fi
# No force push: concurrent remote edits must never be overwritten.
git -C "$checkout_dir" push origin "HEAD:refs/heads/$branch"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" && -n "${GITHUB_REPOSITORY:-}" ]]; then
  report_url="${GITHUB_SERVER_URL:-https://github.com}/$GITHUB_REPOSITORY"
  {
    printf '\n\n---\n'
    printf '[Latest report](%s/blob/%s/%s/latest.md) · ' "$report_url" "$branch" "$report_dir"
    printf '[Report history](%s/tree/%s/%s)\n' "$report_url" "$branch" "$report_dir"
  } >> "$GITHUB_STEP_SUMMARY"
fi
