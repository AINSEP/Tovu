# SPLIT-A52: native-capability permission snapshot validation + projection -> `@jini-ai/agent-runtime` (templates T-SPLIT, T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A52`. Listed blocker "C6 `core/contracts/agents` (wave C)": at integ/wave-b `packages/core/src/contracts/agents*` does not exist and `NativeCapabilities` still lives at `packages/agent-runtime/src/native-tool-policy.ts:7`. **This sheet does not need C6**: the new Jini code is generic over the capability KEY list (`K extends string`) and never names `NativeCapabilities`; only the Tovu binding ties the website's 8 keys to the type. So it is executable now; if C6 later moves `NativeCapabilities`, only the Tovu type-assertion import path changes (listed below).

Tier: S1 Sonnet + Opus review (it is the authorization-snapshot validator), S2 Sonnet. est. executor tokens ≈ 34k (S1 20k, S2 14k). No Chrome look.

## Findings that change the audit row
1. **The audit's function names do not exist.** `parseNativePermissions`/`resolveNativePermissions` are not in `subagent-settings.ts`/`assistant-native-fallbacks.ts` (`rg -n "parseNativePermissions|resolveNativePermissions" apps packages` prints nothing). The real generic units are: `parseCliPermissionsSnapshot` + `validateAgentPermissions` + `validateAgentCapabilities` (`subagent-settings.ts:48-95`: strict shape validation of a persisted owner snapshot), `assistantCliPermissions` (`assistant-native-fallbacks.ts:12`: fill a capability map from a master default), and the per-agent projection inside `resolveAssistantCliPermissions` (:87-95). These move as three functions.
2. **What does NOT move (confirmed in code):** the owner/hosted/env gate (`isHostedAssistantRuntime` reads `TOVU_*` env names; `fullCliEnvLock`; `resolveFullCliAccess`: rule 8, env names stay Tovu), `TOOLS_FIRST_RULE` and `ASSISTANT_DISALLOWED_TOOLS` (product policy text/denies; `resolveAssistantDisallowedTools` filtering `Read(` prefix is two lines and tied to that list), `ASSISTANT_CLI_CAPABILITIES` labels/descriptions (product copy in `contracts/headless/assistant-subagents-policy.ts`), the settings reads (`readAssistantCliPermissions`, `readAssistantSubagentsEnabled`: `SettingsRepoPort` plumbing), the pre-2026-11-10 `userMcpDefaultOn` legacy migration (`subagent-settings.ts:42-46`), and the daemon-log text `"[agent-daemon] …"`.
3. **`NativeCapabilities` (8 booleans) and `ASSISTANT_CLI_CAPABILITIES` (8 keys) are the same set** (`shell,fileWrite,userMcp,subagents,userSettings,web,workflows,loginEnvironment`; compare `agent-runtime/src/native-tool-policy.ts:7-16` with `assistant-subagents-policy.ts:6-15`). The Tovu binding pins that with a compile-time assertion (S2 step 2) so a ninth capability cannot desync them.
4. **Error-message contract:** every refusal throws `Error("Invalid CLI permissions")` and callers deny on ANY throw. The Jini validator throws a typed `InvalidNativePermissionsError` whose `message` is supplied by the host (`messages` option), keeping Tovu's exact text; the Tovu callers keep `catch` semantics unchanged. The message never includes the offending value.
5. **Security parity points for Opus** (the validator is the last line before a launch grant): (a) `enabled` must be a real boolean; (b) EVERY known capability must be a boolean, unknown extra capability keys in the TOP-LEVEL map are NOT rejected today (only `byAgent` entries reject unknown keys: `validateAgentCapabilities` :90); keep parity, add a pinned test, do not tighten silently; (c) `byAgent` arrays and non-objects rejected; (d) `__proto__` as an agent id must not poison the result (`Object.entries`-based copy).

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/website/src/assistant/subagent-settings.ts | blob 98684b9ca69a4dde6ce6921bddb240f21480ff09 | keep-reduced (snapshot validators :48-95 leave)
  - apps/website/src/contracts/core/assistant-native-fallbacks.ts | blob 6e71a3410716a66f9801e2b93d9e056792306ad2 | keep-reduced (`assistantCliPermissions` body and the per-agent projection leave)
  - apps/website/src/contracts/headless/assistant-subagents-policy.ts | blob 933f928874a849d88ee0a8aa658f7d55b723f311 | keep (capability keys; read-only here)
