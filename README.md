# XLA Daily Digest

Automated daily summaries of changes to the [OpenXLA/XLA](https://github.com/openxla/xla) repository using Claude Code.

## How It Works

A GitHub Action runs daily to:
- Fetch the latest commits from the XLA repository
- Analyze changes with focus on GPU backend
- Generate a prioritized digest of important changes

## Setup

1. Fork this repository
2. Get your OAuth token by running `claude /oauth_token` (requires Claude Max subscription)
3. Add `CLAUDE_CODE_OAUTH_TOKEN` to your repository secrets
4. The workflow runs automatically, or trigger manually via Actions tab

## Manual Trigger

Go to Actions > Daily XLA Digest > Run workflow
