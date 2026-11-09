# EXTRACT-S7

**BLOCKED before L2 by reproduced prior Tovu test drift. S7-0 passed; L2, L3 and F7 were not started. All batches did not pass.** This is an early permitted stop, not a cap stop or successful extraction. No half-move was made.

Started 2026-11-09T17:40:00+00:00; stopped 2026-11-09T18:00:54.693550+00:00; elapsed 20.91 minutes. Owner cap: four hours including S7-0, deadline 2026-11-09T21:40:00Z; final 20 minutes reserved. Serial execution, no subagents or clock reset.

## Pins and delivery

Both remotes were identified and fetched before tracked writes; exact tips matched. Both clean checkouts had no local or remote `cloud/extract-s7`. Both branches were created from the pins, never from main.

| Repository | Remote | Verified starting pin | Final S7-0 source / subsequent F7 diff base |
| --- | --- | --- | --- |
| Tovu | https://github.com/AINSEP/Tovu.git | `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa` | `7da7fdf65cad9a384bbeeb29cdc29266a9cef794` |
| Jini | https://github.com/AINSEP/Jini.git | `46cd558de9c6b4fa882b46349450ce3bcf0a378d` | `b78fa32dbc6aab6f79c2ba77b2bc7e8babb349c4` |

Both source tips were pushed and independently verified with `git ls-remote origin refs/heads/cloud/extract-s7`. The final report/receipt commit is a report-only descendant of the Tovu source tip; its SHA is supplied in the final task response. No green L2/L3/F7 paired source exists for this session. The supplied integration receipt remains historical evidence, not a substitute for this job's gates.

No main/other-lane merge, force push, stash, publication or deployment. Explicit staging paths only. This brief and working scripts were never committed. Tovu's expected missing AI-Dev-Shop did not stop work: Jini's bootstrap was loaded. C0 was left integrated and untouched; its F7 rerun was not reached. No missing-prerequisite claim or independent C-d approval claim is made.

## S7-0 inventory

| Symbol/helper | Kind | Source | Resolution | Vocabulary |
| --- | --- | --- | --- | --- |
| resolveAgentPluginSignInPort | value | T features/agent-plugins/mcp-host-bindings.ts:45 | Delete retired test-only resolver and its type-only import; real isAgentPluginSignInRefusal stays | No new host vocabulary |
| Three dead-resolver test lines | test | T features/external-mcp/__tests__/h1a/hosted-mcp-error-identity.test.ts:48 | Coordinator-approved assertion removal, S4 retirement over S5 compatibility. Real-classifier assertion retained | One approved existing-test edit; outside subsequent F7 base |
| Registration/device/callback protocol-code sets | value | J oauth/src/{registration,device-code,authorization-code}.ts | One internal same-package set, identical 20-member contents despite order differences | OAuth protocol vocabulary, not host input |
| TOKEN_ERROR_CODES | value | J oauth/src/token-endpoint.ts:19 | Distinct 15-member set: preserve existing endpoint behavior | Brief's three identical sets refer to registration/device/callback, not token |
| OAuth error spec and adaptOAuthResponse comment | prose | J oauth/docs/spec/errors.spec.md:31; src/errors.ts:60 | Document protocol allowlists and plain unknown-code refusal/invalid_provider_error | No host vocabulary |


## S7-0 changes and verification

F2 deletes the dead resolver and its type-only import. The approved three dead-resolver test statements are the single assertion-removal exception: one setup statement plus two assertions. All four cases and every assertion against the real classifier remain. Identity suite **4/4 before and after**, exit 0. A direct runtime check confirms the retired export is absent and canonical validation errors still return true from the real classifier. No production caller of the removed resolver remained.

