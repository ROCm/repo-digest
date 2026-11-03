# Weekly miles digest

Monitor [radixark/miles](https://github.com/radixark/miles) with an English report
every **Friday at 07:00 China Standard Time (Thursday at 23:00 UTC)**.
The workflow is `.github/workflows/miles-weekly-digest.yml`.

Only commits already merged into `main` are analyzed. The time window covers
commit timestamps in the seven days before each run, excluding open/draft PRs,
closed-but-unmerged PRs, and unmerged branches. Git's `--no-merges` skips merge
wrapper commits, while underlying commits and squash/rebase integrations are
included. This is a rolling commit-time window, not a PR `merged_at` query.

The report also summarizes newly submitted issues from
[radixark/miles/issues](https://github.com/radixark/miles/issues) in a
separate **Newly Submitted Issues** section. Selection uses `created_at` in
the same seven-day window and excludes PRs and older issues that were only
updated. Each issue includes its number, link, and open/closed state at
collection time. Reported problems and requests are distinct from shipped
changes; closing an issue does not establish that a fix was merged.

The configuration enables this with `issue_scope: created`, reusing the
shared issue collector and compiler introduced in #36. Reports show the
fixed UTC start/end timestamps and separate new-issue counts, including
when there are no commits. Issue collection failures stop generation.

## Read reports in GitHub

After the first successful publication, the repository running the workflow has:

- `digest-reports` branch, `reports/miles/latest.md`: latest report.
- `digest-reports` branch, `reports/miles/YYYY-MM-DD.md`: dated history.
- The report rendered in the publishing job's Actions summary.
- A downloadable `miles-digest` artifact.

For ROCm/repo-digest, the latest report URL is:
https://github.com/ROCm/repo-digest/blob/digest-reports/reports/miles/latest.md

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
4. Open **Actions → Weekly miles Digest → Run workflow**.

A manual Wednesday run covers the seven days before that run; the Friday
schedule remains in place. Overlapping windows can repeat commits and issues. GitHub
schedules can be delayed, and gaps longer than seven days can leave coverage
gaps. Model analysis failures may leave a report incomplete; check its analyzed
and total commit counts.

Generation runs with read-only repository access. Only the separate publishing
job receives a write token, and the helper stages only this project's reports.
The publisher requires a clean, disposable checkout. Focus areas are configured
in [the project configuration](../.claude/projects/miles.md).

To download an artifact with an authenticated GitHub CLI:

```bash
./scripts/download-artifacts.sh -a miles-digest miles-weekly-digest.yml
```
