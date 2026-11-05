# miles Weekly Digest - 2026-11-05

## Summary
This week brought a large **LoRA**/**MultiLoRA** overhaul with new per-backend `--lora-type` defaults and several breaking validation changes. It also moved the **torchtitan** backend to v0.4.0 on torch 2.14, bumped CUDA and **ROCm** images to **SGLang** v0.5.23, and made weighted multi-dataset **rollout** mixing (`--rollout-data-yaml-config`) usable end to end, with **checkpoint** resume support. Two **Megatron** correctness fixes landed: one for LR-scheduler double-stepping on resume, and one for log-prob forwards that ran in eval mode. Separately, a newly filed issue (#4697, a user report that is not yet confirmed) says the `math` reward credits `\boxed{}` answers that appear only inside `<think>`.

Source: [radixark/miles](https://github.com/radixark/miles), branch: `main`.
Coverage: commits already merged into `main`, with commit timestamps in the last 7 day(s). Open and unmerged PRs are excluded.
Issues: newly submitted issues in the same window, including open and closed issues. Reported concerns and requests are not shipped changes.
Window (UTC): 2026-10-29T23:12:13Z through 2026-11-05T23:12:13Z. Issue states reflect collection time.

## Key Changes

### 🔴 High Priority

**Training correctness (Megatron)**

- Megatron log-prob forward stays in train mode unless dropout is enabled, to match the training kernels by *Yueming Yuan* [0818cb8](https://github.com/radixark/miles/commit/0818cb872013760f0c60958846fc8a62b1611eb7)

    `forward_only` used to call `eval()` unconditionally, which switched TE attention to inference kernels, so old-policy and reference log probs came from a different function than the training forward. Now `eval()` is called only when `hidden_dropout`, `attention_dropout`, or `lora_dropout` is nonzero. This tightens train/log-prob consistency for **PPO**/**GRPO** importance ratios, **TIS** and low-precision runs. Models without dropout may see slightly different log-prob values than before.

