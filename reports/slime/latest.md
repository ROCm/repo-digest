# slime Weekly Digest - 2026-11-05

## Summary
slime moved to **Megatron**-LM core 0.20 this week. The pinned Megatron commit, Docker and conda builds, **checkpoint** loading and async-save, and MTP loss logging all changed, and a compatibility helper keeps older Megatron versions working. Separately, **weight sync** to **SGLang** now sends one flattened bucket per update when SGLang supports it. Three new issues (all open) report problems in the math reward grader (wrong matches for large integers, and hangs on huge expressions) and in the patch-apply logic of the `coding_agent_rl` example (correct patches can silently get zero reward). These are reported problems, not confirmed regressions.

Source: [THUDM/slime](https://github.com/THUDM/slime), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-10-29T23:06:14Z through 2026-11-05T23:06:14Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- Upgrade Megatron-LM pin to dev ae76c60e6 (core 0.20.0) and adapt slime's Megatron backend, checkpointing, MTP logging and Docker builds by *Shifang Xu (NVIDIA)* [8a53b68](https://github.com/THUDM/slime/commit/8a53b680e82932dabb48cbfcd34f749854400857)

    Bumps `MEGATRON_COMMIT` in `Dockerfile` and `build_conda.sh`, adds the `nvidia-resiliency-ext==0.7.0` dependency, and refreshes the `latest` and `v0.5.21` **Megatron** patches. The GB10 image keeps a frozen copy of the old patch. **Checkpoint** loading passes `restore_training_state` when Megatron supports it. Async-save CPU staging now covers the `nvrx` strategy, and `--async-strategy` stays `nvrx` when `mcore` isn't available. MTP loss logging now follows Megatron's reduced tracker and per-token scaling, which changes the logged MTP loss values. `LinearForLastLayer` gains `gather_output`, and the `qwen3_5`/`qwen3_next` attention constructors accept `pp_layer_offset` and `is_mtp_layer`. If you rebuild images or conda environments, you get the new Megatron and the new dependency, so re-check checkpoint, async-save and MTP behavior. The diff has no ROCm-specific changes.

- Adapt slime to Megatron core 0.20 (gloo process-group flag rename, Qwen3.5-VL mRoPE signature) by *Shifang Xu (NVIDIA)* [9b1209b](https://github.com/THUDM/slime/commit/9b1209b21ab0b91b82388911eb6fe20d8b1201e7)

    A new `use_gloo_process_groups()` helper reads either the new `use_gloo_process_groups` argument or the old `enable_gloo_process_groups` one. Distributed init and optimizer construction use the helper, so slime works with both **Megatron** core 0.20 and older versions. `--disable-gloo-process-groups` is unchanged. The new key is also added to the **Ray** training-recovery config keys that are ignored when comparing configs. The Qwen3.5-VL mRoPE now accepts `return_raw_freqs`, but raises `NotImplementedError` if it is set to `True`. No config migration is needed.

### 🟡 Medium Priority

- Broadcast weight updates as a single flattened bucket when SGLang supports it, instead of per-tensor by *Junting Lv* [f22a2b2](https://github.com/THUDM/slime/commit/f22a2b2226d43da4b166b11fe1a3c373e9302f7e)

    `update_weights_from_distributed` now packs the converted tensors into one `FlattenedTensorBucket` and sends one `dist.broadcast` per update. This should reduce collective-call overhead during **weight sync** to **SGLang** rollout engines. The new path is used only when `load_format` is None and the installed SGLang exposes `supports_multi_dtypes`. Delta/custom load formats, empty buckets, and older SGLang builds keep the per-parameter path. The tests also check that `--update-weight-broadcast-mode` is not an accepted argument, so scripts that pass it will fail to parse.

### 🟢 Low Priority

None

## Newly Submitted Issues

- [#2509](https://github.com/THUDM/slime/issues/2509) (open): Reported bug in the `math` reward path (`slime/rollout/rm_hub/math_utils.py`). `_normalize()` converts answers through `float()`, so distinct large integers (e.g. `9007199254740993` vs `9007199254740992`) can be graded as equal. The reporter shows this with a CPU-only reproduction. Impact: wrong answers can get positive reward in RL training with large-integer labels.
- [#2515](https://github.com/THUDM/slime/issues/2515) (open): Reported hang in `grade_answer_verl`/`grade_answer_sympy` (used by the `math` and `deepscaler` reward types) on answers like `\boxed{9**9**9}` or `\boxed{(10^9)!}`. The `should_allow_eval` guard only checks the `^` form of powers and misses these inputs. Because `async_rm` calls the grader synchronously, the reporter says the **rollout** event loop would block. That last point is inferred from the code; no full training run was tried. The hang only happens when the label is not an integer.
- [#2519](https://github.com/THUDM/slime/issues/2519) (open, `bug`): Reported bug in the patch-apply fallbacks in `examples/coding_agent_rl/swe.py`. When `git apply` fails, `git apply --reject` applies part of the patch, and `patch --batch` then reverses the hunks already applied while still exiting 0. A correct model fix can then silently get zero reward. The reporter reproduced this with a standalone git/patch script and has not seen it in a slime training run. They suggest porting the upstream SWE-bench fix (reset the tree before each fallback and use `--forward`).

## Stats
- **Total Commits**: 3
- **Analyzed Commits**: 3
- **Active Contributors**: 2
- **Files Changed**: 24
- **Training-Specific Commits**: 3 (100% of total)
- **New Issues**: 3 (3 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
