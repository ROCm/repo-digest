#!/usr/bin/env bash

set -euo pipefail

ARTIFACT_NAME="digest"
NUM=1
OUTPUT_DIR="./downloads"
REPO_FLAG="ROCm/repo-digest"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] <workflow> [workflow...]

Download '${ARTIFACT_NAME}' artifacts from GitHub Actions runs matching
the given workflow name(s) (e.g. triton-daily-digest.yml).

OPTIONS:
  -n <count>    Number of recent artifacts to download (default: 1)
  -r <repo>     Repository in owner/repo format (default: ${REPO_FLAG})
  -o <dir>      Output directory (default: ${OUTPUT_DIR})
  -a <name>     Artifact name to download (default: ${ARTIFACT_NAME})
  -h            Show this help message

WORKFLOWS:
  triton-daily-digest.yml     "Daily TRITON Digest"   artifact: digest
  triton-weekly-digest.yml    "Weekly TRITON Digest"  artifact: weekly-digest
  xla-daily-digest.yml        "Daily XLA Digest"      artifact: digest
  test-digest.yml             "Test Digest"           artifact: test-digest-{project}-{days}day

EXAMPLES:
  # Most recent artifact from the Triton daily workflow
  $0 -a digest triton-daily-digest.yml

  # 3 most recent XLA daily digests
  $0 -n 3 -a digest xla-daily-digest.yml

  # Latest XLA daily and latest Triton weekly (different artifact names, two calls)
  $0 -a digest xla-daily-digest.yml
  $0 -a weekly-digest triton-weekly-digest.yml

  # Specify repo explicitly
  $0 -r ROCm/repo-digest -a digest xla-daily-digest.yml
EOF
    exit 0
}

while getopts "n:r:o:a:h" opt; do
    case $opt in
        n) NUM="$OPTARG" ;;
        r) REPO_FLAG="$OPTARG" ;;
        o) OUTPUT_DIR="$OPTARG" ;;
        a) ARTIFACT_NAME="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done
shift $((OPTIND - 1))

if [[ $# -eq 0 ]]; then
    echo "Error: at least one workflow name is required" >&2
    echo "Run '$(basename "$0") -h' for usage." >&2
    exit 1
fi

WORKFLOWS=("$@")

# Resolve repository
if [[ -n "$REPO_FLAG" ]]; then
    REPO="$REPO_FLAG"
else
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+/[^/]+?)(\.git)?$ ]]; then
        REPO="${BASH_REMATCH[1]}"
    else
        echo "Error: could not infer repository from git remote. Use -r owner/repo" >&2
        exit 1
    fi
fi

REPO_ARG=(-R "$REPO")

echo "Repository : $REPO"
echo "Workflows  : ${WORKFLOWS[*]}"
echo "Artifact   : $ARTIFACT_NAME"
echo "Downloading: $NUM artifact(s) -> $OUTPUT_DIR"
echo ""

downloaded=0

for workflow in "${WORKFLOWS[@]}"; do
    if [[ $downloaded -ge $NUM ]]; then
        break
    fi

    mapfile -t RUN_IDS < <(
        gh run list "${REPO_ARG[@]}" --workflow "$workflow" --limit "$NUM" \
            --json databaseId --jq '.[].databaseId'
    )

    if [[ ${#RUN_IDS[@]} -eq 0 ]]; then
        echo "No runs found for workflow '$workflow'" >&2
        continue
    fi

    for run_id in "${RUN_IDS[@]}"; do
        if [[ $downloaded -ge $NUM ]]; then
            break
        fi

        dir="$OUTPUT_DIR/run-$run_id"

        if [[ -d "$dir" ]] && [[ -n "$(ls -A "$dir" 2>/dev/null)" ]]; then
            echo "[run $run_id] Already exists, skipping -> $dir"
            downloaded=$((downloaded + 1))
            continue
        fi

        mkdir -p "$dir"

        if gh run download "$run_id" "${REPO_ARG[@]}" -n "$ARTIFACT_NAME" -D "$dir" 2>/dev/null; then
            echo "[run $run_id] Downloaded -> $dir"
            downloaded=$((downloaded + 1))
        else
            echo "[run $run_id] No '$ARTIFACT_NAME' artifact on GitHub, skipping"
            rmdir "$dir" 2>/dev/null || true
        fi
    done
done

echo ""
if [[ $downloaded -eq 0 ]]; then
    echo "No matching artifacts found." >&2
    exit 1
fi

echo "Done. $downloaded artifact(s) downloaded to $OUTPUT_DIR"