- Fix Megatron LR scheduler stepping on resume so it only steps when the checkpoint did not restore it by *Alexander Zhipa* [3c91b71](https://github.com/radixark/miles/commit/3c91b7117669bb916942cf7fdd1666bb3a7a5d22)

    Before this fix, resuming from a **checkpoint** with `use_checkpoint_opt_param_scheduler=False` stepped the scheduler a second time and double-counted iterations, which skewed LR and weight decay. The scheduler now steps only when its state wasn't restored (`--no-load-optim`, a release checkpoint at iteration 0, or an empty load dir). A LoRA adapter resume counts as restored. This matters for any long **Megatron** RL job that resumes from checkpoints.

**LoRA / MultiLoRA / Tinker (breaking configuration)**

- Default `--lora-type` per backend and require `canonical_lora` for native Megatron LoRA by *Yueming Yuan* [67fc6a2](https://github.com/radixark/miles/commit/67fc6a29d0a128c329662245e5bbfd062cc1642b)

    Native Megatron **LoRA** now defaults to and accepts only `canonical_lora`, so `--lora-type lora` with native mode fails an assertion. Bridge keeps `lora`, **torchtitan** accepts only `lora`, and `serve_tinker.py` keeps `canonical_lora`. Because the adapter layouts differ (shared vs. per-projection `lora_A`), review checkpoints and launch configs. Helm chart snapshots and docs were updated.

- Support canonical **MultiLoRA** (independent Q/K/V and gate/up adapters) and make it the default **LoRA** layout for Tinker by *Yueming Yuan* [2ebb2e6](https://github.com/radixark/miles/commit/2ebb2e6497fa831ac9b099e50d050f731476ae8f)

    `CanonicalMultiLoRA` is now built from Megatron-Bridge, whose pin is bumped in all three Dockerfiles, including **ROCm**. **Breaking for deployment:** `lora_type` is now recorded in Tinker checkpoint metadata and validated on load. Existing checkpoints are treated as fused `lora`, so they won't load on a default gateway unless it is relaunched with `--lora-type lora`. Canonical Q/K/V requires `num_query_groups >= tensor_model_parallel_size`.

- Require explicit `--megatron-to-hf-mode bridge` for multi-LoRA instead of silently overriding it by *Yueming Yuan* [68d7ce5](https://github.com/radixark/miles/commit/68d7ce5efb4f7e0353e5a6d1d5b47639038f7f9b)

    **MultiLoRA** launches that omit the flag now fail validation in `validate_multi_lora_args` instead of having the mode forced to `bridge`. Existing multi-LoRA **Megatron** launch scripts must add the flag.

- Reject `--save`, `--save-hf` and `--save-interval` in Tinker mode and require `--tinker-checkpoint-root` by *Yueming Yuan* [5d1f012](https://github.com/radixark/miles/commit/5d1f01269bbd2b7887fc43c1e96ea618fe43c351)

    Breaking change for `serve_tinker.py` deployments. These save flags used to be accepted but had no effect. Now they fail fast, `--tinker-checkpoint-root` is mandatory, and the fallback to `<save>/tinker` is gone. Update any launch scripts that pass these flags or rely on the derived **checkpoint** path.

- Move Tinker gateway to the Tinker SDK 0.36.0 wire schema, with strict SDK version checks by *Yueming Yuan* [def6d9b](https://github.com/radixark/miles/commit/def6d9b6fe26d57b9145d70b29b0829b672ac537)

    Upgrades the **MultiLoRA** Tinker gateway from `tinker==0.26.2` to `0.36.0`. The gateway rejects other SDK versions, and `client/config` is now POST-only. Both the serving node and clients must upgrade, and `tinker-cookbook` is pinned to `0.5.9`. `stable_reinforce` loss and `save_weights_external` are not served, and only Adam is supported.

- Support shared-outer expert LoRA with multi-LoRA and Tinker, including expert-parallel gradient sync by *Yueming Yuan* [6ad0357](https://github.com/radixark/miles/commit/6ad035711b42baffeed9890e189e1fba0dd0f7db)

    `--experts-shared-outer-loras` now works with **MultiLoRA**. Bridge LoRA runs sum EP-replicated expert adapter gradients, and Tinker records the expert layout in checkpoint metadata and rejects mismatched sampler checkpoints. The Megatron-Bridge pin moves in the CUDA, CUDA 12 and **ROCm** Dockerfiles, so images need rebuilding.

- Support `--experts-shared-outer-loras` with single-LoRA `canonical_lora` and bump Megatron-Bridge by *Yueming Yuan* [cf7a06e](https://github.com/radixark/miles/commit/cf7a06e2dbf7201c7abc9faca352f1b3ad0daf75)

    In canonical mode, expert FC1 gets separate gate and up adapters. Megatron-Bridge is pinned to `f590252` in the CUDA 13, `cu12` and **ROCm** Dockerfiles. Older Bridge versions fail, so images must be rebuilt. This affects the MoE **LoRA** adapter layout served by **SGLang**.

- Enable disaggregated-mode native LoRA and PP>1 for native and bridge LoRA weight sync by *Yueming Yuan* [b573070](https://github.com/radixark/miles/commit/b573070cc5893b13f9c29ab38ae98a1ea60a38eb)

    Removes the colocate-only restriction on native **LoRA**, so adapters can sync to remote **SGLang** engines over NCCL with pipeline parallelism above 1. `--check-lora-weight-equal` now works for PP-local syncs through a merged SHA-256 manifest. Unit tests were added, but the diff contains no end-to-end disaggregated test.

- Add native LoRA `lm_head` (unembed) adapter for all model families, including tied embeddings by *Yueming Yuan* [1586bba](https://github.com/radixark/miles/commit/1586bba0df4de55b03bd98aa0e68a427582f08b9)

    Adds a generic `LMHeadSpec` for every family except Kimi K3, GLM-5.3-Flash and DeepSeek-V4.1. On tied models, the head gets its own adapter. Validation rejects an `unembed` head without `--vocab-size`, with `--enable-mtp-training`, or with `--save-hf`/eval snapshots on tied models. `validate_native_lora_args` now takes `hf_modules`, which breaks existing callers.

- Qwen3.5/3.6 GatedDeltaNet LoRA support in native and Bridge modes by *Yueming Yuan* [4678c12](https://github.com/radixark/miles/commit/4678c12ba4542b0e032b3c0a8d6006b6423cbdf7), [518def0](https://github.com/radixark/miles/commit/518def0341583c993ada40a47292496b12cea794), [e6634d4](https://github.com/radixark/miles/commit/e6634d48d14e9c018d3a707c286839ce56671c0b)

    GDN layers now get independent `in_proj_q/k/v/z/b/a` and `out_proj` adapters in native **LoRA**. Bridge `canonical_lora` exports per-component GDN adapters, which comes with a Megatron-Bridge bump in all Dockerfiles, including **ROCm**. Selections must pair `in_proj_qkv` with `in_proj_z` and `in_proj_b` with `in_proj_a`. Bridge now rejects partial fused-module selections at startup. Under `canonical_lora`, the default `attn` group now covers only `in_proj_q/k/v/z`. Existing adapter checkpoints and target configs may need updating. Native HF adapter loading also now fails on unused tensors instead of letting one failing stage hang the others.

**torchtitan backend**

- Bump torchtitan backend to v0.4.0 on torch 2.14, with a new compat layer and API migration by *Zhichen Zeng (RadixArk)* [d4c5888](https://github.com/radixark/miles/commit/d4c58889bad0864d2c49a85d102d25feea4e84e0)

    Raises the minimum torch to 2.14 and changes Dockerfile pins (including `Dockerfile.tpu`) and dependencies. The actor, trainer, **checkpoint** manager and parallel-state code move to the new torchtitan APIs. Environments on older torch fail validation, so images must be rebuilt. Re-verify checkpoint loading and **SGLang** weight sync.

- Enable torchtitan LoRA on v0.4.0 fused q/k/v and gate/up projections, switching the default to `--lora-type lora` by *Zhichen Zeng (RadixArk)* [2d9b7a4](https://github.com/radixark/miles/commit/2d9b7a44a85ff5a874d26a2b79ccf8765342ad2b)

    Replaces the `NotImplementedError` stub with a working **LoRA** path built on `LoRATransform`. **Breaking:** `--lora-type canonical_lora` now fails on **torchtitan**, and target sets must cover a fused projection fully or not at all. Support is limited to a single adapter on Qwen3, and MoE routed experts are not adapted.

- Port the torchtitan glm5_next model to torchtitan v0.4.0 APIs by *Zhichen Zeng (RadixArk)* [9b48c0d](https://github.com/radixark/miles/commit/9b48c0d6b1214d87472f3343d064e6d1c7ca745e)

    GLM-5 on **torchtitan** now uses `build_model_config` and packed token-major tensors. TP > 1 raises `NotImplementedError`, and `--seq-length` above `max_position_embeddings` raises `ValueError`. Validate existing configs and checkpoints.

- Refactor losses to a shared `ResponseLayout` abstraction with padded-row support for TPU by *HEJIAN SANG* [e45bffa](https://github.com/radixark/miles/commit/e45bffa0881f385b469b244561635dd376b58937)

    Rewrites `policy_loss_function` and the related losses so one code path serves both packed and padded (static-shape/TPU) rows. Out-of-loss-mask rows are masked to keep **PPO**/**GSPO** KL terms finite. This touches the core loss path, so check loss, KL and advantage-whitening numerics for regressions (**GSPO**, OPSM, **TIS**, KL loss).

- Make torchtitan routing replay (**R3**) work on static-shape platforms by staging ids, keeping them on the host, and filling padding without branches by *HEJIAN SANG* [12c028d](https://github.com/radixark/miles/commit/12c028d2fa8bdf7e47b6e1b53c9943cb65a62fa2)

    Routing ids are popped before each part's forward, which avoids per-microbatch recompiles. **Breaking configuration:** on static-shape platforms, `--use-routing-replay` without `--use-rollout-routing-replay`, or combined with `--ci-test`, now raises an error for **torchtitan**.

**Rollout data, reward shaping and router**

- Enable `--rollout-data-yaml-config` to select `MixedRolloutDataSource` for weighted multi-dataset mixing by *Shi-Dong* [e309e2e](https://github.com/radixark/miles/commit/e309e2eec100b0ee7cf727bc91ca825d278de2bc)

    YAML dataset mixing now works end to end: each step draws prompts by `samples_per_step` weight. `--num-rollout` is required, and `--num-epoch`, `--partial-rollout` and a custom `--data-source-path` are refused at launch. A user guide page and integration tests were added. Later commits in the series lifted several of the per-dataset field restrictions (see Medium).

- Add `--rollout-data-reset-on-load` to resume a run from checkpoint with different training datasets by *Shi-Dong* [6298c38](https://github.com/radixark/miles/commit/6298c38370a7e4bcba5705e674655521ad6df7c1)

    Keeps the model, optimizer, rollout step and sample ids while switching the dataset mix on `--load`. Without the flag, resume is now stricter: `RolloutDataResumeMismatch` is raised for changed datasets or fields, so existing commands with edited YAMLs will fail. Custom `DataBuffer` implementations must handle `drop_saved_state`. The tests are CPU-only.

- Add optional **GRPO** length penalties for correct rollouts via `--length-penalty-coeff` by *Shi-Dong* [7f83082](https://github.com/radixark/miles/commit/7f830826e946d826822ea7ec61bce08f32df7932)

    Opt-in reward shaping (off by default) that penalizes longer correct trajectories within each prompt group, applied before GRPO/GSPO normalization. Loss-mask finalization now runs before reward processing, and the nonzero-std filter uses shaped rewards. Nonzero shaping can't be combined with custom reward postprocessing or custom train-data conversion.

- Replace `--use-miles-router` boolean with `--router {sglang,miles}` selector, keeping the old flag as an alias by *HEJIAN SANG* [782696a](https://github.com/radixark/miles/commit/782696a62a7eb3fb689f301000d6e747e9874813)

    The CLI alias and legacy YAML/dashboard configs still work. Code that reads `args.use_miles_router` directly (custom plugins, scripts, Helm charts) will break and must switch to `args.router`.

**Images and models**

- Bump SGLang base image to v0.5.23, vendor DeepSeek V4/V4.1 encoders, and pin SWA bounded replay off by *Kangrui Du* [7a5bebc](https://github.com/radixark/miles/commit/7a5bebc7b0fd44ed9d7ae6b0acb4488529e04c87)

    The vendored encoders keep prompt token ids identical to v0.5.22, which preserves **TITO** consistency. `enable_decoder_swa_bounded_replay=False` keeps rollout logprobs and **R3** aligned with the trainer. The image now installs two FlashMLA builds. Anyone running DeepSeek V4 RL post-training should rebuild and re-validate.

- Bump **ROCm** Docker images to SGLang v0.5.23, adapt the **FSDP** Triton attention bridge, and expand MI350 nightly CI by *Xinyu Jiang (CMU)* [74f5bd2](https://github.com/radixark/miles/commit/74f5bd2e8fa25d79ea37c5ef272e1a25c1b13196)

    All three ROCm image variants move to **SGLang** v0.5.23. The FSDP attention bridge follows the new upstream kernel API and will break against older SGLang. **AMD** users must rebuild images. MI350 nightly CI now covers DeepSeek-V3.2 5-layer FP8 **Megatron**, DSv4 rollout parity, and SGLang session parity tests.

- Add MiniMax-M3 model support (Megatron-to-HF conversion, mbridge plugin, MSA block-max-scores Triton kernel, retuned QSA block-sparse kernels) by *Zhichen Zeng (RadixArk)* [ced322b](https://github.com/radixark/miles/commit/ced322b8cc10cffc696a61996fd622bb09330010)

    First of four commits that add the MiniMax-M3 sparse-attention MoE to **Megatron**. The retuned QSA kernels also affect the existing qwen3-next path, and the `quick_geglu` partition-stride fix applies to weight updates. **Performance** was measured on GB300 only.

### 🟡 Medium Priority

**Multi-dataset rollout mixing series**

- Add `MixedRolloutDataSource` for weighted multi-dataset **rollout** mixing via `--rollout-data-yaml-config` by *Shi-Dong* [674c295](https://github.com/radixark/miles/commit/674c2956f1965d439d22ef1ba0c48abcc1744215)

    Uses smooth weighted round-robin, which keeps exact ratios even for fully **async** rollout. Each dataset keeps its own epoch and shuffle, and samples are tagged with `dataset_name` and per-dataset `reward_spec`. The data source was wired in later by e309e2e.

- Add `--rollout-data-yaml-config` flag with validated multi-dataset YAML config by *Shi-Dong* [62d8934](https://github.com/radixark/miles/commit/62d8934d4a0ee2c046ace4b974e7b4d78b2d92ed)

    Adds strict, frozen pydantic config parsing (YAML or `base64:` payload). The flag is mutually exclusive with `--prompt-data`, and per-dataset limits may only lower run-wide limits. Argument snapshots gain a `rollout_data_yaml_config: null` default.

- Checkpoint and resume the mixed rollout data source's per-dataset positions by *Shi-Dong* [356bea0](https://github.com/radixark/miles/commit/356bea0532b2820049ad853ef1621858bfaa04a2)

    A resumed **checkpoint** run draws the same prompts in the same order. Resume fails clearly if the dataset list changed or a dataset was filtered shorter than the saved offset.

- Verify mixed rollout datasets against pinned sha256 at startup and on checkpoint resume by *Shi-Dong* [e4ce311](https://github.com/radixark/miles/commit/e4ce3117b438a2928c4b95bf2f0df60b9db38c06)

    Prevents silently training on regenerated or edited data. Checkpoints now store a `sha256` key, so older mixer checkpoints that lack it will probably fail to resume.

- Per-dataset generate function, agent function, agent config and `max_seq_len` for mixed datasets by *Shi-Dong* [274342e](https://github.com/radixark/miles/commit/274342ed6e586cb87903082c69f85ad64888d365), [7a6c5f9](https://github.com/radixark/miles/commit/7a6c5f9c70e2a144b6e4615084d61320d68570b8), [070f70c](https://github.com/radixark/miles/commit/070f70c8bc37cf7fe10f1174969e2dde8e83b957)

    Datasets can set their own `custom_generate_function_path`, `custom_agent_function_path`, `max_seq_len` and free-form `agent` block, so one run can mix single-turn math with **agent** tasks. Hook functions are imported and validated at startup, and per-dataset fields used under generate functions that don't read them are rejected. Agent abort on shutdown/hot restart now runs once per distinct agent.

- Per-sample and per-dataset response budgets by *Shi-Dong* [556deb1](https://github.com/radixark/miles/commit/556deb115f66851e9b3d50733d46c48e92420186), [4cb6538](https://github.com/radixark/miles/commit/4cb6538d06c4ec5be79b548a4cdf037bd28b46af)

    `Sample.max_response_len` can lower `max_new_tokens` below `--rollout-max-response-len`, and invalid values raise `ValueError`. Mixed datasets now pass their `max_response_len` through to **SGLang** and agent calls. Resuming with a changed value is refused. The truncation metric still compares against the global limit.

- Log per-dataset rollout metrics (reward, response length, truncation ratio) for mixed datasets by *Shi-Dong* [e4bab7e](https://github.com/radixark/miles/commit/e4bab7eb8677baa27088e2bfdbb89656a8f29826)

    Adds `rollout/dataset/<name>/...` metrics. Dataset names must now match `^[A-Za-z0-9_.-]+$`.

- Flatten rollout groups that mix bare samples and compact rollouts in `postprocess_rollout_data` by *Shi-Dong* [ad799fd](https://github.com/radixark/miles/commit/ad799fdba9055dee980a91b291ffff1f1df6e352)

    Fixes an `AttributeError` crash when a batch mixes single-turn groups and compact multi-turn groups.

- Make per-sample `reward_spec.custom_rm_path` follow the same hook-config and batched-group rules as `--custom-rm-path` by *Shi-Dong* [2779144](https://github.com/radixark/miles/commit/27791442054b635b5ed594f0cb143ee2dcd55ccc)

    Cases that previously ran unconfigured or silently ignored the spec now raise `ValueError`, so a wrong grader fails fast.

**Reward shaping**

- Add group-relative correct-answer length penalty helpers for reward shaping by *Shi-Dong* [49e99b7](https://github.com/radixark/miles/commit/49e99b7591898dbadcc70dc70da6035c0069057c)

    Adds `apply_length_penalty` and validation helpers. These were wired in later by 7f83082.

- Extract shared prompt and trajectory grouping helpers into `miles/rollout/reward_shaping.py` by *Shi-Dong* [6a282b4](https://github.com/radixark/miles/commit/6a282b4a30a55deae82cc4c32be449c842a6bf12)

    The logic is unchanged. The shared-reward `ValueError` message no longer includes the rollout id.

- Log counted tokens and applied length penalties per session, and pin tracer-owned `session_id` in agentic rollouts by *Shi-Dong* [6114c3a](https://github.com/radixark/miles/commit/6114c3a10fe39d8b97713d555cb0368bd8612f5d)

    Makes **GRPO** length shaping auditable. `agentic_tool_call` now overwrites `session_id` with the tracer's ID, so agent-supplied metadata can't spoof it.

**Training backends**

- Fetch sampling masks for `custom_loss` when sampling support replay is enabled in Megatron backend by *Alexander Zhipa* [351cd09](https://github.com/radixark/miles/commit/351cd09de580294ddff20c6decc9986d6fcd3e49)

    Custom RL objectives can now read replayed sampling support, which keeps **Megatron** training consistent with rollout sampling.

- Fix batch normalization of geometric **TIS** weights so the mean is taken over sequences by *Alexander Zhipa* [a14a56b](https://github.com/radixark/miles/commit/a14a56b7fa7e061ed96eb29cccaa2594eaf4c9e1)

    Geometric **truncated importance sampling** weights were normalized over tokens, which biased the mean toward long sequences. This affects the `examples/infra_features` MIS helper.

- Load Megatron-Bridge plugins via a new `load_auto_bridge` helper instead of on `megatron_utils` import by *Yueming Yuan* [7fc1f62](https://github.com/radixark/miles/commit/7fc1f627523346787371c923685553ee14176f9b)

    Plugins now register reliably whenever a bridge is built. A plugin import failure on the bridge path now raises an error instead of logging a warning.

- Make native LoRA exporter `export_lora_hf_named` take an explicit adapter iterable instead of model chunks by *Yueming Yuan* [b63215f](https://github.com/radixark/miles/commit/b63215f42116a404396943721d8affc38a58d013)

    There is no behavior change in-tree, but out-of-tree callers of the old signature will break. Export is collective across TP/EP ranks.

- Add the miles-ext-kernels git submodule behind a new `--use-miles-ext-kernels` flag by *Yueming Yuan* [ff97a63](https://github.com/radixark/miles/commit/ff97a63b6971f4c2f176d7d99f902163aac7dc01)

    Opt-in only. It adds a `cake` attention/top-k backend choice, and deployments that use it must check out submodules and set `PYTHONPATH`.

- Fix inkling model scripts to set `--ffn-hidden-size` to the dense MLP width by *Yueming Yuan* [241d147](https://github.com/radixark/miles/commit/241d147e6f6faf7125d5eaa0035d8a6a0f7279e7)

    Corrects `inkling` (3072 → 24576) and `inkling-small` (2048 → 16384), which would otherwise cause checkpoint shape mismatches. The **AMD** `run_inkling.py` script gets the same fix.

- Add MiniMax-M3.1-Flash **Megatron** training recipes (full and 4-layer) and a CI test by *Zhichen Zeng (RadixArk)* [3a7659a](https://github.com/radixark/miles/commit/3a7659a4c7f2a62468329860ef91c56b5564e7d7)

    The full recipe runs on 32 GPUs (PP4/EP8) from a bf16 conversion of the MXFP8/**NVFP4** checkpoint. The 4-layer variant has an H200 CI test with metric gates.

**Router, Tinker and distributed execution**

- Move routing-key header decisions to the router backend, with PD prefill and decode policy passthrough by *HEJIAN SANG* [65feb4a](https://github.com/radixark/miles/commit/65feb4a616bd935890cdac6ca06b1dca5cee28dd)

    The router backend now decides session pinning, and a warning is logged when turns may lose prefix-cache reuse. `prefill_policy`/`decode_policy` are forwarded for PD runs. Helm chart snapshots changed.

- Add Dynamo router/sidecar config schema and `--dynamo-config` router argument (1/13 of the series) by *Zhongdongming Dai (NVIDIA)* [ce34891](https://github.com/radixark/miles/commit/ce34891436e340b28005f18ba96ce3bca1145255)

    Configuration only, with no runtime change yet. This is groundwork for a Miles-managed **router** and **SGLang** sidecar.

- Delegate router worker environment variables to `RouterBackend.env_var` by *Zhongdongming Dai (NVIDIA)* [cf79310](https://github.com/radixark/miles/commit/cf79310a155fa01a7c1696da828948980e44148b)

    New backend hook. The built-in backends are unaffected.

- Implement Tinker SDK session finish endpoint so `ServiceClient.close` frees LoRA adapter slots immediately by *Yueming Yuan* [e7ecda1](https://github.com/radixark/miles/commit/e7ecda13c8acfeca0053d9599985ea25164768b0)

    Prevents slot exhaustion in multi-tenant **LoRA** serving. It requires Tinker SDK ≥ 0.36, and session state is lost on gateway restart.

- Keep service and **Ray** worker ports out of the host's ephemeral port range by *Bo Li* [e8046ac](https://github.com/radixark/miles/commit/e8046accd214b8038e8593000ad4c39243a5aaa4)

    Removes intermittent "Address already in use" failures in multi-node jobs. `MILES_SCRIPT_EXTERNAL_RAY=1` users must add `--min-worker-port 0 --max-worker-port 0` to their own `ray start` commands.

- Compute engine weight checksums only when the event analyzer checks them by *Alexander Zhipa* [835347a](https://github.com/radixark/miles/commit/835347ae8b87c136c4cd2ddd15a54396b10f0cc4)

    `--save-debug-event-data` alone no longer triggers the large transient allocation needed to materialize **SGLang** weights. The checksums are still enabled under **fault tolerance**/event analyzer. Users who relied on the old default must now pass the flag explicitly.

- Add Novita Agent Sandbox as a new sandbox provider for agentic rollouts and OpenEnv/Harbor examples by *CeerDecy (erda-project)* [84371c3](https://github.com/radixark/miles/commit/84371c38c40c5c8ff7df144f23f6837d46cc00d4)

    Opt-in via `OPENENV_SANDBOX_BACKEND=novita`. It joins Daytona, E2B and Modal as a backend for **agent** rollouts.

**TPU and ROCm platform**

- Default TPU rollouts to a bf16 KV cache unless `--sglang-kv-cache-dtype` is set by *HEJIAN SANG* [4268e2c](https://github.com/radixark/miles/commit/4268e2c03c0692e0ac2a45dc0dddb4cc10bf4be0)

    sglang-torchtpu's `auto` setting produced an unscaled fp8 KV cache that skewed rollout logprobs against the bf16 trainer. **CUDA** behavior is unchanged.

- Update TPU Docker image with patched torch_tpu (job-local worlds) and sglang-torchtpu (all-gather fix, ICI weight receiver) by *HEJIAN SANG* [4e7edeb](https://github.com/radixark/miles/commit/4e7edebd3095d3f699247f8b1cf290d69e0f4ed7)

    Fixes wrong first tokens at TP≥4 on tpu7x and enables `--update-weight-transfer-mode ici` on the engine side.

- Disable SGLang's gfx950 fused DSA indexer in the **AMD** GLM-5.2 744B launch script so online weight updates work by *Michael* [1dcc6b7](https://github.com/radixark/miles/commit/1dcc6b7a6d47ab4c48b9007e8d56bfc421d47b38)

    **ROCm impact:** without `--no-sglang-enable-dsa-fused-indexer`, weight sync to rollout engines fails on gfx950.

- **ROCm** image dependency pins: openai 2.8.0 and `tml-renderers==0.1.0` by *Michael* [9089c1d](https://github.com/radixark/miles/commit/9089c1d94b3be5307840ce167881b4509e6a9332), [d68080a](https://github.com/radixark/miles/commit/d68080a9503536f4d28e3fb138d01c9d8b3affe9)

    Fixes **SGLang** import errors and Inkling serving in `docker/Dockerfile.rocm`.

### 🟢 Low Priority

- Expand e2e CI to cover the LoRA adapter layout matrix (canonical vs fused, shared-outer, fused shared experts) by *Yueming Yuan* [3eed789](https://github.com/radixark/miles/commit/3eed7893874105a42aa18f576664438a7a5e8b73)

    Mostly tests. It adds an opt-in `sglang_shared_experts_fusion` option to the GLM-5.2 **LoRA** script.

- Log `rollout/step` alongside train metrics in `log_train_step` by *Alexander Zhipa* [0c46547](https://github.com/radixark/miles/commit/0c46547ac3648b3592e780b5a03f078e4542c4ff)

    Makes it easier to align training curves with rollout steps, including in **multi-policy** runs.

- Docs: new recipe pages for MiniMax-M3, MiniMax-M3.1-Flash, Kimi-K3.1 W4A16 LoRA, plus Inkling image update by *Zhichen Zeng (RadixArk)*, *Jiajun Li (RadixArk)*, *Yueming Yuan* [eccab31](https://github.com/radixark/miles/commit/eccab31c432af395bbba8cdf0aafbe5169d5be83), [286634c](https://github.com/radixark/miles/commit/286634cc6aacec369938190880bdbd80d9b3769c), [2f445ed](https://github.com/radixark/miles/commit/2f445ed2a8bf1c7d6be92b783ab48e99a6670355), [640664e](https://github.com/radixark/miles/commit/640664e2708401f14a9a55064814fdb4f69e9e97)

    Documentation only. The Kimi-K3.1 recipe depends on an SGLang branch and launcher PRs (#4666, #4667) that this commit does not ship.

- Test fixes for session-id parity, stage-a-cpu args fixture, and Kimi K3 reward gating by *Zhichen Zeng (RadixArk)*, *Jiajun Li (RadixArk)*, *Kangrui Du* [3de5104](https://github.com/radixark/miles/commit/3de51045159f2cc0fe32580eff7800224b6436fe), [8090b8e](https://github.com/radixark/miles/commit/8090b8e1ebc0c4c0ebe68d4d551f123c050c9593), [bc02993](https://github.com/radixark/miles/commit/bc0299339cb5ffcd0fdc2d90ed04543e5b41cd8b), [c62ea5d](https://github.com/radixark/miles/commit/c62ea5d8c2851f63a21fcb42296fdaa6910bce69)

    Test-only fixes that remove flaky or spurious CI failures. They have no runtime impact.

- CI infrastructure: GitHub API retry helper, `radix_transfer_plugins` reinstall per SGLang ref, comment-command allowlist update, **AMD** Verifiers venv fix by *HEJIAN SANG*, *Jiajun Li (RadixArk)*, *Michael* [7154ff8](https://github.com/radixark/miles/commit/7154ff898764a279be145c5317937349482c556b), [c820409](https://github.com/radixark/miles/commit/c8204093baf1e38aba38b53619237ece7ca9f500), [38851b6](https://github.com/radixark/miles/commit/38851b6dfc7d5c848cfa38787e3df5acc571b50b), [166925a](https://github.com/radixark/miles/commit/166925ae73a740049245a14001daa37e3e9ef844)

    CI-only changes. They make CUDA, CPU and **ROCm** CI more reliable.

## Newly Submitted Issues

- [#4697](https://github.com/radixark/miles/issues/4697) (open): A user reports that the `math` reward (and `boxed_math`, `boxed_f1`, `boxed_dapo` and other `boxed_` types) grades the last `\boxed{}` anywhere in the response, including inside `<think>` or in reasoning that was never closed. If confirmed, reasoning-model RL runs could be rewarded for answers the model abandoned mid-thought or for truncated responses. `deepscaler` and `gemma_math` reportedly grade only the text after the end-of-reasoning marker. This is a reported issue and has not been confirmed as a regression.
- [#4657](https://github.com/radixark/miles/issues/4657) (open): A tracking issue for RL training on TPU v7x, with a torchtitan trainer on `torch_tpu`, a sglang-torchtpu rollout engine, and weight sync over ICI. It lists landed and pending PRs (#4589 ICI sender, #4213 TPU trainer, #4656 image pin). The main reported limitation is a step-0 compile of about 25 minutes. ICI sync is also limited to topologies where the engine TP size equals the trainer rank count, and LoRA, PD and colocate are not supported.
- [#4601](https://github.com/radixark/miles/issues/4601) (open): The torchtitan e2e test `test_muse_spark_last4_lora.py` is disabled because the CI image's sglang can't serve Muse Spark Open. Re-enabling it needs that omni model in sglang-miles, plus LoRA restricted to the text decoder.
- [#4590](https://github.com/radixark/miles/issues/4590) (open): A feature request for agentic RL recipes on Qwen3.8 Flash Next with 128k+ context, larger GPU scale and **async** mode. The user notes that current recipes cover only single-turn math at 8192 tokens on 32 GPUs in synchronous mode.

## Stats
- **Total Commits**: 74
- **Analyzed Commits**: 74
- **Active Contributors**: 12
- **Files Changed**: 388
- **Training-Specific Commits**: 24 (32.4% of total)
- **New Issues**: 4 (4 open, 0 closed at collection time)

---
*Generated by [Claude Code](https://claude.ai/code). Verify key conclusions against the linked commits and issues.*
