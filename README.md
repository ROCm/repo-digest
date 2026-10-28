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

The `Daily verl Digest` workflow tracks non-merge commits on
[`verl-project/verl`](https://github.com/verl-project/verl)'s `main` branch
over the last day. It runs daily at **12:17 UTC (20:17 China Standard Time)**
and produces an English digest focused on training, rollout, distributed
backends, and upgrade compatibility. GitHub schedules can be delayed.

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
4. Open **Actions → Daily verl Digest → Run workflow** for the first report.

The generation job has read-only repository access. A separate publishing job
commits only the Markdown reports to `digest-reports`; it does not update the
default branch. The publishing helper requires a clean, disposable checkout.
Identical reruns do not create an extra commit; another run on the same UTC date
replaces that date's report. Analysis uses a rolling one-day window, not a
persistent commit cursor, so long gaps between runs can leave coverage gaps.
The separate `verl-recipe` repository, unmerged PRs, issues, and release events
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

# Most recent verl daily digest (also published for browser reading)
./scripts/download-artifacts.sh -a verl-digest verl-daily-digest.yml
```

Run `./scripts/download-artifacts.sh -h` for full usage and available workflows.

If using Claude Code, invoke `/download-artifacts` to download artifacts interactively.

## Manual Trigger

Workflows can be triggered manually via Actions tab:
- Daily digests: Run the corresponding daily workflow
- Weekly digests: Run the corresponding weekly workflow

## License

MIT