tovu_tests (keep; all must pass unchanged, they are the parity guard):
  - apps/website/src/assistant/__tests__/subagent-settings.unit.test.ts (140 lines), cli-permissions-settings.unit.test.ts, execution-permissions-defaults.integration.test.ts
  - apps/website/src/contracts/core/__tests__/unit/assistant-cli-permissions.unit.test.ts (40 lines), host-signals.unit.test.ts, assistant-native-fallbacks.unit.test.ts
jini_guards:
  - packages/agent-runtime/src/native-tool-policy.ts | blob 61f50bc17a769e60123785cffeac4a7acc29c266 (NOT edited; read for `NativeCapabilities` naming)
  - packages/agent-runtime/src/types.ts | blob 1c5230162063f7f655ffbcba41ba1e4ce6d9c196 (NOT edited)
  - `rg -n "validateNativePermissionSnapshot|fillNativePermissions|projectNativePermissions" packages --glob '!**/dist/**'` prints nothing
```
Importer census (Tovu; signatures of the stayers do not change, so no importer edits expected): `rg -n "assistantCliPermissions|resolveAssistantCliPermissions|readAssistantCliPermissions" apps -g '*.ts' | wc -l` (record N; the same N after). Other consumers named by the earlier grep: `assistant-subagents-policy.ts:1` (re-export of `assistantCliPermissions`: it is an existing forwarder in Tovu, left alone: not in this row), `desktop-agent.ts:45`, `agent-daemon-scope.ts:15`, `assistant-run-tool-policy.ts:3`, `routes/system/assistant-subagents.ts:4`.

## Contracts (Jini `packages/agent-runtime/src/native-permissions.ts`, exported from the package barrel `src/index.ts` like `native-tool-policy.js`)
```ts
export interface NativeAgentPermissions<K extends string> { enabled?: boolean; capabilities?: Partial<Record<K, boolean>> }
export interface NativePermissionSet<K extends string> { enabled: boolean; capabilities: Record<K, boolean>; byAgent?: Record<string, NativeAgentPermissions<K>> }
export class InvalidNativePermissionsError extends Error { constructor(required: { message: string }) }
/** Fill every key from the explicit choice, else the master default. Pure; fresh object. */
export function fillNativePermissions<K extends string>(required: { capabilityKeys: readonly K[]; enabled: boolean; capabilities?: Partial<Record<K, boolean>>; byAgent?: Record<string, NativeAgentPermissions<K>> }, optional: Record<string, never> = {}): NativePermissionSet<K>;
/** Validate an untrusted persisted snapshot; never echoes a value. */
export function validateNativePermissionSnapshot<K extends string>(required: { value: unknown; capabilityKeys: readonly K[] }, optional: { message?: string } = {}): NativePermissionSet<K>;
/** The per-agent projection after the host's own grant gate: override.enabled ?? settings.enabled, capabilities merged. */
export function projectNativePermissions<K extends string>(required: { settings: NativePermissionSet<K>; capabilityKeys: readonly K[]; agentId?: string }, optional: Record<string, never> = {}): NativePermissionSet<K>;
```
Behaviour parity: `validateNativePermissionSnapshot` returns the snapshot filled through `fillNativePermissions` with the SAME key-presence semantics as `parseCliPermissionsSnapshot` (it returns the input's own capabilities, because every key was verified boolean); the `userMcpDefaultOn` legacy rewrite is applied by Tovu BEFORE calling it (S2 step 1: the Tovu function strips `userMcp` from the candidate when the legacy rule says so, but then the validator would fail "every known capability must be boolean": so Tovu re-adds the filled default by calling `fillNativePermissions` after validation, exactly as today's `assistantCliPermissions({ enabled, capabilities: site })` does: keep that order).

```
id: SPLIT-A52-1 .. SPLIT-A52-2
feature: native permission policy
jini_target: agent-runtime src/native-permissions.ts (+ barrel export line); no new subpath (the package barrel already exports native-tool-policy)
changeset: @jini-ai/agent-runtime: minor | "native-permissions: generic capability-set fill, snapshot validation and per-agent projection"
```

## SPLIT-A52-1 — Jini (commit 1, Opus review)
0. Branch rule; blobs; guard `rg` prints nothing.
1. Tests first (`src/__tests__/native-permissions.test.ts`; keys: a 3-key fixture list, NOT Tovu's 8): fill: master default fills all keys; explicit false beats master true; `byAgent` carried by reference-free copy. Validate: every refusal case from `subagent-settings.unit.test.ts` re-expressed (non-boolean `enabled`, missing `capabilities`, a missing key, non-boolean key, `byAgent` array/null/string, entry array/null, `enabled` non-boolean in an entry, capabilities array/null/unknown key/non-boolean in an entry) each throwing `InvalidNativePermissionsError` with the host message and NO value text (`error.message` does not contain a sentinel like `SECRET-123` placed in the bad value); NEW: top-level unknown key accepted (parity pin); NEW: agent id `__proto__` JSON-parsed from text does not change `Object.prototype` and is projected as an ordinary key; project: override enabled wins, override capabilities merge over settings, no agentId = settings unchanged.
2. Code: three functions ≤ 25 lines each, complexity ≤ 8; no `console`, no `process`, no env. Barrel line in `src/index.ts` next to `native-tool-policy.js`; changeset; commit `feat(agent-runtime): native permission set fill, validation and projection`.
3. Checks COMMON 2-9: `rg -n -i "tovu|assistant|full cli|site" packages/agent-runtime/src/native-permissions.ts` prints nothing.

## SPLIT-A52-2 — Tovu (commit 2, Sonnet; after S1)
1. `subagent-settings.ts` (edit): delete `validateAgentPermissions`/`validateAgentCapabilities`; `parseCliPermissionsSnapshot` becomes: legacy rewrite of the candidate (`userMcpDefaultOn`), then `validateNativePermissionSnapshot({ value, capabilityKeys: CLI_CAPABILITY_KEYS }, { message: "Invalid CLI permissions" })`, then `assistantCliPermissions(...)` exactly as today. Keep the legacy comment block verbatim (Tovu-specific why).
2. `assistant-native-fallbacks.ts` (edit): `assistantCliPermissions` body -> `fillNativePermissions({ capabilityKeys: CLI_CAPABILITY_KEYS, ...required })` (still returns the typed `AssistantCliPermissions`: the Jini `NativePermissionSet<AssistantCliCapability>` is structurally identical); `resolveAssistantCliPermissions` keeps its gate line (`if (!resolveFullCliAccess(...)) return assistantCliPermissions({ enabled: false })`) then returns `projectNativePermissions({ settings: required.settings, capabilityKeys: CLI_CAPABILITY_KEYS, agentId: required.agentId })`. Define once in `contracts/headless/assistant-subagents-policy.ts`: `export const CLI_CAPABILITY_KEYS = ASSISTANT_CLI_CAPABILITIES.map(({ key }) => key);` (edit that file: +1 line) and the compile-time tie `const _sameKeys: Record<keyof NativeCapabilities, true> = {} as Record<AssistantCliCapability, true>;` placed in `assistant-native-fallbacks.ts` with `import type { NativeCapabilities } from "@jini-ai/agent-runtime"` (if C6 has since moved `NativeCapabilities`, import it from its new core path: `rg -n "NativeCapabilities" packages/core/src` decides).
3. Tests: the six test files above run unchanged; no assertion removed. Record test counts before/after (should be equal).
4. Census: `rg -n "validateAgentPermissions|validateAgentCapabilities" apps` prints nothing; eslint on the 3 edited files; commit `refactor(website): native permission snapshot via @jini-ai/agent-runtime`.

## untangle overlap
- C6 (wave C) may move `NativeCapabilities`; see top. R-BARRELS/C3 applier passes edit `subagent-settings.ts` imports (`@jini-ai/core/settings`): re-take the blob.
- A65 (`installed-extension-tools`) is independent. A33-area daemon rows do not touch these files.

## STOP specific to this sheet
- A Tovu test fails and the cause is not a literal import (do not loosen the validator).
- The 8-key compile-time tie fails (the sets diverged since this sheet): report both lists.
- `rg "assistantCliPermissions"` count N differs from the recorded count after the edit.
