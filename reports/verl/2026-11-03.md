# verl Weekly Digest - 2026-11-03

## Summary
Low-precision work dominated the week: native NVFP4 W4A4 training with **vLLM** **rollout** landed for Blackwell, NVFP4 QAT moved to per-token activations with a **breaking** removal of FSDP QAT and SGLang static NVFP4 refit, TileLang FP8/MXFP8/MXFP4 QAT kernels were added, FP8 KV-cache garbage rollouts were fixed, and the DeepSeek-V4 VeOmni recipe was fixed for **ROCm**/**AMD**. Newly submitted issues mostly report suspected **training correctness** problems (GMPO with IcePop, k3 policy-gradient **distillation**, multi-turn token merging, V1 metric aggregation); these are user reports, not confirmed regressions.

Source: [verl-project/verl](https://github.com/verl-project/verl), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-10-27T10:38:53Z through 2026-11-03T10:38:53Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- **[BREAKING]** NVFP4 QAT switches to per-token activations; FSDP QAT and static SGLang NVFP4 refit removed by *Zhang Shuai (NVIDIA)* [cd04d68](https://github.com/verl-project/verl/commit/cd04d68d6e435e28c60c79b912ba718b494f889f)

    NVFP4 QAT on **Megatron** now uses per-token activations, matching the NVFP4 **rollout** from #7971. `rollout.quantization.moe: NVFP4` always uses them, and `moe_activation` defaults to `nvfp4_per_token`. The PR reports a large drop in training-rollout mismatch on Qwen3-30B-A3B **DAPO**: mean `rollout_corr/k3_kl` went from 0.060 to 0.0033. **Breaking changes to check before upgrading:**
    1. FSDP QAT is removed (`QATLinear`, `QATQuantizer`, `actor.qat` and the FSDP engine's `qat` config), so QAT now requires the Megatron engine.
    2. Static NVFP4 refit for **SGLang** is removed, and SGLang does not yet support per-token NVFP4, so **vLLM** is the only supported rollout backend.
    3. The static per-tensor activation scale is gone, so review any configs or checkpoints that relied on it.
    4. `nvfp4_qat.md` is merged into `qat.md`.

    The GPU tests need Blackwell. No ROCm/AMD-specific changes.

- Add native NVFP4 W4A4 training (Megatron/TE) and vLLM rollout with live refit on Blackwell by *Zhang Shuai (NVIDIA)* [6879e1a](https://github.com/verl-project/verl/commit/6879e1ab07b9cfd0b4b27c31ca4e7afcad1466b3)

    This is experimental end-to-end NVFP4 for routed MoE experts. **Megatron** trains them via Transformer Engine, the trainer exports NVFP4 weights each update, and **vLLM** **rollout** loads them in place, which preserves **CUDA** graph storage. To enable it, set `override_transformer_config` (`fp4: e2m1`, `fp4_recipe: nvfp4`) and `rollout.quantization.moe=NVFP4` with `moe_activation=nvfp4_per_token`.

    Requirements:
    - Blackwell (SM100) GPUs.
    - A pinned stack: PyTorch 2.13/CUDA 13, vLLM 0.32.0, TE 2.20.2 and Megatron-Core 0.19.2. `pyproject.toml` and `uv.lock` are updated.
    - PP=1, the colocated `naive` **checkpoint** engine and `FULL_DECODE_ONLY` CUDA graphs. SGLang is not validated.

    The author reports rollout about 1.3× faster and steps about 1.2× shorter for responses over ~2.5k tokens. Training is still slower than BF16, the score falls below BF16 after ~450 steps, and the **rollout**/train **KL** mismatch is higher. No ROCm/AMD impact.

