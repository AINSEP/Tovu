id: SP-headless-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/contracts/headless
precondition: TODO(judge)   # MOVE-AFTER only (label: MIXED)
tovu_files:
  - apps/website/src/contracts/headless/assistant-subagents-policy.ts | blob 933f928874a849d88ee0a8aa658f7d55b723f311 | blob-guarded | 19 loc
  - apps/website/src/contracts/headless/plugin-host.ts | blob 8de8814f4c76dad34722291aad588a2eb2a7e1ce | blob-guarded | 96 loc
tovu_tests:
  - apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts | blob 4ff8e2f5f3c42afe923ecdf533187acff271d7c0 | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/contracts/headless/assistant-subagents-policy.ts (survey label MIXED; note: `@jini-ai/agent-runtime/native-tool-policy` (existing). No ports needed.)
declarations (name | line | kind):
  - ASSISTANT_SUBAGENTS_NAMESPACE | apps/website/src/contracts/headless/assistant-subagents-policy.ts:2 | const
  - ASSISTANT_SUBAGENTS_KEY | apps/website/src/contracts/headless/assistant-subagents-policy.ts:3 | const
  - ASSISTANT_CLI_PERMISSIONS_KEY | apps/website/src/contracts/headless/assistant-subagents-policy.ts:5 | const
  - ASSISTANT_CLI_CAPABILITIES | apps/website/src/contracts/headless/assistant-subagents-policy.ts:6 | const
  - AssistantCliCapability | apps/website/src/contracts/headless/assistant-subagents-policy.ts:16 | type
  - AssistantCliAgentPermissions | apps/website/src/contracts/headless/assistant-subagents-policy.ts:17 | interface
  - AssistantCliPermissions | apps/website/src/contracts/headless/assistant-subagents-policy.ts:18 | interface
  - ASSISTANT_SUBAGENTS_WRITE_REASON | apps/website/src/contracts/headless/assistant-subagents-policy.ts:19 | const
split:   # one row per declaration above, none omitted
  - ASSISTANT_SUBAGENTS_NAMESPACE | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - ASSISTANT_SUBAGENTS_KEY | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - ASSISTANT_CLI_PERMISSIONS_KEY | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - ASSISTANT_CLI_CAPABILITIES | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - AssistantCliCapability | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - AssistantCliAgentPermissions | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - AssistantCliPermissions | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - ASSISTANT_SUBAGENTS_WRITE_REASON | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
