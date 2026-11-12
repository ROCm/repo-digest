# verl Weekly Digest - 2026-11-12

## Summary
This week landed several notable training features: opt-in custom dataloaders for the V1 **PPO** trainer, **Megatron** support for score centering, and an FSDP `batch_invariant` mode for bitwise train/rollout log-prob comparison. It also fixed a **performance** **regression** in which `OMP_NUM_THREADS` oversubscribed CPUs on **Ray** workers, and Ascend NPU users now need vllm-ascend 0.30. Among the 16 newly reported (unverified) issues are several training-correctness concerns: Megatron resume without the optimizer reverting weights, Qwen3.5 linear-attention state leaking across packed samples without FLA, microbatch-dependent Clip-Cov selection, and **GSPO** IS ratios counting rejected tokens. There is also a **ROCm** FP8_BLOCK **rollout** crash.

Source: [verl-project/verl](https://github.com/verl-project/verl), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-05T23:05:56Z through 2026-11-12T23:05:56Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- Support custom dataloaders for V1 sync/async **PPO** via new `data.custom_dataloader` config by *Chun-Mao (Michael) Lai* [5c5ab4b](https://github.com/verl-project/verl/commit/5c5ab4b2b1bd185bbecc14506941e0a3739da604)

    This adds an opt-in `data.custom_dataloader` setting. It defaults to `null`, so existing behavior is unchanged. When set, a user-supplied loader class (for example a streaming source) replaces the default dataset, sampler and dataloader, and must yield collated batches containing `raw_prompt`. Constraints: unsized loaders require `trainer.total_training_steps`, and **checkpoint** resume requires `state_dict()`/`load_state_dict()`. The option cannot be combined with `data.custom_cls`, and the validation loader must restart fresh on each iteration and terminate.

- Stop applying the `OMP_NUM_THREADS` default to every **Ray** worker; hand it only to `RayWorkerGroup` training workers when VeOmni **FSDP** CPU offload is on by *vOv* [4b39670](https://github.com/verl-project/verl/commit/4b396702074369ae977db99387bd8470f02f62b9)

    This fixes a **performance** **regression** from #8371, which oversubscribed CPUs on agent loop, reward and rollout workers. In the author's benchmark, step time fell from 84 s to 44 s. **Upgrade note:** non-training Ray workers go back to Ray's default of 1 thread. Training workers get the cores/GPUs default only when `veomni.enable_fsdp_offload` is on, via `VERL_TRAINING_WORKER_OMP_NUM_THREADS`. An explicit `OMP_NUM_THREADS` still takes precedence. The CPU-offload, Megatron and multi-node paths were not tested.

- Add score centering support to the **Megatron** actor (TP/CP vocab-parallel head log-probs) by *vOv* [b363245](https://github.com/verl-project/verl/commit/b363245c5bd51acd2380963f41f7f1e8a2323d26)

    Score centering, a **rollout correction**/**importance sampling** variant, now works with `actor.strategy=megatron` as well as FSDP. Sampler head log-probs are normalized across TP shards and split by CP. The prerequisites are unchanged: v1 trainer, **vLLM** `topk_log_probs>0`, `bypass_mode` with the `reinforce` loss, and a single-turn **agent loop**. Cross-entropy now receives a copy of the logits, which costs extra memory. In the PR's runs, `ppo_kl` was higher than FSDP in the first two steps; the cause was not investigated.

- Add opt-in FSDP `batch_invariant` option for batch-invariant actor forward and vLLM-sampler log-prob formula by *vOv* [2b4ed68](https://github.com/verl-project/verl/commit/2b4ed6826a39205838d0ca004bdd942334dbe4b6)

    `actor_rollout_ref.actor.fsdp_config.batch_invariant` (default off) installs vLLM's batch-invariant kernels in the **FSDP** engine. Train and rollout log-probs can then be compared bitwise via `training/rollout_logprobs_mismatch_count`. The option requires vLLM in the training process and rejects `use_fused_kernels`. A 0-diff target also needs `top_k=-1` and `top_p=1`. The overrides are process-global, and on SM80 every GEMM goes through Triton, which costs step time. It was tested on NVIDIA H20 only.

- Speed up Qwen3.5-35B Megatron **GRPO** on Ascend NPUs with MTP spec decode, **rollout** correction bypass mode, and new e2e CI by *ruanhao566 (H-Partners)* [1d4194c](https://github.com/verl-project/verl/commit/1d4194cb2804d9af5f47352058fbbf482f76dddf)

    The NPU branch of this example gains MTP speculative decoding and `rollout_correction.bypass_mode=True`. It switches to a dual-TP4 rollout layout with a larger batch size, and a new 16-NPU Atlas A3 e2e workflow covers it. The CUDA path is unchanged. Ascend users of this example must migrate from the old single-TP8 engine and batch size 32, and need 16 NPUs plus the pinned vllm-ascend, MindSpeed-Bridge and Megatron-LM versions.

### 🟡 Medium Priority

- Exclude all-padding rows from per-sequence off-policy **rollout correction** metrics by *rrrxxx0510* [3ba1e05](https://github.com/verl-project/verl/commit/3ba1e05d5235424b786b22919b8750fa04be3351)

    Padding rows from `_balance_batch` skewed `training_ppl`, `rollout_ppl`, `log_ppl_diff`, `ppl_ratio` and `chi2_seq`. In the author's repro, three padding rows moved `training_ppl` from 7.39 to 2.60. Only logged metrics change; loss and **importance sampling** weights are untouched. Dashboards for padded **FSDP**/**Megatron** runs may shift.

- Add `reward.preset` config to pick a built-in fallback **reward** scorer from the CLI by *Shawn/Yuxuan Tong* [8c94a12](https://github.com/verl-project/verl/commit/8c94a12d7811030413cd85e2bba6db863e0913c8)

    Datasets with unrecognized `data_source` values previously raised `NotImplementedError`. They can now be scored with presets such as `math_dapo`, `math_verify`, `gsm8k` or `prime_code`. Built-in routes and `custom_reward_function.path` still take precedence. An invalid preset now raises an error at startup instead of silently scoring 0.0. The default `null` needs no migration.

- Fix math_dapo Minerva scoring to parse bold `**Answer:**` labels by *Shawn/Yuxuan Tong* [3255f6b](https://github.com/verl-project/verl/commit/3255f6b1b1fc978be03e8598bc48f4f48d714be0)

    Markdown-bold answer labels such as `**Answer:** 16` were wrongly scored as incorrect. A bare trailing label now falls back to `\boxed{...}`. Users of the DAPO math **reward** may see higher, more accurate scores after upgrading.

- Drop obsolete vLLM-Ascend NPU patch shims and retarget remaining patches to vllm-ascend 0.30 by *wzrd* [f3b9d3d](https://github.com/verl-project/verl/commit/f3b9d3d9ecad8fa9fd03a4a440aadadfd5d3a4e0)

    `npu_vllm_patch.py` now requires `0.30.0 <= vllm < 0.31.0`, and seven shims whose fixes are now upstream are removed. **Ascend users must upgrade to vllm-ascend 0.30**, because the patches no longer apply on 0.23. Device validation of DeepSeek-V4 weight sync, FIA decode and GLM-5.2 numerics was still pending at merge. No **ROCm**/**AMD** impact.

- Align Ascend CANN 9.2.1 images and Megatron/MindSpeed pins, and gate the NPU vLLM config on vLLM ≥0.27.1 by *renjunying2 (Huawei)* [1e12526](https://github.com/verl-project/verl/commit/1e125260a3b89b91398df2381deb7419af754653)

    This adds CANN 9.2.1 Dockerfiles, and the `latest-vllm-*` tags now point at them. The 9.1.0 images move back to **vLLM**/vllm-ascend v0.23.0. The install script pins **Megatron**-LM core_v0.18.2 and the 26.2.0 MindSpeed stack. Ascend users should rebuild images and check their versions before upgrading.

- Enable vLLM-Ascend RL mode by default when preparing vLLM engine arguments on NPU by *lxb007981* [69921c4](https://github.com/verl-project/verl/commit/69921c419cb4ee880c01744f0e6ffcf17337abc0)

    On Ascend, `additional_config.rl_config.enabled` now defaults to true, which disables NZ weights during sleep/wake and weight updates for **vLLM** **rollout**. To keep the old behavior, set `rl_config.enabled=false`.

- Allow vLLM sleep level 2 on Ascend NPU when vllm-ascend >= 0.30.0 by *lxb007981* [482f86f](https://github.com/verl-project/verl/commit/482f86fd09959912c99c0acf2b90329f9e061da7)

    The sleep-level-1 guard now applies only below vLLM 0.30.0, and the MTP and LoRA guards still force level 1. In the author's GLM-5.2 run, step time fell about 5% and throughput rose about 7%. The check reads the vLLM version rather than the vllm-ascend version. See related issue #8609 below about separate draft-model weights.

- Expand Ascend NPU CI coverage and fix HCCL **checkpoint** engine group teardown by *lxb007981* [b61bda7](https://github.com/verl-project/verl/commit/b61bda7923fc935523db76e4afc83f217999eb2d)

    With `rebuild_group` enabled, `HCCLCheckpointEngine` teardown now calls `pyhccl.close()`, so cleanup between weight syncs should be cleaner. The commit also adds NPU CI coverage for Megatron TP **KL**, LoRA merge and vLLM ServerAdapter over HCCL.

- Keep ref weights resident in the Qwen3.5-35B Ascend NPU Megatron GRPO example script by *ruanhao566 (H-Partners)* [14535ee](https://github.com/verl-project/verl/commit/14535ee1d500ac5a96ea1e94f63c6fbfe11642dc)

    The example now sets `ref.megatron.param_offload=False`. The author reports ref log-prob time dropping from 23.5 s to 9.5 s per step on 8-NPU A5, at the cost of more device memory. Only the NPU branch changed.

- Unify dense Qwen3 (0.6B–32B) TPU GRPO recipes into a single `run_qwen3_torchtitan.sh` launcher by *wenjung2007* [1ec15fe](https://github.com/verl-project/verl/commit/1ec15fed25f3fbdb79b15b8e4213292d9038e2d3)

    The old `run_qwen3_0_6b_*`/`run_qwen3_4b_*` scripts are removed. Use `MODEL_SIZE=...` with the new launcher, which adds 1.7B–32B **GRPO** presets on TPU v6e. `TPU_EAGER_MODE` now defaults to `DEFER_AND_FUSE`.

- Bump `tpu-sync-torch` and `vllm-torchtpu` pins in the TPU GRPO Dockerfile by *Shawn Lu (Google)* [b10a5d4](https://github.com/verl-project/verl/commit/b10a5d421a1bb3ab4067d6aa47b8e5ead1a34df3)

    The new pins enable `return_after_d2h` in `verl-hardware-plugin` and add `TPUWorker.reset_encoder_cache`. TPU GRPO users should rebuild their image.

### 🟢 Low Priority

- Add MXFP4 MoE recipe, Qwen3-30B-A3B **GRPO** example script and docs page by *0z5a (University of Tübingen)* [63913d1](https://github.com/verl-project/verl/commit/63913d1d5fef4d028658c330f397c0bd2a909213)

    This adds an example and docs only, with no runtime changes. The recipe runs **Megatron** training with **vLLM** rollout. It requires Blackwell GPUs and Blackwell-only DeepGEMM FP4 kernels, so **ROCm**/**AMD** is not covered. In the author's runs, MXFP4 QAT cut `rollout_corr/kl` from 0.0150 to 0.0030 for about 6% more step time.

- Add Qwen3-30B-A3B (MoE) GRPO example recipe for TPU with TorchTitan trainer and vLLM rollout by *wenjung2007* [0269aaf](https://github.com/verl-project/verl/commit/0269aafa5f1818f28206d281cef9d1eebb6d06e4)

    This adds a TPU v7x/v5p example only, and requires `verl-hardware-plugin` with Qwen3 MoE support. The author reports GSM8K accuracy rising from 0.508 to 0.914 over 20 steps.

- Fix Ascend tutorial links and navigation in docs (Sphinx cross-refs, local TOCs, MyST anchors) by *lxb007981* [b17218b](https://github.com/verl-project/verl/commit/b17218ba58a6fbcdfb0de32772e3c2a79f88529d)

    This is docs only. The `run_qwen3_30b_mxfp8_megatron` example script gains its missing `.sh` extension, so anyone who calls it by the old name must update it.

- Ascend docs and CI housekeeping, all docs/CI-only with no runtime impact:
    - Replace Sphinx-only `:doc:` references with absolute links by *lxb007981* [81464bb](https://github.com/verl-project/verl/commit/81464bb6d35cbb43962be42b0088a591e7020f21)
    - Fix navigation and broken links in the Chinese Ascend install guide by *lxb007981* [7de8f2e](https://github.com/verl-project/verl/commit/7de8f2e61f7011679d56c74677ef7bea87d24946)
    - Update Ascend **SGLang** install guides to require Python >=3.12 by *lxb007981* [689fa1a](https://github.com/verl-project/verl/commit/689fa1a2a1a35fbfee6cdd8cabdec0c15688ccaf)
    - Clarify Ascend image and Qwen3-ASR Megatron-Bridge patch guidance by *renjunying2 (Huawei)* [c16ec34](https://github.com/verl-project/verl/commit/c16ec340e5070459bf6d064b0fc08ae91151b91e)
    - Standardize Atlas training and Ascend 950 product names by *likaizheng666-sketch* [ce42aa8](https://github.com/verl-project/verl/commit/ce42aa82abcf4c0a07d7273b96aafe8485d00043)
    - Point all Ascend CI image references at the `base_image` SWR registry prefix by *likaizheng666-sketch* [7c760b0](https://github.com/verl-project/verl/commit/7c760b079215a674db1d759fe761e2aa1312baf1)
    - Scale Ascend NPU CI/nightly tests to all 16 NPUs per node by *lxb007981* [033b1bd](https://github.com/verl-project/verl/commit/033b1bdfb0039fc7705f201fb97fb96143e063dc)
    - Scale NPU unit CI workloads (FSDP2 regression, **checkpoint**-engine tests) to 16 devices by *lxb007981* [121be09](https://github.com/verl-project/verl/commit/121be0996d6186bedbc11d575aed0990cee0de11)
    - Apply deterministic rollout settings to multimodal **agent loop** tests in CI by *lxb007981* [a911bca](https://github.com/verl-project/verl/commit/a911bca25d6adb26f5bef2dc57e7ba62e99b7ade)

## Newly Submitted Issues

All 16 issues were **open** at collection time. They are user reports, not verified regressions or shipped fixes.

**Training correctness (reported)**
- [#8604](https://github.com/verl-project/verl/issues/8604) (open): The reporter says that resuming a **Megatron** actor with `load_contents` that excludes `optimizer` lets the first optimizer step overwrite the loaded **checkpoint** weights with "initial weights + one step". The cause is that the FP32 main params are never refreshed with `reload_model_params()`. This would silently discard checkpoint progress.
- [#8629](https://github.com/verl-project/verl/issues/8629) (open): The reporter says that without flash-linear-attention (e.g. on Ascend NPU), Qwen3.5 gated-delta-net layers silently ignore `cu_seqlens` with `use_remove_padding=True`. Recurrent state then leaks across packed samples. They report high step-1 `ppo_kl` (0.147 vs 0.0007 after their fix) and reward decaying after about 50 steps.
- [#8634](https://github.com/verl-project/verl/issues/8634) (open): The reporter says Clip-Cov (`loss_mode="clip_cov"`) computes its covariance statistics and clip quota per microbatch. The loss, even its sign, then depends on `ppo_micro_batch_size`. This is the same bug class that was fixed for KL-Cov in #7830.
- [#8636](https://github.com/verl-project/verl/issues/8636) (open): The reporter says the **GSPO** sequence **importance sampling** ratio includes tokens that IcePop-style **rollout correction** has rejected. Those tokens can flip surviving tokens into the clipped regime. A related pattern is reported in `geo_mean`/`sapo`.
- [#8632](https://github.com/verl-project/verl/issues/8632) (open): The reporter says Megatron policy snapshots don't restore persistent buffers such as MoE `TopKRouter.expert_bias`. Decoupled **PPO** old-log-prob recomputation then mixes old parameters with newer routing bias.
- [#8651](https://github.com/verl-project/verl/issues/8651) (open): The reporter says `skip.rollout_tq` cache replay drops trajectories with `index > 0`, relabels sessions, and sizes the replay from the new prompt count rather than the cache. In multi-trajectory **agent** RL, the **GRPO** **advantage** could then be anchored on intermediate outputs.

**Reward scoring (reported)**
- [#8656](https://github.com/verl-project/verl/issues/8656) (open): The reporter says `prime_code` call-based scoring can be reward-hacked by returning an object whose `__eq__` always returns True, which gets full **reward**. They also report an `UnboundLocalError` with `continuous=False`.
- [#8675](https://github.com/verl-project/verl/issues/8675) (open): The reporter says the `math_dapo` Minerva scoring only compares the last assignment of multi-variable answers. For example, `x=2, y=3` gets full credit against `x=1, y=3`.

**Backend and hardware (reported)**
- [#8640](https://github.com/verl-project/verl/issues/8640) (open): **ROCm/AMD**: The reporter says FP8_BLOCK **rollout** weight sync crashes with `No module named 'tilelang'` on the official ROCm image. The suspected cause is that #8498 introduced TileLang kernels while the ROCm image removes tilelang.
- [#8609](https://github.com/verl-project/verl/issues/8609) (open): Separately configured (non-MTP) speculative draft-model weights may be discarded by vLLM sleep level 2 and are not restored by weight sync. The issue was filed by a bot from a review comment and relates to the sleep-level change in [482f86f](https://github.com/verl-project/verl/commit/482f86fd09959912c99c0acf2b90329f9e061da7) / #8608.
- [#8586](https://github.com/verl-project/verl/issues/8586) (open): The reporter says the Ascend NPU quick-start scripts assume 8 or more devices (rollout TP=2, hardcoded `n_gpus_per_node=8` and `ASCEND_RT_VISIBLE_DEVICES`), so they can't run on single-card or small nodes.

**Metrics, usability and requests**
- [#8580](https://github.com/verl-project/verl/issues/8580) (open): The reporter says V1 `_compute_metrics` doesn't fetch `old_log_probs`/`sum_pi_squared`, so `variance_proxy/*` metrics are silently missing.
- [#8579](https://github.com/verl-project/verl/issues/8579) (open): The reporter says `hf_processor` swallows processor load errors, including its own "Unsupported processor type" check. Multimodal runs then fail later without the original cause. The reporter proposes letting load errors propagate.
- [#8649](https://github.com/verl-project/verl/issues/8649) (open): Feature request to compute the fused-kernel vocabulary projection only at response positions for PPO. The author reports a 9.83 s → 6.05 s step on Ascend NPU with identical loss.
- [#8595](https://github.com/verl-project/verl/issues/8595) (open): RFC/tracking issue for verl-side changes for Qwen3.5 GRPO on TPU v7x: IS/RS sequence metrics, a replay-buffer poll interval, deferred host scalars, and a TransferQueue image pin.
- [#8570](https://github.com/verl-project/verl/issues/8570) (open): Docs request to list `trackio` in the `RolloutTraceConfig.backend` docstring.

## Stats
- **Total Commits**: 27
- **Analyzed Commits**: 27
- **Active Contributors**: 12
- **Files Changed**: 208 (sum of per-commit file counts)
- **Training-Specific Commits**: 6 (22.2% of total)
- **New Issues**: 16 (16 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
