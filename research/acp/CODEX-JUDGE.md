Software Architect / Security(Review): **Verdict: needs rework.**

Reviewed design `89bb0a20`, Jini `02edbb68`, and Tovu `80b00f5b`, using Git reads only. No files changed or tests run.

References below use `AR/` for `packages/agent-runtime/src/`, `DA/` for `packages/daemon/src/agent-executor/`, and `D`/`R` for the reviewed `DESIGN.md`/`RESEARCH.md`.

1. **Blocker — The Claude profile cannot preserve the existing security contract.**

   **Evidence:** D:88 limits `sessionMeta` to `NativeToolPolicyInput`. That interface contains five permission fields, but no filesystem root, read-only directories, explicit tool allow/deny lists, settings, or setting sources (`AR/native-tool-policy.ts:53–58`). Those inputs currently drive mandatory restrictions in `AR/defs/claude.ts:96–119,135–146,274–285`. In particular, filesystem confinement reaches Claude through generated `--settings`; validating paths before spawn does not install that confinement.

   Replacing native arguments with the proposed profile can therefore retain a “folder-limited” host decision while dropping its enforcement. ACP workspace roots alone do not guarantee shell confinement. [ACP workspace security](https://agentclientprotocol.com/protocol/v1/session-setup#workspace-root-security).

   **Fix:** Define the complete authorized launch-policy contract. Extend the existing Claude policy owner to produce native and adapter representations, and verify denied outside-root reads, writes, shell access, personal MCP, and settings inheritance before opt-in.

2. **Blocker — Switching an HTTP-capable def to ACP can silently remove Jini’s tools.**

   **Evidence:** D:256–258 changes the stream format and MCP strategy. Existing Claude and Codex defs also declare `mcpHttp: true` (`AR/defs/claude.ts:295`; `AR/defs/codex.ts:438`). When HTTP preparation succeeds, `DA/launch.ts:1567–1568` deliberately sets `mcpBridge` to `null`. ACP dispatch receives only that bridge and derives `mcpServers` exclusively from its `acp-merge` variant (`DA/events.ts:1305–1307`).

   Moreover, `AcpMcpServerInput` and its normalizer have no URL/header fields (`AR/agent-protocol/acp/session-params.ts:14–20,64–77`). A1 records `mcpHttp`, but no step implements HTTP descriptor delivery.

   **Fix:** Carry the prepared endpoint through ACP dispatch and serialization, including capability checks and cleanup. Test both required HTTP and stdio fallback through the executor before migrating either def.

3. **Major — Codex staging cannot remain unchanged when delivery becomes `acp-merge`.**

   **Evidence:** D:178 says staging files are untouched; D:264–266 says to call the existing staging function. That function obtains its entry only from an HTTP endpoint or a `codex-toml` bridge (`DA/codex/home-staging.ts:234`). With an ACP bridge, it either refuses explicit personal-config restrictions or returns `null` (`:235–241`).

   Staging also depends on `home-config.ts` for security-sensitive removal of personal MCP and trusted-project tables (`:129–139,182–194,222–230`). It is not merely replaceable MCP serialization.

   **Fix:** Separate isolation inputs from native MCP delivery inside the existing staging owner. Specify this prerequisite before D1 and preserve the refusal behavior. An assertion that an environment variable exists cannot verify the staged contents.

4. **Major — G3 misses the broken end-to-end resume path.**

   **Evidence:** A3 changes the ACP method, but `DA/launch.ts:1319–1338` and `DA/events.ts:1260–1273,993–1005` never forward `resumeSessionId`. On creation, `recordSessionIdentity` saves a durable handle from `openCodeSessionId`, but not standard `result.sessionId` (`AR/agent-protocol/acp/session.ts:819–823`). The daemon also does not use `controller.getDurableSessionId()` when finishing; it persists only a session ID captured from translated events (`DA/events.ts:1079,1089–1093`).

   Thus A3’s `FakeAcpChild` test can pass while real follow-up runs still create fresh sessions. Standard ACP uses the returned session ID for later load/resume. [Session setup](https://agentclientprotocol.com/protocol/v1/session-setup).

   **Fix:** Include dispatch forwarding, durable-ID capture, host persistence, and resume eligibility in one migration contract. Test two executor runs joined through the actual stored session reference, without `openCodeSessionId`.

5. **Major — G2’s impact is factually wrong, and A7 replaces it with silent model substitution.**

   **Evidence:** R:172 calls an unsupported `session/set_model` a wasted round trip rather than a failure. Recovery requires `!effects.model || effects.model === 'default'` (`AR/agent-protocol/acp/session.ts:357–358`), whereas sending the request requires a non-default explicit model (`:796`). The executor normally resolves a concrete model before dispatch (`DA/launch.ts:1240–1250`).

   A7 then proposes proceeding on the agent default when the selected model cannot be set (D:238). Opting into ACP does not authorize changing the user’s model selection.

   **Fix:** Correct G2. Preserve explicit selection through a supported mechanism or return an actionable unsupported-selection error. Cover the concrete-model executor path.

6. **Major — Reasoning effort disappears from the proposed ACP contract.**

   **Evidence:** Native Claude forwards `options.reasoning` through `--effort` (`AR/defs/claude.ts:84–86,257`). Codex invokes its model/effort argument builder (`AR/defs/codex.ts:401`). ACP options contain only `model`, and ACP dispatch forwards no reasoning value (`AR/agent-protocol/acp/session.ts:120–168`; `DA/launch.ts:1319–1338`).

   Neither `AcpProfile` nor A1–A7 adds effort/config-option selection, despite the research identifying `thought_level`. ACP exposes reasoning selectors separately from model selectors. [Session config options](https://agentclientprotocol.com/protocol/v1/session-config-options).

   **Fix:** Specify ordered model and effort selection, including unsupported values and model-dependent option changes. Require parity tests before removing native argument delivery.

7. **Major — A2 has no route from the def’s profile to the session.**

   **Evidence:** D:233 requires the AMR def to pass its profile in the same commit and labels Phase A “agent-runtime only.” The actual route is def → `dispatchAcpPrompt` → `runAcpDispatch` → `wireAcpLifecycle` → `attachAcpSession`. It currently passes no profile or equivalent vendor hooks (`DA/launch.ts:1314–1354`; `DA/events.ts:993–1005,1083–1104,1289–1317`).

   Updating a def and the attach-options type alone cannot activate the profile. Restating C6’s types does not supply this missing value flow.

   **Fix:** List every forwarding contract, caller, fake, and C6 copy in A2’s commit. Either thread the selected profile through the port or define a runtime-owned binding that receives the selected def explicitly.

8. **Major — A2’s claimed default parity is contradicted by today’s filtering behavior.**

   **Evidence:** D:94 gives the default profile no text filter; D:233 moves filtering into AMR. Today the tool-call suppressor is instantiated unconditionally (`AR/agent-protocol/acp/session.ts:1052`) and applied by the shared message handler (`:419–426,547 onward`). Its module explicitly describes a generic tagged-block mechanism (`text-suppression.ts:1–8`).

   Moving this behavior only to AMR changes other existing ACP defs. A0’s outgoing-frame equality will not detect changed assistant output. G7 also misses the OpenCode-specific promotion that remains in shared `rpc.ts:98–122`, called from `session.ts:372–375`.

   **Fix:** Inventory filtering behavior separately from vendor policy. Preserve current emitted events unless a behavior change is explicitly approved; test split tags, flushing, prose, and tool events. Include the omitted OpenCode promotion in the ownership decision.

9. **Major — The host switch selects a different registry view from detection and preflight.**

   **Evidence:** D:116–121 places selection in `defs.get` without tracing its consumers. `createNativeAgentRuntime` independently binds detection, model probing, launch resolution, and lookup (`AR/native-runtime.ts:54–59`). Tovu uses that runtime’s lookup for selection, permissions, and preparation (`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:205–210,473,642,1104`). Inventory also defaults to static `AGENT_DEFS` (`apps/website/src/assistant/agents.ts:94,180`).

   Changing only the daemon binding leaves native capability/auth/model information describing an ACP launch. For Codex, launch adaptation is additionally keyed solely by `def.id` (`AR/launch.ts:21,32–35`).

   **Fix:** Choose variants once in the runtime-owned catalog and use that selection consistently across discovery, preflight, launch, and execution. Define adapter and engine executable identities separately.

10. **Major — A4’s new usage event is discarded, and its test cannot validate the full cost contract.**

    **Evidence:** D:235 proposes a new agent event while keeping Phase A inside agent-runtime. The daemon accepts a fixed event-type table; unknown types are ignored (`DA/event-translation.ts:175–186,211–216`). Existing usage translation already supports `cumulativeCostUsd` and `costSessionId`, but no context occupancy fields (`:50–65`).

    Two updates and one prompt result cannot test cumulative cost across resumed runs. ACP cost also has a required currency/unit and is not necessarily USD. [ACP usage updates](https://agentclientprotocol.com/protocol/v1/prompt-turn#session-usage-updates).

    **Fix:** Reuse the existing cumulative-cost mechanism where applicable. Explicitly design context occupancy and non-USD handling, with downstream contracts and tests covering multiple runs, session changes, resets, and missing cost.

11. **Major — The adapter lifetime guarantee is unsupported by the actual teardown paths.**

    **Evidence:** D:316–318 promises adapter processes start and stop with the run using today’s process-tree stop. Cancellation does call tree termination (`DA/events.ts:1054–1057`). Ordinary ACP completion and protocol failure instead signal only the immediate child (`AR/agent-protocol/acp/session.ts:1149,1184,1370–1373`). The close handler then cleans staged files (`DA/events.ts:1060–1067`).

    This does not establish that a backing vendor engine has exited before cleanup. The added adapter/engine relationship makes that assumption material. Both adapters can launch their own engine binaries. [Codex adapter](https://github.com/agentclientprotocol/codex-acp#installation), [Claude adapter](https://github.com/agentclientprotocol/claude-agent-acp#standalone-executables).

    **Fix:** Specify descendant ownership for success, protocol failure, crash, and cancellation. Verify exit before releasing sensitive staging. Also review raw stdout/stderr retention (`DA/events.ts:1040–1048`); disabling an adapter log directory alone does not address those sinks.

12. **Major — The savings and lane-K conclusions lack a valid deletion ledger.**

    **Evidence:** The raw 3,249-line ACP count and sampled vendor file totals reproduce. The proposed deletions do not follow from those counts:

    - D:150 assigns roughly 250 lines to Claude launch arguments; the actual `buildArgs` occupies `AR/defs/claude.ts:242–287`, with policy helpers needing separate retention decisions.
    - D:152 credits Antigravity with the 205-line Gemini parser, although Antigravity selects `eventParser: 'antigravity'` (`AR/defs/antigravity/index.ts:278–279`). Gemini is registered separately under `legacy-google-stream-json` (`AR/json-event-stream.ts:206`).
    - D:202 classifies all Codex `home-config.ts` as replaceable MCP delivery despite its retained isolation work.
    - D:210 relies on “R8 §12.14.” The cited R8 artifact at `5bf9c7fb` ends at line 331 with §10; that section and claimed lane-K contract are absent.

    **Fix:** Produce a symbol-level retained/deleted/shared ledger with caller and test changes. Separate unrelated dead-code cleanup from ACP savings. Recalculate net savings after the missing security, transport, and forwarding work, and identify the actual lane-K contract.

13. **Major — The plan knowingly leaves materially changed functions outside owner limits without an approved exception.**

    **Evidence:** D:305 defers the 1,608-line session file to an unverified size lane, while A1–A7 materially extend its state machine. `attachAcpSession` alone occupies `AR/agent-protocol/acp/session.ts:1007–1608`. D:304 also incorrectly says it currently has a single-object signature: line 1007 already uses required and optional objects.

    **Fix:** Make the approved size refactor a prerequisite or obtain a specific exception before estimating and dispatching these changes. Correct the signature claim and enforce the two-object convention on new hooks.

The inventory check covered all 28 defs. These 15 sampled rows show the current-format classifications against source:

| Def | Verified format | Evidence under `AR/defs/` |
|---|---|---|
| amr | ACP | `amr/index.ts:279` |
| auggie | ACP | `auggie.ts:23` |
| cline | ACP | `cline.ts:25` |
| devin | ACP | `devin.ts:43` |
| goose | ACP | `goose.ts:26` |
| hermes | ACP | `hermes/index.ts:53` |
| kilo | ACP | `kilo.ts:15` |
| kimi | ACP | `kimi.ts:20` |
| kiro | ACP | `kiro.ts:15` |
| reasonix | ACP | `reasonix.ts:31` |
| trae-cli | ACP | `trae-cli.ts:19` |
| vibe | ACP | `vibe.ts:15` |
| claude | Claude stream JSON | `claude.ts:290` |
| codex | JSON event stream | `codex.ts:428` |
| opencode | JSON event stream | `opencode.ts:88` |

G1, G3–G6, G8, and G9’s stated code absences/size were confirmed; G2’s impact and G7’s inventory require the corrections above. Configuration does not establish that all 12 existing ACP integrations work live.

Primary-source spot checks confirmed OpenCode’s native ACP command, the separate Claude/Codex adapters, and Pi’s RPC wrapper with its MCP limitation. [OpenCode](https://opencode.ai/v1/docs/acp/), [Claude](https://github.com/agentclientprotocol/claude-agent-acp), [Codex](https://github.com/agentclientprotocol/codex-acp), [Pi](https://github.com/svkozak/pi-acp#limitations). The cited historical hashes could not be fetched through browsing, so their exact versions, registry totals/quarantine count, and remaining registry-only coverage claims were not independently verified.

## Recurring mistake classes

- Track the adapter executable and its backing engine as separate identities, with separate version, probe, configuration, and teardown contracts.
- Distinguish configured support, advertised capability, and demonstrated interoperability; none proves the next.
- Preserve telemetry dimensions: context occupancy versus billable usage, cumulative snapshots versus deltas, and currency or credit units.
