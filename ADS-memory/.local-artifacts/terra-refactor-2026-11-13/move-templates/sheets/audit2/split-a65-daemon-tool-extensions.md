# SPLIT-A65: guarded tool-registry view + installed->federation ordering -> `@jini-ai/daemon/tool-extensions` (templates T-SPLIT, T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A65` (also CLASSIFY row 148). Precondition "untangle C6/R8 (daemon runtime, waves C/E)": R8 edits `packages/daemon/src/index.ts` and `package.json`, so this sheet **executes after wave B merge and after R8; re-take the Jini `package.json`/`index.ts` blobs** (this sheet adds a NEW subpath only and touches neither `index.ts` nor existing exports).

Tier: S1 Sonnet + Opus review (registration guard + ordering), S2 Sonnet. est. executor tokens ≈ 33k (S1 20k, S2 13k). No Chrome look.

## Findings that change the audit row
1. **The generic core of `installed-extension-tools.ts` (154 lines) is only `attachAssistantToolExtensions`'s BODY (lines 104-154)**: (a) the guarded registry view `installedRegistry` (accessor forwarding of `has`, `list`, `refreshInstalledSkills`, `refreshInstalledAgentPlugins` to the executor's own registry so a family's live-registry writes are not stranded; `register` runs the host validator then `registry.register`; `replaceAgentPluginRegistrations` validates every registration, lazily creates one `createToolRegistrationScope`, and replaces the plugin scope; empty list before the scope exists is a no-op) and (b) the fixed order: installed pass promise first, federation runtime built (not started) with `after: installed` and a `beforeReload` that awaits `installed`, snapshots `toolRegistryRevision`, awaits `refreshInstalledAgentPlugins`, and reports whether the revision changed. Everything else in the file is Tovu typing: `InstalledExtensionToolDeps` (feature layouts, `PostRepoPort`, `PluginDiscoveryRecord`, skill/agent-plugin hosts), the federation deps shape, `createFederationRuntime` (`external-mcp-federation-runtime.ts`, Tovu).
2. **Row says "attachToolExtensions with installer/federation/validator ports"; the three ports are exactly**: `registerInstalled` (the installed-extension pass, injected today), `createFederation` (a factory taking `{ after, beforeReload }`, returning the host's own runtime type `F`), `validateRegistration` (today `toolApprovalPolicyFor`: throws if a registration lacks explicit approval metadata). `toolApprovalPolicyFor` (`assistant-tool-approval-policy.ts:43`) is Tovu product policy and stays.
3. **Names:** `attachAssistantToolExtensions` -> `attachToolExtensions` (generic); Tovu keeps `attachAssistantToolExtensions` as a REAL function (it builds the Tovu-typed deps and calls the Jini one: not a forwarder because it supplies the three ports). `InstalledExtensionRegistrar`'s `registry` parameter type moves to Jini as `GuardedToolRegistry`.
4. **`console.warn`** appears in the doc as the families' degrade path, inside `registerInstalledExtensionTools` (composition file, not this one) - nothing in the moved body logs, so rule 7 is satisfied. The `log` prefix string is passed through untouched to `createFederation` (Tovu-opaque to Jini: keep it as part of the host's factory closure rather than a Jini arg: **Jini does not take `log`**).
5. The file's two import-cycle explanations (assistant <-> features/agent-plugins/plugins cycles refused by `check:architecture`) are Tovu architecture why-comments and stay in Tovu.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/website/src/assistant/installed-extension-tools.ts | blob 8d1a10a75927547ec47238fefe2d897cfb4ea72e | keep-reduced (types + thin Tovu binding; body :104-154 leaves)
tovu_tests (keep unchanged; they are the parity guard):
  - apps/website/src/assistant/__tests__/installed-extension-tools.order.test.ts | blob a66f4b3e83b2f145878d42a26cf29dd4ba0ee296
  - apps/website/src/assistant/__tests__/extension-approval-classification.test.ts | blob 81a33f8c78fad1442c141c9f4f2690ce8c5448af
  - apps/website/src/assistant/__tests__/plugin-guidance-reload.integration.test.ts | blob 5a1fb2457976743f17804d1fdfdc0462a0fe1ab8
  - apps/website/src/assistant/__tests__/agent-daemon-port.barrel.test.ts | blob e31976e00f4b9ef8076c2cabbdbf1657dd614b17 (pins the `attachAssistantToolExtensions` export of the barrel: name must survive)
