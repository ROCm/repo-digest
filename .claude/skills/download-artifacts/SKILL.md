---
name: download-artifacts
description: Use this skill when the user wants to download GitHub Actions artifacts from repo-digest workflows. Triggers when the user mentions "download artifact", "get the digest", "fetch artifact", "latest digest", or references workflows like "triton-daily-digest", "triton-weekly-digest", "xla-daily-digest", or "test-digest".
argument-hint: [triton|xla|triton-weekly|latest] [n]
allowed-tools: Bash
---

# Download Artifacts

Download digest artifacts from repo-digest GitHub Actions workflows using the bundled script.

## Script

Run `./scripts/download-artifacts.sh` from the project root. The script is also available at `skills/download-artifacts/scripts/download-artifacts.sh`.

## Arguments

User request: $ARGUMENTS

If no arguments are provided, **ask the user** which workflow to download from and how many artifacts they want. Do not assume a default.

If `latest` is given without specifying a workflow, also ask which workflow.

Parse the arguments to determine:
- Which workflow to use: `triton` or `triton-daily` → `triton-daily-digest.yml`, `triton-weekly` → `triton-weekly-digest.yml`, `xla` → `xla-daily-digest.yml`, `test` → `test-digest.yml`.
- How many artifacts: if a number is given (e.g. `3`), pass it as `-n`. Default: `1`.

## Steps

1. Parse $ARGUMENTS to identify workflow and count (see above)
2. Look up the correct artifact name for that workflow (see table below)
3. Run the script with the appropriate flags
4. Report what was downloaded and where it was saved

## Workflows and artifact names

| Workflow file             | Display name          | Artifact name                     |
|---------------------------|-----------------------|-----------------------------------|
| `triton-daily-digest.yml` | Daily TRITON Digest   | `digest`                          |
| `triton-weekly-digest.yml`| Weekly TRITON Digest  | `weekly-digest`                   |
| `xla-daily-digest.yml`    | Daily XLA Digest      | `digest`                          |
| `test-digest.yml`         | Test Digest           | `test-digest-{project}-{days}day` |

## Script options

| Flag        | Description                         | Default            |
|-------------|-------------------------------------|--------------------|
| `-n <count>`| Number of recent artifacts          | `1`                |
| `-r <repo>` | Repository in `owner/repo` format   | inferred from git  |
| `-o <dir>`  | Output directory                    | `./downloads`      |
| `-a <name>` | Artifact name to download           | `digest`           |

## Examples

```bash
# Most recent Triton daily digest
./scripts/download-artifacts.sh -a digest triton-daily-digest.yml

# 3 most recent XLA daily digests
./scripts/download-artifacts.sh -n 3 -a digest xla-daily-digest.yml

# Latest XLA daily and Triton weekly (different artifact names, two calls)
./scripts/download-artifacts.sh -a digest xla-daily-digest.yml
./scripts/download-artifacts.sh -a weekly-digest triton-weekly-digest.yml
```

## Notes

- Artifacts are saved to `./downloads/run-<run_id>/`
- Already-downloaded runs are skipped and counted toward the total
- Requires `gh` CLI authenticated with access to `ROCm/repo-digest`