F3 folds registration/device/callback's identical 20-code sets into `oauth/src/protocol-error-codes.ts`, imported relatively. The token endpoint has a distinct 15-code set and is byte-identical to the starting pin. The three prior memberships were compared exactly. Public text/metadata and signatures are unchanged. Corrected `errors.spec.md`, the `adaptOAuthResponse` comment and the existing OAuth minor changeset. No dependency, lockfile, package manifest or export change.

Removed the two stale comment lines claiming plugin-runtime never uses `ToolInputError`/the rejection convention, with minimal adjacent sentence repair. The uninstall-specific refusal rationale remains. The file is not in S9's observed changed paths. No other why-comment was neutralized; no N1 rejection or own-barrel issue arose in this limited change.

OAuth baseline and restored final suite: **42 files, 755/755**, exit 0. Own consolidation error was caught as TS2440 in three files (duplicate local declarations), fixed in the next commit, then build/types/lint/tests rerun green. Meaningful mutation: remove `invalid_client` from the shared set; the exact recognized-registration case fails, 24/25, exit 1. Restoring bytes gives 25/25 and full 755/755. No test addition, assertion weakening or coverage exclusion was used. An EOF blank-line diff-check finding was repaired and diff checks rerun clean.

Checks that passed on the final S7-0 implementation: OAuth build, `tsc --noEmit`, strict changed-production ESLint (complexity and cognitive complexity ≤10, no inline config, max warnings 0); Tovu SDK build, Jini relink, contracts build, main `tsc -p tsconfig.json --noEmit`, changed-production strict lint, and XP1–XP5. No new excluded tests or type pins need separate compilation. Full L2/L3/F7 package/test matrices, plugins minor changeset, thin-shim and emitted-contract-note proofs are not claimed: those batches never started.

## Ready baseline and stop evidence

The ready baseline contains **54 explicit Tovu files, 612 tests: 602 pass, 7 fail, 1 cancellation, 2 existing skips, 0 todo**. Full selections, exact command arrays, exits, counts and case names are in [extract-s7-gates.json](extract-s7-gates.json). All plugin-runtime unit tests and all requested L2/L3 Tovu files ran, plus the named source-layout checks and F2 identity file. No full-repository suite was substituted.

Each file used `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=tap <explicit-file>`. The known enable-access case used native `--test-timeout=60000`; its actual cancellation is recorded, not green.

Nonzero results:

- `apps/website/src/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts`: exit 1; {'tests': 4, 'pass': 3, 'fail': 1, 'cancelled': 0, 'skipped': 0, 'todo': 0}. Cases: bundled cold-start guidance names the enable tool and Agent Plugin family.
- `apps/website/src/features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts`: exit 1; {'tests': 4, 'pass': 3, 'fail': 0, 'cancelled': 1, 'skipped': 0, 'todo': 0}. Cases: a declined enable remains a choice when a seeded-off plugin signs in later.
- `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts`: exit 1; {'tests': 10, 'pass': 8, 'fail': 2, 'cancelled': 0, 'skipped': 0, 'todo': 0}. Cases: every surfaceExchanges.open(...) call names a toolId constant this scan can resolve; every allowlisted id opens an exchange or is a named carve-out.
- `apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts`: exit 1; {'tests': 7, 'pass': 6, 'fail': 1, 'cancelled': 0, 'skipped': 0, 'todo': 0}. Cases: plugin production services cross feature boundaries only through injected ports.
- `apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts`: exit 1; {'tests': 17, 'pass': 15, 'fail': 2, 'cancelled': 0, 'skipped': 0, 'todo': 0}. Cases: t91 §7.1: a corrupt activations.json reaches the model through the real executor as a path-free result, not an opaque INTERNAL_ERROR; the detail goes to console.warn; t91 §7.1: activations.json corrupted while the dialog is open: confirm removes nothing and returns the same path-free result.
- `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts`: exit 1; {'tests': 25, 'pass': 24, 'fail': 1, 'cancelled': 0, 'skipped': 0, 'todo': 0}. Cases: every bundled agent and site package declares a distinct publisher identity and discovery terms.

