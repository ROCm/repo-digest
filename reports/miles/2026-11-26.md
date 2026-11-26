# miles Weekly Digest - 2026-11-26

## Summary
Several training-correctness fixes landed this week. Bridge-built **Megatron** models now get the full **FP8**/**FP4** precision recipe, GLM-5 DSA indexer parameters are frozen (old checkpoints need `--no-load-optim`), and resumed **LoRA** runs keep their weight version. New features include multi-node pipeline-parallel **SGLang** rollout engines, TPU true on-policy **torchtitan** training, routed-expert **LoRA** for Qwen3.5/3.6 **MoE**, a BPO loss example, and continuation of **agent** turns cut by `finish_reason=length` (on by default). Among the newly submitted issues, a user reported a GLM-5.3 KDA int32 overflow in the pinned `flash-linear-attention` 0.5.2 at 87,382+ tokens, and another user proposed an RFC for FSDP trie packing.

Source: [radixark/miles](https://github.com/radixark/miles), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-19T23:11:08Z through 2026-11-26T23:11:08Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

- Pass the full low-precision recipe (FP8/FP4, BF16 layer overrides, TE precision config file) to bridge-built Megatron models by *HEJIAN SANG* [a2e81a3](https://github.com/radixark/miles/commit/a2e81a39f949eec06969e448ec020143896df6dc)

    Fixes a numerics correctness bug. Bridge-built models, including **LoRA** models built through the bridge, previously received only `fp8` and `fp8_recipe`. Other precision flags stayed at provider defaults and silently trained in BF16. A new `apply_precision_args` helper now applies `fp8_param_gather`/`fp4_param_gather`, the quantizer factories, the `first_last_layers_bf16` and `num_layers_at_*_in_bf16` overrides, and `quant_recipe` from `--te-precision-config-file`. **Megatron** runs that use **NVFP4**/**MXFP8**-style recipes through the bridge should expect different numerics and memory behavior than before.

