# miles Weekly Digest - 2026-11-12

## Summary
This week's biggest change is a new backend-agnostic **LoRA** adapter **checkpoint** library. Bridge, native **Megatron**, **torchtitan** and Tinker LoRA now save and resume through it, native multi-LoRA no longer needs Bridge mode, and the per-rank `.pt` writer was removed. Other major merges are **torchtitan** training on TPU with **ICI** weight sync, a token-space multimodal (MLLM) training pipeline, and breaking changes to `--max-seq-len` and `rollout/raw_reward`. Reporters also filed issues saying the v0.1.3 image can train silently on all-zero attention on Blackwell (sm_120) and that single-adapter LoRA keeps changing the MoE router expert bias. Neither has been confirmed by maintainers.

Source: [radixark/miles](https://github.com/radixark/miles), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-11-05T23:10:40Z through 2026-11-12T23:10:40Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

**LoRA adapter checkpoint library and multi-LoRA**

- Add backend-agnostic **LoRA** adapter **checkpoint** library (save/load, PEFT conversion, parametrization) by *Yueming Yuan* [a18bade](https://github.com/radixark/miles/commit/a18bade32b490cfcb5d2330655adf6c90a7e6d66)

    A new `training_utils/checkpoint/adapter/` package saves and loads miles adapter dirs, PEFT and external-weights sources, and converts between parametrizations. If one rank fails, all ranks see the failure, so a single rank can't hang a collective. Loading PEFT or external sources converts the whole adapter on rank 0, which takes about 6 bytes per element (around 41 GB for a rank-16 adapter on every DeepSeek-V3 expert). It also adds `tools/convert_lora_adapter_to_peft.py`.

- Save and restore Bridge single LoRA as an adapter dir with DistributedOptimizer state (adds `--lora-adapter-convert-save`) by *Yueming Yuan* [266a554](https://github.com/radixark/miles/commit/266a554e3c8d70350c25fc019b4a1852b257df3c)

    Checkpoints now go to `{save}/iter_N/adapter`, which holds fp32 masters, Adam state and a PEFT export, and can resume under any parallel layout. The `adapter` entry is a symlink, so copy it with `cp -rL` or `rsync -L`. Saving now requires fp32 Adam with the distributed optimizer and Gloo groups. Launch refuses `--indep-dp`, in-memory checkpoints and `--stream-optimizer-state-to-disk`. Check long-running **fault tolerance** jobs before upgrading.

- Move native single LoRA onto the shared adapter library and drop the per-rank `.pt` checkpoint writer by *Yueming Yuan* [641eac1](https://github.com/radixark/miles/commit/641eac1006d308e0a33d1e3c49381e05e77054f3)

    Native **Megatron** **LoRA** now saves the same layout-independent adapter dir as Bridge. `save_checkpoint_with_lora` has been removed. Older per-rank shards and older `--save-hf` exports can still be loaded through `--lora-adapter-path`. The docs now also list MiMo and JoyAI-LLM-Flash LoRA targets.

- Save and resume torchtitan LoRA through adapter dirs, with cross-backend schedule resume by *Yueming Yuan* [9a10eb1](https://github.com/radixark/miles/commit/9a10eb1ca05431b25d76965866f6934928bde43d)

    **torchtitan** LoRA can now save and resume. `--lora-adapter-path` accepts torchtitan or Megatron adapter dirs, PEFT pairs and DCP step dirs. A new `first_rollout` field lets resume restore the LR schedule by rollout, including across backends. This changes the Megatron LoRA save/restore signatures. `--no-load-optim` is required when the number of steps per rollout changes.

- Load Megatron-Bridge PEFT `iter_N/` checkpoints into single-LoRA runs by *Yueming Yuan* [71accd8](https://github.com/radixark/miles/commit/71accd89f5f202511ab30a6cdf81e6a3ac2a72b9)

    The new `MegatronBridgeCheckpointLoader` warm-starts or resumes from Bridge `torch_dist` PEFT checkpoints across TP/EP layouts and can optionally restore Adam state. It checks the run config and base model before loading. Only TP2/EP2 loads have been validated on GPU. PP>1, virtual pipeline and CPU offload have not been tested, and the iteration, scheduler and RNG state are not restored.

- Add Bridge LoRA adapter slots and route Bridge `--save-hf` through the PEFT export by *Yueming Yuan* [790f557](https://github.com/radixark/miles/commit/790f55726c868f2ef937946c5df39428199f4153)

    In Bridge mode, `--save-hf` now writes a PEFT-format adapter, or an SGLang-named export when fused modules have no PEFT name. The new `BridgeAdapterSlots` probe runs collectively on every rank at init, so a failure on one rank could stall the whole job.

- Enable multi-LoRA on native (raw-mode) Megatron adapters by *Yueming Yuan* [8e2fb12](https://github.com/radixark/miles/commit/8e2fb120ed4e3af4043012ff03b0d937e5ddd013)

    **MultiLoRA** no longer requires `--megatron-to-hf-mode bridge`. Native mode covers dense projections and lm_head. It refuses grouped expert adapters, and refuses GDN `in_proj` and KDA slots under CP. Legacy Tinker checkpoints still load only on a Bridge-mode gateway.

- Add shared slot compute members (init/clear/route_tokens) and native multi-LoRA slots to Megatron LoRA adapter slots by *Yueming Yuan* [214f356](https://github.com/radixark/miles/commit/214f3566233107b72795ce0c6fd3169bd9bcc43f)

    A shared `SlotComputeMembers` mixin handles claiming, freeing and token routing for adapter slots. Slot lifecycle bugs, such as double-claiming a slot, now fail on assertions. Native multi-LoRA is limited to PP=1.

- Save and load Tinker multi-LoRA state through the adapter library with `LayerWise` state members by *Yueming Yuan* [be0d20e](https://github.com/radixark/miles/commit/be0d20e011244d18c562f28311ea849cf701737c)

    A save commits a new adapter dir before switching the name to it, so a failed overwrite keeps the previous **checkpoint**. The gateway takes an `flock` on the checkpoint root, which needs a filesystem that enforces locks across hosts. NFS `nolock` and Lustre `localflock` don't. A checkpoint from a different adapter layout loads weights only, without optimizer state.

- Write Tinker sampler exports via the adapter library and resolve them by commit ID by *Yueming Yuan* [f5b4116](https://github.com/radixark/miles/commit/f5b4116efb35fba27793ce14e394482edf81299e)

    This changes the on-disk layout of `--tinker-checkpoint-root`. `sampler_weights/<v>` is now a link to `.<v>.<commit_id>/`, and **SGLang** adapter names become `model@name@commit_id`, so a re-save never serves stale cached weights. `export_slot` has a new signature and `SnapshotPublisher.publish_adapter` was removed. Check any tooling that reads the old layout.

- Add Tinker external weights downloads, checkpoint TTLs and deletes to the gateway by *Yueming Yuan* [75888bf](https://github.com/radixark/miles/commit/75888bfb35559727309623bd54ffdfe6f42ab5e9)

    New gateway features: `save_weights_external` (F32 adapters, optionally age-encrypted), short-lived download URLs, `ttl_seconds`, `set_checkpoint_ttl` and `delete_checkpoint`. Expired checkpoints are deleted automatically. Deployments behind a TLS or path-prefix ingress need the new `--tinker-public-url`, and age encryption adds an optional `pyrage` dependency. LoRA loading now rejects adapters whose shapes don't match the run before loading them.

- Add http-lora weight transfer mode for LoRA sync to external SGLang rollout engines by *Yağız Çalık* [c4d5aa1](https://github.com/radixark/miles/commit/c4d5aa11a637debd0af63c3d0d7bbbf01831a3c3)

    The new `--update-weight-transfer-mode http-lora` mode, set with `--http-lora-ship path|tensors`, syncs **LoRA** weights to **SGLang** engines that share no NCCL/RCCL communicator or host with the trainer. `path` mode stages adapters in `update_weight_disk_dir` and keeps only the last 3 versions.

**TPU / torchtitan**

- Run the torchtitan trainer on TPU (torch_tpu) with a patched torchtitan, a splash attention kernel and new platform validation by *HEJIAN SANG* [46a1743](https://github.com/radixark/miles/commit/46a1743f908a4df05025ff4cc87ac5869512bd3a)

    The **torchtitan** trainer now runs on TPU. Any bump of `TORCHTITAN_COMMIT` means rebasing the fuzz-0 patch. TPU runs have strict validation: no `--colocate`, no fused log-probs, a disaggregated weight-sync mode is required, CP and EP must be 1, and `--seq-length` must be a multiple of the attention block size. CUDA paths are unaffected apart from the new platform checks.

- Add TPU weight sync over ICI (`--update-weight-transfer-mode ici`) for a trainer and engine sharing one slice by *Zhichen Zeng (RadixArk)* [e5f1669](https://github.com/radixark/miles/commit/e5f166901c8e8a0ffd0b59bc4cf0acb9ec751318)

    The trainer pushes weights device-to-device to a co-located SGLang engine with no host copies. The engine must fill the rest of the slice, which must be exactly twice the trainer's size. If the engine's expert split doesn't match the trainer's, the run fails loudly instead of serving stale experts. Engine load failures are reported to all ranks.

**Multimodal (MLLM) token-space pipeline**

- MLLM refactor: build multimodal training inputs in token space via SGLang placeholder expansion by *Kangrui Du* [01aef99](https://github.com/radixark/miles/commit/01aef99d82fee619f579bc8a5ce22a59274f5710)

    New opt-in flags: `--multimodal-token-space-processing` and `--shared-media-dir`. It works on **Megatron** only. It requires `--sglang-enable-token-space-processor` and a media directory shared by every engine and trainer rank. It rejects external engines and true-on-policy settings.

- Add Qwen3.5 multimodal training under raw Megatron, with mRoPE position handling and CP-aware media row placement (MLLM refactor 3/4) by *Kangrui Du* [71604fb](https://github.com/radixark/miles/commit/71604fb42e7cfb5141561c37d53d1610e3b6c726)

    The trainer rebuilds SGLang's mRoPE positions and vision-row placement, including under context parallelism, so training matches what the **rollout** engines saw. Frozen vision towers are re-synced from the boot checkpoint on every weight update.

- Run Inkling audio and image RL on the token-space processor, with a new AVQA audio GRPO example by *Kangrui Du* [52bd6a9](https://github.com/radixark/miles/commit/52bd6a9239c008259243ddc70ef42bd736238427)

    Inkling-Small now trains on audio and images using placements computed by SGLang. The new AVQA **LoRA** **GRPO** example reports held-out accuracy rising from 55.1 to 72.8 over 50 steps.

- Fix routed-experts replay for multimodal prompts that the engine expands by *Yueming Yuan* [bb18e6a](https://github.com/radixark/miles/commit/bb18e6ab7811e9301ee1690914eb7499ff3996c9)

    This fixes a correctness bug in **R3** routing replay. The routed-experts array was sized from `len(sample.tokens)`, which is too short when SGLang expands image placeholders. It now uses the token counts the engine reports, so replayed routing lines up with what the engine actually served in multimodal MoE runs.

**Rollout semantics, async and policy consistency**

- Replace `--rollout-max-context-len` with a unified, globally registered `--max-seq-len`, and remove `--eval-max-context-len` by *Jiajun Li (RadixArk)* [a364af9](https://github.com/radixark/miles/commit/a364af9d40830d6a3657e6dbbcd3565f503d9574)

    **Breaking CLI change:** launch scripts, Helm charts and examples must switch to `--max-seq-len`. It now applies to every **rollout**: it caps `max_new_tokens` on each request and marks requests with no room left as `TRUNCATED`. Eval no longer has a separate context limit.

- Report `rollout/raw_reward` before dynamic sampling filters and rename the trainer's retained-batch mean to `rollout/raw_reward_filtered` by *Jiajun Li (RadixArk)* [4976a94](https://github.com/radixark/miles/commit/4976a94872616a018386f1e1f1d1473123ef4f09)

    **Breaking metric semantics:** `rollout/raw_reward` now averages all groups the filter decides on, including dropped ones, so it no longer looks inflated when zero-variance groups are dropped. `rollout/raw_reward_unfiltered` is removed. Update dashboards and alerts, and change custom rollout functions to report through `MetricGatherer`.

- Add `--async-submit-within-staleness` to bound **async** rollout staleness at group submission time by *Yikai Zhang* [b133ce9](https://github.com/radixark/miles/commit/b133ce9cac3c8b4d9969d20d6a03117d545c2865)

    `--max-weight-staleness` is now enforced before a group starts generating, which saves wasted generation. The flag is opt-in and requires `--fully-async` and `--update-weights-interval 1`. Custom data buffers must override `admits()`.

- Add `--allow-stop-token-replace` flag to gate GLM stop-token replacement in the TITO session server by *Jiajun Li (RadixArk)* [cd04975](https://github.com/radixark/miles/commit/cd049754e2e4f983b82a403e21f08a672229156a)

    When replacement happens, the sampled stop token is dropped from the training sample, which affects **TITO** policy consistency. GLM launch configs that use `--sglang-enable-streaming-session` will now fail validation unless they pass `--no-allow-stop-token-replace`.

- Render DeepSeek-V4/V4.1 chat templates through sglang's deepseek-recipe renderer, replacing the vendored V4/V4.1 encoders, by *Jiajun Li (RadixArk)* [b04ff64](https://github.com/radixark/miles/commit/b04ff64607827897ab9348bcb8dc9177d70080ca)

    V4/V4.1 prompts now come from the same renderer as the **SGLang** server, which keeps TITO token IDs consistent. Your pinned SGLang must include `deepseek_recipe_renderer`, and SGLang upgrades may shift V4 prompts.

- Honor FlashInfer tie policies in DeepSeek-V4.1 indexer candidate selection and make replay per-forward by *Ziang Li (University of Michigan)* [a6f0c68](https://github.com/radixark/miles/commit/a6f0c683e694452ff32a710b22fc005e427083b4)

    The new `--miles-dsa-topk-backend flashinfer` option narrows trainer/rollout top-k mismatches. The rollout side needs SGLang PR #47960. Replay now works per layer-forward, so re-validate V4.1 runs that use indexer replay or query chunking.

**New models**

- Add Muse Spark Open model support: Megatron-to-HF weight conversion, mbridge plugin, TITO chat template and launch scripts by *Jiajun Li (RadixArk)* [706c610](https://github.com/radixark/miles/commit/706c6106cafe24bad5eba7cceb09ee4f24c2d1b3)

    Adds a new Megatron model family. Weights stream to SGLang one expert at a time with shape and dtype checks, and q/k rows are re-ordered for the rotary convention. Launch scripts target 32×B300 and 64×H200.

### 🟡 Medium Priority

- Fix multi-policy startup by dropping the orchestrator-side `--async-submit-within-staleness` assertion by *HEJIAN SANG* [d28b952](https://github.com/radixark/miles/commit/d28b9521c7f149f34555b486c1418fd6f0c57b18)

    **multi-policy** runs can start again. With the check gone, the flag is also no longer rejected for multi-policy runs, so watch staleness and policy consistency there.

- Fix Megatron checkpoint loading to count Inkling's padded embedding rows (`padded_vocab_size`) by *Michael* [2b795e2](https://github.com/radixark/miles/commit/2b795e2425d4afa57af2fad826d131416bdc1675)

    Fixes loading or padding failures for HF **checkpoint**s whose embeddings store more rows than the reported vocab.

- Tinker gateway gains raw (miles-native LoRA) launcher mode and padded-vocab HF load via mbridge by *Yueming Yuan* [171c33b](https://github.com/radixark/miles/commit/171c33bd8f2ad7730e01564424bcf7fd23f8ac7f)

    The serve launcher accepts `--megatron-to-hf-mode raw`, for dense models only. A new `create_mbridge_for_model` zero-pads HF embeddings up to the model's vocab rows.

- Add torchtitan LoRA adapter checkpoint members and `probe_torchtitan_row_mapping`, with shared slot logic moved into a common `ProbedAdapterSlots` by *Yueming Yuan* [184e1bb](https://github.com/radixark/miles/commit/184e1bb1fa6679592e8c06a5726e944ba0e22959)

    Groundwork for **torchtitan** LoRA checkpointing. Megatron LoRA save and restore behavior should be unchanged.

- Leave `kv_b_proj` frozen in GLM-5 default **LoRA** targets because SGLang DSA prefill rejects its adapter by *HEJIAN SANG* [0d8e220](https://github.com/radixark/miles/commit/0d8e220a0e16a007433db94f4adeda576836aac8)

    GLM-5/5.1/5.2 LoRA now trains fewer modules by default. Review configs or checkpoints that rely on `kv_b_proj` adapters.

- Clear negative-zero E2M1 codes in exported **NVFP4** weights by *Nan Jiang* [96719ea](https://github.com/radixark/miles/commit/96719ea22f11f10956551af6e16c1af14f1931ac)

    NVFP4 exports are now byte-deterministic when tiny sign changes occur, but they no longer match raw Transformer Engine output. Pass `clear_negative_zero=False` to get the old behavior.

- Fix startup KeyError when reading SGLang server args with SUPPRESS defaults by *Yueming Yuan* [7033cd7](https://github.com/radixark/miles/commit/7033cd7d30f2438ab87d91736e460dfbbcdef572)

    Improves **SGLang** compatibility with versions that still carry deprecated alias arguments.

- MLLM refactor part 1/4: add shared-path media references for multimodal token space by *Kangrui Du* [a6bc4b0](https://github.com/radixark/miles/commit/a6bc4b0b030f78dad8dea67cd61b0d853e0dc48f)

    Media is written once under `--shared-media-dir`, named by content hash. Remote URLs and per-part resize options are rejected explicitly. Multimodal deployments need the same mount path on the trainer and on every engine.

- Add TimeLens video RL example for Qwen3.5 and rebuild token-space multimodal trainer inputs in the background by *Kangrui Du* [6c87be3](https://github.com/radixark/miles/commit/6c87be3c195ec2e510d9aab891b4cb71622a836e)

    Multimodal inputs are now prepared in background threads, overlapping with training. Two new flags tune the worker counts: `--trainer-mm-processor-worker-num` and `--trainer-mm-io-worker-num`. `--debug-rollout-only` now drops multimodal inputs.

- Trainer reuses rollout engines' disk item feature cache for token-space multimodal preprocessing by *Kangrui Du* [7c4117f](https://github.com/radixark/miles/commit/7c4117f5b2fc37a875496f1eb123793ec3fe69af)

    The trainer skips image and video preprocessing the engines already did when they share `token_space_preprocess_cache_dir`. This needs an **SGLang** build with `DiskPreprocessCache`.

- Add geo3k token-space VLM recipes and docs for Qwen3.5-35B-A3B, Qwen3.8-27B and Inkling by *Kangrui Du* [f370614](https://github.com/radixark/miles/commit/f37061434dfe70ec10f2b0031e1aff025ee0542b)

    Multi-turn **GRPO** recipes with **R3** routing replay over the media-expanded sequence, Megatron only. Multi-node runs need a shared filesystem.

- Add Dynamo frontend launch argument and environment rendering for the router (2/13) by *Zhongdongming Dai (NVIDIA)* [58567bf](https://github.com/radixark/miles/commit/58567bf87de25b21d0e597c94da05ae97ecf8b5f)

    Part of a 13-part Dynamo **router** series. Settings that Miles owns now override inherited shell env, so a stray `NATS_SERVER` or `DYN_HTTP_*` value can't change routing.

- Add Dynamo native SGLang sidecar argument rendering (`sidecar_overrides`) for the router by *Zhongdongming Dai (NVIDIA)* [6463866](https://github.com/radixark/miles/commit/64638666403bc3499ab49331097dd63396641ca0)

    Dynamo deployments need **SGLang** engines that serve native gRPC alongside HTTP, with delta streaming, which means a pinned sglang-miles revision.

- Add Dynamo sidecar listener port allocation, process environment and launch command helpers by *Zhongdongming Dai (NVIDIA)* [4028aa9](https://github.com/radixark/miles/commit/4028aa969e4b7be2a5c4665c7d653d9d33918805)

    Reserves gRPC, system and KV-event ports per DP rank, and rejects user settings that conflict with controller-managed admission.

- Add `--compile-warmup` so the TPU torchtitan trainer compiles its first step while SGLang engines start by *HEJIAN SANG* [c0fcef1](https://github.com/radixark/miles/commit/c0fcef14e7d9180ff8199d56949d1fd6eda3e531)

    Shortens time to the first rollout on TPU. Startup in `train.py` and `train_async.py` was refactored to build components concurrently, and the shared torch-native actor's training core was split, so **FSDP2**/torch-native users should watch for regressions.

- Add opt-in `--titan-fsdp-reduce-dtype` to choose the FSDP gradient reduce dtype in the torchtitan/TPU trainer by *HEJIAN SANG* [1583fbb](https://github.com/radixark/miles/commit/1583fbb5c5a87770c496fea7e0b8170526d98758)

    `bfloat16` halves reduce-scatter memory and ICI traffic but can affect gradient stability. The default stays `float32`.

- Add `--titan-fsdp-gather-once` to the **torchtitan** TPU trainer so FSDP gathers params once per pass by *HEJIAN SANG* [aeedfb2](https://github.com/radixark/miles/commit/aeedfb251d88b1c3df7df0a59bc6626697f41637)

    Does one all-gather per pass instead of one per microbatch, at the cost of every rank holding full params and grads, so it suits small dense models. Off by default. The Qwen3-4B TPU script enables it.

- TPU: fix MoE launchers' weight sync (torchtitan expert-range lookup, device-aware hybrid process group, GLM dynamo tracer) by *Zhichen Zeng (RadixArk)* [8fa9b28](https://github.com/radixark/miles/commit/8fa9b28dac2fc9071602b759a541b7a5218b8bb5)

    Fixes a GLM-4.7-Flash export `KeyError` and a hardcoded `cuda` device in the CPU-offload process group. According to the commit, both MoE launchers now run the smoke recipe end to end on a v7x host.

- Add TPU launchers for Qwen3-30B-A3B and a 4-layer GLM-4.7-Flash, plus a `4layer` torchtitan flavor by *Zhichen Zeng (RadixArk)* [4541d7c](https://github.com/radixark/miles/commit/4541d7c910f28a5f91e760eb3f787951adc4b318)

    The Qwen3-30B-A3B launcher needs about 120 GB of host RAM per trainer process. The README says neither launcher had been validated with the current engine flags at merge time, and **R3** on TPU is still a TODO.

- TPU: serve rollouts with batched ragged paged attention in the torchtitan launch script by *Zhichen Zeng (RadixArk)* [b778e34](https://github.com/radixark/miles/commit/b778e34017e418e5d147d0b4297399faa1e3302e)

    Switches to `pallas_tpu_rpa_batched` with a 256-token page size and up to 128 concurrent requests, for faster rollout decoding. Update launch scripts or snapshots pinned to the old flags.

- Pin sglang-torchtpu main in the TPU image and drop the local sglang-torchtpu patches by *HEJIAN SANG* [5deaa59](https://github.com/radixark/miles/commit/5deaa59bf0c28603c201294bef0ed5af52cd2340)

    The TPU image now depends on an unreleased upstream commit. The torch requirement note for the torchtitan backend changes to >= 2.14.

- Pin sglang-torchtpu to a newer main commit in the TPU Docker image by *HEJIAN SANG* [6b28093](https://github.com/radixark/miles/commit/6b28093be7f4176dd431bc1cb44438333b92f269)

    Changes the **SGLang** revision used by TPU image builds, which may change rollout behavior.

- Build the TPU image as `dev-tpu` in automatic Docker builds, with per-variant push selection by *HEJIAN SANG* [8630453](https://github.com/radixark/miles/commit/86304536fedc14a4f24522f2a67e24d4293ff62b)

    Publishes `radixark/miles:dev-tpu` and `latest-tpu`. TPU-only pushes no longer trigger the multi-arch cu13 rebuild.

- Classify cut-off and failed tau2-bench episodes in the example adapter, aborting invalid ones by *Jiajun Li (RadixArk)* [caa5cef](https://github.com/radixark/miles/commit/caa5cef0337b25a2839b1b92273bbb24b5968093)

    Infrastructure failures now abort the group instead of counting as zero-reward samples, so they no longer skew **GRPO** advantages.

- Set E2B sandbox `max_lifetime_secs` to the trial or episode cap plus 30 minutes in the Harbor and OpenEnv examples by *Tao Lin (RadixArk)* [2e8cd73](https://github.com/radixark/miles/commit/2e8cd739dda99e82e9097ead0620a4025e840d3a)

    Limits leaked E2B sandboxes and their cost in long **agent** runs. Harbor now raises a `ValueError` when a caller's lifetime isn't longer than the trial timeout.

- Add River's multi-turn text-to-SQL RL recipe as an example on Qwen3.6-35B-A3B (BIRD-Platinum, read-only SQLite tool, GRPO), and factor out `append_observation_tokens` by *Zhichen Zeng (RadixArk)* [51eed39](https://github.com/radixark/miles/commit/51eed39b3d60636492b54059dca1ea2e96be104f)

    Reports validation accuracy rising from 61.3 to 90.2 over 160 steps. The new public `append_observation_tokens` helper keeps the sampling mask and loss mask aligned. The existing tool-call behavior is unchanged.

### 🟢 Low Priority

- Bump miles package version from 0.1.3 to 0.2.0 in setup.py by *Kangrui Du* [2f627e0](https://github.com/radixark/miles/commit/2f627e0887f26a5a39a749e2d71b5b3c7c9db003)

    Release metadata only.

- Warn once that agentic `--max-seq-len` only truncates samples and does not stop the agent by *Jiajun Li (RadixArk)* [34ef839](https://github.com/radixark/miles/commit/34ef839dde7a56b9494537949c5cd2dc3a19dcd5)

    **agent** harnesses must read `metadata["max_seq_len"]` themselves. Otherwise episodes run past the limit and are truncated afterward.

- Add tau2-bench agentic RL example for Qwen3.6-35B-A3B, plus a None-reward guard in zero-std metrics by *Zhichen Zeng (RadixArk)* [647579e](https://github.com/radixark/miles/commit/647579e5158c2023dfa8e097e347474b6fa849d1)

    Experimental example. Also fixes a crash in zero-std group metrics when a sample has no reward.

- Add Qwen3.5-35B-A3B MoE profile, docs and results to the TimeLens video recipe by *Kangrui Du* [7616409](https://github.com/radixark/miles/commit/761640984756ca99050431c9a7145813f5597141)

    A reference setup for multimodal MoE training with **R3** and **TIS**. tIoU rose from 0.46 to about 0.545 over 100 steps.

- Add Inkling 2 Small LoRA RL recipe documentation page by *Yueming Yuan* [071cbe6](https://github.com/radixark/miles/commit/071cbe6c79af204cf2b0f6451f73830f9639bb0c)

    Docs only. Covers **LoRA** with **NVFP4**/**MXFP8** experts, GRPO, TIS, routing replay and TITO.

- Add Google TPU v7x guide to the Hardware Platforms docs by *HEJIAN SANG* [2d755fe](https://github.com/radixark/miles/commit/2d755fe7f97b07c26acf2d242c8d487cfb43f57e)

    Docs only: torchtitan plus sglang-torchtpu on TPU v7x. Megatron is not supported on TPU.

- Add TPU v7x CI workflow (`pr-test-tpu.yml`) for the `scripts/tpu` launchers by *Zhichen Zeng (RadixArk)* [a18187f](https://github.com/radixark/miles/commit/a18187f3efe49f6d1a8d2fbf1ffab2061e5ac69b)

    TPU smoke tests run on the `run-ci-tpu` label and nightly. A cluster admin must complete a one-time setup before they work.

- Add CPU-runner contract tests for the sglang-torchtpu APIs the TPU path calls, run on PRs by *HEJIAN SANG* [92d0aa3](https://github.com/radixark/miles/commit/92d0aa3281817cf285ebe6b298ea66eefd2aa6b9)

    Catches silent API drift in sglang-torchtpu before it breaks TPU weight sync or rollout.

- Add multimodal e2e CI tests for geo3k, TimeLens and AVQA recipes, plus a new `multimodal` CI label by *Kangrui Du* [cefb2a1](https://github.com/radixark/miles/commit/cefb2a19cb7e13d7df503e5b697caf234ef4c4c7)

    The tests gate `grad_norm`, `ppo_kl`, the train/rollout log-prob diff and reward.

- Run ROCm PR CI on Spur (Slurm) MI355X cluster runners instead of self-hosted MI350 runners by *Michael* [c28d2a4](https://github.com/radixark/miles/commit/c28d2a4d15c0ef7f620802dfa40a0bd9752153f2)

    **ROCm**/**AMD** CI infrastructure only: shards are now scheduled through Slurm on MI355X. There is no runtime change.

- Move test_dumper and GLM-4.7-Flash native LoRA CI tests to the stage-c-8-gpu-h200 suite by *Yueming Yuan* [778794a](https://github.com/radixark/miles/commit/778794a807866a4f51f34d5e87dda3e55d9e85ad)

    CI-only change.

- Update test snapshots to record Megatron's new `moe_expert_fake_quant` argument by *HEJIAN SANG* [64b4e68](https://github.com/radixark/miles/commit/64b4e681360baf9a4f6fd8662470192eae1e9cf1)

    Snapshot-only change.

- Update Helm and Kubernetes test snapshots to record token-space cache server args of the pinned **SGLang** by *Kangrui Du* [e64ffe3](https://github.com/radixark/miles/commit/e64ffe38afb0182a0ea5d0656b7c2e41c151b8b7)

    Snapshot-only change.

- Grant CI label command permission to user bingxche in the comment-command access policy by *Jiajun Li (RadixArk)* [51253f7](https://github.com/radixark/miles/commit/51253f74918bd417ab6edd2f80387b374eb29321)

    CI access control only.

## Newly Submitted Issues

- [#4735](https://github.com/radixark/miles/issues/4735) (open): The reporter says the `radixark/miles:v0.1.3` image pairs TransformerEngine 2.17 with `flash-attn-4` 4.0.0b35. When TE picks FA4 (with `--attention-backend flash` on sm_120, and likely sm_100), causal attention comes out all zeros. Training continues silently on garbage, and the only sign is `train_rollout_logprob_abs_diff` around 12. The reporter suggests pinning or dropping FA4, documenting the sm_120 situation, and failing fast on a large log-prob gap. Hopper is reported as unaffected. Maintainers have not confirmed this as a regression.
- [#4708](https://github.com/radixark/miles/issues/4708) (open): The reporter says single-adapter **LoRA** keeps updating the MoE router `expert_bias` on both the Bridge and native paths. On the Bridge path, `--moe-router-bias-update-rate 0` reportedly never reaches the provider. The adapter doesn't export the bias, so the trainer's routing drifts from SGLang's. **R3** replay hides the drift. Multi-LoRA already freezes the bias. A CPU repro is included.
- [#4780](https://github.com/radixark/miles/issues/4780) (open): The reporter says that without `--use-fault-tolerance`, a dead rollout engine on Ray doesn't fail the run. Training continues with fewer engines, or with none. The proposal is to fail the next rollout, eval or weight update with an error that names the lost cells.
- [#4779](https://github.com/radixark/miles/issues/4779) (open): The reporter says sampling-support replay (`--rollout-top-p < 1` or `--rollout-top-k > 0`) on sglang-miles builds older than v0.5.20 fails only after the first rollout, instead of at startup. The proposal is a launch-time check. The issue also asks whether `Dockerfile.cu12`, which still pins v0.5.19, should be bumped or removed.
- [#4778](https://github.com/radixark/miles/issues/4778) (open): The reporter says `--rm-type dapo` or `boxed_dapo` without `--reward-key` crashes in reward normalization after the first rollout. The proposal is to default `--reward-key` to `score` for these types.
- [#4777](https://github.com/radixark/miles/issues/4777) (open): The reporter says the DrGRPO example reducer calls Megatron `mpu` directly, so it fails on the FSDP and torchtitan backends. The docs also give a colon-form function path that `load_function` can't resolve.
- [#4712](https://github.com/radixark/miles/issues/4712) (open): Feature request to add a `reinforce_zero` advantage estimator: unclipped token-level importance sampling with group-mean advantages, for async RL. The requester has an implementation and offers to open a PR.
- [#4776](https://github.com/radixark/miles/issues/4776) (open): RFC to support T-Head SAIL (PPU) through a new `MILES_ACCELERATOR=ppu` platform, a PPU Docker image and Qwen3.5 GRPO/OPD recipes. The plan is three PRs, and existing CUDA, ROCm and TPU paths would be unchanged.

## Stats
- **Total Commits**: 65
- **Analyzed Commits**: 65
- **Active Contributors**: 12
- **Files Changed**: 494
- **Training-Specific Commits**: 30 (46.2% of total)
- **New Issues**: 8 (8 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
