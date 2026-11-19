# verl Weekly Digest - 2026-11-19

## Summary
This week the V0 **PPO** trainer was removed, leaving V1 as the only trainer. The legacy fully-**async** and one-step-off trainers moved to verl-recipe, `DataProto` auto padding was removed, the single-controller dispatch API changed, and **agent loop** prompts now raise an error instead of being silently truncated, so many users will need to migrate before upgrading. Other changes add a TileLang fused linear cross-entropy backend for **distillation** and a salt mode that prevents stale external KV cache reuse during **rollout**. New issues report possible training-correctness problems, none of them confirmed yet: advantage handling for multi-trajectory sessions and mini-batches, model weights changing when Megatron **checkpoints** are resumed, and **ROCm**/**AMD** CI problems.

Source: [verl-project/verl](https://github.com/verl-project/verl), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-12T23:05:21Z through 2026-11-19T23:05:21Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- [BREAKING] Remove the V0 **PPO** trainer and move the legacy fully-**async** and one-step-off trainers to verl-recipe, by *Begunner* [124d22c](https://github.com/verl-project/verl/commit/124d22c401f3c93779ec5171070cb9f0fc857c8d)

    `verl.trainer.main_ppo` now always uses V1, and `trainer.use_v1=false` is ignored. Several entry points are gone: `main_ppo_v0`, `ppo.ray_trainer`, `experimental.fully_async_policy`, `experimental.one_step_off_policy`, and `skip.rollout`/`skip.async_rollout`. Shared helpers moved to `verl/trainer/ppo/trainer_utils.py`. The **async** and one-step-off workflows now live in verl-recipe, pinned to verl v0.9.1. The full-determinism workflow also depended on V0, so mainline no longer guarantees bitwise reproducibility. The author reports only smoke tests (Hopper, **vLLM**, Qwen2.5-0.5B).

- [BREAKING] Remove `DataProto` auto padding; `DP_COMPUTE_PROTO` now requires the batch size to be divisible by the world size, by *Chi Zhang* [909bb91](https://github.com/verl-project/verl/commit/909bb91387b96fd20dddc86cb9c026b536f0f05e)

    This removes `DataProtoConfig`, `VERL_AUTO_PADDING`, the `auto_padding` argument and `is_padding_enabled`. A batch that does not divide evenly across workers now fails to split. The change fixes a **training**-correctness risk: the old trim step could drop real samples when workers expanded, filtered or reordered rows. Code that relied on auto padding should call `DataProto.padding`, `pad_dataproto_to_divisor` and `unpad_dataproto` explicitly.

- [BREAKING] Send data-parallel shards only to the model-parallel source rank, and add worker pre/post hooks, by *Chi Zhang* [44cdff3](https://github.com/verl-project/verl/commit/44cdff30191583b9aa14d90872b6ba1447a7275d)

    Dispatch and collect queries now return `DispatchInfo(dp_rank, is_mp_src)` and `CollectInfo(is_collect)`. The keys were renamed to `dispatch_info` and `collect_info`, so custom workers and trainers must migrate. The new opt-in `dispatch_mp_src_only=True` can reduce data-transfer overhead. The new `worker_preprocess_fn` and `worker_postprocess_fn` hooks are rejected when TransferQueue is enabled. By default, data is still sent to all ranks. The author notes that the final version was not re-run on the multi-GPU Ray cluster test.

- `data.truncation` now applies to the **agent loop** prompt-length cap. Under the default `error` setting, overlong prompts now raise an error instead of being silently left-truncated. By *Jackie2049* [28b0d52](https://github.com/verl-project/verl/commit/28b0d52862f1e9d18332ecd909504167242585f6)

    `SingleTurnAgentLoop` and `ToolAgentLoop` now follow the configured policy: `left`, `right` or `middle`. The default `error`, or any unknown value, raises `ValueError`. Runs that relied on silent truncation will fail: raise `rollout.prompt_length` or set `data.truncation` explicitly. `RolloutConfig` now also rejects `prompt_length <= 0`.

- Validate **distillation** estimator and update-mode combinations, and change the Python default of `use_policy_gradient` to False, by *Adrian Wang* [3108beb](https://github.com/verl-project/verl/commit/3108bebc2d2f2bbe4642cd95f82a778667252d39)

    This is a breaking `DistillationLossConfig` change that also fixes **KL** distillation correctness. Setting `use_policy_gradient=True` together with `abs`, `mse`, `k2`, `k3` or `low_var_kl` now raises an error, because k3 with policy gradient can increase the reverse KL instead of reducing it. Configs built in Python that never set the flag now default to direct backpropagation. For reverse-KL policy gradient, use `k1`/`kl` with `use_policy_gradient=True`. See `docs/algo/opd.md` for migration steps.

- Add a TileLang fused linear cross-entropy backend (**FSDP**, **Megatron**, VeOmni) with top-k log-prob support for **distillation** and score centering, by *Joel (ByteDance)* [8a2d1d9](https://github.com/verl-project/verl/commit/8a2d1d9227544e5f5dbb428d9797858b1ad5664f)

    This is a **performance** and memory feature: setting `impl_backend: tilelang` with `use_fused_kernels=true` computes log-probs and **entropy** without materializing the full logits. TileLang runs only on **CUDA**, and it is required whenever top-k auxiliary labels are passed. Triton and Liger now fail explicitly on multi-label input. Existing VeOmni OPD configs should set `impl_backend=tilelang`. `pyproject.toml` and `uv.lock` dependencies changed. No **ROCm** support.

- Add an opt-in `rollout.external_kv_cache_invalidation: salt` that tags requests with a `cache_salt` for each weight version, so external KV caches no longer need to be reset, by *Daegyu Han* [c012b10](https://github.com/verl-project/verl/commit/c012b10a498d1fa65002fc20f8ece00392a4fc69)

    This fixes a **rollout**-correctness problem: requests could reuse stale KV from older policy weights in external tiers (Mooncake, LMCache MP, HF3FS, SGLang HiCache) on **vLLM**, **SGLang** and TRT-LLM. The default stays `reset`. Requirements for `salt`:
    - every weight update must pass `global_steps`
    - vLLM KV connectors must be keyed by block hashes; `LMCacheConnectorV1` is rejected and PD disaggregation is not supported
    - keeping the store across sleep requires a vLLM build newer than 0.33.0
    - the store needs an eviction policy

- Upgrade the ROCm Docker image to **vLLM** v0.32.0 and update the ROCm e2e CI image and environment, by *Yuhan Yang (AMD)* [ca439af](https://github.com/verl-project/verl/commit/ca439aa5afcfe913c075570a9cb3f0f83730904d)

    **ROCm/AMD** users should pull `verlai/verl:rocm7.14_torch2.12_release_1112`. It includes transformers 5.16.1, mcore_bridge 1.7.0 and megatron-bridge 0.5.1. CI sets `HSA_TOOLS_DISABLE_REGISTER=1`; without it, idle vLLM workers busy-poll, which roughly doubled the **Megatron** MoE job time. Setting the variable also removes GPU records from profiler traces, so users profiling with this image may hit the same busy-polling.

### 🟡 Medium Priority

- Set `KMP_INIT_AT_FORK=TRUE` in the ROCm e2e workflow and Dockerfile to stop dataloader fork deadlocks, by *Yuhan Yang (AMD)* [89f5d51](https://github.com/verl-project/verl/commit/89f5d519a2d9577d44283becd973e652e47480aa)

    Fixes intermittent **PPO** hangs on **ROCm** (3 of 20 test runs hung). The fix takes effect only after the image is rebuilt. **AMD** users running outside the image should `export KMP_INIT_AT_FORK=TRUE` before launching. The problem was reported in [#8712](https://github.com/verl-project/verl/issues/8712).

- Fix two **vLLM** MTP weight-sync problems during **rollout**:
  - Skip MTP completeness checks during bucketed IPC weight sync, by *lxb007981* [0c0a7a0](https://github.com/verl-project/verl/commit/0c0a7a0f3be1f5ab0581d347d8cbd726f84bcb1d)
  - Resolve both `drafter.model` and `speculator.model` for ModelRunner V2, by *lxb007981* [cc1773b](https://github.com/verl-project/verl/commit/cc1773b2f7c6145c921c5fa71e827eb6773bc4de)

    Users running MTP or speculative decoding with colocated vLLM need both fixes to keep the draft model in sync with the trained weights. On older vLLM versions the completeness-check change does nothing. No config changes are needed.

- Report vLLM `finish_reason="length"` as `stop_reason="length"` in the **vLLM** **rollout** server, by *Yuyang Ding* [61adb0c](https://github.com/verl-project/verl/commit/61adb0c7eb90730306e7794c2bf248331211e657)

    Truncated generations no longer report `completed`. Custom **agent loop** code that treats `completed` as the only successful stop reason should also handle `length`.

- Skip rows that have no valid tokens in the **rollout correction** **importance sampling** and rejection-sampling sequence metrics, by *hx (Meta)* [a4e0dd2](https://github.com/verl-project/verl/commit/a4e0dd2188e3dd458a2cbb097c03d975ca77f159)

    Padding rows no longer bias the `rollout_is_seq_*` and `rollout_rs_seq_masked_fraction` metrics. Loss and gradients are unchanged, but dashboards may shift for runs that had padding rows.

- Add `trainer.v1.sampler.poll_interval` for the V1 replay buffers, by *hx (Meta)* [27129e3](https://github.com/verl-project/verl/commit/27129e351ac5d6f038d009478f1e7cdebfbd4397)

    The default stays at 2.0 s. Setting it to 0.1 gave roughly a 5–9% speedup on a fast-step **GRPO** run on TPU. Invalid values now raise `ValueError`.

- Pin TransferQueue 0.1.11 in the TPU GRPO Dockerfile, by *hx (Meta)* [3eb34c0](https://github.com/verl-project/verl/commit/3eb34c009b1558c68a8422e9c6a538f37cf798f6)

    With the old 0.1.8 pin, V1 **async** **checkpoints** failed with an `AttributeError`. TPU users should rebuild the image. The docs now note that multi-node runs need `trainer.default_local_dir` on a shared filesystem.

- Avoid dynamic-shape boolean indexing in the `ppo_loss` old-logprobs mismatch metric, by *askhat-g (Google)* [1628f46](https://github.com/verl-project/verl/commit/1628f464c07b16cc8b87d7bfbbb7998d235441db)

    Stops repeated XLA recompilation, which ran out of memory on TPU after several steps. The metric value is unchanged, and the change also removes a host sync.

- Fix **PPO** metrics collection so `token_level_rewards` is fetched only when `use_kl_in_reward` is enabled, by *ChibiQuest (Huawei)* [07490cb](https://github.com/verl-project/verl/commit/07490cb5ce1fa1818e0d98540abc9bccd02534ac)

    Fixes missing-field errors in the V1 trainer when **KL**-in-reward is disabled.

- Save generation configs that transformers refuses to save (e.g. GLM-5) in the **checkpoint** managers and the model merger, by *Jeremy Savarese* [2dc537b](https://github.com/verl-project/verl/commit/2dc537b87e757d2ecf9321149e87ddc5ea957f70)

    Previously, **FSDP** and **Megatron** checkpoints of GLM-5 models were written without `generation_config.json`, so serving those checkpoints missed GLM's stop tokens. GLM-5 users should re-save or re-merge their checkpoints.

- Let **vLLM** and **SGLang** `launch_servers` run on workers without an accelerator, and add a `_get_server_env_vars` hook, by *Shawn Lu (Google)* [2a04459](https://github.com/verl-project/verl/commit/2a04459b31f9d99e33362a25712c69c2867ca109)

    Lets out-of-tree platforms such as TPU reuse the **rollout** server launch path. GPU and NPU behavior is unchanged.

- Add `PlatformBase` hooks for the torch profiler's device activity and extra kwargs, by *wenjung2007* [565bc5c](https://github.com/verl-project/verl/commit/565bc5ca267d56eaaf45a6f5d10a82ad4ca9ba29)

    Out-of-tree backends (TPU, MLU) no longer need to patch `get_torch_profiler`. **CUDA** and **ROCm** still use `DEVICE_ACTIVITIES`.

- Support the `delta_sharded` **checkpoint** engine on Ascend NPU through an HCCL transport, by *wucong25* [2ef644a](https://github.com/verl-project/verl/commit/2ef644af0fd1cbaca3bfe621c187ac1f5a394114)

    Enable it with `actor_rollout_ref.rollout.checkpoint_engine.backend=delta_sharded`. The `cupy` and `ray.util.collective` imports are now optional. The **CUDA**/NCCL path should behave as before.

