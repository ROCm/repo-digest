# Weekly vime digest

Monitor [vllm-project/vime](https://github.com/vllm-project/vime) with an English report
every **Friday at 07:00 China Standard Time (Thursday at 23:00 UTC)**.
The workflow is `.github/workflows/vime-weekly-digest.yml`.

Only commits already merged into `main` are analyzed. The time window covers
commit timestamps in the seven days before each run, excluding open/draft PRs,
closed-but-unmerged PRs, and unmerged branches. Git's `--no-merges` skips merge
wrapper commits, while underlying commits and squash/rebase integrations are
included. This is a rolling commit-time window, not a PR `merged_at` query.

## Read reports in GitHub

After the first successful publication, the repository running the workflow has:

- `digest-reports` branch, `reports/vime/latest.md`: latest report.
- `digest-reports` branch, `reports/vime/YYYY-MM-DD.md`: dated history.
- The report rendered in the publishing job's Actions summary.
- A downloadable `vime-digest` artifact.

For ROCm/repo-digest, the latest report URL is:
https://github.com/ROCm/repo-digest/blob/digest-reports/reports/vime/latest.md

Replace `ROCm/repo-digest` with your fork's owner/repository when running there.
Publication retries up to five times so concurrent reports can refresh the
shared branch and publish without force-pushing. Identical reruns do not create
an extra commit; another run on the same UTC date replaces that dated report.

## Setup and manual runs

1. Merge the workflow and configuration into the repository's default branch
   and enable GitHub Actions, including scheduled workflows in a fork.
2. Provide the reusable workflow's `ANTHROPIC_BASE_URL`, `LLM_GATEWAY_KEY`, and
   `USER_NTID` secrets and a `build-only-repo-digest` runner that can reach the
   model gateway. Forks do not inherit upstream secrets or runner access.
3. Permit the publishing job's `GITHUB_TOKEN` to create/update `digest-reports`.
4. Open **Actions → Weekly vime Digest → Run workflow**.

A manual Wednesday run covers the seven days before that run; the Friday
schedule remains in place. Overlapping windows can repeat commits. GitHub
schedules can be delayed, and gaps longer than seven days can leave coverage
gaps. Model analysis failures may leave a report incomplete; check its analyzed
and total commit counts.

Generation runs with read-only repository access. Only the separate publishing
job receives a write token, and the helper stages only this project's reports.
The publisher requires a clean, disposable checkout. Focus areas are configured
in [the project configuration](../.claude/projects/vime.md).

To download an artifact with an authenticated GitHub CLI:

```bash
./scripts/download-artifacts.sh -a vime-digest vime-weekly-digest.yml
```
