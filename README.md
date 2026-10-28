# Open Source Project Digest

Automated summaries of changes to any open source repository using Claude Code. Generate weekly, monthly, or custom-frequency digests with AI-powered analysis.

## Features

- **Flexible Scheduling** — Generate digests weekly, monthly, or on any custom schedule
- **Multi-Project Support** — Configure multiple repositories with different focus areas
- **AI-Powered Analysis** — Uses Claude Code multi-agent architecture for intelligent commit categorization
- **Customizable Focus Areas** — Define paths, keywords, and priority rules per project

## How It Works

A GitHub Action runs on your configured schedule using a multi-agent architecture:

1. **digest** — Fetches commits for the specified time range and coordinates analysis
2. **analyze-commit** — Sub-agents that analyze individual commits in parallel

The system generates prioritized digests highlighting changes relevant to your defined focus areas.

## Project Structure

```
.claude/
├── agents/
│   ├── digest.md            # Orchestrator agent
│   └── analyze-commit.md    # Commit analyzer sub-agent
├── projects/
│   └── <project>.md         # Project-specific configuration
└── skills/
    └── download-artifacts/  # Skill for downloading digest artifacts
        └── SKILL.md
scripts/
└── download-artifacts.sh    # Download artifacts from GitHub Actions
digests/                     # Generated digest files
```

## Configuration

Project settings are defined in `.claude/projects/<project>.md`:
- **Repository** — GitHub repository path (e.g., `owner/repo`)
- **Focus areas** — Paths and components to prioritize
- **Keywords** — Terms to highlight in analysis
- **Priority rules** — How to categorize and rank changes
- **Digest template** — Output format customization

## Adding New Projects

1. Create a config file in `.claude/projects/<project>.md`
2. Define repository path, focus areas, and template
3. Create a workflow that invokes the digest agent with:
   - Config path (first line)
   - Number of days (second line) - e.g., 1 for daily, 7 for weekly
4. Configure the cron schedule for your desired frequency

## Examples

See the [`xla_digest_examples/`](./xla_digest_examples/) directory for sample digest outputs from the [OpenXLA/XLA](https://github.com/openxla/xla) repository. These examples demonstrate:

- Weekly digest format and structure
- Commit categorization by focus areas (GPU, HLO, PJRT, SPMD)
- Priority-based change highlighting
- AI-generated summaries and insights

## Read verl reports in the browser

The `Weekly verl Digest` workflow tracks **only commits already merged into
[`verl-project/verl`](https://github.com/verl-project/verl)'s `main` branch**,
using commit timestamps from the last seven days. Open or draft PRs, closed-but-unmerged
PRs, and commits only on unmerged branches are excluded.
It also summarizes [newly submitted issues](https://github.com/verl-project/verl/issues)
in a separate section, including issues that have since closed. Issues are
selected by creation time in the same seven-day window; older issues that were
only updated during the window are excluded. Each entry links to the issue and
shows its state at collection time. Reported concerns and feature requests are
kept separate from shipped changes, and a closed issue does not imply a merged fix.
It runs every **Friday at 07:00 China Standard Time (Thursday at 23:00 UTC)**
and produces an English digest focused on training, rollout, distributed
backends, and upgrade compatibility. GitHub schedules can be delayed.

Manual runs are also supported: a Wednesday run covers the seven days preceding
that run and does not change the Friday schedule. Reports from overlapping
windows may contain the same commits and issues.

Commit selection reads the checked-out `main` history with `git log --no-merges`.
Here, `--no-merges` skips Git merge wrapper commits to avoid duplicate entries;
the underlying commits from merged branches and commits landed through squash
or rebase merges are included. It does not select open PRs.

The verl configuration opts into issue collection with `- **issue_scope**: created`.
The generator freezes the UTC window at the start of each run and uses `gh api`
to fetch all issue pages, exclude PRs, and filter by `created_at`. The compiler
reads this data from `summaries/issues.json` and includes issues even if no
commits landed in the window. API failures stop generation rather than claiming
there were no issues. The runner needs Python 3 and GitHub CLI; the existing
`GH_TOKEN` supplies authentication for reading this public repository. Other
projects retain commit-only coverage unless they explicitly opt in and add an
issues section to their report template.

After the workflow's first successful publication, open these paths in **the
repository running the workflow**, on the **`digest-reports` branch**:

- `reports/verl/latest.md` — bookmark this for the latest report.
- `reports/verl/YYYY-MM-DD.md` — dated reports for browsing history.

The fixed URL is
`https://github.com/OWNER/REPO/blob/digest-reports/reports/verl/latest.md`.
The publish job's summary also displays the report and links to its latest and
historical versions. The `verl-digest` artifact remains available for download.

To activate this in a fork or another repository:

1. Put the configuration and workflow on its default branch and enable Actions
   (including scheduled workflows in a fork).
2. Supply the existing reusable workflow's model gateway secrets:
   `ANTHROPIC_BASE_URL`, `LLM_GATEWAY_KEY`, and `USER_NTID`. The model generation
   job uses the `build-only-repo-digest` runner; provision that runner or adapt
   `.github/workflows/_digest.yml` to an available runner and model service.
3. Allow the publishing job's `GITHUB_TOKEN` to write to `digest-reports`.
   Repository rulesets must permit creation and updates of this branch.
4. Open **Actions → Weekly verl Digest → Run workflow** for the first report.

The generation job has read-only repository access. A separate publishing job
commits only the Markdown reports to `digest-reports`; it does not update the
default branch. The publishing helper requires a clean, disposable checkout.
Identical reruns do not create an extra commit; another run on the same UTC date
replaces that date's report. Analysis uses a rolling seven-day window, not a
persistent commit cursor, so long gaps between runs can leave coverage gaps.
The separate `verl-recipe` repository, unmerged PRs, and release events
are outside this workflow's scope.

## Downloading Artifacts

Generated digests are uploaded as GitHub Actions artifacts. Use the included script to download them:

```bash
# Most recent Triton daily digest
./scripts/download-artifacts.sh -a digest triton-daily-digest.yml

# 3 most recent XLA daily digests
./scripts/download-artifacts.sh -n 3 -a digest xla-daily-digest.yml

# Triton weekly digest
./scripts/download-artifacts.sh -a weekly-digest triton-weekly-digest.yml

# Most recent LLVM weekly digest (AMD/AMDGPU/ROCm focus)
./scripts/download-artifacts.sh -a llvm-digest-weekly llvm-weekly-digest.yml

# Most recent MaxText daily digest
./scripts/download-artifacts.sh -a maxtext-digest maxtext-daily-digest.yml

# Most recent MaxText weekly digest
./scripts/download-artifacts.sh -a maxtext-weekly-digest maxtext-weekly-digest.yml

# Most recent JAX daily digest (GPU/ROCm/CUDA focus)
./scripts/download-artifacts.sh -a jax-digest jax-daily-digest.yml

# Most recent JAX weekly digest
./scripts/download-artifacts.sh -a jax-weekly-digest jax-weekly-digest.yml

# Most recent verl weekly digest (also published for browser reading)
./scripts/download-artifacts.sh -a verl-digest verl-weekly-digest.yml
```

Run `./scripts/download-artifacts.sh -h` for full usage and available workflows.

If using Claude Code, invoke `/download-artifacts` to download artifacts interactively.

## Manual Trigger

Workflows can be triggered manually via Actions tab:
- Daily digests: Run the corresponding daily workflow
- Weekly digests: Run the corresponding weekly workflow

## License

MIT