- Tune the DeepSeek V4 Flash **FSDP** Turbo recipe for Ascend NPU and remove the engine's `_gradient_sync_context` override, by *zhouhengan1211* [629e30e](https://github.com/verl-project/verl/commit/629e30e23efe6b7937970b77c03fd339e9756501)

    `FSDPTurboEngineWithLMHead` now uses the base engine's gradient-sync handling. FSDP-Turbo users should check gradient accumulation, **performance** and memory after upgrading.

- Add a `schedule` option to the NPU mstx profiler so that only selected actor mini-batch updates are traced, by *xieanran* [cc35929](https://github.com/verl-project/verl/commit/cc35929bf8eedf5f3eb7c4ace3441dfd9f6d4c0e)

    This is opt-in under `profiler.tool_config.npu`. With `discrete=False`, a schedule also affects the log-prob traces.

- Fix the Ascend NPU source installation and add the required FLA NPU backend, by *renjunying2 (Huawei)* [4191e7f](https://github.com/verl-project/verl/commit/4191e7f910d85d69acb8c45f4840f10faa535165)

    Source installs now require `FLA_NPU_DEVICE` (a2/a3/a5) and install `flash-linear-attention-npu`. Ascend users building from source should follow the revised steps.

### 🟢 Low Priority

- Ascend NPU CI updates (CI and tests only, no runtime impact):
  - Run the **vLLM** **reward**-loop CI on 16 NPUs, by *lxb007981* [3503bec](https://github.com/verl-project/verl/commit/3503bec3420dbb8ee67f8c9da6c0721570ae75ac)
  - Add vLLM top-k sampling tests, by *lxb007981* [35c6520](https://github.com/verl-project/verl/commit/35c652028bb5f7e4f0a1397bdacd538dd0e604c7)
  - Enable `PYTHONFAULTHANDLER` to diagnose intermittent segfaults, by *lxb007981* [7810520](https://github.com/verl-project/verl/commit/781052063c338cdc911e585a6404e96cfeb04681)
  - Call `pytest` directly instead of through `python -c` wrappers, by *XiangRun Liu* [b0871fd](https://github.com/verl-project/verl/commit/b0871fd89d19329d8c9ed58e5402b11dcf920b64)

- Add Intel XPU to the README hardware support list, by *kahlun (Intel)* [622cd6c](https://github.com/verl-project/verl/commit/622cd6c12b2796a3b541fe50babebf8aa3076799)

    Documentation only.

- Add links to Ascend recipe repositories in the English and Chinese quick start docs, by *renjunying2 (Huawei)* [6e7db96](https://github.com/verl-project/verl/commit/6e7db96322d30a186dfed8d9cb82d5d8a50ad037)

    Documentation only.

## Newly Submitted Issues

**Training and algorithm correctness (reported, not yet confirmed)**
- [#8741](https://github.com/verl-project/verl/issues/8741) (open): Reports two problems. First, `compute_advantage_for_multi_trajectories` collapses multi-turn sessions only for `grpo`. With `grpo_vectorized`, `rloo`, `rloo_vectorized`, `grpo_passk` or `gpg`, intermediate zero-reward turns are said to distort group statistics and give negative advantages to winning sessions. Second, `norm_adv_by_std_in_grpo=False` (Dr.GRPO) is reportedly ignored for `grpo_vectorized`, `gdpo` and `grpo_passk`. A CPU reproducer is included.
- [#8766](https://github.com/verl-project/verl/issues/8766) (open): Reports that in the V1 sync and `colocate_async` trainers, GAE, REINFORCE++ and GDPO advantages are whitened over the full batch but used in smaller `ppo_mini_batch_size` updates. Each update chunk can then have a nonzero mean advantage, which may inflate `actor/loss` and make **entropy** collapse faster. The reporter proposes whitening each chunk.
- [#8765](https://github.com/verl-project/verl/issues/8765) (open): Reports that resuming a **Megatron** **checkpoint** with `optimizer_cpu_offload` (`HybridDeviceOptimizer`) silently changes model weights during loading. In the v2 split checkpoint layout, `dummy_step()` reportedly runs a real optimizer step after the model weights are loaded, so the first rollout after a resume may use perturbed weights.
- [#8719](https://github.com/verl-project/verl/issues/8719) (open): Reports that `full_determinism` has no effect on the **Megatron** engine. The key is missing from `megatron.yaml`, and the engine never reads it, even though the docs claim support on all engines.
- [#8739](https://github.com/verl-project/verl/issues/8739) (open): Reports that **FSDP2** policy snapshot save and restore fail after inference when `reshard_after_forward=False`, because child modules keep their full parameters. This breaks V1 Decoupled **PPO** old-log-prob computation. A reproducer and proposed fix are described.
- [#8735](https://github.com/verl-project/verl/issues/8735) (open): Reports that `fsdp_config.batch_invariant=True` crashes at the first backward pass on A100 and L40S (SM8x) with `aten::linear_backward` not implemented. vLLM's batch-invariance GEMM overrides are blamed. H100 is reportedly unaffected.

**Rollout, data plane and infrastructure**
- [#8768](https://github.com/verl-project/verl/issues/8768) (open): Reports that TransferQueue logs, but otherwise ignores, a 30 s ACK timeout, so samples are silently dropped. `compute_log_prob` then fails later with `KeyError: 'loss_mask'`. Seen with the Qwen2-7B GSM8K **GRPO** recipe on verl v0.9.1 after validation passes. The suggested workaround is raising `TQ_DATA_UPDATE_RESPONSE_TIMEOUT`.
- [#8769](https://github.com/verl-project/verl/issues/8769) (open): Reports that v0.9.1 can't be installed as documented, because the `uv.lock` wheel URLs for flash-attn, transformer-engine, apex and megatron-bridge return 404 after the wheelhouse tags were renamed. The reporter asks for a v0.9.2 release or restored asset names.
- [#8770](https://github.com/verl-project/verl/issues/8770) (open): Reports that `import megatron.bridge` fails in the `verlai/verl:vllm024.dev2` image (`No module named 'modelopt'`) and that `flash-linear-attention` is missing. As a result, the default **Megatron** config and Megatron LoRA can't build models in that image.

**ROCm/AMD**
- [#8712](https://github.com/verl-project/verl/issues/8712) (closed): Reports that **PPO** training on **ROCm** hangs indefinitely at dataloader worker startup, because of `KMP_INIT_AT_FORK=FALSE` combined with LLVM OpenMP. The workaround is exporting `KMP_INIT_AT_FORK=TRUE`. Commit [89f5d51](https://github.com/verl-project/verl/commit/89f5d519a2d9577d44283becd973e652e47480aa) addresses this, but only in the ROCm CI workflow and Dockerfile.
- [#8716](https://github.com/verl-project/verl/issues/8716) (open): Reports that FP8_BLOCK **rollout** weight sync with **SGLang** at TP=2 fails on **ROCm** (MI350X) with a scale shape mismatch ([16, 32] vs [16, 16]).
- [#8717](https://github.com/verl-project/verl/issues/8717) (closed): Reports unexpected cancellations of the ROCm e2e CI workflow runs, both before and during execution, and asks maintainers to identify the cause.

**RFCs and feature requests**
- [#8691](https://github.com/verl-project/verl/issues/8691) (open): RFC to restart faulty **rollout** replicas without interrupting the trainer. It covers detecting faults, isolating the replica, rebuilding it in place from a checkpoint or the next weight sync, and replaying in-flight requests. The proposed switch is `rollout.restart.enabled`. Demo results on NPU with Megatron and vLLM are included.
- [#8696](https://github.com/verl-project/verl/issues/8696) (open): RFC for shared-backbone **PPO**, in which a small value head is trained on the frozen actor backbone. The reporter measures about 20% shorter steps on Qwen2.5-7B (Megatron), with similar eval results.
- [#8697](https://github.com/verl-project/verl/issues/8697) (open): RFC to run the non-expert layers of the NVFP4 MoE recipe in MXFP8 instead of BF16, for both training and rollout.
- [#8699](https://github.com/verl-project/verl/issues/8699) (open): RFC to add MXFP8 backward GEMMs, optionally with stochastic rounding, for routed experts in the NVFP4 MoE recipe.
- [#8738](https://github.com/verl-project/verl/issues/8738) (open): RFC to share prompt preprocessing and TransferQueue storage across the `rollout.n` trajectories of a prompt (PR #8578). The reporter measures 40% less storage memory and 22% faster rollout on multimodal video **GRPO**.

## Stats
- **Total Commits**: 30
- **Analyzed Commits**: 30
- **Active Contributors**: 21
- **Files Changed**: 323 (sum of per-commit file counts; 6,866 insertions, 21,704 deletions)
- **Training-Specific Commits**: 12 (40% of total)
- **New Issues**: 17 (15 open, 2 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
