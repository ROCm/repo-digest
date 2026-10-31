# vime Project Configuration

## Repository
- **name**: vime
- **path**: vime
- **url**: https://github.com/vllm-project/vime
- **branch**: main
- **issue_scope**: created

## Output
- **directory**: digests
- **filename_prefix**: digest

## Commit Scope

Only report commits already merged into `vllm-project/vime`'s `main` branch.
Use the checked-out `main` history as the source of truth. Exclude open or
draft PRs, closed-but-unmerged PRs, and commits only present on unmerged branches.
Do not describe proposed changes as available in vime.

The generator uses `git log main --no-merges`: it analyzes the underlying
commits from merged branches, including commits landed through squash and
rebase merges, while skipping merge wrapper commits to avoid duplicate entries.
The rolling time window is based on commit timestamps, not PR creation dates.

## Issue Scope

Also summarize issues newly submitted to
[vllm-project/vime/issues](https://github.com/vllm-project/vime/issues) within
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
- `vime/backends/megatron_utils/*`
- `vime/backends/megatron_utils/alignment/*`
- `vime/backends/megatron_utils/kernels/*`
- `vime/backends/megatron_utils/stateless_adam.py`
- `vime/backends/megatron_utils/server/*`
- `vime/utils/ppo_utils.py`

**vLLM Rollout, Routing, and Agent Workflows**:
- `vime/backends/vllm_utils/*`
- `vime/rollout/*`
- `vime/agent/*`
- `vime/rollout/filter_hub/*`
- `vime/rollout/rm_hub/*`
- `vime/backends/megatron_utils/dspark/*`

**Data Flow, Distributed Execution, and Recovery**:
- `vime/data/*`
- `vime/ray/*`
- `vime/utils/weight_sync.py`
- `vime/utils/disk_delta.py`
- `vime/utils/routing_replay.py`
- `vime/observability/*`
- `vime/backends/megatron_utils/update_weight/*`
- `vime_plugins/rollout_buffer/*`
- `vime/utils/staleness.py`
- `vime/utils/routed_experts.py`
- `vime/utils/rocm_checkpoint_writer.py`

**Configuration, Models, and Runtime Compatibility**:
- `vime/utils/*`
- `vime_plugins/*`
- `scripts/*`
- `docker/*`
- `tools/*`
- `requirements.txt`
- `pyproject.toml`
- `setup.py`

**Examples, Documentation, and CI**:
- `examples/*`
- `docs/*`
- `tests/*`
- `.buildkite/*`
- `.github/*`
- `README*.md`
- `docs/zh/*`
- `.pre-commit-config.yaml`
- `.readthedocs.yaml`
- `.agents/*`

## Keywords
PPO, GRPO, CISPO, Megatron, vLLM, vllm-router, Ray, rollout, agent, distillation, staleness, checkpoint, weight sync, R3, FP8, performance, regression, CUDA, ROCm, AMD, DSpark, speculative decoding, MTP, INT4, QAT, low-precision, FP4, GDN, disaggregation, encoder prefill, NIXL, determinism, algorithmic alignment, stateless Adam, dynamic sampling, filter hub, reward model, tracing, fully async rollout

## Emphasis
Explain what changed for vime users before upgrading: Megatron training correctness, vLLM and router compatibility, policy-loss/log-probability consistency, asynchronous rollout staleness, data transport, checkpoint recovery, and train-to-rollout weight synchronization. Highlight throughput, memory use, and configuration migrations when supported by the diff. Monitor this repository only; its relationship to slime does not make unmerged changes in slime or vLLM part of the report.

Call out ROCm/AMD implications only when supported by the diff. Include user-facing changes outside the focus areas when relevant.

### Mirror-Sync Commits

For `[Sync]` or other mirror-sync commits touching many files, aggregate the
compiled digest into 1–3 user-visible entries per sync commit, organized by
impact. Do not create an entry for every touched file. Retain the vime commit
link in each entry, but count the commit only once in commit statistics.

Report only code actually present in vime's `main`. Never imply that unmerged
slime or vLLM changes are available in vime, and do not add upstream-only
commits or file counts to vime's statistics. Count **Files Changed** as unique
paths touched by the selected vime commits across the whole window (renames
count once). A synced file must not be counted again for each digest entry
or for its upstream source; repeated focus-path matches also count once.

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
# vime {FREQUENCY} Digest - YYYY-MM-DD

## Summary
[Summarize the most important developments in 1–2 sentences.]

Source: [vllm-project/vime](https://github.com/vllm-project/vime), branch: `main`.
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
