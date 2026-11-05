# vime Weekly Digest - 2026-11-05

## Summary
A large `[Sync]` commit reworks **checkpoint** recovery (rewind replaces fork), adds GLM5-Next and Qwen3.5 native-weight conversion, and overhauls the `docker/patch/latest` **vLLM** patch stack (Rust frontend patches removed, router PD registration and unified PD metrics/**tracing** added). A separate fix pins the **ROCm** image by digest and applies the shared vLLM patches with strict `git apply`. Among new issues, one user reports that colocated online **DSpark** draft training never updates the draft weights. Maintainers have not confirmed this, and the proposed fix is not on `main`.

Source: [vllm-project/vime](https://github.com/vllm-project/vime), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-10-29T23:04:44Z through 2026-11-05T23:04:44Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- [Sync] **Checkpoint** rewind, new model conversions, and Megatron training-path updates by *aoshen02 (Inferact)* [6845501](https://github.com/vllm-project/vime/commit/6845501aed4be6497213292dbebb16ceb5565954)

    Adds `vime/data/rewind.py` and replaces the straw **checkpoint** fork test with a rewind test. It adds GLM5-Next and Qwen3.5 native-weight conversion, and changes the **Megatron** loss, actor, **weight sync** and `ppo_utils` paths. Before upgrading, re-check Megatron **checkpoint** recovery and **rollout** staleness behavior.

- [Sync] **vLLM** patch stack, PD/Mooncake, and serving/runtime rework by *aoshen02 (Inferact)* [6845501](https://github.com/vllm-project/vime/commit/6845501aed4be6497213292dbebb16ceb5565954)

    The `docker/patch/latest` stack drops the Rust frontend patches and adds C++20 FA2, DeepGEMM BF16 rejection, router PD registration, and unified PD metrics and **tracing**. It also changes the vLLM serving, runtime, **disaggregation**, Mooncake and **fully async rollout** paths. Rebuild Docker images and re-check serving configuration. The commit message says full CI, ARM and the paired PD quality experiment were still pending or failing at sync time.

- [Sync] **ROCm** Dockerfile and CI changes by *aoshen02 (Inferact)* [6845501](https://github.com/vllm-project/vime/commit/6845501aed4be6497213292dbebb16ceb5565954)

    `docker/Dockerfile.rocm` changed and `docker/amd_patch/latest/vllm-inflight-queue-diagnostics.patch` was removed, so **AMD** image builds should be re-validated. CI adds Mooncake RDMA tests and lets you select exact tests through `VIME_CI_TESTS`.

### 🟡 Medium Priority

- Pin the **ROCm** base image by digest and apply the shared **vLLM** patches in the ROCm Dockerfile by *Jinn (RLsys-Foundation)* [720d223](https://github.com/vllm-project/vime/commit/720d223ad79b47ed233ce4a74d9cb952db9ec1c2)

    `Dockerfile.rocm` now uses a ROCm 10 nightly pinned by digest, at the same vLLM commit as `docker/Dockerfile`, instead of the floating `nightly` tag. It applies the ten shared `docker/patch/latest/` patches with strict `git apply`, and the fuzz-applied **AMD** patch copies are deleted. This should fix the broken ROCm build and gives gfx950 (MI350X/MI355X) users a reproducible image. Anyone who bumps the shared patches or `VLLM_COMMIT` must now keep `BASE_IMAGE` compatible. The commit message says ROCm 10 is needed because on ROCm 7.2 a `torch_memory_saver` pause frees no VRAM.

- Follow-up bundle: MemAgent parent-rollout grouping fix, vLLM engine contract tightening, `straw-queue==0.1.6` pin by *aoshen02 (Inferact)* [7a9a81e](https://github.com/vllm-project/vime/commit/7a9a81ea9829eac96e8f0d3b2c2758cf39fcff4f)

    MemAgent `custom_convert` no longer trims expanded samples to `global_batch_size`. It now aggregates loss-mask denominators per parent **rollout**, which changes training-loss consistency for MemAgent users. `VLLMEngine.check_weights` now raises `NotImplementedError`. External **vLLM** setups should confirm they expose the `reload_weights` and `pull_weights` RPCs over `/collective_rpc`. `straw-queue` is pinned to `==0.1.6` in the Docker image and in CI. The release preflight now checks Docker patch coverage and requires an immutable base-image digest.

### 🟢 Low Priority

None

## Newly Submitted Issues

- [#509](https://github.com/vllm-project/vime/issues/509) (open): **[Bug][Training]** A user reports that in colocated runs (`--colocate`), online **DSpark** draft training never changes the draft. `Actor.update_weights()` swaps each draft parameter's storage, which detaches it from the distributed-optimizer buffer, so the optimizer steps but the draft keeps its pretrained values. The loss curve does not reveal this. The reporter shows 0 changed elements per step on GH200/Qwen3-4B. A proposed fix exists in #484, which targets another branch and is not on `main`. Maintainers have not confirmed the bug.
- [#508](https://github.com/vllm-project/vime/issues/508) (open): **[Perf]** A user proposes defaulting `--vllm-watermark` to 0.05 for rollouts. Under KV-cache pressure, hybrid models such as Qwen3.5 and Qwen3-Next repeatedly re-preempt requests. The reporter measured up to 17% faster GRPO rollout steps and about 10× fewer preemptions on Qwen3.5-4B. These are single-run, user-reported numbers. The shipped recipes are said to be unaffected unless the batch is scaled up.
- [#515](https://github.com/vllm-project/vime/issues/515) (open): **[RFC]** A plan for DeepSeek-V4.1-Flash RL and SFT on **AMD** MI355X (gfx950):
    - Fix the **ROCm** image. The described image fix appears to match merged commit 720d223.
    - Make train offload work on ROCm 10 (`torch_memory_saver` pin, `NCCL_CUMEM_ENABLE=1`).
    - Work around a ROCr/KFD IPC defect that stalls colocated **weight sync** with TP1 engines (#516).
    - Port DSv4.1, starting in disaggregated mode.

    It also reports several ROCm problems on `main`: a build failure at `7a9a81e` before the pin, the `gsm8k_async` CI step pointing to a removed file, and NIXL being imported as `nixl_rocm`.

## Stats
- **Total Commits**: 3
- **Analyzed Commits**: 3
- **Active Contributors**: 2
- **Files Changed**: 303 (unique paths across the window; renames counted once)
- **Training-Specific Commits**: 1 (33.3% of total)
- **New Issues**: 3 (3 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