- Freeze Miles DSA indexer parameters in GLM-5 so DDP and weight decay skip them by *Alexander Zhipa* [b17bd2b](https://github.com/radixark/miles/commit/b17bd2b329a7c2b7559ab2c0add87419b2f28e6d)

    Fixes a training correctness problem with `--dsa-impl miles`. Weight decay was shrinking the gradient-free indexer weights every step, which drifted the top-k selection that the **SGLang** rollout engine serves. **Checkpoint** compatibility changes: resuming from a pre-change checkpoint with optimizer state fails on distributed-optimizer bucket sizes, so use `--no-load-optim`. Converted HF checkpoints, `release` checkpoints and **LoRA** runs are unaffected.

- Resumed **LoRA** runs now continue the weight version saved in the adapter checkpoint by *Nan Jiang* [1cc3d62](https://github.com/radixark/miles/commit/1cc3d62ec7cee704c7c87c0cc2552a7460881b90)

    Adapter-only **checkpoint** saves now record `weight_version`, and `restore_single_lora` restores it. Before this, resumed **Megatron** LoRA runs restarted the version counter, which could break policy consistency between **rollout** and training in long-running **async** jobs. Older adapter dirs and torchtitan dirs keep the version that `--load` restored.

- Make pipeline-parallel SGLang rollout engines work: add `--sglang-pp-layer-partition`, derive TP as GPUs/`pp_size`, and scale health timeouts per stage by *Asaf Gardin* [2e724d9](https://github.com/radixark/miles/commit/2e724d993aadc6afcb72cb16ff3b2ad239594ba4)

    **SGLang** rollout engines can now span multiple nodes with one pipeline stage per node. **Breaking:** `--rollout-num-gpus-per-engine` now means TP × PP GPUs, so existing scripts that set `--sglang-pp-size` will get a different TP. Health-check budgets now scale with `pp_size` for launched and external engines (**rollout**, **router**, **Ray** cells), which avoids false unhealthy marks on cold start. Megatron pipeline layout, including the **LoRA** bridge, now goes through a shared `apply_pipeline_layout` helper.

- Add TPU true on-policy training for Qwen3 and dense Qwen3.5-family models on the torchtitan backend by *HEJIAN SANG* [70a07ef](https://github.com/radixark/miles/commit/70a07ef75efe7de4504a145b5d9df29135512ee5)

    With `--true-on-policy-mode` on TPU, the **torchtitan** trainer uses sglang-torchtpu batch-invariant ops so trainer log-probs match the **SGLang** rollout bit for bit. That removes the train/rollout mismatch that **TIS**-style corrections otherwise handle. The mode has strict constraints: TP/CP/PP all 1, one GPU per engine, no **LoRA**, dense models only, plain temperature sampling, `entropy_coef` 0, and at most 128 packed sequences per microbatch. Startup validation rejects unsupported configurations.

- Add native shared-outer routed-expert **LoRA** for Qwen3.5/3.6 **MoE** in the **Megatron** raw mode by *Nan Jiang* [ceae9c5](https://github.com/radixark/miles/commit/ceae9c5f3f901e2f03af3ad23187f78b132aac19)

    Under `--megatron-to-hf-mode raw`, routed-expert adapters (`experts.gate_up_proj`/`down_proj`) can now be trained via `PackedGroupedExpertsSpec`. This requires `--experts-shared-outer-loras` and `--expert-tensor-parallel-size 1`. The new startup assertions require gate/up and down to be targeted together, because **SGLang** otherwise ignores the expert weights, and they may reject target sets that previously started.

- Add Bellman Policy Optimization (BPO) custom loss example and a `pg_loss_fn` hook in `policy_loss_function` by *wl45361* [0c55a4a](https://github.com/radixark/miles/commit/0c55a4af17a80376df0475bbf9534ef3aec77b3c)

    An experimental BPO plugin (`--loss-type custom_loss`, `--bpo-smoothing`, `--bpo-weight-cap`) runs on top of **GRPO**. It replaces PPO's clipped ratio with a stop-gradient complementary-probability weight. Core `policy_loss_function` gains an optional `pg_loss_fn` hook, and entropy, KL, OPSM and **TIS** still apply with it. OPSM masking now uses `torch.where`. On **Megatron**, `custom_loss` uses `fp32_output=True`, so full logits take about 2× the memory.

- Continue agentic session turns cut by `finish_reason=length` by closing open reasoning and tool-call blocks (new `--allow-truncated-continuation` flag) by *Jiajun Li (RadixArk)* [350ab20](https://github.com/radixark/miles/commit/350ab2015da3c48b1e7464726ff280f95c5fc1e9)

    The v1 and v2 **SGLang** session servers now extend a length-truncated turn instead of ending the trajectory. They append closer tokens with loss mask 0, which changes **rollout** sample structure and **agent** trajectory length. The flag is **on by default** for families that declare a closer, so existing runs change behavior on upgrade. Use `--no-allow-truncated-continuation` to keep the old HTTP 409 behavior. The `tito_session_mismatch` check now compares the closed form.

- Continue Muse Spark turns cut by `finish_reason=length` in the session server, and reject client-supplied server-only message keys by *Jiajun Li (RadixArk)* [0685f4b](https://github.com/radixark/miles/commit/0685f4b3b346000095699823aa11d8bbda010434)

    `muse_spark` truncated turns are now extended with loss-masked closer tokens and stored under a server-only `truncated_turn` key. Previously these requests returned HTTP 409. **Behavior change for agent clients:** messages that carry server-only keys (`truncated_turn`, Inkling `content_blocks`, DeepSeek-V4 `content_leading_whitespace`) now get HTTP 400 and leave the session unchanged.

### 🟡 Medium Priority

- Add **TITO** truncation closing for assistant turns cut by `finish_reason=length` across model families by *Jiajun Li (RadixArk)* [36c4ce8](https://github.com/radixark/miles/commit/36c4ce88a53c46d8e8863b0fb25359c8dfa97fcc)

    Adds `close_truncated_turn`/`check_turn_structure` and per-family `TruncationGrammar` definitions for DeepSeek, GLM, Kimi, MiniMax, Qwen3.5 and Nemotron3. Open `<think>` and tool-call blocks are closed correctly, so multi-turn **agent** **rollout** sessions keep token-level consistency. This is the foundation for the high-priority continuation changes above.

- Continue Inkling turns cut by `finish_reason=length` in the session server (TITO) by *Jiajun Li (RadixArk)* [ef9ff34](https://github.com/radixark/miles/commit/ef9ff34d1e5482f5b37ee3c96f643a5ea94810ef)

    Inkling now declares a truncation closer, so follow-up requests after a `max_tokens` cutoff no longer get HTTP 409. An unfinished tool call is stored with its recipient and partial JSON but is not treated as a call.

- Centralize reasoning/answer delimiters in new `miles/utils/reasoning.py`, shared by TITO tokenizers and rm_hub graders by *Jiajun Li (RadixArk)* [fe7037f](https://github.com/radixark/miles/commit/fe7037f561910f26ac4eccf9082bc5f4410488f8)

    The **TITO** truncation grammars and the `deepscaler`, `gemma_math` and `gpqa` reward functions now share `REASONING_DELIMITERS`. `deepscaler`/`gpqa` grading now uses `extract_after_reasoning`. **Reward values may change** for multi-delimiter model families, so check reward consistency on affected runs.

- Split the monolithic TITO tokenizer into per-family modules (base, deepseek, glm, inkling, kimi, minimax, muse_spark, nemotron, qwen) by *Jiajun Li (RadixArk)* [fec59ea](https://github.com/radixark/miles/commit/fec59eaa329d690980d1ed3834603f948127b399)

    About 1,400 lines in `tito_tokenizer.py` became a `tito_tokenizer/` package, with no intended behavior change. Code that imports from the old module path should be checked against the new package exports. New families register a `TITOTokenizer` and `FIXED_TEMPLATE` in the package.

- Fix math reward to extract `\fbox{}` answers, not just `\boxed{}` by *Catherine Lee* [a0a68c6](https://github.com/radixark/miles/commit/a0a68c6e9b53089c5709e5dbadf19ca5c4530fc9)

    Correct `\fbox{}` answers previously got zero **rollout** reward in the math/deepscaler graders. **GRPO** reward curves may shift upward for affected runs.

- Fix DrGRPO example reducer to read miles' parallel state instead of Megatron's `mpu` by *Catherine Lee* [8668b1e](https://github.com/radixark/miles/commit/8668b1ec3c1ab0c22e284183867f7085d7af3872)

    The Dr.**GRPO** reducer now works on the **Megatron**, **FSDP** and **torchtitan** backends; it still requires CP size 1. The `--custom-pg-loss-reducer-function-path` docs and help text now use dotted-path syntax.

- Allow score centering with DFlash speculative decoding, requiring exact acceptance thresholds by *Nan Jiang* [54300c0](https://github.com/radixark/miles/commit/54300c0068cebd559a29f558d392fd5971d92876)

    Score centering now permits **SGLang** `DFLASH` speculative **rollout** when both acceptance thresholds are 1.0. Configs that combine score centering with a non-DFLASH algorithm still fail validation.

- Stride pad-token routing replay fill across experts instead of piling onto the first experts by *Maxwill Lin* [96afce3](https://github.com/radixark/miles/commit/96afce3694bf70a8669a2c3cd9b4744e4d8112c5)

    In MoE routing replay (**R3**-style), `fill_replay_padding` now spreads padding rows across experts instead of always using experts 0..top_k-1. This avoids dispatch hotspots in torchtitan compile warmup and the DeepSeek V4.1 indexer. Non-padding rows are unchanged.

- Fix DSA indexer top-k for a lone query row by keeping the padded row stride (new `score_rows` helper) by *Nan Jiang* [0c424f1](https://github.com/radixark/miles/commit/0c424f105e01f836ebe97c72ff39505ab950392a)

    Fixes rejected top-k calls in DeepSeek-V4/V4.1 indexers when a context-parallel rank holds a single query row with an unaligned key count (**Megatron** training).

- Fix glm5_next (GLM-5.3-Flash) **Megatron** raw HF export to use checkpoint tensor names by *Nan Jiang* [38574a2](https://github.com/radixark/miles/commit/38574a2b2e1e40521c09414152635b6879daed0f)

    Exported text-stack weights now use the `model.language_model.` prefix to match the **checkpoint** layout. This fixes weight loading in **SGLang**/HF.

- Add native shared-outer routed-expert **LoRA** support for GLM-5.3-Flash in the **Megatron** backend by *Nan Jiang* [f205db8](https://github.com/radixark/miles/commit/f205db8cc70498084c49a4094201f7042945b82e)

    With `--experts-shared-outer-loras`, routed experts can take shared-outer adapters. The launcher still leaves routed experts out by default, so existing runs are unaffected.

- Keep base weight bytes in merged **LoRA** export when merging leaves values unchanged (e.g. -0.0 stays -0.0) by *Nan Jiang* [41da3bf](https://github.com/radixark/miles/commit/41da3bfa902f014979d5ac313af3ce3ff47cc906)

    Merged **Megatron** LoRA exports are now bit-exact with the base model wherever the delta is zero. This helps checkpoint comparison and weight-sync consistency.

- Move train-data object-store `put` off the rollout executor event loop via `asyncio.to_thread` by *Nan Jiang* [a0c90b9](https://github.com/radixark/miles/commit/a0c90b929dbf098e6544801305f1e994581c284d)

    Slow object-store puts no longer block the fully-**async** **rollout** producer. This reduces stalls in long-running **Ray** RL jobs.

- Run on **SGLang** builds without deprecated DP-attention flags; send the admin API key on admin routes by *HEJIAN SANG* [ec8bb5a](https://github.com/radixark/miles/commit/ec8bb5a31f70563fbec175f399debd64d6d8fcef)

    Miles now tolerates SGLang builds that dropped `--enable-dp-attention`. `SGLangApiClient` sends a separate `admin_api_key` on admin routes, falling back to `SGLANG_ADMIN_API_KEY` for external engines. The key is plumbed through **Ray** rollout cell specs. This affects deployments that use admin keys, external engines or newer SGLang builds.

- Pin newer sglang-torchtpu commit in the TPU image and require an admin key for weight updates by *HEJIAN SANG* [2beab27](https://github.com/radixark/miles/commit/2beab27e63dd3674036aea8a10ab9c67a48a8e36)

    The TPU **SGLang** engine now refuses weight updates without `SGLANG_ADMIN_API_KEY`. **torchtitan** TPU RL users must export the same key in both the engine and trainer shells.

- Add SSE decoding for Dynamo generate streams inside the existing HTTP retry transport (`response_decoder` in `http_utils.post`) by *Zhongdongming Dai (NVIDIA)* [c6e33b6](https://github.com/radixark/miles/commit/c6e33b68df8effc8358d15383bb93862339bbedf)

    Adds a robust SSE parser for Dynamo-backed generation. Decoder failures and other permanent errors now fail once with the original reason. Only 408/429/5xx and producer-marked errors are retried, which improves **router**/**rollout** reliability. Non-streaming paths are unchanged.

- Skip vision processing for text-only prompts in `process_vision_info` by *Alexander Zhipa* [4dfc8b4](https://github.com/radixark/miles/commit/4dfc8b41902979a0666df4cfe24e8a10b2aa76ea)

    Text-only checkpoints that ship an `AutoProcessor` config no longer need `qwen_vl_utils` or an image processor, which fixes **rollout** data-processing failures. Image and video prompts still raise `ImportError` if the dependency is missing.

- Name the primary W&B run after `--wandb-exp-name` and handle a missing wandb group by *Alexander Zhipa* [c349799](https://github.com/radixark/miles/commit/c34979946baf1c7f94c53e3db76d06f684efd6f8)

    Primary W&B runs now get predictable names, and runs without a `wandb_group` no longer fail with a `None + str` error. This improves **observability** for long-running RL jobs.

- [AMD] Enable more MI350 nightly CI tests and add ROCm support for the fake INT4 quant kernel and image build by *Xinyu Jiang (CMU)* [271cbfc](https://github.com/radixark/miles/commit/271cbfca7a1989be01eec9a74fe0f5eb1fef0cf5)

    `fake_int4_quant_cuda` now compiles under HIP and is installed in `Dockerfile.rocm`. New MI350 nightly tests cover FSDP **R3**, multi-**LoRA**, LoRA GDN, the quantizer and MiniMax M3. **ROCm impact:** AMD users get **INT4** fake-quant support and broader nightly regression coverage.

- Pause scheduled ROCm CI runs on Spur by removing the cron triggers from `pr-test-rocm.yml` by *Xinyu Jiang (CMU)* [9011e81](https://github.com/radixark/miles/commit/9011e812d091a7bbc57d508898b93a081f2497d0)

    **ROCm impact:** long ROCm tests now run only on PRs labelled `nightly` and `run-ci-long`, or via `/rerun-test`. ROCm metric baselines accumulate more slowly. There is no runtime change.

- Scope CI metric-history gate storage to the writing repository by *Yueming Yuan* [c1f7aa6](https://github.com/radixark/miles/commit/c1f7aa696a2b694d1ea20a097a064e8c81baa89a)

    Baselines are now scoped per repository, including on the ROCm CI path. The hosted `runs` table needs a `repository` column, provisioned out-of-band. CI only.

- CI: strip the host docker socket from job containers on every self-hosted runner via a `docker` wrapper hook by *Yueming Yuan* [d8a5b24](https://github.com/radixark/miles/commit/d8a5b245c88a9767abe48cfab0fab94164c11b97)

    Closes a path to host root from CI jobs. Maintainers must reinstall the hook on existing runners, and jobs that relied on the docker socket will fail.

- CI: name Docker image repository after `github.repository` instead of hardcoding `radixark/miles` by *Yueming Yuan* [ecf1987](https://github.com/radixark/miles/commit/ecf19870da3932f5af9278cea5559eb6303f6cb3)

    Forks no longer touch `radixark/miles` images, and `docker/build.py` gains `--image-repo`. The TPU and ROCm PR images stay pinned to `radixark/miles`. CI and image maintainers only.

### 🟢 Low Priority

- Add a truncate rollout to the session verifier to test continuing turns cut by `finish_reason=length` by *Jiajun Li (RadixArk)* [db993aa](https://github.com/radixark/miles/commit/db993aaca3e53abfe90fdfe42b046496805085fa)

    Adds GPU verifier coverage for **TITO** truncated-turn continuation. `SPEC_UNFINISHED_RATIO_THRESHOLD` is renamed to `UNFINISHED_RATIO_THRESHOLD`.

- Clarify the `deepscaler` and `math` reward grading contracts in `rm_hub` comments by *Jiajun Li (RadixArk)* [4ad60af](https://github.com/radixark/miles/commit/4ad60afd3330b1a7219eac7705200f725c9c1267)

    Comment-only change. It documents strict post-reasoning grading for `deepscaler` and verl-aligned `\boxed{}` extraction for `math`.

- Refactor mbridge: share DeepSeek-layout MTP name mapping via new `DeepseekMtpBridgeMixin` by *Nan Jiang* [6f973c9](https://github.com/radixark/miles/commit/6f973c9e4c0608c3b06e06fbcf7710efb2b93f6f)

    Deduplicates the MTP conversion for DeepSeek-V3.2 and GLM-4.7-Flash **Megatron** checkpoints. The mapping is intended to stay the same.

- Add Inkling 2 Mini recipe docs page (torchtitan backend, colocated **SGLang**, GRPO on 8× B200) by *Zhichen Zeng (RadixArk)* [44c464f](https://github.com/radixark/miles/commit/44c464f5fef2c953282a62db1a367f4d48df0533)

    Docs-only change. It covers the **torchtitan** FSDP2 setup, BF16 conversion, `--save-hf` **checkpoint** export and expected health metrics.

- Speed up CPU CI via test fixes, skipping empty Stage B, and rebalancing suites by *Jiajun Li (RadixArk)* [9779b14](https://github.com/radixark/miles/commit/9779b148031a7aa69265ebbadb3c9da18b669ffb)

    CI only. CPU CI should turn around faster, and the CI registration rules are updated.

- Make the Lark CI notifier handle failed or truncated GitHub job reads by *Jiajun Li (RadixArk)* [0989f48](https://github.com/radixark/miles/commit/0989f4842fbd3b8a8b8f99a993daa9cbe8d48e32)

    The notifier now retries GitHub reads and falls back to a run-level card, so nightly CI failures are less likely to go unreported.

- Isolate CI GPU job containers from the host and other runners (drop `--privileged` and `--ipc=host`) by *Yueming Yuan* [47fcca1](https://github.com/radixark/miles/commit/47fcca1229bef53d4d4dd4f94a2305d93b3c75cb)

    GPU CI jobs now get only `SYS_PTRACE`/`SYS_NICE`, InfiniBand devices and scoped data mounts. Multi-GPU tests that rely on **CUDA** IPC or NUMA binding may need these capabilities.

- Fail GPU CI jobs whose container has the host docker socket mounted by *Yueming Yuan* [afb139f](https://github.com/radixark/miles/commit/afb139f25a2b2f9bca150d8da6b853eec9ad76c3)

    Runners without the `job-container-docker` hook now fail GPU CI instead of running jobs with host-root access.

- Add a CI job-start hook that deletes other repositories' checkouts from the runner work directory by *Yueming Yuan* [bb40e28](https://github.com/radixark/miles/commit/bb40e2875f16b987a7357b26e1b18f1f898834e2)

    This affects only runner operators, including the B200 and aliyun runners.

- Restrict wheel publishing, fork image builds, and ROCm/TPU PR tests to radixark/miles by *Yueming Yuan* [ce4985d](https://github.com/radixark/miles/commit/ce4985d944539a408354af5ba1de5e78445de21e)

    Forks can no longer publish wheels or use the MI350/TPU runners. **ROCm impact:** forks can't run ROCm CI.

## Newly Submitted Issues

- [#5054](https://github.com/radixark/miles/issues/5054) (open): **Bug report:** GLM-5.3-Flash KDA training with the pinned `flash-linear-attention` 0.5.2 hits int32 row-offset overflow in fla's short-convolution kernels at 87,382+ tokens in a single sequence (`T * D >= 2**31`, with D = 24576). The reporter says this causes silent out-of-bounds reads and writes, which they saw as `found NaN in local grad norm` on a 91k-token sequence. They included a reproduction script. They point to fla 0.6.0 (bumped in draft #4965) or a small patch on 0.5.2 as fixes. This is user-reported and not yet confirmed by maintainers. It could affect long-context training of models with wide short-conv layers.
- [#5037](https://github.com/radixark/miles/issues/5037) (open): **RFC:** opt-in `--trie-packing` for the **FSDP** backend, which would train each shared token prefix once (prefix tries, similar to SGLang's radix cache). The author reports 1.4×–3.0× step speedups and lower peak memory on tau2-bench agentic RL workloads, with bit-identical step-0 log-probs. A stack of 8 draft PRs (#5021–#5028) is proposed. This is not merged.
- [#5060](https://github.com/radixark/miles/issues/5060) (open): **Feature request:** `--dynamic-global-batch-steps N`, which would allow several optimizer steps per rollout together with `--use-dynamic-global-batch-size`. Today that option pins training to one step per rollout. The motivation is agentic rollouts with variable sample counts. The author asks how this should interact with `--num-steps-per-rollout` and with #4714 (weight versioning).
- [#5018](https://github.com/radixark/miles/issues/5018) (open): **Question:** whether miles could use Megatron's native `RouterReplay` API instead of its Megatron fork patch for **R3** routing replay, and which configs or custom routers would still need the fork patch.
- [#4991](https://github.com/radixark/miles/issues/4991) (open): **Feature request:** multimodal (image-text) **GRPO** support for DeepSeek-V4.1-Flash-1017. The current documented recipe drops vision tensors during checkpoint preparation, so training is text-only. The user asks about the roadmap and about reusing the Inkling multimodal RL infrastructure.
- [#4969](https://github.com/radixark/miles/issues/4969) (open): An outreach request from Hugging Face asking maintainers to check the paper results and metadata listed on Papers with Code. It has no code or user impact.

## Stats
- **Total Commits**: 42
- **Analyzed Commits**: 42
- **Active Contributors**: 12
- **Files Changed**: 378
- **Training-Specific Commits**: 11 (26.2% of total)
- **New Issues**: 6 (6 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
