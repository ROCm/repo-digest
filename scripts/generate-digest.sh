#!/usr/bin/env bash
#
# generate-digest.sh — deterministic digest generator.
#
# Phase 1: fan out one `claude -p --agent analyze-commit` process per commit
#          (bounded concurrency) writing summaries/<hash>.md.
# Phase 2: run one `claude -p --agent digest` that reads those summaries and
#          compiles the final digests/<prefix>-YYYY-MM-DD.md.
#
# This replaces the model-driven Task-tool orchestration, which hangs in the
# headless claude-code-action SDK (async subagents, no way to block).
#
# Usage: scripts/generate-digest.sh <config-file-path> <days>
#   e.g. scripts/generate-digest.sh .claude/projects/xla.md 1

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

# Max concurrent claude analyze processes. Bounded to avoid gateway
# rate-limits and runner memory pressure on large commit sets.
JOBS="${DIGEST_JOBS:-4}"
SUMMARY_DIR="${DIGEST_SUMMARY_DIR:-summaries}"

# Headless CLI runs need onboarding marked complete so they don't prompt.
CLAUDE_SETTINGS='{"hasCompletedOnboarding": true}'

# When DIGEST_VERBOSE is set (manual/debug runs), stream the compile agent's
# full tool-use trace so the run log is useful for debugging.
DIGEST_VERBOSE_FLAG=()
if [[ -n "${DIGEST_VERBOSE:-}" ]]; then
  DIGEST_VERBOSE_FLAG=(--verbose)
fi

# ---------------------------------------------------------------------------
# Internal mode: analyze a single commit. Invoked by xargs (see Phase 1).
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--analyze-one" ]]; then
  config="$2"
  hash="$3"
  outdir="$4"
  out="$outdir/$hash.md"
  if claude -p "$config"$'\n'"$hash" \
        --agent analyze-commit \
        --allowedTools "Bash,Read,Grep" \
        --settings "$CLAUDE_SETTINGS" \
        > "$out.tmp" 2> "$outdir/$hash.err"; then
    mv "$out.tmp" "$out"
    echo "OK   $hash"
  else
    echo "FAIL $hash (see $outdir/$hash.err)" >&2
    rm -f "$out.tmp"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Main mode
# ---------------------------------------------------------------------------
CONFIG="${1:-}"
DAYS="${2:-}"

if [[ -z "$CONFIG" || -z "$DAYS" ]]; then
  echo "Usage: $0 <config-file-path> <days>" >&2
  exit 2
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "Config file not found: $CONFIG" >&2
  exit 2
fi

# Parse a `- **key**: value` line from the config.
config_value() {
  local key="$1"
  grep -iE "^\s*-\s*\*\*${key}\*\*\s*:" "$CONFIG" \
    | head -n1 \
    | sed -E "s/^\s*-\s*\*\*${key}\*\*\s*:\s*//I" \
    | sed -E 's/\s+$//'
}

REPO_PATH="$(config_value path)"
BRANCH="$(config_value branch)"

if [[ -z "$REPO_PATH" || -z "$BRANCH" ]]; then
  echo "Could not parse 'path' and 'branch' from $CONFIG" >&2
  exit 2
fi
if [[ ! -d "$REPO_PATH/.git" && ! -f "$REPO_PATH/.git" ]]; then
  echo "Repository not found at '$REPO_PATH' (expected a git checkout)" >&2
  exit 2
fi

echo "==> Config:  $CONFIG"
echo "==> Repo:    $REPO_PATH (branch $BRANCH)"
echo "==> Window:  last $DAYS day(s)"
echo "==> Jobs:    $JOBS concurrent"

# ---------------------------------------------------------------------------
# Phase 0: gather commit hashes
# ---------------------------------------------------------------------------
mapfile -t HASHES < <(git -C "$REPO_PATH" log \
  --since="$DAYS days ago" \
  --format="%H" \
  --no-merges \
  "$BRANCH")

echo "==> Found ${#HASHES[@]} commit(s)"

# Reset the summaries dir for a clean run.
rm -rf "$SUMMARY_DIR"
mkdir -p "$SUMMARY_DIR"

if [[ ${#HASHES[@]} -eq 0 ]]; then
  echo "==> No commits in window; skipping analysis, digest agent will emit an empty digest"
else
  # -------------------------------------------------------------------------
  # Phase 1: parallel per-commit analysis (bounded concurrency).
  # A failing commit drops its summary but never aborts the whole run.
  # -------------------------------------------------------------------------
  echo "==> Phase 1: analyzing commits"
  printf '%s\n' "${HASHES[@]}" \
    | xargs -P "$JOBS" -I {} "$SCRIPT_PATH" --analyze-one "$CONFIG" {} "$SUMMARY_DIR" \
    || true

  produced="$(find "$SUMMARY_DIR" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')"
  echo "==> Phase 1 done: $produced/${#HASHES[@]} summaries written"
fi

# ---------------------------------------------------------------------------
# Phase 2: compile the final digest from the summaries.
# ---------------------------------------------------------------------------
echo "==> Phase 2: compiling digest"
claude -p "$CONFIG"$'\n'"$DAYS" \
  --agent digest \
  --allowedTools "Bash,Read,Write,Glob,Grep" \
  --settings "$CLAUDE_SETTINGS" \
  "${DIGEST_VERBOSE_FLAG[@]}"

echo "==> Done"