ports: TODO(judge)
shape_changes: TODO(judge)
census_cmd: rg -n --no-heading -e '["'][^"']*assistant\-subagents\-policy(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/headless/assistant-subagents-policy.ts
importers (4 prod, 1 test; resolved to this file):
  - apps/website/src/assistant/daemon-core-protocol.ts:5 | static | "#src/contracts/headless/assistant-subagents-policy"
  - apps/website/src/contracts/core/assistant-native-fallbacks.ts:1 | static | "#src/contracts/headless/assistant-subagents-policy"
  - apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:7 | namespace | "../assistant-subagents-policy.js"
  - apps/website/src/contracts/headless/index.ts:13 | reexport | "./assistant-subagents-policy.js"
  - apps/website/src/contracts/headless/index.ts:14 | reexport | "./assistant-subagents-policy.js"
  WARNING apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:7 uses namespace (T-REPOINT step 2 / STOP rule)
path_literals (rg -F "headless/assistant-subagents-policy", not already importers):
  - -
baselines (json files naming the path): -
jini_target: agent-runtime /native-tool-policy | packages/agent-runtime/package.json:22 has exports key ./native-tool-policy
jini_names (existing declaration in packages/agent-runtime/src, excluding tests; none = free to add):
  - ASSISTANT_SUBAGENTS_NAMESPACE -> ABSENT
  - ASSISTANT_SUBAGENTS_KEY -> ABSENT
  - ASSISTANT_CLI_PERMISSIONS_KEY -> ABSENT
  - ASSISTANT_CLI_CAPABILITIES -> ABSENT
  - AssistantCliCapability -> ABSENT
  - AssistantCliAgentPermissions -> ABSENT
  - AssistantCliPermissions -> ABSENT
  - ASSISTANT_SUBAGENTS_WRITE_REASON -> ABSENT
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/agent-runtime/package.json blob 52bfeffd81b12c9b070f0c9ebfe3cb5142152b3d
  - packages/agent-runtime/README.md blob 258eed0094a934a9de6c36f8b1814b7e14ffaae9
  - rg -n "ASSISTANT_SUBAGENTS_NAMESPACE|ASSISTANT_SUBAGENTS_KEY|ASSISTANT_CLI_PERMISSIONS_KEY|ASSISTANT_CLI_CAPABILITIES|AssistantCliCapability|AssistantCliAgentPermissions|AssistantCliPermissions|ASSISTANT_SUBAGENTS_WRITE_REASON" packages/agent-runtime/src -> prints nothing
    (today it prints 0 line(s))
--- file: apps/website/src/contracts/headless/plugin-host.ts (survey label MIXED; note: `@jini-ai/agent-plugins/lifecycle` (`AgentPluginLayoutPort`), `@jini-ai/agent-plugins/connect/plugin-host` (`AgentPluginLifecycleCapability<U>`, `PortablePlugin)
declarations (name | line | kind):
  - AgentPluginWorkspaceLayout | apps/website/src/contracts/headless/plugin-host.ts:14 | interface
  - AgentPluginLayout | apps/website/src/contracts/headless/plugin-host.ts:34 | interface
  - OperatorLocaleDeps | apps/website/src/contracts/headless/plugin-host.ts:54 | interface
  - AgentPluginUninstallToolDeps | apps/website/src/contracts/headless/plugin-host.ts:61 | interface
  - SetAgentPluginEnabledInput | apps/website/src/contracts/headless/plugin-host.ts:72 | type
  - AgentPluginHostCapability | apps/website/src/contracts/headless/plugin-host.ts:75 | interface
  - PluginHostPort | apps/website/src/contracts/headless/plugin-host.ts:91 | interface
  - PluginLookupPort | apps/website/src/contracts/headless/plugin-host.ts:10 | re-export (type) from "@jini-ai/core/plugin-directory"
  - PluginProvider | apps/website/src/contracts/headless/plugin-host.ts:10 | re-export (type) from "@jini-ai/core/plugin-directory"
split:   # one row per declaration above, none omitted
  - AgentPluginWorkspaceLayout | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - AgentPluginLayout | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - OperatorLocaleDeps | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - AgentPluginUninstallToolDeps | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - SetAgentPluginEnabledInput | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - AgentPluginHostCapability | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - PluginHostPort | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
ports: TODO(judge)
shape_changes: TODO(judge)
census_cmd: rg -n --no-heading -e '["'][^"']*plugin\-host(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/headless/plugin-host.ts
importers (2 prod, 0 test; resolved to this file):
  - apps/website/src/contracts/headless/index.ts:9 | reexport | "./plugin-host.js"
  - apps/website/src/contracts/headless/operator-locale.ts:2 | reexport | "./plugin-host.js"
path_literals (rg -F "headless/plugin-host", not already importers):
  - -
baselines (json files naming the path): -
jini_target: agent-plugins /lifecycle | packages/agent-plugins/package.json:17 has exports key ./lifecycle
jini_names (existing declaration in packages/agent-plugins/src, excluding tests; none = free to add):
  - AgentPluginWorkspaceLayout -> packages/agent-plugins/src/lifecycle/layout.ts:4:export interface AgentPluginWorkspaceLayout {
  - AgentPluginLayout -> packages/agent-plugins/src/lifecycle/layout.ts:17:export type AgentPluginLayout = AgentPluginLayoutPort;
  - OperatorLocaleDeps -> ABSENT
  - AgentPluginUninstallToolDeps -> ABSENT
  - SetAgentPluginEnabledInput -> packages/agent-plugins/src/lifecycle/set-enabled.ts:22:export interface SetAgentPluginEnabledInput {
  - AgentPluginHostCapability -> ABSENT
  - PluginHostPort -> ABSENT
  - PluginLookupPort -> packages/agent-plugins/src/connect/plugin-host/index.ts:9:import { createPluginLookup, readPluginIdentity, assertPluginIdentityAvailable, type PluginIdentityCandidate, type PluginLookupPort, type PluginProvider } from '@jini-ai/core/plugin-directory';
  - PluginProvider -> packages/agent-plugins/src/connect/plugin-host/index.ts:9:import { createPluginLookup, readPluginIdentity, assertPluginIdentityAvailable, type PluginIdentityCandidate, type PluginLookupPort, type PluginProvider } from '@jini-ai/core/plugin-directory';
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/agent-plugins/package.json blob e32f6ca94122a5aa8042e45fe4f31eb7db029d22
  - packages/agent-plugins/README.md blob 404d803d93026344e6e344f28a6c80f4dc4a5527
  - rg -n "AgentPluginWorkspaceLayout|AgentPluginLayout|OperatorLocaleDeps|AgentPluginUninstallToolDeps|SetAgentPluginEnabledInput|AgentPluginHostCapability|PluginHostPort|PluginLookupPort|PluginProvider" packages/agent-plugins/src -> prints nothing
    (today it prints 52 line(s); names already exist, check twin/SPLIT)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
jini_code: TODO(judge)
jini_index: TODO(judge)
tovu_reduced: TODO(judge)
binding_edits: TODO(judge)
tests_split: TODO(judge)