The integration receipt covers the enable-access cancellation, completeness 8/10, publisher-identity failure and environmental skips. It does **not** select the guidance, domain-boundary or uninstall files above. These additional failures were independently rerun on a detached, tracked-clean Tovu checkout at `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa`, reusing installed/built dependencies. All three files reproduced exactly: guidance 3/4, boundary 6/7, uninstall 15/17. Relevant Jini guidance files are byte-identical to the Jini pin; no related lifecycle implementation changed in S7-0. The scratch checkout was not a new task/lane.

Concrete drift: Composio guidance says “enable the plugin with confirmation” followed by `family: "agent-plugin"`, while the frozen test demands `plugins_set_enabled` first. Higgsfield guidance has the same pattern. The boundary scanner reports the already-present `features/agent-plugins/mcp-host-bindings.ts -> ../external-mcp/external-mcp-store.js (value)` edge. Uninstall's two warning assertions expect 1 but receive 2 and 3. No assertion or prior behavior was repaired outside the authorized S7-0 scope.

Completeness arrays were read from the real failing test and remain exactly:

- Unresolved: `['cli/commands/import-local.ts:151: file']`.
- Unexplained allowlisted ID: `['agent_plugin_connect']`.

No completeness test edit or exemption. The two expected skips are in `tool-guidance.live`; no skip/todo was added.

## Setup, guards and immutable snapshot

Node v24.22.1, npm 11.9.0; top-level package gates use pinned pnpm 10.33.2 through the workspace npm cache. System pnpm is 11.25.0; a nested provider-plugin build command emitted its system-pnpm warning. Both initial clean recursive builds completed exit 0. `CI=true pnpm install --frozen-lockfile` and `npm ci` succeeded after directing package cache/store into `/workspace/work/`; the first default pnpm store attempt failed EROFS and is not a test debt. No incidental lockfile change.

Initial guard reported 14 violations: five obsolete package directories, seven missing generated Cloudflare edges, and the two inherited findings. Each of six residue directories (including the earlier `plugin-ui-ux-design` residue) was checked with `git ls-files -- <exact-path>` for zero tracked entries and removed individually: `plugin-ui-ux-design`, `plugin-ai-trace-langfuse`, `plugin-analytics-posthog`, `plugin-observability-opentelemetry`, `plugin-observability-sentry`, `plugin-payments-stripe`. Their timestamps/content came from the earlier prepared checkout, not S9. The normal agent-plugins build emitted Cloudflare assets. No broad clean/reset, tracked deletion or guard baseline edit.

A first report push inadvertently ran an unrelated desktop hook because the fetch had not installed an origin tracking ref. Its exact PID tree (root 1936) was stopped; fetching `origin/cloud/extract-integ` into its tracking ref made subsequent pushes correctly skip desktop gates. No desktop source was changed or passing desktop gate claimed. Premature Tovu attempts before package emissions were discarded as setup-invalid and the ready baseline rerun. These are setup corrections, not broadened debt.

XP3 was reproduced once in a separate clean checkout at `35c4961af718f0f30591c46d2ea2756c4484a731`: frozen install, core build, recursive build, then the current repaired checker invoked from the OLD cwd with current absolute tsx loader and `--write-baseline`. Result: **3308 mappings / 3320 declarations**, manifest **`d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459`**, exactly the integrated checksum. All 3320 emitted-file hashes were recorded and reverified; manifest/files made read-only. Every checker gate supplied `JINI_DECLARATION_BASELINE_DIR=/workspace/work/extract-s7/xp3-original`; no gate regeneration. Checker exit 0.

Actual exported layers/isolation check functions were invoked in addition to the brief's direct module commands (those modules have no CLI body). Layers **[]**, isolation blocking **[]**, **578 closures**, informational **SI-c 9 / SI-d 7**, exact findings in receipt. Plugin guards exit 0. Complete guard stdout/stderr and real exit were read personally; ready guard exit **1**, only the two documented inherited findings. No N1/N2/R8/unknown or new HW finding. Full ready output:

