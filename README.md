# Open Source Project Digest

Automated summaries of changes to any open source repository using Claude Code. Generate weekly, monthly, or custom-frequency digests with AI-powered analysis.

## Features

- **Flexible Scheduling** — Generate digests weekly, monthly, or on any custom schedule
- **Multi-Project Support** — Configure multiple repositories with different focus areas
- **AI-Powered Analysis** — Uses Claude Code multi-agent architecture for intelligent commit categorization
- **Customizable Focus Areas** — Define paths, keywords, and priority rules per project

## How It Works

A GitHub Action runs on your configured schedule using a multi-agent architecture:

1. **digest-orchestrator** — Fetches commits for the specified time range and coordinates analysis
2. **analyze-commit** — Sub-agents that analyze individual commits in parallel

The system generates prioritized digests highlighting changes relevant to your defined focus areas.

## Project Structure

```
.claude/
├── agents/
│   ├── daily-digest.md      # Orchestrator agent
│   └── analyze-commit.md    # Commit analyzer sub-agent
└── projects/
    └── <project>.md         # Project-specific configuration
digests/                     # Generated digest files
```

## Configuration

Project settings are defined in `.claude/projects/<project>.md`:
- **Repository** — GitHub repository path (e.g., `owner/repo`)
- **Frequency** — Digest frequency (weekly, monthly, daily)
- **Focus areas** — Paths and components to prioritize
- **Keywords** — Terms to highlight in analysis
- **Priority rules** — How to categorize and rank changes
- **Digest template** — Output format customization

## Adding New Projects

1. Create a config file in `.claude/projects/<project>.md`
2. Define repository path, focus areas, frequency, and template
3. Create a workflow that invokes the digest agent with the config path
4. Configure the cron schedule for your desired frequency

### Example Frequencies

```yaml
# Weekly digest (every Monday at 9am UTC)
schedule:
  - cron: '0 9 * * 1'

# Monthly digest (first day of month at 9am UTC)
schedule:
  - cron: '0 9 1 * *'
```

## Setup

1. Fork this repository
2. Get your OAuth token by running `claude /oauth_token` (requires Claude Max subscription)
3. Add `CLAUDE_CODE_OAUTH_TOKEN` to your repository secrets
4. Configure your project in `.claude/projects/`
5. Set up the workflow schedule for your desired frequency
6. The workflow runs automatically, or trigger manually via Actions tab

## Examples

See the [`xla_digest_examples/`](./xla_digest_examples/) directory for sample digest outputs from the [OpenXLA/XLA](https://github.com/openxla/xla) repository. These examples demonstrate:

- Weekly digest format and structure
- Commit categorization by focus areas (GPU, HLO, PJRT, SPMD)
- Priority-based change highlighting
- AI-generated summaries and insights

## Manual Trigger

Go to Actions > Project Digest > Run workflow

Select the project configuration and time range when triggering manually.

## License

MIT
