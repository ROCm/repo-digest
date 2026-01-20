# Daily Digest

Automated daily summaries of changes to the [OpenXLA/XLA](https://github.com/openxla/xla) repository using Claude Code.

## How It Works

A GitHub Action runs daily using a multi-agent architecture:

1. **daily-digest** — Orchestrator that fetches commits and coordinates analysis
2. **analyze-commit** — Sub-agents that analyze individual commits in parallel

The system generates prioritized digests with focus on focus area.

## Project Structure

```
.claude/
├── agents/
│   ├── daily-digest.md      # Orchestrator agent
│   └── analyze-commit.md    # Commit analyzer sub-agent
└── projects/
    └── xla.md               # XLA project configuration
digests/                     # Generated digest files
```

## Configuration

Project settings are defined in `.claude/projects/xla.md`:
- **Focus areas** — Paths to prioritize (GPU, HLO, PJRT, SPMD)
- **Keywords** — Terms to highlight (performance, CUDA, ROCm)
- **Priority rules** — How to categorize changes
- **Digest template** — Output format

## Adding New Projects

1. Create a config file in `.claude/projects/<project>.md`
2. Define repository path, focus areas, and template
3. Create a workflow that invokes `--agent daily-digest` with the config path

## Setup

1. Fork this repository
2. Get your OAuth token by running `claude /oauth_token` (requires Claude Max subscription)
3. Add `CLAUDE_CODE_OAUTH_TOKEN` to your repository secrets
4. The workflow runs automatically, or trigger manually via Actions tab

## Manual Trigger

Go to Actions > Daily XLA Digest > Run workflow