```text
[hardwiring] HW1-env-default: 17 total; 0 new
[hardwiring] HW2-vendor-adapter: 16 total; 0 new
[hardwiring] HW3-module-state: 135 total; 0 new
[hardwiring] HW4-injected-fetch: 1 total; 0 new
[hardwiring] HW5-jini-export: 0 total; 0 new
[hardwiring] HW6-boot-default: 0 total; 0 new
[hardwiring] HW7-public-react: 0 total; 0 new
[hardwiring] HW8-provider-url: 49 total; 0 new
[hardwiring] HW9-plugin-import: 0 total; 0 new
[guard] R13-model-fallback-freshness claude: MF3 SKIPPED — no readable ~/.claude.json and the CLI initialize handshake found nothing (Claude Code not installed/usable here). Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness codex: MF3 compared 9 live id(s) against 20 fallback entr(ies).
[guard] R13-model-fallback-freshness antigravity: MF3 SKIPPED — `agy models` unavailable (spawn agy ENOENT). Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness pi: MF3 SKIPPED — MF3 does not apply to `pi` — only MF1/MF2 (staleness date) apply. Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness aider: MF3 SKIPPED — MF3 does not apply to `aider` — only MF1/MF2 (staleness date) apply. Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness opencode: MF3 SKIPPED — MF3 does not apply to `opencode` — only MF1/MF2 (staleness date) apply. Staleness date still enforced (MF1/MF2).
[guard] R2-deep-path packages/plugin-catalog/scripts/generate.ts: relative import "../../agent-plugins/src/core/identity-namespace.js" reaches into another package's src (agent-plugins) — import by package name instead
[guard] R10-chatpane-public-surface packages/chat/src/react/features/chat-pane/components/ChatPane.tsx: imports "Icon" from "../../../components/Icon.js" (resolves outside features/chat-pane/**), but "Icon" is not in the public barrel's export list (packages/chat/src/react/index.ts) — a consumer of the published API could not reach this the same way ChatPane does

2 guard violation(s).
```

## Integrity, overlap and shutdown

The approved identity test diff is recorded verbatim in the receipt. No other existing test, fixture, golden, migration or SQL file changed. Relative to the post-S7-0 source pair, existing-test/fixture changes are **NONE**. No saved format, key/fingerprint, approval identity, activation, row or package serialization code changed. Goldens equal the starting pin:

- G-plug unit: `6fd502d4676ca2eaa0c873ba55f2f3d5268db72e3b218d38290c088d060b347a`.
- G-plug tier2: `a31f6574887d0db308446ba8d9fb793520d06a7608c5608f1221c619266a9768`.
- Metadata: `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`.

S9 overlap at 2026-11-09T18:00:54.693550+00:00: **NONE in either repository**. Compared all S7 changed paths with S9's complete changed-path inventories at Tovu `f11072b7d830654c4010c752f68d9379e14b69af` and Jini `e4c2b55681a8e8a0ab67365b0cc747a7ed84da66`; exact lists are in receipt. In particular, S9's custom-credentials `tool-registrations.ts` was not touched. No merge or write to S9.

All task-owned test/build/server processes have exited; explicit `/proc` audit found none active. The aborted setup-invalid baseline's Python PID 7331 and its exact child process group were stopped. Native test timeout completed without a leftover test. Pre-existing environment services were left alone. Both source trees were tracked-clean before this final report-only write. No test/server remains running.

Pushed commits before the final report-only descendant:

