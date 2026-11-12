# vime Weekly Digest - 2026-11-12

## Summary
A large `[Sync]` commit moves the **Megatron** pin to a 0.20-compatible revision, adds Nemotron Super VL training support, and touches **checkpoint**, recovery and **weight sync** code. Two **ROCm**/**AMD** fixes repair TP1 colocated IPC **weight sync** and **NIXL** rollout transport, and make `--offload-train` release VRAM. Among new issues, one user reports slow `SampleCodec.prepare` encoding for long id lists. A second describes **GDN** and Qwen3.6-35B-A3B work on Ascend NPU, which lives on the `ascend` branch and is not in `main`.

Source: [vllm-project/vime](https://github.com/vllm-project/vime), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-05T23:05:30Z through 2026-11-12T23:05:30Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- [Sync] Update **Megatron** pin for 0.20 compatibility and add Nemotron Super VL training support by *aoshen02 (Inferact)* [2ce39aa](https://github.com/vllm-project/vime/commit/2ce39aa2cb380fa36d4df8c11d15270c212ee453)

    **Dependency/image migration:** **Megatron** is now pinned to `ae76c60`, and `megatron.patch` was rebased onto it. The commit also adds `nvidia-resiliency-ext==0.7.0` for async **checkpoint** support and builds `mamba_ssm`/`causal-conv1d` in the Docker image. **Model support:** it adds Nemotron-H and Nemotron-H VL HF↔Megatron converters, model scripts and plugins. Two new **vLLM** patches handle native weight reload (`vllm-nemotron-reload`) and multimodal placeholder masking (`vllm-tito-placeholder-mask`). **Upgrade note:** the sync also changes `update_weight/common.py`, `training_recovery.py`, `checkpoint.py` and `data.py`. Rebuild your images and re-check checkpoint loading, **weight sync** and recovery before upgrading. New tests cover packed weight transfer, **stateless Adam** and the **R3** conversion checkpoint, and an 8-GPU Nemotron 3.5 Super VL e2e CI suite was added. The diff has no ROCm/AMD-specific changes.

- Fix TP1 colocate IPC **weight sync**, **NIXL** rollout transport, and offload-train VRAM release on **ROCm** by *Jinn (RLsys-Foundation)* [8707a5a](https://github.com/vllm-project/vime/commit/8707a5a7156223ce1d92c65279e2eed748addb82)

    The **ROCm** image is now pinned by digest and uses the shared **vLLM** patches. A new AMD-only vLLM patch opens one HIP IPC handle before VMM allocations, so TP1 colocated engines no longer stall on their first IPC **weight sync**. A `nixl` → `nixl_rocm` alias makes `--rollout-data-transport nixl` work. Before this fix, that option crashed the RolloutManager with SIGSEGV. **AMD impact:** MI355X users should rebuild the ROCm image. This commit and [bf7f7ac](https://github.com/vllm-project/vime/commit/bf7f7ac6108288fccaf0f9f9702bbc913879f2c4) below are related; together they make `--offload-train` free VRAM (64 of 64 GiB in the author's test).

### 🟡 Medium Priority

- Make `--offload-train` work on **ROCm**: pin torch_memory_saver 118b09b3 and enable offload in the **AMD** Qwen3-8B example by *Jinn (RLsys-Foundation)* [bf7f7ac](https://github.com/vllm-project/vime/commit/bf7f7ac6108288fccaf0f9f9702bbc913879f2c4)

    The commit bumps `TMS_COMMIT` in `docker/Dockerfile.rocm` to a torch_memory_saver that rounds HIP VMM sizes to the allocation granularity. Freeing a paused block no longer fails in cuMemUnmap, and `.item()` on offloaded tensors no longer faults. `scripts/run-qwen3-8B-amd.sh` drops `--no-offload-train` and now passes `--train-env-vars '{"NCCL_CUMEM_ENABLE":"1"}'`. Without that variable, RCCL P2P collectives return empty data under offload. **Migration:** if you run `--offload-train` on ROCm, rebuild the image and set `NCCL_CUMEM_ENABLE=1` for the train workers.

### 🟢 Low Priority

None

## Newly Submitted Issues

- [#519](https://github.com/vllm-project/vime/issues/519) (open): A user reports that `SampleCodec.prepare` in `vime/data/codec.py` is slow on Samples with long id lists. The nested `visit()` encoder repeats imports and `isinstance` checks for every list item, and rebuilds the replay field set for each field. In the user's benchmark (32 groups × 2 Samples), 8192-id lists take about 160 ms, versus 6 ms for 64-id lists. The user says the encoded output is still correct. They propose hoisting the imports and fast-pathing plain-scalar lists, which in their local test brings the 8192-id case down to 30 ms. Users with long rollout sequences could see CPU overhead in data transport and buffer checkpointing. This is a reported **performance** concern and has not been confirmed as a **regression**.
- [#522](https://github.com/vllm-project/vime/issues/522) (open, labeled `question`): The author describes running Qwen3.5/3.6-35B-A3B (**GDN** linear attention + 256-expert MoE) on Ascend NPU from the separate `ascend` branch, in non-colocated and colocated modes. The described work includes:
    - a `fla-npu` native GDN backend
    - TP sharding of the GDN layer, with a merged qkv+z+b+a projection
    - per-sub-matrix TP gather for **weight sync**
    - support for both routed-expert **checkpoint** layouts
    - passthrough of visual/MTP weights on HF save

  The author reports 16% lower train time and AIME rising from 0.20 to 0.81 over 100 steps. None of this is in `main`, so `main` users cannot use it yet.
- [#524](https://github.com/vllm-project/vime/issues/524) (open, labeled `question`): A user (writing in Chinese) says a **tracing** span name is misleading. In `examples/coding_agent_rl/generate.py`, the `sandbox_boot_wait` span also covers `sandbox_create` and `harness_install`, so trace views can misattribute where time goes. The user suggests renaming the span.

## Stats
- **Total Commits**: 3
- **Analyzed Commits**: 3
- **Active Contributors**: 2
- **Files Changed**: 50
- **Training-Specific Commits**: 1 (33.3% of total)
- **New Issues**: 3 (3 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
