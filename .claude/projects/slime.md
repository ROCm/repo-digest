# slime Project Configuration

## Repository
- **name**: slime
- **path**: slime
- **url**: https://github.com/THUDM/slime
- **branch**: main
- **issue_scope**: created

## Output
- **directory**: digests
- **filename_prefix**: digest

## Commit Scope

Only report commits already merged into `THUDM/slime`'s `main` branch.
Use the checked-out `main` history as the source of truth. Exclude open or
draft PRs, closed-but-unmerged PRs, and commits only present on unmerged branches.
Do not describe proposed changes as available in slime.

The generator uses `git log main --no-merges`: it analyzes the underlying
commits from merged branches, including commits landed through squash and
rebase merges, while skipping merge wrapper commits to avoid duplicate entries.
The rolling time window is based on commit timestamps, not PR creation dates.

## Issue Scope

Also summarize issues newly submitted to
[THUDM/slime/issues](https://github.com/THUDM/slime/issues) within
the same rolling time window, based on `created_at`. Include both open and
closed issues, with their state at collection time. Exclude pull requests
and older issues that were only updated during the window.

Read the collected issue data from `summaries/issues.json`. Keep reported
problems and feature requests separate from merged code changes: a reported
problem is not a confirmed regression, and a closed issue does not prove a
fix has shipped. Summarize every new issue in English with its number, link,
state, and reported user impact. Group related issues when helpful, retaining
all issue links and states.

## Focus Areas

**Training and RL Algorithms (highest priority)**:
- `train.py`
- `slime/backends/megatron_utils/*`
- `slime/utils/ppo_utils.py`

**SGLang Rollout, Routing, and Agent Workflows**:
- `slime/backends/sglang_utils/*`
- `slime/rollout/*`
- `slime/agent/*`

**Data Buffer, Distributed Execution, and Recovery**:
- `slime/data/*`
- `slime/ray/*`
- `slime/utils/weight_sync.py`
- `slime/utils/disk_delta.py`
- `slime/utils/routing_replay.py`
- `slime/observability/*`

**Configuration, Models, and Runtime Compatibility**:
- `slime/utils/*`
- `slime_plugins/*`
- `scripts/*`
- `docker/*`
- `tools/*`
- `requirements.txt`
- `pyproject.toml`
- `setup.py`
- `build_conda.sh`

**Examples, Documentation, and CI**:
- `examples/*`
- `docs/*`
- `tests/*`
- `.github/*`

## Keywords
PPO, GRPO, CISPO, Megatron, SGLang, Ray, rollout, agent, data buffer, distillation, staleness, checkpoint, weight sync, R3, FP8, performance, regression, CUDA, ROCm, AMD, PD disaggregation, rewind, router, TIS, sandbox, harness

## Emphasis
Explain what changed for slime users: Megatron training and SGLang rollout compatibility, policy-loss/log-probability correctness, custom generation and multi-turn agent interfaces, asynchronous rollout, data-buffer semantics, checkpoint recovery, and weight synchronization. Highlight configuration migrations, throughput, and memory changes when the diff supports them. Monitor THUDM/slime only; linked ecosystem projects and their open PRs are outside this report.

Call out ROCm/AMD implications only when supported by the diff. Include user-facing changes outside the focus areas when relevant.

## Language
Write summaries and impact paragraphs in English. Preserve code
identifiers, author names, links, and the required PRIORITY/ENTRY markers and
priority headings used by the agents.

## Priority Rules
- 🔴 **High**: Breaking APIs/configuration, training correctness regressions or fixes, major algorithm/backend features, substantial performance or memory changes, incompatible checkpoints or dependencies.
- 🟡 **Medium**: Other functional fixes, backend compatibility improvements, distributed execution changes, and refactors that affect user workflows.
- 🟢 **Low**: Documentation, tests, formatting, and minor cleanups without runtime impact.

## Digest Template

```markdown
# slime {FREQUENCY} Digest - YYYY-MM-DD

## Summary
[Summarize the most important developments in 1–2 sentences.]

Source: [THUDM/slime](https://github.com/THUDM/slime), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last {days} day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): [start timestamp] through [end timestamp]. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

[High-priority entries, or "None" if there are no changes in this category.]

### 🟡 Medium Priority

[Medium-priority entries, or "None" if there are no changes in this category.]

### 🟢 Low Priority

[Low-priority entries, or "None" if there are no changes in this category.]

## Newly Submitted Issues

[English summaries with issue number, link, and open/closed state, or "No issues were submitted in this window".]

## Stats
- **Total Commits**: X
- **Analyzed Commits**: X
- **Active Contributors**: X
- **Files Changed**: X
- **Training-Specific Commits**: X (Y% of total)
- **New Issues**: X (Y open, Z closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
```

### Entry Format Rules
- Replace `{days}` with the requested number of days.
- Use the fixed `since` and `until` timestamps from `summaries/issues.json` for the UTC window.
- Start each commit entry with `- `, followed by an English summary, `by *Author Name (Org)*`, and `[short-hash](full-commit-url)`.
- After a blank line, write one impact paragraph indented by four spaces.
- Count Analyzed Commits from the per-commit summaries. If it is below Total Commits, explicitly state that the report is incomplete; missing analyses do not imply no changes.
- If there are no commits, state "No commits already merged into main have commit timestamps within the last {days} day(s)" and use zeroed commit stats. Still summarize newly submitted issues and populate issue stats.
- Format issue entries as `- [#number](issue-url) (open/closed): English summary and reported impact.` Keep issue counts separate from commit statistics.