- Tovu `7da7fdf65cad9a384bbeeb29cdc29266a9cef794 style(agent-plugins): remove trailing retirement-edit blank line`
- Tovu `211acb82ed868329e313c3718097d583786c7370 docs(extraction): record S7-0 verification and prior guidance stop`
- Tovu `40cb3540086c5d8b2c59a4173f64e99d43d735c0 docs(plugin-runtime): remove retired error-classification claims`
- Tovu `5fe368ef9f47e4b3a672375a050306fe2d6b29d9 fix(agent-plugins): retire unused legacy sign-in resolver`
- Tovu `2a0d46980c56807ac140389f829e67d7ab6c8170 docs(extraction): record S7 pins and initial review-fix inventory`
- Jini `b78fa32dbc6aab6f79c2ba77b2bc7e8babb349c4 fix(oauth): remove superseded local allowlist declarations`
- Jini `12d3579e6056867601a70eb98afaf754a82cca92 refactor(oauth): share protocol error vocabulary and correct public failure spec`

**BLOCKED: prior Tovu behavior/test drift reproduced at the original source pin; the required ready baseline is red. S7-0 is complete, but not all batches passed.** Remaining work, in order:

1. Obtain coordinator disposition of the three unlisted prior failure groups above; do not silently widen debt or edit frozen assertions.
2. Complete the L2 closure/vocabulary inventory, foreign-host regressions, portable seam and full paired gate.
3. Complete L3's mechanical move, public node entry, contract notes, vocabulary/public-install proofs, changeset and paired gate.
4. Run accumulated F7 from the recorded post-S7-0 diff bases, including the untouched C0/G-cred and other additional goldens; verify/push the final pair.

## Continuation

Resumed in this thread at 2026-11-09T18:03:06Z, on the same branches. The original start/deadline remain 17:40/21:40 UTC; no cap reset. The coordinator superseded the earlier stop: guidance remains an explicitly red known failure at every gate; boundary and uninstall warning regressions are S7-0b. Earlier “prior” meant prior to this session, not prior to extraction. F7's diff bases will be the source commits after S7-0b.

### S7-0b inventory

| Symbol/helper | Kind | Source | Resolution | Host vocabulary |
| --- | --- | --- | --- | --- |
| classifyAgentPluginMcpError | value | T features/agent-plugins/mcp-host-bindings.ts:13 | Inject the canonical unconfigured-error predicate; remove cross-feature value edge; retain legacy canonical public-class fallback | No name/code duck typing; original safe error categories unchanged |
| composeAgentPluginMcp | value | T server/runtime/composition/agent-plugin-service-ports.ts:22 | Bind the same canonical external-MCP error through the predicate port | Composition owns runtime class identity |
| Uninstall console warnings | runtime evidence | T features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts:318,345 | Trace every warning before deciding repair versus coordinator-permitted known drift | No test edit; no removal of required compatibility diagnostics |

S7-0b investigation is active. No continuation terminal marker has been written.

S7-0b warning disposition proof: an external preload observed the unchanged frozen tests' `console.warn` mock while forwarding every call unchanged. First failing case: one legacy-metadata warning plus exactly one activation-refusal warning. Second: two legacy-metadata warnings (preview and post-confirmation reindex) plus exactly one activation-refusal warning. Stack traces lead through `installed-package-index.ts:111` → `ports.onEvent` → Tovu `lifecycle.ts:101`, independently of the refusal at `uninstall-tool.ts:152`. The legacy parser's existing `portable-metadata.unit.test.ts` explicitly requires the deprecation warning, and it plus installed-package indexing tests pass 21/21. Therefore the frozen uninstall assertions count unrelated required diagnostics, rather than duplicate refusal logging. Under the coordinator's conditional disposition this is known test drift; warnings and tests remain unchanged. Both exact failures remain red at every gate. Session-only diagnostic trace: `logs/continuation/uninstall-warnings.jsonl`.

S7-0b boundary regression: new injected-error-predicate test failed before the fix (`other` versus `unconfigured`), then passed. The canonical public error remains the legacy fallback; composition injects the owner's canonical predicate explicitly. Boundary suite 7/7 and canonical-error identity 4/4, combined focused 12/12. No existing test edit.

