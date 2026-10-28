# verl Project Configuration

## Repository
- **name**: verl
- **path**: verl
- **url**: https://github.com/verl-project/verl
- **branch**: main
- **issue_scope**: created

## Output
- **directory**: digests
- **filename_prefix**: digest

## Commit Scope

Only report commits already merged into `verl-project/verl`'s `main` branch.
Use the checked-out `main` history as the source of truth. Exclude open or
draft PRs, closed-but-unmerged PRs, and commits only present on unmerged branches.
Do not describe proposed changes as available in verl.

The generator uses `git log main --no-merges`: it analyzes the underlying
commits from merged branches, including commits landed through squash and
rebase merges, while skipping merge wrapper commits to avoid duplicate entries.
The rolling time window is based on commit timestamps, not PR creation dates.

## Issue Scope

Also summarize issues newly submitted to
[verl-project/verl/issues](https://github.com/verl-project/verl/issues) within
the same rolling time window, based on `created_at`. Include both open and
closed issues, with their state at collection time. Exclude pull requests
and older issues that were only updated during the window.

Read the collected issue data from `summaries/issues.json`. Keep issue reports
and feature requests separate from merged code changes: a reported problem is
not a confirmed regression, and a closed issue does not prove a fix has shipped.
Summarize each issue in English with its number, link, state, and user impact;
group related issues when helpful, retaining all issue links. Prioritize the
focus areas below, but include all newly submitted issues in the coverage.

## Focus Areas

**Training and RL Algorithms** (highest priority):
- `verl/trainer/*`
- `verl/workers/engine/*`
- `verl/workers/config/*`
- `verl/workers/*.py`
- `verl/workers/utils/*`

**Rollout and Agent Workflows**:
- `verl/workers/rollout/*`
- `verl/experimental/*`
- `verl/tools/*`

**Distributed Execution, Models, and Checkpoints**:
- `verl/single_controller/*`
- `verl/checkpoint_engine/*`
- `verl/model_merger/*`
- `verl/models/*`
- `verl/protocol.py`
- `verl/utils/*`
- `verl/plugin/*`

**Rewards and Data**:
- `verl/workers/reward_manager/*`
- `verl/utils/reward_score/*`
- `verl/utils/dataset/*`

**Installation, Examples, and Compatibility**:
- `docker/*`
- `scripts/*`
- `examples/*`
- `docs/*`
- `tests/*`
- `.github/*`
- `pyproject.toml`
- `setup.py`
- `requirements*.txt`
- `uv.lock`
- `recipe`

## Keywords
PPO, GRPO, REINFORCE, RLOO, DAPO, GSPO, SAPO, off-policy, async, rollout correction, importance sampling, multi-turn, agent loop, trajectory, advantage, KL, entropy, distillation, rollout, agent, reward, FSDP, Megatron, vLLM, SGLang, Ray, checkpoint, performance, regression, CUDA, ROCm, AMD

## Emphasis
Explain what changed and what a verl user needs to know before upgrading:
training correctness, throughput, memory use, configuration migrations,
checkpoint compatibility, and training/rollout backend requirements.
Call out ROCm/AMD implications when supported by the diff; do not infer an
AMD-specific benefit or regression solely from a generic GPU change.
Include changes outside the focus areas when they matter to users.

The `recipe` entry is a submodule pointing to `verl-project/verl-recipe`.
Report pointer updates if present, but do not claim to monitor that separate
repository's commits, unmerged PRs, issues, or releases.

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
# verl {FREQUENCY} Digest - YYYY-MM-DD

## Summary
[Summarize the most important developments in 1–2 sentences.]

Source: [verl-project/verl](https://github.com/verl-project/verl), branch: `main`.
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

[English summaries of the collected issues, with links and open/closed states, or "No issues were submitted in this window" if the collected list is empty.]

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
- Start each commit entry with `- `, followed by an English summary, `by *Author Name (Org)*`, and `[short-hash](full-commit-url)`.
- After a blank line, write one impact paragraph indented by four spaces.
- Count Analyzed Commits from the per-commit summaries. If it is below Total Commits, explicitly state that the report is incomplete; missing analyses do not imply no changes.
- If there are no commits, state "No commits already merged into main have commit timestamps within the last {days} day(s)" and use zeroed commit stats. Still summarize newly submitted issues and populate issue stats.
- Format issue entries as `- [#number](issue-url) (open/closed): English summary and reported impact.` Do not count issues as commits or imply that closing an issue means its fix was merged.
