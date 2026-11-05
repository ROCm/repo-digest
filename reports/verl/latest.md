# verl Weekly Digest - 2026-11-05

## Summary
Low-precision work landed on `main` this week. Commits added native NVFP4 W4A4 training and **rollout** on Blackwell, moved NVFP4 QAT to per-token activations, and added TileLang FP8/MXFP8/MXFP4 QAT kernels. These carry breaking changes: FSDP QAT and the **SGLang** static NVFP4 refit are removed, and new `modelopt`/`tilelang` pins apply. Other high-priority commits fix garbage **vLLM** FP8 KV-cache rollouts and add a startup chat-template check for multi-turn Continuous Token rollouts, which is `strict` by default. Among new issues, users reported **training-correctness** concerns: misaligned V1 rollout-diff metrics, VeOmni R3 router-replay masking, and a Qwen3 XML tool parser that drops tool calls. A community member also posted an AMD/ROCm Q4 roadmap.

Source: [verl-project/verl](https://github.com/verl-project/verl), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-10-29T23:06:29Z through 2026-11-05T23:06:29Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- Add native NVFP4 W4A4 training and rollout with live refit (Megatron/Transformer Engine + vLLM) by *Zhang Shuai (NVIDIA)* [6879e1a](https://github.com/verl-project/verl/commit/6879e1ab07b9cfd0b4b27c31ca4e7afcad1466b3)

    This is an experimental NVFP4 path for routed MoE experts. Enable it with `override_transformer_config` (`fp4: e2m1`, `fp4_recipe: nvfp4`) plus `rollout.quantization.moe=NVFP4`. The author reports about 1.3x faster rollout and about 1.2x shorter steps once responses exceed ~2.5k tokens. It requires Blackwell (SM100), PyTorch 2.13/**CUDA** 13, **vLLM** 0.32.0, TE 2.20.2 and Megatron-Core 0.19.2. It also requires PP=1 and the `naive` **checkpoint** engine. `pyproject.toml`/`uv.lock` change, and **SGLang** is not validated. No **ROCm** support.

- [BREAKING] NVFP4 QAT switches to per-token activations; FSDP QAT and SGLang static NVFP4 refit removed by *Zhang Shuai (NVIDIA)* [cd04d68](https://github.com/verl-project/verl/commit/cd04d68d6e435e28c60c79b912ba718b494f889f)

    Train/rollout mismatch dropped sharply in the author's Qwen3-30B-A3B **DAPO** run on GB200 (`k3_kl` 0.060 → 0.0033). **Breaking:** `QATLinear`, `QATQuantizer`, `actor.qat` and the **FSDP** engine `qat` config are removed. QAT now requires **Megatron**, and per-token NVFP4 is not supported on **SGLang**. Configs that set the removed keys must be migrated. No **ROCm** impact indicated.

- Add TileLang FP8_BLOCK, MXFP8 and MXFP4 QAT kernels shared with parameter export by *Joel (ByteDance)* [06a3a49](https://github.com/verl-project/verl/commit/06a3a494daa28c912d764ee928bc96e643ec3d56)

    Fused TileLang quantize-dequantize kernels now back the ModelOpt fake quantizers and **CUDA** compressed-tensors export, so exported values match QAT numerics. **Megatron** QAT now requires `nvidia-modelopt==0.47.0` and `tilelang==0.1.15`. MXFP8/MXFP4 E8M0 scales now round upward to a power of two, so numerics may differ from the earlier preset. CUDA-only.

- Add grouped TileLang FP8/MXFP8/MXFP4 fake-quantization and expert weight export for Megatron QAT by *Joel (ByteDance)* [e2ace87](https://github.com/verl-project/verl/commit/e2ace870eba5e4cb850e839655f7be524a8fbe54)

    Grouped Transformer Engine expert weights are fake-quantized through pointer-table kernels without stacked copies. They are exported in the per-expert layouts that **rollout** engines expect, with **vLLM** `weight_scale_inv` naming. Existing `qat.mode=fp8|mxfp8|mxfp4` settings pick up the new kernels automatically. Expect lower memory use and faster QAT and export for MoE models. NVFP4 QAT users should re-check that path, because its tests were removed in this commit.

- Reset uncalibrated vLLM KV cache scales after quantized FP8 refit, fixing garbage rollout by *Beichen Huang* [fc726e3](https://github.com/verl-project/verl/commit/fc726e33ceb54ad875d4537880e786de2a32129d)

    Combining `FP8_BLOCK` quantized rollout with `kv_cache_dtype=fp8_e4m3` produced garbage generations and NaN `k3_kl`. Uncalibrated q/k/v/prob scales are now reset to 1.0 when the quant config has no `kv_cache_scheme`. Anyone running FP8 **vLLM** rollout with an FP8 KV cache should upgrade. **SGLang** was not checked.

- Check Continuous Token merges against the chat template before the first multi-turn rollout, and register `qwen3_next` and `glm4_moe_lite` builders by *khazzz1c (OpenRLHF)* [31cfccb](https://github.com/verl-project/verl/commit/31cfccb4dbad8f1f4aa41a34eb589afbe283e8fe)

    `tokenization_sanity_check_mode` had no effect since #4422 and is now enforced again. **Upgrade note:** under the default `strict` mode, **multi-turn**/**agent loop** runs on models that fall back to the default builder (e.g. SmolLM, Granite, OLMo-2) now **raise** before the first **rollout**. Fix this by registering a builder, or set `ignore_strippable`/`disable`. Qwen3-Next and GLM-4.7-Flash now get correct turn boundaries, a **training-correctness** fix. Custom context-merging loops should set `merges_context_messages = True`.

- Optimize Qwen3.5 FSDP-Turbo training with fused kernels and Turbo model overrides by *pengnuoheng* [184687b](https://github.com/verl-project/verl/commit/184687bb3b7c601627eed3660283ecabd2bb75ed)

    `fsdp_turbo` now loads Turbo's optimized model class and enables fused causal-conv1d and gated-delta-net kernels. It also CPU-offloads forward-only workers such as the reference model. EP config changes: the dispatcher is now `all2all`, and `apply_efsdp_modules`/`use_fused_ops` are new options. Example scripts now require `transformers==5.21.0` and `vllm==0.30.0`. Turbo backend users must migrate their configs and dependencies.

### 🟡 Medium Priority

- Decouple checkpoint publish from rollout commit in `CheckpointEngineManager` with an opt-in `support_publish_weights` mode by *Joel (ByteDance)* [08f0b49](https://github.com/verl-project/verl/commit/08f0b49e171ae6f59187e0907cd448eb73d66dac)

    The default (`False`) keeps the coupled NCCL/NIXL behavior. With `True`, the trainer returns once a weight snapshot is published, and the rollout commit continues in the background. This is groundwork for the **async** decoupled trainer (#8526). No config or **checkpoint** changes for existing backends.

- Make separate-async trainer wait for background weight update before validation and at train end by *Shawn Lu (Google)* [b151d44](https://github.com/verl-project/verl/commit/b151d444f4a7ebd9ed54cdbf0242ff572b9d7424)

    The new `wait_for_weight_update()` stops **async** validation from generating with stale weights when `support_publish_weights=True`. Coupled backends are unaffected. The author reports `update_weights` time dropping from 2.06 s to 0.66 s per step on a TPU backend.

- Request `values` from TransferQueue only when the critic is enabled in the PPO v1 trainer by *renjunying2 (Huawei)* [3fdf2b5](https://github.com/verl-project/verl/commit/3fdf2b548882a8aeccf0842c2150d9c9f1790a55)

    Fixes critic-free **GRPO** failures on the v1 trainer with newer TransferQueue versions, which reject requests for missing fields. Behavior with the critic enabled is unchanged.

- Run `on_train_end()` on the last step and stop train dataloader workers at the end of v1 trainer `fit()` by *0z5a (University of Tübingen)* [1186e32](https://github.com/verl-project/verl/commit/1186e32f6ec81da21bd827f1178d39227f6b5441)

    `on_train_end()` and the dump executor shutdown now run on every exit path, so custom overrides of `on_train_end()` will now be called. This also removes the spurious "DataLoader worker killed by signal" traceback after successful runs. Only a CPU test covers the change.

- Keep the first NonTensorData in `concat_tensordict` with tensordict >= 0.11 by *Jialei Chen (Google)* [8e48d72](https://github.com/verl-project/verl/commit/8e48d72de4766228c36623c90f9f5c49ee5b45f3)

    Fixes `sft_trainer_ray` validation `TypeError`s and broken `compute_log_prob` metrics on newer tensordict versions. There is no change for the pinned tensordict <= 0.10.

- Add Qwen3.5-397B-A17B full-parameter GRPO recipe on TPU v7x with multi-replica rollout and TPU FLOPS accounting by *Jialei Chen (Google)* [592cba1](https://github.com/verl-project/verl/commit/592cba13531a32b69eccd490a04b795a89587854)

    The recipe adds opt-in large-MoE **GRPO** knobs (EP, fp32 master weights, host-offloaded optimizer). The TPU image pins a newer torchtitan, `jax` 0.12.0.1 and `tokamax` 0.0.17. `perf/mfu/actor` is now reported on TPU v5e/v5p/v6e/v7x. The author reports ~130 s/step and 3.8% MFU on 64 v7x chips.

- Add DeepSeek-V4-Pro GRPO example (H100 and GB200 profiles) and scale-up docs by *linmuchuiyang* [7cea539](https://github.com/verl-project/verl/commit/7cea5392165ac26d5eadf879701337c85e4a2b2f)

    Adds a ~1.6T **GRPO** example using **Megatron** training and **vLLM** rollout. It needs `main` with #8234/#8235 and a patched Megatron-LM branch. Checkpoints default to `save_contents=[model,extra]` because the optimizer state is ~22 TB. The rollout MoE kernel is forced to Marlin. NVIDIA-only.

- Upgrade Ascend (NPU) vLLM/vLLM-Ascend stack to 0.30.0 in Dockerfiles, install script and docs by *renjunying2 (Huawei)* [f7722fe](https://github.com/verl-project/verl/commit/f7722fef34492b973469167927d76127932a7dff)

    The A2/A3/A5 images now use **vLLM**/vLLM-Ascend 0.30.0, `torch_npu==2.10.0.post7` and `transformers==5.14.1`, and the MindSpeed install order changed. Ascend users must rebuild and revalidate their images.

- Avoid duplicate Qwen3-ASR registration and add FLA NPU backend in Ascend Docker images by *renjunying2 (Huawei)* [e41dd69](https://github.com/verl-project/verl/commit/e41dd697abd7d5a583c0b46b1cedb821ba402db3)

    Patches Megatron-Bridge's Qwen3-ASR registration and installs `flash-linear-attention-npu`, which **vLLM**-Ascend needs. Rebuild Ascend images or rerun the install script to pick these up.

- Upgrade Ascend 950 Docker image to Megatron-Core 0.18 and add Qwen3-30B-A3B MXFP8 GRPO example by *XiangRun Liu* [6dcc6e4](https://github.com/verl-project/verl/commit/6dcc6e4d10ba3b10cd7f659ba89189acabcb55be)

    The Ascend 950 image moves from **Megatron** core 0.12 to 0.18, plus the matching MindSpeed/Bridge stack. The commit adds an 8-NPU MXFP8 **GRPO** example, which is verified only at pinned commit 18eb23d and is committed without a `.sh` extension. Ascend 950 users must rebuild their images.

- Add multi-stage Intel GPU (XPU) Docker image for vLLM 0.32.0 with FSDP/FSDP2 by *kahlun (Intel)* [321e4e4](https://github.com/verl-project/verl/commit/321e4e450fcfc47a3491c946cd01dacd9ea7281a)

    New image for Intel Arc Pro B-series GPUs. It requires transformers >= 5.16.1 (`main` since #8390) and compute-runtime 26.18 or later. It was tested by hand only, with no CI coverage.

### 🟢 Low Priority

- Make tests device-agnostic using `verl.utils.device` platform helpers instead of hardcoded `cuda` by *kahlun (Intel)* [2bcc98a](https://github.com/verl-project/verl/commit/2bcc98a9b64bdb3af5b88ac870ba0709ed709aef)

    Test-only change across 12 files. Behavior on **CUDA** is unchanged, and the tests are easier to run on other accelerators.

- Add H20 FP8 KV cache results and usage notes to the FP8 guide by *Beichen Huang* [0938fcb](https://github.com/verl-project/verl/commit/0938fcb3190bc8eca3091f77aead3cd44c4d8869)

    Docs only. On H20, the FP8 KV cache cut rollout time by ~13% but roughly doubled `k3_kl`. With FP8_BLOCK rollout it needs the scale reset fix in [fc726e3](https://github.com/verl-project/verl/commit/fc726e33ceb54ad875d4537880e786de2a32129d).

- Ascend NPU CI maintenance by *lxb007981*: [fc724ff](https://github.com/verl-project/verl/commit/fc724ff75126e2f80ee258eedb33ef4d48a845ec) [cb94d6c](https://github.com/verl-project/verl/commit/cb94d6c4b5157fbf728295363c1332586a9da754) [464a91a](https://github.com/verl-project/verl/commit/464a91a6eadc8e8595ea73c8c8688e109ac33a4e) [07ba1a8](https://github.com/verl-project/verl/commit/07ba1a854e57356ccf1c9d604898607a88e3da3e) [d4bf40c](https://github.com/verl-project/verl/commit/d4bf40cf5fe43ef25fdf634efbd43ad90b08c5ff) [3902420](https://github.com/verl-project/verl/commit/39024209cc412e363a66338429d4644416de0abb) [7454326](https://github.com/verl-project/verl/commit/745432653d15af14954af1e055c8aeed72afa064)

    CI-only changes with no runtime impact:
    - The Qwen3-8B **PPO** nightly now runs on 16 NPUs to avoid host OOM.
    - The multinode nightly creates its log directory and gains a GLM5.2 **GRPO** baseline regression check.
    - Ascend workflows print `/proc/meminfo` before tests.
    - Engine tests use tiny Qwen3 configs.
    - Ascend A5 images are now built daily.
    - The nightly Ascend workflow no longer runs on pull requests.

- Use "Huawei Ascend" in README hardware support and Ascend Docker description by *XiangRun Liu* [8df5bae](https://github.com/verl-project/verl/commit/8df5baeed0f5ecdd7f870d83bc3d79194816e2a9)

    Documentation wording only.

## Newly Submitted Issues

**Rollout, agent loops and tools**
- [#8462](https://github.com/verl-project/verl/issues/8462) (closed): The reporter found that Continuous Token merges were never checked against the chat template during training, and that `tokenization_sanity_check_mode` had no effect since #4422. As a result, unregistered models such as GLM-4.7-Flash and Qwen3-Next could silently train on wrong turn boundaries (duplicated `<|observation|>`, dropped `\n`). Commit [31cfccb](https://github.com/verl-project/verl/commit/31cfccb4dbad8f1f4aa41a34eb589afbe283e8fe) in this window implements the proposed startup check.
- [#8478](https://github.com/verl-project/verl/issues/8478) (closed): `ToolAgentLoop` reportedly returns the whole prompt as the response when the first turn generates no tokens, for example on an aborted request. Prompt tokens would then be scored as response text and counted in length metrics. The reporter offered a one-line fix.
- [#8550](https://github.com/verl-project/verl/issues/8550) (closed), [#8559](https://github.com/verl-project/verl/issues/8559) (open): Two duplicate reports. The Qwen3 XML tool parser raises `TypeError` when a parameter value is literally `...`, because `ast.literal_eval` returns `Ellipsis`. The tool call is then dropped for that turn; the reporter saw this 2 times in 38 training steps.
- [#8488](https://github.com/verl-project/verl/issues/8488) (closed): The VeOmni R3 router replay reportedly infers padding rows from duplicate top-k values instead of an explicit mask. As described, valid duplicate rows would silently lose replay fidelity, and topk=1 models would replay padding as expert 0. The reporter proposed a `routed_experts_mask`.

**Training and algorithms**
- [#8504](https://github.com/verl-project/verl/issues/8504) (open): V1 `MetricsAggregator` reportedly aggregates `rollout_probs_diff_mean` and `_valid` inconsistently when `parameter_sync_step > 1`. Placeholder NaNs from empty steps contaminate the mean, and real NaNs can be hidden. The reporter reproduced this on CPU, which would make the logged metrics misleading.
- [#8536](https://github.com/verl-project/verl/issues/8536) (open): RFC for a `kl_loss_type: topk_rb` estimator: a top-k Rao-Blackwellised **KL** to the reference with a sampled tail correction, unbiased and with lower variance than `k3`/`low_var_kl`. It would later fill the `full` stub. Results so far come only from toy experiments; the author proposes a PR sequence.
- [#8475](https://github.com/verl-project/verl/issues/8475) (open): Asks why **Megatron** disables fused `linear_cross_entropy` whenever `mtp.enable` is set, even for inference-only MTP (`enable_train=False`). The reporter argues this is an integration gap and links a PR that relaxes only that case. The PR has no end-to-end validation yet.
- [#8549](https://github.com/verl-project/verl/issues/8549) (open): Question and offer to contribute Muon optimizer support for the native **FSDP2** backend.
- [#8567](https://github.com/verl-project/verl/issues/8567) (open): The `compute_policy_loss_vanilla` docstring documents `rollout_log_probs`, but the function takes `rollout_is_weights`, which are importance ratios rather than log-probs. The reporter lists three more stale docstrings and offers a doc-only PR.

**Data**
- [#8552](https://github.com/verl-project/verl/issues/8552) (closed): The overlong-prompt filter reportedly re-tokenizes the whole dataset on every launch, taking 13–16 minutes for ~33k rows. The cause given is that the `datasets` cache fingerprint depends on a closure that is not stable across processes. The reporter proposed an explicit `new_fingerprint`.
- [#8554](https://github.com/verl-project/verl/issues/8554) (closed): `RLHFDataset` reportedly does not resolve a relative `tool_config_path`, unlike `AgentLoopWorker`. In Ray actors with a different working directory, tool schemas would be missing, so the overlong-prompt filter would underestimate prompt lengths.

**Platform roadmap**
- [#8537](https://github.com/verl-project/verl/issues/8537) (open): **AMD**/**ROCm** roadmap for 26Q4. Planned items include CI and Docker updates, QAT and MXFP8/MXFP4 recipes on MI300X/MI355X, and DeepSeek-V4-Flash **GRPO**. It also lists JAX/Primus backends, agentic RL recipes and a MoRI-IO checkpoint engine. These are plans, not shipped changes.

## Stats
- **Total Commits**: 28
- **Analyzed Commits**: 28
- **Active Contributors**: 13
- **Files Changed**: 194 file changes across 28 commits (some files touched by several commits)
- **Training-Specific Commits**: 7 (25% of total)
- **New Issues**: 13 (7 open, 6 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