- Add TileLang FP8_BLOCK, MXFP8 and MXFP4 kernels for Megatron QAT and parameter export, and upgrade ModelOpt to 0.47.0 by *Joel (ByteDance)* [06a3a49](https://github.com/verl-project/verl/commit/06a3a494daa28c912d764ee928bc96e643ec3d56)

    The ModelOpt fake quantizers now use shared TileLang fused quantize-dequantize kernels. The CUDA compressed-tensors export reuses them, so exported values and scales match QAT numerics. MXFP8 and MXFP4 now use DeepSeek-style upward power-of-two E8M0 scale rounding, which may shift QAT results compared with earlier runs. **New dependencies:** `nvidia-modelopt==0.47.0` and `tilelang==0.1.15`. The kernels are CUDA-only, and there is no evidence of **ROCm**/**AMD** support.

- Add grouped TileLang fake-quantization and export kernels for FP8/MXFP8/MXFP4 QAT by *Joel (ByteDance)* [e2ace87](https://github.com/verl-project/verl/commit/e2ace870eba5e4cb850e839655f7be524a8fbe54)

    Megatron QAT with TE grouped expert weights now uses pointer-table kernels, which avoids a stacked weight copy. This should cut memory use and speed up QAT and **rollout** weight export. Fused 3D Megatron-Bridge expert tensors are quantized once and then split per expert. No config changes are needed. Two new requirements: these paths need TileLang and a GPU, and an assertion now enforces that FP8 block scales do not cross expert boundaries. No ROCm/AMD-specific handling.

- Reset uncalibrated FP8 KV cache scales after quantized vLLM refit, fixing garbage rollouts by *Beichen Huang* [fc726e3](https://github.com/verl-project/verl/commit/fc726e33ceb54ad875d4537880e786de2a32129d)

    This fixes a **rollout** correctness bug. With `FP8_BLOCK` quantization plus `kv_cache_dtype=fp8_e4m3`, **vLLM** attention scales were left at dummy values. That produced garbage output and NaN `k3_kl`. The new `reset_uncalibrated_kv_cache_scales` sets them to 1.0 after each refit when the quant config has no `kv_cache_scheme`. In the reported Qwen3-30B-A3B run, results went from NaN `k3_kl` and 0.0 AIME24 to 0.0066 `k3_kl` and 4.6% AIME24. Users running FP8 rollout with an FP8 KV cache should upgrade. SGLang was not checked.

- Make the DeepSeek-V4 VeOmni GRPO recipe run on AMD ROCm: skip the DeepGEMM default, keep the checkpoint weight layout, and set a default `OMP_NUM_THREADS` by *xiaohong* [6d04f39](https://github.com/verl-project/verl/commit/6d04f398f1d5dc11d09fc1fc92368608d26e3538)

    This fixes **vLLM** FP8 **rollout** failures on **ROCm** that started after #8308 made `deep_gemm` the default. It also stops silent weight corruption after rollout weight syncs for DeepSeek-V4 with AITER. **ROCm impact:** `VLLM_ROCM_DSV4_BPRESHUFFLE` now defaults to 0. With AITER on gfx94x, the recipe exits if vLLM lacks support for `VLLM_ROCM_DSV4_BPRESHUFFLE`. **Upgrade note for all backends:** `get_ppo_ray_runtime_env` now defaults `OMP_NUM_THREADS` to physical cores divided by GPUs per node when it is not already set. This can change host-side **performance**.

- Support the trainer-side rollout weight quantizer in the VeOmni engine, and reject unsupported quantization combinations at init by *xiaohong* [6f3f449](https://github.com/verl-project/verl/commit/6f3f449e113b7eb84eef8c0912aad33ffdd322cd)

    This fixes a `NotImplementedError` at `init_model` for VeOmni runs on FP8-quantized checkpoints (a regression since #8287). Saved **checkpoints** stay unquantized. **Upgrade note:** two combinations now fail at init on both the **FSDP** and **Megatron** engines:
    - a `rollout.quantization` override on DeepSeek-V4;
    - `checkpoint_engine.backend='delta_sharded'` with a quantized rollout.

    **ROCm impact:** the PR reports consistent rollout and trainer token probabilities across two-node runs on **AMD** gfx942 and gfx950.

- Fix FSDP-Turbo stability and fused MoE weight transposition for DeepSeek-V4-Flash on NPU (**vLLM**-Ascend, **FSDP**) by *zhouhengan1211* [a08ea02](https://github.com/verl-project/verl/commit/a08ea02a784d7d4982b1d81df36d188a476192bb)

    This fixes a **training correctness** bug on NPU: when the fused `w13_weight` had equal last dimensions, it was transposed twice, causing a training/inference mismatch. The commit also fixes DeepSeek-V4 weight-name conversion for **rollout** sync, duplicate outputs under TP/Ulysses, and `no_sync` interfering with FSDP-Turbo's backward communication. It adds a DeepSeek-V4-Flash **GRPO** example. This only affects Ascend NPU, with no ROCm/AMD implication.

- Fix nested position-ID packing so the token axis is preserved for equal-length mRoPE batches by *yue zeng (UNSW)* [59f9a42](https://github.com/verl-project/verl/commit/59f9a42c749a49793ee38298f3081beab43d79bc)

    `left_right_2_no_padding()` now passes an explicit `jagged_dim`. This fixes a `split_with_sizes` crash in actor minibatch selection during **GRPO** on the no-padding path. The crash was reported with Qwen3.5-4B on Ascend. No config changes are needed, and the fix is backend-agnostic PyTorch.

### 🟡 Medium Priority

- Release vLLM rollout submission-gate barrier once a request reaches the engine, not on its first token by *Shawn Lu (googlers)* [081c76b](https://github.com/verl-project/verl/commit/081c76bba2a92bcff3032c2f5e4758bdbe687b37)

    `abort_all_requests()` no longer waits for every **vLLM** request to be prefilled before pausing. The PR reports this removes 5–14 s of pause per weight sync when the batch exceeds `max_num_seqs`. This should lower weight-sync latency in **async** **rollout** and **agent** workflows. No config changes are needed. It relies on `AsyncLLM.add_request(..., data_parallel_rank=...)`, which the PR says exists in vLLM 0.18–0.32.

- VeOmni engine honors `optim.override_optimizer_config` (fused AdamW under FSDP2 CPU offload) and makes checkpoint loading configurable by *xiaohong* [b65da71](https://github.com/verl-project/verl/commit/b65da71c1745b49e80adc218d02782a3df73d047)

    With `enable_fsdp_offload=true`, `fused` now defaults to `true`. This avoids a host-memory temporary the size of the local fp32 parameters, which had triggered **Ray** OOM in the DeepSeek-V4 recipe. Set `override_optimizer_config.fused=false` to opt out. Two new **checkpoint** loading fields, `broadcast_model_weights_from_rank0` and `ep_sharded_stream_load`, default to the old behavior. Reported on **AMD** gfx942/gfx950 for this recipe only.

- Request `values` from TransferQueue only when critic is enabled, fixing GRPO failures by *renjunying2 (Huawei)* [3fdf2b5](https://github.com/verl-project/verl/commit/3fdf2b548882a8aeccf0842c2150d9c9f1790a55)

    This fixes **GRPO** and other critic-free runs on the v1 trainer, which failed with newer TransferQueue versions. Critic-enabled **PPO** behavior is unchanged.

- Run `on_train_end()` on the last step of v1 `fit()` and shut down train dataloader workers by *0z5a (University of Tübingen)* [1186e32](https://github.com/verl-project/verl/commit/1186e32f6ec81da21bd827f1178d39227f6b5441)

    `on_train_end()` now fires on every exit path, so custom overrides will now run at the final step. The stray "DataLoader worker killed by signal" traceback at the end of a run is also gone. Training correctness and **checkpoints** are unaffected.

- Keep first NonTensorData in `concat_tensordict` with tensordict >= 0.11 by *Jialei Chen (Google)* [8e48d72](https://github.com/verl-project/verl/commit/8e48d72de4766228c36623c90f9f5c49ee5b45f3)

    This fixes a `sft_trainer_ray` validation crash and list-valued **Ray** trainer metrics, including `mfu`, on newer tensordict versions such as 0.15.1 in the TPU image. There is no change with verl's pinned tensordict (≤ 0.10).

- Add Qwen3.5 (incl. 35B-A3B MoE) GRPO recipe for TPU v7x, with context-parallel and fused-QKV options by *Jialei Chen (Google)* [2ab3529](https://github.com/verl-project/verl/commit/2ab35292039a51175a4b3d3b3b2d76e951a0d3e4)

    This adds a TPU **GRPO** recipe with **vLLM** **rollout**. **Migration:** the TorchTitan TPU options move under `engine_kwargs.tpu.*`, so custom overrides of `torchtitan.use_splash_attention`, `tpu_eager_mode` or `use_simple_fsdp` must be updated. The TPU Dockerfile bumps vLLM to v0.32.0 and transformers to >=5.18,<5.20. No ROCm impact.

- Add multi-stage Intel GPU (XPU) Docker image for vLLM 0.32.0 rollout and FSDP/FSDP2 training by *kahlun (Intel)* [321e4e4](https://github.com/verl-project/verl/commit/321e4e450fcfc47a3491c946cd01dacd9ea7281a)

    This adds a new `docker/xpu/Dockerfile.stable.vllm` for Intel Arc Pro B-series GPUs, with torch 2.14.0+xpu and oneCCL. It requires a verl checkout that allows transformers >= 5.16.1, plus compute-runtime >= 26.18. It was tested by hand only and has no CI coverage. CUDA and ROCm users are unaffected.

- Upgrade Ascend 950 images to **Megatron**-Core 0.18 and add Qwen3-30B-A3B MXFP8 **GRPO** example by *XiangRun Liu* [6dcc6e4](https://github.com/verl-project/verl/commit/6dcc6e4d10ba3b10cd7f659ba89189acabcb55be)

    The Ascend 950 CANN 9.1.0 image moves from Megatron-LM core_v0.12.0 to core_v0.18.0 and MindSpeed to core_r0.18.0, and it adds Megatron-Bridge v0.5.0 and related packages. Users of this image need to rebuild it. The commit also adds an 8-NPU MXFP8 example with quantized **vLLM** **rollout**.

- Fix Qwen3.5-35B FSDPTurbo GRPO example for NPU by using the `all2all` dispatcher and setting `use_fused_ops` separately for actor and ref by *renjunying2 (Huawei)* [4d3ed12](https://github.com/verl-project/verl/commit/4d3ed12a7617c6b78ee0ac8f27dd7848bb0d11ee)

    FSDPTurbo no longer supports the `fused` dispatcher. Custom **FSDP** **GRPO** scripts that copied the old values need `ep_plan.dispatcher=all2all` and `ep_plan.use_fused_ops` set separately for the actor and ref models. Only the example script changed.

### 🟢 Low Priority

- Add H20 FP8 KV cache results and usage notes to the FP8 guide by *Beichen Huang* [0938fcb](https://github.com/verl-project/verl/commit/0938fcb3190bc8eca3091f77aead3cd44c4d8869)

    Docs only. The guide documents `kv_cache_dtype=fp8_e4m3` for **vLLM** **rollout**. Combining it with `FP8_BLOCK` requires the fix in [fc726e3](https://github.com/verl-project/verl/commit/fc726e33ceb54ad875d4537880e786de2a32129d). The reported H20 runs show roughly BF16 accuracy with about 10% lower step time.

- Make tests device-agnostic by replacing hardcoded `cuda` with `verl.utils.device` helpers by *kahlun (Intel)* [2bcc98a](https://github.com/verl-project/verl/commit/2bcc98a9b64bdb3af5b88ac870ba0709ed709aef)

    Test-only change across 12 files. These tests can now run on non-CUDA accelerators, and CUDA behavior is unchanged.

- Enable daily Ascend A5 Docker image builds in CI by *lxb007981* [3902420](https://github.com/verl-project/verl/commit/39024209cc412e363a66338429d4644416de0abb)

    CI only. A5 images are now built daily, like A3.

- Use "Huawei Ascend" in README hardware support and Ascend Docker description by *XiangRun Liu* [8df5bae](https://github.com/verl-project/verl/commit/8df5baeed0f5ecdd7f870d83bc3d79194816e2a9)

    Documentation wording only. No runtime impact.

## Newly Submitted Issues

**Reported training/algorithm correctness concerns** (user-reported, not confirmed by maintainers):

- [#8406](https://github.com/verl-project/verl/issues/8406) (open): `geo_mean` (GMPO) policy loss reportedly ignores IcePop's zero IS weights. A rejected token keeps its gradient, and the rest of the sequence is down-scaled by `exp(log(1e-10)/L)`, about ×0.24 at L=16. The reporter has a CPU reproduction showing the effect on gradients. Short responses with **rollout correction** / **importance sampling** enabled would be most affected.
- [#8423](https://github.com/verl-project/verl/issues/8423) (open): The reporter argues that **distillation** with `loss_mode=k3`/`low_var_kl` and `use_policy_gradient=True` does not follow the reverse-**KL** gradient, because it detaches the k3 reward. They show a two-action example where an on-policy update increases the true reverse KL, and they ask maintainers whether k3 + PG is an intended objective.
- [#8462](https://github.com/verl-project/verl/issues/8462) (open): Continuous Token **multi-turn** merges are reportedly never checked against the chat template during training. The default builder used for unregistered `model_type`s (e.g. GLM-4.7-Flash, Qwen3-Next) reportedly duplicates `<|observation|>` or drops the `\n` after `<|im_end|>`. The reporter also says `tokenization_sanity_check_mode` has done nothing since #4422. A runtime check is proposed.
- [#8504](https://github.com/verl-project/verl/issues/8504) (open): The V1 `MetricsAggregator` reportedly misaligns `rollout_probs_diff_mean` and `rollout_probs_diff_valid` when `parameter_sync_step > 1`. Placeholder NaNs from empty steps contaminate the mean, which makes the logged rollout/training mismatch metrics misleading.
- [#8433](https://github.com/verl-project/verl/issues/8433) (open): When SFT resumes from a **checkpoint**, the `StatefulDataLoader` is built without a generator, so it consumes the restored global CPU RNG. The resumed RNG state then differs silently from an uninterrupted run. Batch order is unaffected.
- [#8449](https://github.com/verl-project/verl/issues/8449) (open): The `math_dapo` **reward** scorer gives -1.0 to correct Minerva-style answers wrapped in markdown emphasis (e.g. `**Answer:** 42`). This could under-reward correct responses during RL.

**Rollout and agent workflow reports:**

- [#8478](https://github.com/verl-project/verl/issues/8478) (closed, completed): `ToolAgentLoop` reportedly returns the prompt as the response when the first turn generates no tokens, for example after an aborted request. The prompt tokens then get scored as response text. The closed state does not confirm that a fix was merged into `main`.
- [#8488](https://github.com/verl-project/verl/issues/8488) (closed, not planned): VeOmni R3 router replay infers padding rows from duplicate top-k values instead of an explicit mask. The report says valid duplicate rows are misclassified and topk=1 padding rows replay as expert 0.

**Feature requests and RFCs:**

- [#8410](https://github.com/verl-project/verl/issues/8410) (open): Proposal to mark individual placement-group slots unavailable in `RayResourcePool`, so unhealthy GPUs can be excluded during recovery without discarding the whole PG.
- [#8452](https://github.com/verl-project/verl/issues/8452) (open): RFC for a pluggable `data.custom_dataloader` hook for V1 PPO, to support streaming or table-backed pipelines and unsized streams.
- [#8475](https://github.com/verl-project/verl/issues/8475) (open): Request to allow fused `linear_cross_entropy` in **Megatron** when MTP is used only for rollout speculative decoding (`enable_train=False`). Currently `mtp.enable` disables fused kernels, which may cost memory and throughput.
- [#8447](https://github.com/verl-project/verl/issues/8447) (open): `setup.py` extras (`gpu`, `geo`, `prime`, `trl`, `mcore`, `trtllm`) are dropped because `pyproject.toml` takes precedence. As a result, `pip install -e ".[trtllm]"`, which the TensorRT-LLM docs still recommend, installs nothing extra.

## Stats
- **Total Commits**: 22
- **Analyzed Commits**: 22 (all commits analyzed)
- **Active Contributors**: 13
- **Files Changed**: 115 unique files (154 file changes across commits)
- **Training-Specific Commits**: 9 (40.9% of total)
- **New Issues**: 12 (10 open, 2 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