### L2 closure inventory (before production seam edits)

All sources below are T `features/plugin-runtime/` at the supplied pin. J destinations mean `plugins/src/host/tools/` after L3; L2 first writes the same bodies under T `host-tools/`. Every helper has an owning destination; no unresolved row proceeds.

| Symbol/helper | Kind | Source | Destination | Vocabulary |
| --- | --- | --- | --- | --- |
| `AGENT_PLUGIN_FAMILY` | value | tool-registrations.ts:128 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `requireAgentPluginHost` | value | tool-registrations.ts:132 | T host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `listInstalledAgentPlugins` | value | tool-registrations.ts:137 | T host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `CATALOG_BY_ID` | value | tool-registrations.ts:142 | T host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `AgentPluginListRow` | type | tool-registrations.ts:147 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `toAgentPluginListRow` | value | tool-registrations.ts:155 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `listAgentPluginsForResponse` | value | tool-registrations.ts:163 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `PluginsToolDeps` | type | tool-registrations.ts:186 | T host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `pluginsDerivedRisk` | value | tool-registrations.ts:226 | J management.ts keyed risk factory | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `SetEnabledRequest` | type | tool-registrations.ts:272 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `readFamily` | value | tool-registrations.ts:284 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `readSetEnabledRequest` | value | tool-registrations.ts:294 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `PluginApprovalIdentity` | type | tool-registrations.ts:305 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `pluginApprovalIdentity` | value | tool-registrations.ts:318 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `uninstallRequestFor` | value | tool-registrations.ts:355 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `uninstallConfirmedPlugin` | value | tool-registrations.ts:378 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `restartNoteFor` | value | tool-registrations.ts:426 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `applyAgentPluginDecision` | value | tool-registrations.ts:448 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `unwritableAgentPluginActivationsResult` | value | tool-registrations.ts:517 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `hostIncompatibleEnableResult` | value | tool-registrations.ts:542 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `linkedFaceResult` | value | tool-registrations.ts:550 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `linkedFaceEnableResult` | value | tool-registrations.ts:559 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `agentPluginEnablePreflight` | value | tool-registrations.ts:567 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `updatePendingResult` | value | tool-registrations.ts:574 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `updateJournalNextStep` | value | tool-registrations.ts:591 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `hostIncompatibleResult` | value | tool-registrations.ts:600 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `activationsUnreadableResult` | value | tool-registrations.ts:618 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `activationsBusyResult` | value | tool-registrations.ts:640 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `activationsRefusalResult` | value | tool-registrations.ts:662 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `applySiteRuntimeDecision` | value | tool-registrations.ts:676 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `requireEnablePermission` | value | tool-registrations.ts:750 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `requireSetEnabledPermission` | value | tool-registrations.ts:758 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `SiteConsent` | type | tool-registrations.ts:765 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `siteRecordBeingEnabled` | value | tool-registrations.ts:772 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `siteConsentFor` | value | tool-registrations.ts:783 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `SetEnabledPrepared` | type | tool-registrations.ts:796 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `prepareSetEnabled` | value | tool-registrations.ts:809 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `previousPluginEnabled` | value | tool-registrations.ts:823 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `currentApprovedIdentity` | value | tool-registrations.ts:833 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `runSetEnabled` | value | tool-registrations.ts:854 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `PLUGINS_MODEL_FACING_ERRORS` | value | tool-registrations.ts:880 | Split: J canonical conflict rule; T lowering error rule | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `buildPluginsRegistrations` | value | tool-registrations.ts:889 | J management.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `contributePluginsTools` | value | tool-registrations.ts:1014 | T host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `EnableConfirmationSubject` | type | tool-registrations.ts:1024 | T enable-confirmation-ui.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `FAMILY_COPY` | value | tool-registrations.ts:1039 | T enable-confirmation-ui.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `describeEnableApproval` | value | tool-registrations.ts:1059 | T enable-confirmation-ui.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `pluginResourceId` | value | tool-registrations.ts:1084 | T enable-confirmation-ui.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `pluginEnableAccessResources` | value | tool-registrations.ts:1089 | T enable-confirmation-ui.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `PluginsInstallToolDeps` | type | install-tool.ts:44 | T catalog / host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `PLUGINS_INSTALL_TOOL_ID` | value | install-tool.ts:51 | T catalog / host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `catalog` | value | install-tool.ts:53 | T catalog / host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `derivedRisk` | value | install-tool.ts:75 | J install.ts keyed risk factory | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `refusedResult` | value | install-tool.ts:83 | J install.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `localInstallEnabled` | value | install-tool.ts:89 | T catalog / host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `installInputFor` | value | install-tool.ts:95 | T catalog / host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `previewOrRefuse` | value | install-tool.ts:106 | J install.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `installedResult` | value | install-tool.ts:115 | J install.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `buildRegistrations` | value | install-tool.ts:130 | J install.ts | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `contributePluginsInstallTools` | value | install-tool.ts:161 | T catalog / host binding / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `MUTATES_DURABLE_STATE` | value | source-tools.ts:11 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `ENABLE_PLUGIN_PERMISSION` | value | source-tools.ts:12 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `WORKFLOW` | value | source-tools.ts:14 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `id` | value | source-tools.ts:15 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `file` | value | source-tools.ts:16 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `text` | value | source-tools.ts:17 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `schema` | value | source-tools.ts:18 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `pluginSourceAgentToolCatalog` | value | source-tools.ts:22 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `pluginSourceDerivedRisk` | value | source-tools.ts:44 | J source.ts keyed risk factory | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `SourceDeps` | type | source-tools.ts:50 | T legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `stringField` | value | source-tools.ts:53 | J source.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `SourceOperation` | type | source-tools.ts:59 | J source.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `SOURCE_OPERATIONS` | value | source-tools.ts:62 | J source.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `buildPluginSourceRegistrations` | value | source-tools.ts:81 | J source.ts / local contract | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |
| `contributePluginSourceTools` | value | source-tools.ts:131 | T catalog / legacy shim | Host literals resolved in vocabulary table below; generic protocol bytes unchanged |

