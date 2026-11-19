# miles Weekly Digest - 2026-11-19

## Summary
This week shipped several deployment-breaking changes. The dashboard became a separate `miles-dashboard` package configured with `MILES_DASHBOARD*` env vars, and new **SGLang** rollout features (flat base64 sampling masks, PP-aware output-store replay reads) need matching SGLang and **router** builds. New training features include opt-in BF16 stochastic rounding, a `fused_lm_head` log-prob backend, MXFP4 QAT for DeepSeek-V4-Flash and TPU **torchtitan** training for Qwen3.5-family models. Users also reported, in new open issues that are not yet confirmed regressions, that colocated **PPO** saves an all-zero actor **checkpoint** and that `--save-hf` on Qwen3.5 writes an incomplete export.

Source: [radixark/miles](https://github.com/radixark/miles), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-12T23:11:02Z through 2026-11-19T23:11:02Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- Move the **dashboard** from `miles/dashboard` into a separately installed `packages/miles-dashboard` package (`miles_dashboard`) by *Tao Lin (RadixArk)* [5e4f7b8](https://github.com/radixark/miles/commit/5e4f7b85a9cd56091df252987d81c7c16b9724a7)

    Breaking change: the import path is now `miles_dashboard.*` and the viewer is `python -m miles_dashboard.serve`. The dashboard is no longer in the `miles` wheel, so you need `pip install -e packages/miles-dashboard`. The Dockerfiles (CUDA, cu12, **ROCm**, Rubin, TPU) install it conditionally, so AMD images keep the dashboard. Custom environments, wheel installs and dump-viewing login nodes must add the install step.

- Move the built-in dashboard onto the run observer interface and replace the `--use-miles-dashboard` CLI flags with `MILES_DASHBOARD*` environment variables by *Tao Lin (RadixArk)* [f5cdf15](https://github.com/radixark/miles/commit/f5cdf1574c33810a3013d486825e362cbe48129f)

    Breaking configuration change: `--use-miles-dashboard`, `--miles-dashboard-workspace`, `--dashboard-gpu-sample-interval`, `--dashboard-sglang-scrape-mode` and `--dashboard-forward-prometheus` were removed, and runs that still pass them fail argument parsing. Set `MILES_DASHBOARD=1` plus `MILES_DASHBOARD_*` via `extra_env_vars` instead. With the dashboard on, startup fails unless `--dump-details` is set, and it also fails under `--cluster-backend kubernetes`. `report_sandbox` moved to `miles.rollout.agentic.sandbox_reporter`.

- Request sampling masks and top-k candidates as flat base64 arrays in rollout, and reject nested rows by *Nan Jiang* [c38b9e8](https://github.com/radixark/miles/commit/c38b9e8dafcaead456bf27f31c8c9c215c1e52cc)

    A **performance** change to the **SGLang** **rollout** transport, and also deployment-breaking: Miles now rejects nested rows. You need an SGLang build with PR #50126 and a **router** that forwards the new fields (sgl-router-for-miles #32). The Miles router already forwards raw bodies, but the native SGLang router needs the update. The output-store path is unaffected.

- Read only this pipeline stage's replay layers (routed experts, indexer top-k) from the output store under Megatron PP by *Jiajun Li (RadixArk)* [206e4eb](https://github.com/radixark/miles/commit/206e4ebc12ba0da141a6abe0ea8fa06e6087de20)

    Cuts output-store (Mooncake) read volume for **R3** and indexer replay under pipeline parallelism. It requires SGLang with sgl-project/sglang#48123 and a router that forwards `return_outputs_via_store` and `replay_layer_splits`, and runs fail otherwise. The `register_replay_list_*` and `attach_replay_data` signatures changed (new `blocks` argument). Custom `--pipeline-model-parallel-layout` setups still over-read.

- Read output-store routing replay rows per micro batch instead of materializing whole columns by *Jiajun Li (RadixArk)* [d44f60c](https://github.com/radixark/miles/commit/d44f60c5a239e270d9370285d3e9fcc99891ce8a)

    Lower memory and read cost for **Megatron** and torch-native MoE routing replay, including the **MultiLoRA** actor. `output_store_read` is replaced by an `OutputStore` client across actor and rollout-data APIs. Startup now fails if `radix_transfer_plugins` lacks `OutputStore.read_slot`, so older SGLang images must be rebuilt.

- Add opt-in BF16 stochastic rounding of FP32 master weights for Megatron training by *Ziang Li (University of Michigan)* [47d67e2](https://github.com/radixark/miles/commit/47d67e2d18f0f5a4ece66e2f989717dd76b3de75)

    `OPEN_TRAINING_BF16_STOCHASTIC_ROUNDING_FLAG=1` turns on a Triton Philox kernel that addresses "weight sticking", where small RL updates are lost under round-to-nearest. It works for `--bf16` runs with the distributed optimizer, on GPU or with `--optimizer-cpu-offload`, and it stays deterministic across rematerialization and **checkpoint** resume. With the flag on, startup rejects `--use-precision-aware-optimizer` unless `--optimizer-cpu-offload` is also set.

- Add `--log-probs-backend fused_lm_head` to compute log-probs and entropy without materializing full logits by *Omri Manor (AI21 Labs)* [cbea8cb](https://github.com/radixark/miles/commit/cbea8cb01eefc276aa646ad917335074304a26ce)

    Projects through the vocab-parallel output layer one tile at a time under activation checkpointing. This should cut peak memory for large-vocab **Megatron** RL. It applies to the actor only, needs a `GPTModel`-style forward (`HybridModel` fails early) and does not support combined 1f1b. Internally, `model` was renamed to `model_chunks` in `forward_only`/`run_forward_backward_pass`. Verify numerical parity before relying on it.

- Add MXFP4 routed-expert rollout and optional MXFP4 QAT for DeepSeek-V4-Flash by *Bo Li* [5bb9786](https://github.com/radixark/miles/commit/5bb97866d417533d54ddd9efe34e77872d1b25ce)

    New `mxfp8-mxfp4-routed-expert` precision mode plus the `--routed-expert-qat mxfp4`, `--init-model-source hf` and `--rollout-weight-source trainer` flags. RL can start from the official HF checkpoint, and the trainer forward matches the W4A8 **SGLang** rollout. This feature is experimental and Blackwell-only. It needs Megatron-Bridge and fp32 master weights, and it does not support Megatron FSDP or CUDA graphs. `scripts/run_deepseek_v4.py` now sets `SGLANG_DSV4_FP4_EXPERTS=1` for MXFP4 rollout.

- Fix score-centering empty CP ranks to return fp32/fp64 log-prob dtype, matching non-empty ranks, by *Xiuyu Li (UC Berkeley)* [55766eb](https://github.com/radixark/miles/commit/55766eb710afe0dec5c48e71bc30931cbef01849)

    Fixes a training hang. Under all-gather CP with bf16/fp16 logits, a dtype mismatch on empty ranks made the all-reduce fail on Gloo or hang on NCCL. This affects long-running training that uses score centering with context parallelism.

- Enforce per-family continuation roles in the session server and split the TITO verifier into spec and normal rollouts by *Jiajun Li (RadixArk)* [af4d5fa](https://github.com/radixark/miles/commit/af4d5fa4c962e11681dc201b8c36c5a35e724186)

    Behavior change for **agent** harnesses. The v1 and v2 session servers now return HTTP 400 when the role appended after an assistant turn isn't allowed for the model family. For example, DeepSeek-V4 accepts only `tool` after a tool call, and MiniMax/DeepSeek-V3.2 reject `tool` after a plain reply. New model families need a `test_continuation_roles.py` entry or CI fails.

- Add TPU torchtitan training for Qwen3.5/3.6/3.8 with a new launcher, a gated-delta-rule kernel, and TPU CI by *HEJIAN SANG* [ef40c95](https://github.com/radixark/miles/commit/ef40c95ca9d5cdd22ddc75bca0ffa431a27eafaa)

    Adds `scripts/tpu/run_qwen3_5_torchtitan.py` (Qwen3.5-4B/27B, Qwen3.6-35B-A3B, Qwen3.8-27B), a TPU `gated_delta_rule` kernel and nightly TPU CI. The SGLang TPU pin and jax/jaxlib versions changed, which affects anyone rebuilding the TPU image. `--multimodal-keys` is now rejected on platforms that cannot train encoders.

- Enable Ulysses context parallelism around the TPU flash attention in the **torchtitan** backend by *HEJIAN SANG* [244a229](https://github.com/radixark/miles/commit/244a22978244d81d2bfa05cae22b94b843b2dec2)

    Lifts the TPU `--context-parallel-size 1` restriction, enabling long-sequence RL on TPU. `--seq-length` must now be divisible by the CP size, and the head count by TP×CP. Expert parallelism remains unsupported on TPU. A test checks outputs and gradients are bitwise equal to single-rank attention.

### 🟡 Medium Priority

**Routing replay (R3) and output store**

- Fill rollout/routing replay entries on a background worker thread, ahead of the forward passes, by *Jiajun Li (RadixArk)* [673708c](https://github.com/radixark/miles/commit/673708ca7bccbd5903ee44dc45287825db1eeedd)

    Overlaps replay reads with compute for **Megatron** and **torchtitan**, a **performance** and host-memory gain. Fill errors surface at the first pop that needs them. Watch the new `replay_wait`/`replay_fill` timers.

- Replay now reads only each trainer rank's own CP rows from the **output store** by *Jiajun Li (RadixArk)* [8487f9f](https://github.com/radixark/miles/commit/8487f9f04a50ebcdd08fbcd0fadb8bdbe201a762)

    Cuts store read traffic by about `cp_size`. `--save-debug-train-data` dumps now hold per-rank local, padded rows, so compare dumps per CP rank.

- Refactor rollout (R3) replay to fill one micro batch at a time via the replay manager, renaming `fill` to `attach` by *Jiajun Li (RadixArk)* [2522c78](https://github.com/radixark/miles/commit/2522c785ccc8755a1fd8e5ebf84d38316f1d6344)

    `fill_replay_data` is now `attach_replay_data`, and out-of-tree callers of `routing_replay.fill`/`fill_replay_data` must migrate. Adds a `replay_fill` timer.

- Refactor Megatron **R3** routing replay to number replays by MoE layer, assigning each router's `stream_idx` once after model build by *Jiajun Li (RadixArk)* [5395993](https://github.com/radixark/miles/commit/5395993e9a10872c585b66712bbc37b971901cf7)

    Raises `ValueError` if the registered router count doesn't match `moe_layer_freq`, and drops the `models` argument from `attach_replay_data`. Users with PP/VPP or mixed dense/MoE layouts should verify the layer mapping.

- Refactor context-parallel slicing into a shared `CPLayout` used by token and MoE replay (R3) paths by *Jiajun Li (RadixArk)* [22bd973](https://github.com/radixark/miles/commit/22bd973356fbed8fca93c2259ea8dae1651f7946)

    Intended to preserve behavior for zigzag and allgather CP (bshd/thd), and it removes a memory copy. Long-context CP users should confirm their numerics are unchanged.

**Checkpointing**

- Add checkpoint decay (`--keep-recent-checkpoints`, `--keep-checkpoint-every`) to prune old Megatron checkpoints by *andreas-inherent (Inherent Laboratories)* [061ee78](https://github.com/radixark/miles/commit/061ee783b4488e813ec2930c064c7442ee58a416)

    Opt-in, destructive **checkpoint** retention that limits disk growth in long runs. Sentinel saves are pinned with `.keep`. It is Megatron-only and not compatible with `--use-critic`, `--megatron-config` or multi-policy.

- Reject `--save-retain-interval` when **checkpoint** decay (`--keep-recent-checkpoints`) is enabled by *Jiajun Li (RadixArk)* [7767e15](https://github.com/radixark/miles/commit/7767e158bcb743b47a7db0b0674abebacc02e82a)

    Configs that combine the two flags now fail at startup. Before this check, they could silently lose checkpoints.

**Rollout, agents and TITO**

- Add `random` mode to `--async-data-buffer-selection` so fully-async rollout can take a random subset of buffered groups by *Nan Jiang* [326b2a1](https://github.com/radixark/miles/commit/326b2a1d615668eb087648ba72f878da60a9a571)

    Changes which groups a step sees, which affects policy staleness in **async** rollout. The default `fifo` is unchanged, and `random` is seeded by `--rollout-seed`.

- Add optional agent `preflight` hook that runs once at startup, before the engine wait, and fails the run early on a broken setup by *Tao Lin (RadixArk)* [40a81e7](https://github.com/radixark/miles/commit/40a81e7a515f9e4647335cd22c74cac639bda250)

    Before this hook, a broken **agent** setup made rollout drop and refill samples without end. Harbor implements the hook, and it is optional for other agent functions.

- Let in-process Harbor trials on AgentENV build task Dockerfiles that copy files, adding an `aenv` preflight and a shared `PROVIDER_ALIASES` registry by *Tao Lin (RadixArk)* [7ae844a](https://github.com/radixark/miles/commit/7ae844a4783c48155c8c0d5a8638ab22ab6bc1e7)

    `HARBOR_ENV_TYPE=agentenv` now supports `COPY`/`ADD` and multi-`FROM` Dockerfiles. Install `aenv` ≥ 0.2.3 on every worker.

- Stop idle executor workers from keeping the agentic subprocess alive after an agent call by *Nan Jiang* [d4caa29](https://github.com/radixark/miles/commit/d4caa29e58f99b947e48a5838e329320e9c94162)

    Prevents agent child processes from piling up in long-running agentic **rollout** jobs.

- Render DeepSeek-V4 appended turns from the last assistant turn to cut **TITO** tokenization cost by *Jiajun Li (RadixArk)* [8a2aa0b](https://github.com/radixark/miles/commit/8a2aa0b3cbaec01922e18071ab4a66ab5b403b3d)

    Tokenization cost now scales with the appended messages, not the whole conversation. This is a **performance** gain for long multi-turn sessions, with tokens meant to stay identical.

- Accept appended system messages in the **TITO** tokenizer for DeepSeek-V4.1 by *Jiajun Li (RadixArk)* [b55c2a5](https://github.com/radixark/miles/commit/b55c2a533f33ec126df145bf4760ce113dd9304b)

    Supports mid-conversation system prompts with `deepseekv41`. V4 still rejects them.

**Observability**

- Add a run-observer plugin interface that reports train tokens, rollout samples, engine topology and data buffer length by *Tao Lin (RadixArk)* [5a16ade](https://github.com/radixark/miles/commit/5a16adecfd42a79c5d86d6d45fdbf8d1d6d864d9)

    External packages can watch runs without patching the trainer, and engine topology is re-reported after **fault tolerance** recovery. It is a no-op without observers, but per-token reporting adds CPU copy overhead when one is active.

**Model conversion and weight sync**

- Fix mbridge MTP layer mapping for DSA (DeepSeek-V3.2/GLM-MoE-DSA) models so it lands after the last decoder layer by *Nan Jiang* [95b555a](https://github.com/radixark/miles/commit/95b555a8e2b0c86e826845fe0688f8c63d5780bd)

    Before this fix, MTP weights could be mis-mapped during HF↔Megatron conversion and weight sync. Only one MTP layer is supported.

- torchtitan weight sync now sends grouped HF experts (Qwen3.5-MoE) as per-expert tensors by *HEJIAN SANG* [ee05e8b](https://github.com/radixark/miles/commit/ee05e8b92c741c53de3b523a753eb05f12517cf0)

    Keeps MoE weights consistent between the **torchtitan** trainer and **SGLang**. It assumes EP = 1 and asserts on unsupported layouts.

- Fix `convert_hf_to_fp8.py` so all-zero blocks keep finite, positive FP8 scales by *Nan Jiang* [764bdb2](https://github.com/radixark/miles/commit/764bdb287d3411af0702130cdde7cb12e07efe86)

    Prevents NaN/inf scales for zero or padded blocks, and fixes fp16 underflow in the channel and tensor strategies.

- Fix `convert_hf_to_nvfp4.py` so it quantizes DeepSeek-native checkpoints (adds bare `layers` prefix) by *Nan Jiang* [c32fa57](https://github.com/radixark/miles/commit/c32fa57f6759e6850b9004298e964a3991c63da7)

    Before this fix, **NVFP4** conversion skipped every layer in DeepSeek-native checkpoints.

**TPU / torchtitan**

- Add compiled `RowLogProb` op for TPU padded-row log-prob scoring that avoids saving the fp32 softmax by *HEJIAN SANG* [c05bd92](https://github.com/radixark/miles/commit/c05bd929035c04a50285593ac32a2e2652da59ec)

    Saves about 8 GB for 8192 rows × 248K vocab. It is used when `--entropy-coef` is 0 and TP is 1, and log-probs differ from the torch scorer by about 1e-6.

- TPU torchtitan trainer pads every microbatch to `--seq-length`, replacing power-of-two length buckets by *HEJIAN SANG* [cb89016](https://github.com/radixark/miles/commit/cb89016704b9e24d6eba0b52ac0487ac80823ee9)

    Each pass compiles a single program, which shortens warmup but adds padded compute for small microbatches. The GPU path is unchanged.

- Enable `--save-debug-train-data` for the torchtitan backend by moving the dump into the shared torch-native loop by *HEJIAN SANG* [e338921](https://github.com/radixark/miles/commit/e338921546f6f91356fc034ed15896d0ae8c72ce)

    FSDP and **torchtitan** now share one dump path, and only one CP rank writes in torchtitan.

- Patch torchtitan in the TPU docker image so CPU-offloaded weight init runs with DTensor's RNG tracker off, fixing an init hang, by *HEJIAN SANG* [02f9920](https://github.com/radixark/miles/commit/02f9920cfd032ca0c2383ce77e2f791df71d9b5a)

    Backports pytorch/torchtitan#6161. Fixes a `trunc_normal_` hang seen with Qwen3.8-27B and the host optimizer. The patch applies only to the TPU image.

- TPU: move the final norm out of torchtitan's vocab-sized FSDP unit in the TPU patch by *HEJIAN SANG* [80e2407](https://github.com/radixark/miles/commit/80e240773bd474088ee75b6392da6feb60119e38)

    The commit message reports that Qwen3-4B cold compile time on TPU dropped from about 33 minutes to about 6.

- Install torch_tpu with a `_chunk_cat.out` kernel in the TPU Docker image by *HEJIAN SANG* [99b7374](https://github.com/radixark/miles/commit/99b73743c73ecb8822368f17881b9ca8aeb7c336)

    Avoids about 100 s of compile per vocab-sized unit on the first **FSDP2** backward on TPU. The image now depends on a new `miles-wheels` asset.

**Build, release and ROCm CI**

- Publish the miles wheel to the GitHub release on every release tag, with a sglang-miles wheel version resolver and CI smoke tests by *HEJIAN SANG* [6e4c4a1](https://github.com/radixark/miles/commit/6e4c4a185eab5aa8023810c06e5602b5502ca71b)

    Release and installation packaging change. The resolver only scans the 100 newest wheel releases.

- Align ROCm PR CI with CUDA: shared dependency-ref resolver, 2/4/8-GPU MI350 stages, per-file ROCm test planning by *Xinyu Jiang (CMU)* [99fee65](https://github.com/radixark/miles/commit/99fee653c8ba0c69535b340dc977c160b9e1f4f1)

    **ROCm**/**AMD** MI350/MI355X PRs now get the same test coverage as CUDA. Contributors must move ROCm test registrations to the `stage-c-<N>-gpu-mi350` suites, and maintainers must provision the renamed `AMD_*` secrets.

- Restore ROCm PR CI image builds and unify Docker image input hashing across CUDA, TPU and ROCm by *Jiajun Li (RadixArk)* [11fd95f](https://github.com/radixark/miles/commit/11fd95f74964d984824a2dff24c7cce8b2e18790)

    `docker/image_inputs.py` is now the single source of truth for which images need rebuilding. ROCm PRs that change image inputs get their own `pr-<n>-rocm10-mi35x` image.

- Bump Mooncake to 0.3.13 in the ROCm image and raise the e2e output-store segment size for fully-async runs by *Kevin Mi* [fa13e2e](https://github.com/radixark/miles/commit/fa13e2ec42622f6e77aabd8e0c295ab8b4347eac)

    **ROCm** users on the Mooncake/output-store path should rebuild their images. Fully-**async** runs may need more than the 2 GiB default segment size.

- Authenticate Dockerfile GitHub API release lookups via a BuildKit secret to avoid rate-limit 403s by *Zhichen Zeng (RadixArk)* [f60d744](https://github.com/radixark/miles/commit/f60d74465aa492aa2edf6fa38f9b09de32569d95)

    More reliable image builds. HTTP errors now fail the build instead of being silently ignored.

- Patch scanner-flagged packages in the Docker image and bump kubectl and helm by *Han Yu* [e55513f](https://github.com/radixark/miles/commit/e55513f6390c3d5d5045355398e255c467b9201f)

    Should clear HIGH/CRITICAL Trivy/Xray findings for security-gated clusters. Findings in pinned SGLang and Ray files remain.

### 🟢 Low Priority

- CI image pipeline updates by *Jiajun Li (RadixArk)*: build the PR CI image whenever its inputs change [010a85c](https://github.com/radixark/miles/commit/010a85cd9c4470969335fae410c822cbc000bed7); per-architecture (amd64/arm64) PR image builds [15b3274](https://github.com/radixark/miles/commit/15b32740408a28e28fca42cc55910aec714606c6); a persistent `rebuild-ci-image` label [28dac25](https://github.com/radixark/miles/commit/28dac25ff4ab798ccae836e24cf86a15965d0c2e); earliest-run-only fork image publishing via pinned skopeo [4102f39](https://github.com/radixark/miles/commit/4102f3904b4a52865000f339414dcdda0ea903a5); ignoring cancelled runs in the supersession check [b054e3f](https://github.com/radixark/miles/commit/b054e3fd2a4a6142754a3e925d772d00ae2384e5); and replacing `gh` CLI calls with direct API requests [f3a198f](https://github.com/radixark/miles/commit/f3a198f5d490f9fd1971f14b231acfcf1e793f58)

    These are CI-only changes with no runtime impact. The PR image build is now more reliable for fork and self-hosted builders, and contributors who touch `docker/` get earlier build feedback.

- Keep inline R3 and indexer replay e2e coverage at CP>1, PP>1 and GLM-5 indexer top-k by *Jiajun Li (RadixArk)* [db67977](https://github.com/radixark/miles/commit/db679771fdaf68bfdfe06bc599fda9b870c50131)

    Test-only. Keeps CI coverage of both **R3** replay transports (inline and output store) at CP>1 and PP>1.

- Fix CI so torchtitan LoRA checkpoint tests actually run, not just import, by *HEJIAN SANG* [a5207af](https://github.com/radixark/miles/commit/a5207af398f8bb32ea9aa6cf1967b9f011113d5a), plus updated test fakes [e81bc84](https://github.com/radixark/miles/commit/e81bc840ed646e1a60e2089d7f11c8243890b04f)

    Test-only. Restores regression coverage for **torchtitan** **LoRA** checkpointing.

- Document running the NeMo Gym recipe on E2B sandboxes, with updated setup steps by *Maksim Obukhov (Sudolabs)* [e91123b](https://github.com/radixark/miles/commit/e91123bd44f3de86cb65f279d4acf8a917f642fd)

    Docs and examples only. Adds E2B as a validated sandbox provider for the experimental NeMo Gym **agent** workflow.

## Newly Submitted Issues

- [#4863](https://github.com/radixark/miles/issues/4863) (open): User report that colocated **PPO** (`--colocate`, which enables `--offload-train`) silently saves an all-zero actor **checkpoint**, and the `--save-hf` export is zero too, while the save still reports success. The reporter reproduced it on v0.2.0 and v0.1.3 with the stock Qwen3-4B PPO example and says the code path is unchanged on `main`. Exported actor models from affected runs would be unusable. The reporter proposes restoring the actor from its host backup before saving.
- [#4966](https://github.com/radixark/miles/issues/4966) (open): User report that `--save-hf` on Qwen3.5 writes only 320 of the checkpoint's 632 tensors, missing the vision tower and MTP layer. The directory still gets the full `config.json` and a `.complete` marker, so loading it in transformers, vLLM or the Hub would give random weights for the missing parts. The reporter asks for either a complete export or clear documentation and tooling.
- [#4967](https://github.com/radixark/miles/issues/4967) (open): User report that `--fully-async --pause-generation-mode in_place` with a bare `--use-session-server` (v1) fails argument validation at startup. The cause is that the auto-enabled `--namespaced-radix-cache` requires session server v2. The shipped async agentic example uses exactly this combination. The workaround is `--no-namespaced-radix-cache`. The reporter also notes that `--get-mismatch-metrics` requires an undocumented `--custom-tis-function-path`.
- [#4922](https://github.com/radixark/miles/issues/4922) (open): User report that on the **multi-LoRA** Tinker trainer, a CUDA OOM in a single request kills the whole trainer cell and loses every other adapter. With DP > 1, the client waits out a 120 s timeout. The reporter proposes catching OOM per request and coordinating it across DP ranks.
- [#4924](https://github.com/radixark/miles/issues/4924) (open): Request to support Nemotron 3.5 Super VL checkpoints (`NemotronH_Omni_Reasoning_V3`) in bridge mode. These checkpoints are currently rejected by `AutoBridge`, and the reporter proposes a language-model-only bridge plugin. The reporter also notes an SGLang Mamba prefix-cache setting that otherwise gives wrong multi-turn logprobs.
- [#4925](https://github.com/radixark/miles/issues/4925) (open): Maintainer tracking issue to re-enable the disabled Inkling **TITO** session-verifier GPU lane. The suspected cause is special-token mismatches on replies with several tool calls, which has not been reproduced yet. Until the lane is re-enabled, Inkling has no GPU session-verifier coverage.
- [#4914](https://github.com/radixark/miles/issues/4914) (open): RFC to add Monarch as a `--cluster-backend monarch` option, including single-node runs and multi-node runs on SLURM. It would refactor the Ray-specific worker-manager layer into backend-neutral interfaces. Implementation is in draft PRs #4904–#4913, which are not merged.
- [#4952](https://github.com/radixark/miles/issues/4952) (open): Feature plan for end-to-end 4-bit MoE training: NVFP4 forward, MXFP8 stochastic-rounding backward and quantized EP communication, starting with Inkling 2 Small. It is phased across miles, TransformerEngine and Megatron.
- [#4959](https://github.com/radixark/miles/issues/4959) (open): RFC for an opt-in ModelExpress integration for Megatron→SGLang weight sync. It proposes object-storage XOR-delta sync for cross-region deployments and direct NIXL full-weight sync.

## Stats
- **Total Commits**: 52
- **Analyzed Commits**: 52
- **Active Contributors**: 14
- **Files Changed**: 568
- **Training-Specific Commits**: 20 (38.5% of total)
- **New Issues**: 9 (9 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