jini_guards:
  - packages/daemon/package.json | blob 9b07e1bb869c1d5cf1909e54952e817075096a69
  - packages/daemon/src/index.ts | blob 2b28299268c0391cee9140cf64c7a86f598a9ebb (NOT edited)
  - packages/core/src/tool-registry.ts exports `createToolRegistrationScope` (:271) and `toolRegistryRevision` (:264) (import from "@jini-ai/core"); the guard is `rg -n "export function (createToolRegistrationScope|toolRegistryRevision)" packages/core/src`
  - packages/daemon/src/tool-extensions/ must not exist; `rg -n "attachToolExtensions|GuardedToolRegistry" packages --glob '!**/dist/**'` prints nothing
```
Importer census (Tovu): `attachAssistantToolExtensions` — `agent-daemon-port.ts:77-78` (barrel re-export), `byok-tool-surface.ts:39` (import with `AssistantToolExtensions`, `InstalledExtensionRegistrar`), the five test files above and `plugin-runtime/__tests__/integration/contribution-runtime.integration.test.ts:16`; `InstalledExtensionRegistrar`/`InstalledExtensionToolDeps`: `server/runtime/composition/installed-extension-tools.ts:28`, `installed-extension-tools.preview-port.test.ts:12`. None of these edits are needed: the Tovu exports keep their names and shapes.

## Contracts (Jini `packages/daemon/src/tool-extensions/`)
```ts
import type { ToolRegistration, ToolRegistry } from '@jini-ai/core';
/** The write-surface the installed families register through; reads/live hooks forward to the executor's own registry. */
export interface GuardedToolRegistry {
  register(registration: ToolRegistration): void;
  has?: ToolRegistry['has'];
  list?: ToolRegistry['list'];
  refreshInstalledAgentPlugins?: () => Promise<void>;
  replaceAgentPluginRegistrations?: (required: { registrations: readonly ToolRegistration[] }, optional?: Record<string, never>) => void;
}
export interface FederationOrdering { readonly after: Promise<void>; readonly beforeReload: () => Promise<boolean> }
export function createGuardedRegistryView(
  required: { registry: ToolRegistry; validateRegistration: (required: { registration: ToolRegistration }, optional?: Record<string, never>) => unknown },
  optional: Record<string, never> = {},
): GuardedToolRegistry;
export function attachToolExtensions<F>(
  required: {
    registry: ToolRegistry;
    validateRegistration: (required: { registration: ToolRegistration }, optional?: Record<string, never>) => unknown;
    registerInstalled: (required: { registry: GuardedToolRegistry }, optional?: Record<string, never>) => Promise<void>;
    createFederation: (required: FederationOrdering, optional?: Record<string, never>) => F;
  },
  optional: Record<string, never> = {},
): { readonly installed: Promise<void>; readonly federation: F };
```
Note the Tovu `registerInstalled` takes `{ registry, deps, log }`: the Tovu binding closes over `deps`/`log` and passes a 1-arg adapter. `validateRegistration` return value is ignored (Tovu's returns the policy); it must THROW to refuse.

```
id: SPLIT-A65-1 .. SPLIT-A65-2
feature: daemon installed tool extensions
jini_target: daemon src/tool-extensions/{registry-view.ts,attach.ts,index.ts}; package.json exports "./tool-extensions" + jini.entries "./tool-extensions": "universal" (core-only imports, no node: built-ins); README line
changeset: @jini-ai/daemon: minor | "tool-extensions: guarded registry view and installed-then-federation attach ordering"
```

## SPLIT-A65-1 — Jini (commit 1, Opus review)
0. Branch rule; blobs; guards.
1. Tests first (`src/tool-extensions/__tests__/attach.test.ts`, fake registry as in `installed-extension-tools.order.test.ts:fakeRegistry`): `register` runs `validateRegistration` BEFORE `registry.register` and a throwing validator prevents the registration (RED on parent: absent); `has`/`list`/`refresh*` reads and writes forward both ways (assign through the view, observe on the real registry); `replaceAgentPluginRegistrations`: validates all before replacing; empty list with no scope = no scope created (assert `createToolRegistrationScope` not exercised: spy via registry call counts); first non-empty call creates the scope, second replaces (the old ones are removed: pin with `has`); order: `createFederation` is called AFTER `registerInstalled` is INVOKED (not resolved) and receives the same promise as `after` (identity: `attach(...).installed === the promise registerInstalled returned`); `beforeReload` awaits `installed`, returns `true` only when the registry revision changed during `refreshInstalledAgentPlugins`, `false` when it did not, and `false` when no refresh hook exists; a rejecting `registerInstalled` does NOT throw out of `attach` (it returns the rejected promise as `installed`: parity with today: the real registrar never rejects, so pin that attach does not wrap/swallow).
2. Code: `registry-view.ts` (accessor forwarding via `Object.defineProperty` helpers: each property forwarded by one small `forward()` helper, replacing six get/set blocks) and `attach.ts`; each function ≤ 50 lines, complexity ≤ 10; `(required, optional = {})`. Why-comments (extension ids come from installed data so the registration boundary validates too; live skills replace discovery methods and attach a refresh hook, so writes forward to the executor's registry) move reworded neutral.
3. package.json export + `jini.entries`, README, changeset. Checks COMMON 2-9: `rg -n -i "tovu|assistant|agent plugin|skill|federat|mcp" <new src files>` — "federation" is the generic port name; the ONLY allowed hits are the identifiers `createFederation`/`FederationOrdering` and `refreshInstalledAgentPlugins` (an existing registry-hook name carried for parity; record it as a known neutrality debt, rename later with the registry owner). Commit `feat(daemon/tool-extensions): guarded registry view and attach ordering`.

## SPLIT-A65-2 — Tovu (commit 2, Sonnet; after S1)
1. `installed-extension-tools.ts` (edit): keep all exported types; `attachAssistantToolExtensions` body becomes:
```ts
const { installed, federation } = attachToolExtensions<FederationRuntime>({
  registry, validateRegistration: ({ registration }) => toolApprovalPolicyFor({ registration }),
  registerInstalled: ({ registry: guarded }) => deps.registerInstalled({ registry: guarded, deps: { ...deps, executablePluginToolRegistry: registry }, log }),
  createFederation: ({ after, beforeReload }) => createFederationRuntime({ registry, presetRegistry: deps.federation.presetRegistry, deps: deps.federation.deps, resolveConnections: deps.federation.resolveConnections, after, beforeReload, log, ...(deps.federation.onAdmitted ? { onAdmitted: deps.federation.onAdmitted } : {}), ...(deps.federation.connect ? { connect: deps.federation.connect } : {}) }),
}, {});
return { installed, federation };
```
Remove the now-unused `createToolRegistrationScope`, `toolRegistryRevision`, `ToolRegistration` (still used by the `InstalledExtensionRegistrar` type: keep) imports; delete the `liveRegistry` cast block. `InstalledExtensionRegistrar`'s `registry` field type becomes `GuardedToolRegistry` from `@jini-ai/daemon/tool-extensions` (structurally the same).
2. No test edits expected: the four tests above must pass unchanged; record that none was touched.
3. Census: `rg -n "createToolRegistrationScope|toolRegistryRevision" apps/website/src/assistant/installed-extension-tools.ts` prints nothing; eslint; commit `refactor(website): tool-extension attach on @jini-ai/daemon/tool-extensions`.

## untangle overlap (execute after wave B merge, after R8)
- R8 (daemon runtime) edits `packages/daemon/{index.ts,package.json}`: re-take blobs (this sheet only appends one export + one `jini.entries` row; apply by text anchor `"./chat-settings": "node"` for entries and the last `exports` block).
- C6 (agents contract) may change `ToolRegistry` import paths in Tovu files: the `import type { ToolRegistration, ToolRegistry } from "@jini-ai/core"` line in `installed-extension-tools.ts` is its only exposure.
- A52 (native permission policy) and the A33-A38 assistant rows live in neighbouring files; none edits this file.

## STOP specific to this sheet
- `createToolRegistrationScope`/`toolRegistryRevision` signatures changed (R8/core) from the cited lines.
- `installed-extension-tools.order.test.ts` needs an assertion edited.
- The accessor-forwarding helper cannot preserve `refreshInstalledSkills` write-through exactly (the `plugin-guidance-reload` test is the guard).