| Vocabulary / closure | Resolution |
| --- | --- |
| admin.plugins.read/enable; plugins_list/set_enabled/uninstall/install; nine plugin_source_* ids | Required host permissions/toolIds; same descriptor and dispatch inputs; catalogs/metadata supplied whole |
| plugins/plugins-install/plugin-source domains and features/plugin-runtime catalog paths | Required registration inputs; no default in portable bodies |
| plugin, agent-plugin permission entities; plugin-activation mutation entity | Required entity inputs; adds explicit `entityTypes.agentPlugin` and install `entityType` because both are consumed, beyond R1's abbreviated member list |
| assistant mutation actor; core tool principal kind | `actorPluginId` host input; core's standardized principal kind remains its canonical core constant |
| tovu.native-escalation.v1; JSON connection id; roster origin; description; tool remoteName | Host approvalFingerprint callback closes over exact existing bytes; J retains original sorted revision JSON/schema |
| ToolAccessLoweringError and Stop/roster coordination | T canonical lowering operation + extraModelFacingErrors; J retains only own canonical PluginConflictError rule |
| Agent Plugin classes, compatibility version, search projection, legacy overrides/layout | T lazy agentPlugins binder; classifier uses canonical instanceof; compatibility receives same full safe installed revision snapshot and today's empty activeProvides; no relist |
| Plugin exports, provider faces | Additional consumed `pluginExports.catalog` local safe-row port; providerFaces contains only three used safe projection methods. Export props are host-opaque validated public data, never handles/paths |
| agent_plugin_connect, load_agent_plugin, search_agent_plugin_local, content_read.plugin, chat_list_pending_attachments, tool grammar and example URLs | T catalogs/messages only, exact bytes |
| TOVU env policy; .tovu-plugin/tovu.plugin.json; /api/p/; archive limits and owner/run attachment reading | T catalog/request parsing/install input/policy; no portable host path or environment read |
| familyRequired/restartNote/changedSinceConfirmation/updatePendingNextStep/hostIncompatibleNote/activationsUnreadableNote/activationsBusyNote; localInstallDisabledNote/installedNote/retryInstallHint | Exact R2 required messages bound by T; no other message member currently needed |
| plugin_toggled/plugin_installed/operation_failed; cms/assistant telemetry properties | T optional plain toggled/installed/installFailed callbacks preserve bytes/call counts |
| [agent-plugins] log tag | Existing plugin-family diagnostic tag justified; tool id inside the message becomes supplied toolIds.setEnabled; private error message stays only in existing server log |
| site-runtime/agent-plugin family tags; plugin:<family>:<id>; reason/result/field keys and PLUGIN_* owning-domain error codes | Stable plugin protocol/saved formats; unchanged and explicitly justified, no new host default |
| Approvals/descriptions | Generic local host-opaque description type; same prepare/describe/run methods and authenticated host handler. No J surfaces member; T closes over it for approvals and agent uninstall |
| Command gateway | Local consumed command/mutation shape only; T closes over SAME clock/idGen/changeSets/outbox/authorize and executeCommand |

