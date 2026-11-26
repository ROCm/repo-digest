# verl Weekly Digest - 2026-11-26

## Summary
The biggest change this week is a **vLLM** 0.34 upgrade. It moves **rollout** weight refit onto vLLM's reload lifecycle, removes about 2.6k lines of quantization patches, and pins torch 2.14, so environments and images must be rebuilt. Also new: LoRA memory and LoRA+ options, FP8 rollout under **FSDP**, frozen Engram/PLE streaming with VeOmni default changes, multi-label **Triton** kernels, and fixes to **SGLang** EOS handling and DeepSeek-V4 reasoning-effort prompts. Among the 12 new issues, users reported a TiledMLP gradient-accumulation bug (#8839, closed; this does not show that a fix was merged) and a Kimi tool-parser name-matching bug (#8869).

Source: [verl-project/verl](https://github.com/verl-project/verl), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-19T23:07:35Z through 2026-11-26T23:07:35Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- Refit **vLLM** **rollout** through the vLLM 0.34 reload lifecycle, delete the per-scheme weight-update patches, and bump to vllm 0.34.0 by *aoshen02 (Inferact)* [95ede34](https://github.com/verl-project/verl/commit/95ede340d77ace73638b9b1d3fb5a0eed1bad4fd)

    Weight sync now wraps the bucket stream in `start_reload`/`finish_reload` (`VLLM_RELOAD_MODE=direct`, the default on non-NPU devices). This replaces about 2.6k lines of FP8/MXFP4/NVFP4/MoE staging patches. The reported GSM8K accuracy matches real-load baselines. **Before upgrading:** the vllm extra now pins `vllm==0.34.0`, `torch==2.14.0`, `torchvision==0.29.0`, `transformers==5.18.0` and `tokenizers==0.23.3`, so Docker images and wheelhouses must be rebuilt. The `veomni-sft` extra is gone, and trainer-only environments must add `--extra native-cu130torch213`. Sparse delta sync for vLLM now uses `checkpoint_engine.backend=vllm_sparse_nccl`, and `delta_sharded` now targets SGLang only. **ROCm/AMD:** the diff has no AMD-specific changes, but the new reload default applies to every non-NPU device, so AMD users should validate refit on vLLM 0.34 with torch 2.14.

- Stream frozen Engram/PLE weights from safetensors to the vLLM rollout, change VeOmni defaults, and add Qwen3.8 support by *Joel (ByteDance)* [64aef64](https://github.com/verl-project/verl/commit/64aef647d08113b2dc3643624ec916dbf025926d)

    **FSDP** and VeOmni now skip the frozen lookup tables, which can be tens of GiB, during **rollout** weight sync. vLLM streams them from safetensors only when it needs them, which cuts sync memory for Qwen3.8-Flash-Next and DeepSeek-V4.1. **Config migration:** the VeOmni engine gains `ple_parallel_size`, `freeze_ple_embeddings` (default `True`), `frozen_ple_dtype` and `qsa_attention_implementation`. The defaults are now `broadcast_model_weights_from_rank0=False` and `ep_sharded_stream_load=True`, so VeOmni users should re-check checkpoint loading. They may also need the companion VeOmni PR (#1497).

- Add opt-in `model.lora.resync_base`, which releases LoRA base weights on sleep for **vLLM** and **SGLang** rollouts, by *ℍ𝕠𝕝𝕝𝕠𝕨 𝕄𝕒𝕟 (openSUSE)* [8d6ae46](https://github.com/verl-project/verl/commit/8d6ae4696540b778bd9977f57e40c5f3a67e81f6)

    The flag defaults to `False` and only works with `lora.merge=False`. It lowers memory pressure during **rollout** sleep, but every weight update then re-syncs the full base weights first. vLLM uses sleep level 2 for HYBRID rollouts. SGLang now releases `weights` on sleep, which fixes the `KeyError: 'weights'` from #7289. `rollout.layered_summon=True` now raises `ValueError` when base weights are exported. All generated PPO trainer configs gain the new key.

- Wire **Megatron** LoRA+ (`lora_plus_ratio`) and shared-outer MoE LoRA export into the optimizer and rollout paths by *ℍ𝕠𝕝𝕝𝕠𝕨 𝕄𝕒𝕟 (openSUSE)* [de74236](https://github.com/verl-project/verl/commit/de742368df5d23e93ce9ba487d386f5265e1c9af)

    The new `model.lora.lora_plus_ratio` defaults to `1.0` (off). Any other value requires `optim.lr_warmup_init=0`. The commit also adds `normalize_moe_lora`, `share_expert_adapters`, `experts_shared_outer_loras` and `enable_tower_connector_lora`. Export picks the adapter layout that the **SGLang** or **vLLM** rollout expects, and HF adapter checkpoints are written as PEFT-loadable expanded factors. With Megatron-Bridge 0.6.2, wgrad fusion is turned off on trainable EP-replicated LoRA projections, which may lower throughput. Some export paths need Bridge v0.7.0. vLLM now rejects `enable_tower_connector_lora` in engine kwargs.

- Support the trainer-side rollout weight quantizer in the **FSDP** engine, so FSDP runs can use an FP8_BLOCK **vLLM** **rollout**, by *Shawn Lu (googlers)* [e764931](https://github.com/verl-project/verl/commit/e76493122c6f0f88d6e3b39ca3086cdd65f94da1)

    Before this change, `rollout.quantization.linear=FP8_BLOCK` with FSDP failed with `NotImplementedError`. `hf_model` checkpoint export bypasses the quantizer, so saved checkpoints stay in training precision. Unmerged LoRA combined with a quantized rollout still raises an error, so set `lora.merge=True`. The author reports a larger train/inference mismatch (`rollout_corr/kl` about 0.010 versus about 0.0008 for bf16) and unstable **GRPO** on a 0.5B model. The change was tested on NVIDIA GPUs only.

- Support multi-label (top-k) queries in the **Triton** fused linear cross-entropy kernel by *Jianbing (NVIDIA)* [94625d9](https://github.com/verl-project/verl/commit/94625d9e371cba4db9be1598bc5da6418763cd61)

    **Distillation** and score centering can now use `impl_backend=triton` on FSDP, **Megatron** and VeOmni. The PR reports about 2.2–3.3x faster forward+backward than TileLang at K=5–129. The single-label path now accumulates dHidden in FP32, which slightly changes numerics for existing Triton runs. Support is documented as **CUDA** only.

- Fix the **SGLang** rollout so it propagates default EOS `stop_token_ids` and `ignore_eos` by *Hao Guo* [8612d02](https://github.com/verl-project/verl/commit/8612d0292c38dbe7b104a8c783594f5c57119fa7)

    With `skip_tokenizer_init=True`, generations could miss EOS or chat stop tokens and run to `max_new_tokens`, for example on Qwen3.5-style multimodal checkpoints without `generation_config.json`. That hurt **reward** and trajectory correctness and wasted throughput. EOS IDs are now merged from `hf_config`, `text_config`, `generation_config` and the tokenizer. SGLang users may see shorter responses after upgrading.

- Fix the DeepSeek-V4 reasoning-effort mapping and prompt encoding by *Yuyang Ding* [d577845](https://github.com/verl-project/verl/commit/d577845e4e5c55bf8cebb57928e01552b271440c)

    Prompts change for **rollout**, **multi-turn** and **agent** runs that use `reasoning_effort`. `low` now has no preamble, `high` gets the high-effort preamble, and `max` gets its own preamble. Aliases are `minimal/medium→low`, `xhigh→high` and `ultra→max`, and unsupported values raise `ValueError`. Tool schemas now follow the system content, and user/tool runs share one user turn. Re-evaluate any earlier runs that used `high` or `max`. The fix was validated on CPU only, with no regression tests committed.

### 🟡 Medium Priority

- Forward `rollout.max_model_len` to the **SGLang** server as `context_length` by *Hao Guo* [29eb4f7](https://github.com/verl-project/verl/commit/29eb4f7950a9697116e97e989e5a7be746a4253a)

    SGLang now launches with the same context limit that verl already enforces, matching vLLM and TRT-LLM. This can change memory use and the allowed prompt and response lengths. An explicit `engine_kwargs.sglang.context_length` still takes precedence.

- Read vLLM sampled-token **rollout** log-probs from flat lists, cutting rollout time by about 10%, by *hxw12219* [453954b](https://github.com/verl-project/verl/commit/453954b3cb68575803ba4ff769032dda655b8f99)

    With `calculate_log_probs=True`, verl skips building a `Logprob` dict per token. In the author's B300 benchmark, rollout went from 6.99 s to 6.29 s. Outputs are unchanged. The commit also fixes an `IndexError` for one-token prompts on vLLM < 0.29.

- Fix Gemma4 image-token duplication in the **vLLM**/TRT-LLM rollout by replacing `qwen2_5_vl_dedup_image_tokens` with `dedup_image_tokens` by *Zhiliang* [7b6c9cc](https://github.com/verl-project/verl/commit/7b6c9cc0e19de780ca52c0c35d5157348955a3dc)

    Gemma4 **rollout** prompts now match the trainer's prompts in multimodal RL. External code that imports the old helper name must be updated.

- Skip a redundant `save_model_to_cpu(0)` in the separate-**async** PPO trainer when `parameter_sync_step == 1` by *Jialei Chen (Google)* [499cbe6](https://github.com/verl-project/verl/commit/499cbe6d3a741de605c6aaf495c4bd13c1ac1fff)

    This removes a wasted device-to-host copy of the full model on every step and frees the host RAM it held. Behavior is unchanged for `parameter_sync_step > 1` (the default is 4).

- Fix the Triton fused linear cross-entropy backward kernel on GPUs with limited shared memory by *Joel (ByteDance)* [2d0283f](https://github.com/verl-project/verl/commit/2d0283f89d7e368be0c502707c58a91f88173b0f)

    New two-stage and one-stage autotune fallbacks make the kernel work on the L20 and RTX PRO 6000 Blackwell (**CUDA**), where the fallbacks may run slower. Gradient buffers are now reset between autotune benchmark runs.

- Stabilize the **rollout** importance-sampling std metric by using centered population variance by *Joel (ByteDance)* [3a90989](https://github.com/verl-project/verl/commit/3a909894862c9d298073618e742e2f3ce51e86fc)

    This only affects the logged `rollout_is_std` diagnostic. **Rollout correction** weights and the loss are unchanged, but dashboards may show small shifts.

- Allow the `veomni` strategy in score-centering validation and add a VeOmni example by *Joel (ByteDance)* [8357f1e](https://github.com/verl-project/verl/commit/8357f1e0a7ce4c06dc970c2c637d49b33815f5cc)

    This fixes the `ValueError` for VeOmni users. The example script's defaults also changed, including **GRPO**→**RLOO**, `MAX_OFF_POLICY_THRESHOLD=16` and `entropy_coeff=0.0`, so copied scripts will train differently.

- Upgrade the pinned VeOmni revision and adapt to its checkpoint API refactor by *Joel (ByteDance)* [9bdd371](https://github.com/verl-project/verl/commit/9bdd3713e338f5ab60ded53a8244c21cf3d79e0b), with a related follow-up by *Huazhong* [b0f9224](https://github.com/verl-project/verl/commit/b0f92240559cc9b7180b754b25dfe7ee422a7089)

    Imports move to `veomni.models.checkpoint`, and the old `checkpoint_tensor_loading` module no longer exists. VeOmni backend and model-merger users therefore need the new pin (`9f533f46`). The follow-up also updates the Ascend CI pins and the score-centering tests and error message.

- Bump TransferQueue from 0.1.11 to 0.1.12 across requirements, pyproject, uv.lock, CI and **ROCm** images by *OutstanderWang* [8d96a40](https://github.com/verl-project/verl/commit/8d96a406cf9613aa43802d25b7f3552e7caf0cf4)

    `verl-core` now requires `>=0.1.12`, so refresh your environments. **ROCm/AMD:** `Dockerfile.rocm` and `Dockerfile.rocm.deepseek-v4` now install 0.1.12, so rebuild ROCm images.

- Update the TPU GRPO Docker image to **vLLM** 0.33.0 with newer torchtitan and vllm-torchtpu pins and TransferQueue 0.1.12 by *Jialei Chen (Google)* [3d7a8a0](https://github.com/verl-project/verl/commit/3d7a8a0a3372895e3380a2e3a0d0f94d6530eac6)

    This only affects TPU **GRPO** image builds. The GKE sandbox and SWE-bench extras are now installed by default; pass `--build-arg INSTALL_GKE_SANDBOX=false` to skip them.

- Add B300 and GB300 peak FLOPS so MFU metrics work on those GPUs by *hxw12219* [ee7f144](https://github.com/verl-project/verl/commit/ee7f1442f8d1c827258f62422bb334ee9ba5ca74)

    Before this change, `perf/mfu/*` always reported 0 on these GPUs. This only affects **performance** metrics.

### 🟢 Low Priority

- Add a Qwen3.5-35B-A3B NVFP4 example with native, QAT and BF16 modes by *Zhang Shuai (NVIDIA)* [7e4eaf5](https://github.com/verl-project/verl/commit/7e4eaf5be4546d8c0e623931ced29569af4f4e3c)

    This is a **DAPO**/**GRPO** recipe on **Megatron** + **vLLM** with **rollout correction** and R3 router replay, tested on GB200. It adds no library code changes.

- Fix the Ascend NPU docs: profiler defaults and rank selection, AISBench config, and ModelScope paths by *lxb007981* [a0f1dce](https://github.com/verl-project/verl/commit/a0f1dce5a2162881ccaece476f3011dc5d101579)

    The docs now state that `global_profiler.tool` defaults to `null` and must be set to `npu` to collect Ascend profiles. This is a docs-only change.

- Ascend NPU CI maintenance by *lxb007981* and *fangweii1*: HCCL diagnostics capture [610d65e](https://github.com/verl-project/verl/commit/610d65e39d3881b660b873f281973384ba7a1936), automatic HCCL ports [1cbe296](https://github.com/verl-project/verl/commit/1cbe296f6547a23888add890ac7023514fca41ef), `VLLM_WORKER_MULTIPROC_METHOD=spawn` for the top-k test [42252c7](https://github.com/verl-project/verl/commit/42252c7959a70b010bcc96ab44039cf35d069455), batch size 32 for the Qwen3.5-2B FSDP2 nightly job [90a8e1e](https://github.com/verl-project/verl/commit/90a8e1e306b1186d94bae2d6614f2b6f851d12a3), and the **vLLM** V2 model runner for the GLM-5.2 nightly job [0411899](https://github.com/verl-project/verl/commit/041189978b4e1d3908aa821156fdbf8ba57a2a61)

    These changes are CI-only and have no runtime impact. The batch-size change only works around the `position_ids`/`split_with_sizes` failure (related: #8624), so the underlying problem remains for **GRPO**/**FSDP** users on small equal-length batches. None of these changes affect **ROCm**/AMD.

## Newly Submitted Issues

**Training correctness and performance**
- [#8839](https://github.com/verl-project/verl/issues/8839) (closed): A user reports that `TiledMLP.backward` silently drops gradients accumulated from earlier micro-batches when `torch.chunk` returns fewer chunks than `num_shards`. The report includes a CPU repro with relative gradient errors up to about 99% and suggests a one-line fix. Closed as completed at collection time, but this digest does not confirm that a fix was merged.
- [#8797](https://github.com/verl-project/verl/issues/8797) (open): A **performance** report on Ascend. Precomputing flash-attention `cu_seq_lens` kwargs made attention about 150x faster in isolation, but `update_actor` was 62% slower under FSDP1 with param offload, likely because removing host syncs changed FSDP unshard behavior. The reporter also notes that an `offload_fsdp_model_to_cpu` assert can hide the original exception.
- [#8790](https://github.com/verl-project/verl/issues/8790) (open): In the V1 FSDP path, `update_weights` broadcasts the full parameter set every step, about 9 s/step on a 32B model. The reporter requests a bucketed delta sync or overlapping the sync with generation.

**Rollout, agents and tools**
- [#8869](https://github.com/verl-project/verl/issues/8869) (open): `KimiToolParser._infer_tool_name` picks the wrong tool, or reports an unknown function, when one tool name contains another (`search`/`web_search`). Affected **agent** **multi-turn** runs either call the wrong tool silently or never run the tool. The reporter offers a fix.
- [#8794](https://github.com/verl-project/verl/issues/8794) (open): On Ascend, the verl driver keeps waiting after the **vLLM** EngineCore fails KV-cache validation at startup, because `max_model_len` defaults to the model's 262k length. The reporter asks for a prompt exit with a clear error.
- [#8836](https://github.com/verl-project/verl/issues/8836) (open): A feature request to hold each prompt's prefix state with SGLang's session radix cache for hybrid models (Qwen3.5, Qwen3-Next). The reporter cites 7–18% faster **rollout** in a constrained benchmark and offers an opt-in PR.
- [#8777](https://github.com/verl-project/verl/issues/8777) (open): An RFC to refactor `SkipManager.rollout_tq` replay. The current replay rewrites trajectory keys to `index=0`, drops `index>0` rows, and leaves uid metadata inconsistent, which the RFC says is incorrect for agentic RL. It proposes replay that preserves the dump exactly, a `load_mode`, and mini-batch-level replay.

**Configuration, backends and design**
- [#8845](https://github.com/verl-project/verl/issues/8845) (open): An RFC for explicit weight-source and precision policies (for example, quantizing from FP32 optimizer values rather than BF16 module weights) in the existing WeightQuantizer refit pipeline across Megatron, FSDP and VeOmni. This is a design proposal only, with no implementation yet.
- [#8843](https://github.com/verl-project/verl/issues/8843) (open): An RFC to move NPU vLLM monkey patches from verl into vllm-ascend or vLLM. 8 of 14 patches are already removed, and the RFC proposes sink-or-keep criteria for the remaining 6.
- [#8789](https://github.com/verl-project/verl/issues/8789) (open): With the V1 trainer, the NPU profiler silently does nothing unless both `global_profiler.steps` and `actor.profiler` are configured. The reporter asks for validation or a warning.
- [#8793](https://github.com/verl-project/verl/issues/8793) (closed, not planned): A request for batch-divisibility assertion messages that explain how the effective and minimum batch sizes were derived.
- [#8842](https://github.com/verl-project/verl/issues/8842) (open): A question asking whether VeOmni's shared-prefix reuse works across micro-batches or only within one.

## Stats
- **Total Commits**: 27
- **Analyzed Commits**: 27
- **Active Contributors**: 15
- **Files Changed**: 170 (per-commit file counts summed; +6,364 / −4,349 lines)
- **Training-Specific Commits**: 9 (33.3% of total)
- **New Issues**: 12 (10 open, 2 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