Existing caller search across J packages/examples found no real caller of the moving builders or pluginApprovalIdentity (only historical TSV/comment mentions); no existing Jini test input change is authorized. Local contract notes will attach authority, identity, privacy, custody, saved bytes, preflight/order, rollback/Stop and failure obligations to each declaration/member. No new package/non-core dependency or universal runtime contract.

S7-0b gate completed: 55 T files / 613 tests, exact coordinator-disposed failure groups retained and boundary now green. All selected Jini groups and neutral connect pass; types/lint/checker/plugin guards/layers/isolation pass. The complete real guard output was read: only inherited R2/R10, unchanged HW totals and six R13 lines. Predicate-bypass mutation makes the new regression fail; restoration passes. Post-S7-0b source diff bases: Tovu `57ecbf6b3` and Jini `b78fa32db`. No frozen test changed during continuation. L2 inventory above is complete and proceeds now.

L2 implementation checkpoint: portable management/install/source bodies are in T host-tools/, legacy signatures remain, and all non-text shim/binder files are ≤80 code lines (60/37/41/46/44/21/60/2 before final comment-only notes). Nine foreign-host cases now cover ids/permissions/entities/catalog/example-URL copy, both families, soft list degradation/strict missing lifecycle, canonical classifier, install ordering/digest, source dispatch, sorted fingerprint revision and telemetry after durable OFF. Existing suites cover consent/preflight/stale/abort/rollback/Stop order. Own transport syntax/initialization and fixture issues were fixed. The first full matrix exposed captured authorize callbacks: revoking the host grant after registration could still open a dialog. The binder now returns the actual live authorize owner via a getter, preserving revocation and function identity; the 28-case family suite passes. Full L2 gate is being rerun. A deliberate wrong-read-permission mutation makes the new foreign-host regression red; original bytes restored green.

Additional resolved helper inventory: T plugin-tool-ids.ts breaks catalog/binder initialization cycles and owns only existing ids; T agent-plugin-tool-binding/install-tool-binding keep scoped owner adapters under 80 lines; J source risk closure also retains the original MUTATES_DURABLE_STATE constant. Contract-local OptionalValue<T> preserves explicit undefined across both TypeScript optional-property modes without weakening lint or runtime behavior. Legacy pluginApprovalIdentity requires a J public helper export to retain the old T export/call signature; it introduces no new workflow. Every local contract/member and public portable function has attached second-host notes for later emitted-declaration verification.
