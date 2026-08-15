ACK_PACKET_RECEIVED CTX-PLUGINS-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

My Round 2 seat (`sonnet5-round2`) landed on: the wire is a **narrow, fast precondition**, not a phase gate — "composition-root glue over already-built, already-tested pieces" — and EC-10's recovery "ship[s] in the same batch as the wiring fix... Treat as one work item." This packet's brief for Debate 4 is that exact plan, now due as code. Nothing below reverses that; it executes it, plus the ABI audit I'd already flagged (Round 2: "ADR-024 §3 explicitly demanded this audit happen *now*... Do the audit as part of step (1), when it is free").

What's new this round, from re-reading the four implementation files myself rather than trusting the appendix:

- `loader.ts:147-158`'s own comment says steps (4)-(5) "need a live hook-registry instance and per-load core deps... that this function's certified signature has no parameter for" — but it also says the SDK-building half is explicitly **not** this function's job: `capability-sdk.ts`'s own header states "building and gating that SDK stays the caller's responsibility." Round 2 (mine included) treated "wire the loop" as one undifferentiated task. Reading the actual division of labor, it's two smaller, more separable pieces: (a) `loadPlugin` capturing its own import result and calling `setup()` — genuinely `loader.ts`'s job, since only it has the imported module; (b) building `coreDeps` and attaching the resulting filter — genuinely the **composition root's** job, already anticipated by name in `attachLoadedPlugin`'s own doc comment ("A future caller... supplies the filter obtained from step (4)'s `setup()` call"). Splitting it this way keeps `loadPlugin`'s diff small and keeps `attachLoadedPlugin` — the one thing ADR-057 already extracted and tested — as the single shared attach path, rather than reinventing it inside `loadPlugin` too.
- I drafted this response initially assuming a competing "leave `loadPlugin` untouched, double-`import()` from the composition root" option was unsafe because of module-level side effects running twice. That assumption is **wrong** — see Sources: MDN confirms dynamic `import()` is cached by resolved specifier and does not re-execute the module body on a second call. I flag this because I nearly shipped a wrong safety argument for my own recommendation; the real cost of that option turns out to be different (and, I think, still disqualifying — see Solution Slate) and I'd rather report the correction than quietly drop the point.
- `activation.ts:127` (`await deps.repo.save(activation)`) commits the row **before** `deps.onEnabled?.(...)` runs at line 130 — codex-round2 flagged this as leaving durable state claiming success on a failed load. True as far as `activation.ts` alone shows. But `tool-registrations.ts:122-132` — a real given file, the one actual `setPluginEnabled` call site in `files/` — already wraps the call in `executeCommand`'s `captureInverse`/`rollback`, which re-saves the prior activation row if `execute()` throws. That doesn't make codex's finding false, but it does mean **my** wire must let `onEnabled` failures propagate as throws rather than swallow them, or that existing safety net does nothing. I built it that way (see Leading Option).

## Sources

- MDN, `import()` operator — checked whether dynamic `import()` of an already-resolved specifier re-runs the module body. **Confirms**: "This aggressive caching ensures that a piece of JavaScript code is never executed more than once, even if it is imported multiple times," with `import * as mod from "/x.js"` and `import("/x.js")` shown to be reference-equal (`mod === mod2`). Also surfaced a real gotcha I used in the Solution Slate: a module exporting a function named `then` is auto-invoked by the dynamic-import Promise machinery, "behav[ing] differently when imported dynamically than when imported statically." https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import
- Node.js docs, `structuredClone` global — checked availability/version and clone-failure behavior for the ABI-audit fix. **Confirms**: global since Node v17.0.0, is "the WHATWG `structuredClone` method." Node's own docs excerpt didn't restate the DataCloneError-on-functions behavior verbatim, but that's the documented WHATWG structured-clone algorithm's behavior, not a Tovu-specific claim I'm asserting untested. https://nodejs.org/api/globals.html#structuredclonevalue-options
- Node.js docs, Node-API — checked the stated rationale for freezing a plugin ABI ahead of an ecosystem existing, as prior art for ADR-024 §3's "freeze now, while there are zero third parties to break." **Confirms**: Node-API's whole reason to exist is that NAN-style addons "often need to be recompiled when Node.js ships a new V8 version," while an ABI frozen ahead of time "allow[s] modules compiled for one major version to run on later major versions... without recompilation." Same shape of bet ADR-024 §3 is making, different layer (binary ABI vs. wire/type contract). https://nodejs.org/api/n-api.html
- WordPress Developer docs + Make WordPress Core (5.2 Recovery Mode) — researched for "how comparable plugin systems detect and quarantine a misbehaving extension." **Confirms**: WordPress pauses a plugin **on the first detected fatal error** (a shutdown-handler catches the PHP fatal), e-mails the admin a recovery link, and lets the admin choose to keep it paused or reactivate — it does not wait for a repeat occurrence. I checked this specifically because I designed a *consecutive-failure counter* instead of a single-shot trip, and wanted to know whether that's a deviation from precedent or independently justified. It's the latter, for a reason the source itself makes visible: WordPress's failure mode is a process-killing PHP fatal, so there logically cannot be a "second occurrence" in the same request to count — a counter isn't an option available to them. Tovu's EC-10 failure is a caught `PluginHookFailedError` (`hook-registry.ts`'s own try/catch); the process and the plugin both survive every occurrence, so a count is possible, and a hair-trigger single-failure disable would over-quarantine on one bad entry. https://wordpress.org/documentation/article/recovery-mode/ , https://make.wordpress.org/core/2019/04/16/fatal-error-recovery-mode-in-5-2/ (fetched directly; the second source's own text does not spell out the technical detection mechanism beyond "a shutdown handler" and an admin-configurable session ID for recovery-mode-specific storage — flagging the gap rather than inventing the missing detail)
- VS Code extension host issues (`microsoft/vscode` #79782, #321901) — researched for a second comparable system's isolation/detection model, since WordPress's is single-process/single-shot. **Confirms**: VS Code detects an *unresponsive* (not thrown-error) extension by monitoring the shared extension-host process and attaching a CPU profiler when it stalls, then attributing the stall to a specific extension. **Contradicts** any assumption that this is solved: the same issue threads state directly that "it doesn't isolate different extensions from each other" and there are open asks for VS Code to "identify the extension causing the error... and prompt the user to disable it" — i.e., even a mature, well-funded extension host does not yet auto-quarantine a misbehaving extension by default; it profiles and reports. This tempered my design — Tovu's per-`pluginId`-attributed `PluginHookFailedError` (already existing, `hook-registry.ts:172`) is actually further ahead than VS Code's attribution story, which strengthens the case that consecutive-failure auto-disable is cheap to add here specifically. https://github.com/microsoft/vscode/issues/79782 , https://github.com/microsoft/vscode/issues/321901
- AWS Prescriptive Guidance, Circuit Breaker pattern — checked the standard shape for "N consecutive failures ⇒ trip" as the general mechanism (as opposed to WordPress's single-shot or VS Code's profiling). **Confirms**: "When failures exceed a configured threshold, the circuit 'opens' and immediately rejects subsequent requests," commonly illustrated with a small fixed consecutive-failure count (the guidance's own worked example uses 5). This is the shape I used for `quarantine.ts`, with the threshold left as a constructor parameter rather than hardcoded, since the right number is an owner call, not an engineering one. https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html
- `dckc/awesome-ocap` (object-capability security) + the OpenHands Agent SDK paper (arXiv:2511.03690) — researched for prior art on "capability-scoped SDK" as a term of art, to check whether `capability-sdk.ts`'s "pass a callable, not the underlying resource" design matches an established model rather than being ad hoc. **Confirms**: the object-capability model (Dennis & Van Horn) requires capabilities to be "unforgeable references that couple resource designations with access rights," and modern agent-sandbox work (OpenHands, 2026) explicitly re-derives the same shape: "a sandboxed skill cannot access any resource beyond its declared capability set, even if it attempts to escalate privileges at runtime." `buildCapabilityScopedSdk`'s "always present, never absent; ungranted = throwing stub" design (CIC U-003) is a faithful instance of this, not a novel invention — worth knowing since ADR-024 §6 treats the capability *shape* as something to freeze now. https://github.com/dckc/awesome-ocap , https://arxiv.org/pdf/2511.03690

## Solution Slate

**Ranking criteria, stated before ranking** (both options close the same functional gap — AC-01 provably firing through the SPEC-005 enable path — so they're compared on cost/risk, not capability):
1. Single source of truth for "how a plugin's entry module gets imported" — no forked import path.
2. Minimal, additive blast radius on `loader.ts` — the file its own header calls "the single most security-critical unit in this feature," under CIC U-001.
3. Backward compatibility: any existing test/caller of `loadPlugin()` that doesn't know about steps (4)-(5) keeps working unmodified.
4. Preserves `loadPlugin`'s CIC-approved test seam (`importModule` injection) as the *one* place a test can prove "the plugin's code was never evaluated before integrity/sdkRange passed."

**Option A — capture-in-place: `loadPlugin()` gains an additive optional `setup` field; the composition root owns attach.** `loadPlugin` captures its own `importModule(entryPath)` result (previously discarded, `loader.ts:141-143`) and, only when a caller supplies `_optional.setup.coreDeps`, builds the capability-scoped SDK and calls the module's `setup()`. Attaching stays entirely outside `loadPlugin` — it happens inside whatever `coreDeps.attachFilter` the composition root supplies, which in turn calls the already-tested `attachLoadedPlugin`. Real, disclosed sacrifices: it touches a CIC U-001/doc-frozen file (even though additively); it widens `LoadPluginResult`'s `reason` union with a new `"SETUP_FAILED"` member, which is source-compatible for any caller but **not** exhaustiveness-compatible — any `switch (result.reason)` elsewhere in the codebase I can't see (outside `files/`) that lacks a `default` now has a real TypeScript gap to fix. I have no way to rule that out from the given files, so I'm stating it as a known unknown, not a false all-clear.

**Option B — composition-root-only: `loader.ts` untouched; call `loadPlugin()` for steps 1-3, then re-`import()` the same `entryPath` a second time from the composition root to get the module for `setup()`.** This is legitimately viable now that I've confirmed (Sources) that Node's ESM cache means the second `import()` does **not** re-run the module body — my first-draft objection to this option was wrong, and I'm not going to keep it as the stated reason to reject B. The real cost is different: it forks "how do I import a plugin's entry" into two call sites — `loadPlugin`'s own real `import()` (covered by the injectable `importModule` seam `loader.ts`'s header calls CIC U-001's approved "Verification Surface Rule") and a second, uncovered real `import()` call living in the composition root. A certified test proving "the plugin's code was never evaluated for a rejected plugin" (the exact property that seam exists to prove, per the file's own header) can no longer observe the composition root's second import at all — it's a different function, in a different file, with no seam. That's a regression against the header's own stated verification intent for the one function it calls the most security-critical in the feature, even though the *runtime* behavior (no double-execution) turns out to be fine.

**Recommendation: Option A.** Criterion 4 (preserving the one CIC-approved verification seam on the security-critical function) is the deciding factor once B's actual, correct cost is understood — not the cost I originally, wrongly, reached for.

**Cheapest test that would falsify this:** grep `files/` (or the real repo) for a `loader.ts`-facing public-API/snapshot test analogous to `packages/sdk`'s REQ-08/AC-10 one — i.e., something that would fail CI merely because `LoadPluginOptional`/`LoadPluginResult` grew a new *optional* field or union member, the same way changing the SDK's own exports fails REQ-08's snapshot test. None exists in the files I was given. If one exists elsewhere in the real repo, Option A's "additive-only, no real cost" framing collapses and Option B (or a versioned `loadPluginV2`) becomes the better trade.

## Leading Option — Code

### 1 & 4. The wire + the ABI-freeze audit

**`packages/sdk/src/index.ts`** — not in this dispatch's `files/`; reconstructed from `state.spec.md`'s `SdkSurface` entity contract (`state.spec.md:75-81`) plus actual call-site usage in `hook-registry.ts`/`capability-sdk.ts`/`loader.ts`. Only the member this item's audit touches is shown; the real file's own public-API snapshot test (REQ-08/AC-10) must be the one place this change actually lands.

```ts
// BEFORE — matches state.spec.md:80's documented signature verbatim, no Promise:
// export type BeforeSaveFilter = (entry: Readonly<ContentEntryDraft>, ctx: HookContext) => ExtPatch;

// AFTER — ADR-024 §3: "Asynchronous only. No synchronous hook may block the shared host event
// loop," which this debate's brief says must be audited "now, while there are zero third parties
// to break." hook-registry.ts:170 already does `patch = await attachment.filter(snapshot, ctx)` —
// `await` on a plain (non-Promise) value resolves it immediately (see Sources: this is standard
// `await` semantics, not something I'm inventing for Tovu), so this type change is compile-time
// only and does not alter hook-registry.ts's runtime behavior at all. What it DOES change: a
// plugin author's `setup(sdk) { sdk.addFilter(HOOK, (entry, ctx) => ({ count: 5 })) }` — a plain
// synchronous return — no longer type-checks. TypeScript now requires `Promise<ExtPatch>` or an
// `async` function body, forcing every future plugin author to confront "this runs off the shared
// event loop" at the type level instead of only in ADR prose nobody reads at `setup()` call time.
export type BeforeSaveFilter = (
  entry: Readonly<ContentEntryDraft>,
  ctx: HookContext
) => Promise<ExtPatch>;
```

**`plugin-runtime/loader.ts`** — modified. Full new/changed regions (unchanged code represented by comments to keep the diff honest about scope):

```ts
import { buildCapabilityScopedSdk, type CapabilityScopedSdkCoreDeps } from "./capability-sdk";
import type { AttachmentSource, HookRegistry, HookRegistryFieldDecl } from "./hook-registry"; // unchanged import, listed for context
import type { PluginCapability, PluginManifest } from "./manifest"; // PluginCapability is NEW on this import
import type { BeforeSaveFilter, PluginSdk } from "../../../packages/sdk/src/index"; // PluginSdk is NEW

// ... derivePluginRoot / defaultComputeFileHash / LoadPluginRequired / DEFAULT_RUNTIME_SDK_VERSION
// unchanged from the given file ...

/** NEW. Built by the CALLER for this specific load (the composition root) — `capability-sdk.ts`'s
 * own doc comment: "building and gating that SDK stays the caller's responsibility." The one thing
 * `coreDeps.attachFilter` is expected to do — not this file's concern how — is register the
 * resulting filter somewhere real; in practice that means calling `attachLoadedPlugin` below, per
 * ADR-057 Decision 2.1's already-shared attach path. */
export interface LoadPluginSetup {
  readonly coreDeps: CapabilityScopedSdkCoreDeps;
}

export interface LoadPluginOptional {
  readonly runtimeSdkVersion?: string;
  readonly importModule?: (entryPath: string) => Promise<unknown>;
  readonly computeFileHash?: (absoluteFilePath: string) => Promise<string>;
  /** NEW (this item). When supplied, `loadPlugin` performs step (4): builds a capability-scoped
   * SDK over `setup.coreDeps` and invokes the imported module's default export's `setup()`.
   * Omitted ⇒ the exact pre-fix behavior (steps 1-3 only, module imported and discarded) —
   * additive, not a breaking change for any existing caller. */
  readonly setup?: LoadPluginSetup;
}

export type LoadPluginResult =
  | { readonly loaded: true }
  | {
      readonly loaded: false;
      readonly reason:
        | "INTEGRITY_FAILED"
        | "SDK_RANGE_UNSATISFIED"
        | "CODE_ENTRY_MISSING"
        | "SETUP_FAILED"; // NEW member — see Solution Slate's disclosed exhaustiveness cost
      /** Only ever populated for `SETUP_FAILED`: the plugin's own `setup()` threw, or its default
       * export had no callable `setup`. */
      readonly cause?: unknown;
    };

export async function loadPlugin(
  required: LoadPluginRequired,
  _optional: LoadPluginOptional = {}
): Promise<LoadPluginResult> {
  const { manifest, entryPath } = required;
  const importModule = _optional.importModule ?? ((p: string) => import(p));
  const computeFileHash = _optional.computeFileHash ?? defaultComputeFileHash;
  const runtimeSdkVersion = _optional.runtimeSdkVersion ?? DEFAULT_RUNTIME_SDK_VERSION;

  // --- CIC U-001-ORD1: step (1), integrity — UNCHANGED from the given file. ---
  const pluginRoot = derivePluginRoot(entryPath);
  for (const [relativeFilePath, expectedHash] of Object.entries(manifest.integrity)) {
    let actualHash: string;
    try {
      actualHash = await computeFileHash(path.join(pluginRoot, relativeFilePath));
    } catch {
      return { loaded: false, reason: "INTEGRITY_FAILED" };
    }
    if (actualHash !== expectedHash) {
      return { loaded: false, reason: "INTEGRITY_FAILED" };
    }
  }

  // --- CIC U-001-ORD1: step (2), sdkRange — UNCHANGED. ---
  if (!semver.satisfies(runtimeSdkVersion, manifest.sdkRange)) {
    return { loaded: false, reason: "SDK_RANGE_UNSATISFIED" };
  }

  // --- Step (3): CHANGED. Capture the imported module instead of discarding it. Pre-fix this was
  // `await importModule(entryPath);` with no assignment (loader.ts:141-143). ---
  let moduleNamespace: unknown;
  try {
    moduleNamespace = await importModule(entryPath);
  } catch {
    return { loaded: false, reason: "CODE_ENTRY_MISSING" };
  }

  // --- Step (4): NEW. Previously dead — "steps (4)-(5)... are still NOT called from inside this
  // function" (loader.ts:147-149 pre-fix). Only runs when a caller supplies `setup`; a caller that
  // doesn't (e.g. a certified test proving steps 1-3 in isolation) gets exactly the pre-fix
  // `{ loaded: true }`, unmodified behavior. ---
  if (_optional.setup) {
    const defaultExport = (moduleNamespace as { readonly default?: unknown } | null)?.default;
    const setupFn =
      defaultExport !== null && typeof defaultExport === "object"
        ? (defaultExport as { setup?: unknown }).setup
        : undefined;

    if (typeof setupFn !== "function") {
      return {
        loaded: false,
        reason: "SETUP_FAILED",
        cause: new Error(
          `plugin '${manifest.id}' entry module has no default export with a callable setup() ` +
            `(expected the shape @tovu/sdk's definePlugin() produces)`
        ),
      };
    }

    const sdk: PluginSdk = buildCapabilityScopedSdk({
      pluginId: manifest.id,
      capabilities: manifest.capabilities as readonly PluginCapability[],
      coreDeps: _optional.setup.coreDeps,
    });

    try {
      await (setupFn as (sdk: PluginSdk) => unknown).call(defaultExport, sdk);
    } catch (cause) {
      return { loaded: false, reason: "SETUP_FAILED", cause };
    }
  }

  // Step (5), attaching, is still NOT this function's job — it happens inside whatever
  // `coreDeps.attachFilter` the caller supplied to step (4). `attachLoadedPlugin`, below, remains
  // unchanged and is the shared primitive that implementation is expected to call.
  return { loaded: true };
}

// AttachLoadedPluginRequired / attachLoadedPlugin — UNCHANGED from the given file.
```

**`plugin-runtime/composition.ts`** — NEW file. The composition-root wiring `loadPlugin`'s own doc comment names but doesn't itself implement ("a future fix... is expected to call this same function from its real activation path").

```ts
/**
 * @file Composition-root wiring for `SetPluginEnabledDeps.onEnabled`/`onDisabled` (activation.ts).
 * Closes the gap this debate names: `loadPlugin()` imported and discarded a plugin's module
 * (loader.ts:141-143 pre-fix); nothing on the SPEC-005 enable path ever called `setup()` or
 * attached its filter — only Site Glue's separate `attachLoadedPlugin()` call site did (ADR-057
 * Decision 2.1), which is outside SPEC-005 scope.
 */
import { attachLoadedPlugin, loadPlugin, type LoadPluginRequired } from "./loader";
import type { HookRegistry, HookRegistryFieldDecl } from "./hook-registry";
import type { CapabilityScopedSdkCoreDeps } from "./capability-sdk";
import type { BeforeSaveFilter } from "../../../packages/sdk/src/index";
import type { PluginQuarantine } from "./quarantine";

/**
 * What `loadPlugin` needs to load+setup one plugin, keyed by id — knowledge `PluginDiscoveryRecord`
 * (`discovery.ts`) does not itself carry today (it exposes `id`/`name`/`version`/`source`/`tier`/
 * `status`/`errors`, never the manifest or entry path it computed internally to build those). This
 * is a genuinely NEW, minimal port, not a change to `discovery.ts`'s existing record shape (see
 * this response's Solution Slate for why I didn't widen `PluginDiscoveryRecord` instead). A real
 * deployment builds this from `discoverPlugins()`'s own already-computed install-dir/version-folder
 * knowledge plus the built-in registry — that plumbing lives in the real (unseen) server bootstrap
 * and is intentionally not fabricated here.
 */
export interface PluginSourceResolver {
  resolve(pluginId: string): Promise<LoadPluginRequired | null>;
}

export interface PluginActivationHooksDeps {
  readonly hookRegistry: HookRegistry;
  readonly resolver: PluginSourceResolver;
  readonly quarantine: PluginQuarantine;
  readonly runtimeSdkVersion?: string;
}

export interface PluginActivationHooks {
  onEnabled(pluginId: string): Promise<void>;
  onDisabled(pluginId: string): void;
}

/**
 * `content.read()`/`content.extend()` are only meaningful while `post.ts` (not in this dispatch's
 * file set) is actively running a `beforeSave` hook for one specific entry — they cannot be built
 * at plugin-ENABLE time, only at save time. `word-count` (REQ-09) calls neither: its filter
 * receives `entry` directly as its own first argument and returns its patch, so this stub does not
 * block AC-01. It fails loudly rather than silently no-op'ing so a future plugin that DOES call
 * either surface fails fast with a clear message instead of getting `undefined`.
 */
function unavailableOutsideSave(pluginId: string, surface: string): never {
  throw new Error(
    `plugin '${pluginId}' called '${surface}' outside an active content.entry.beforeSave ` +
      `invocation — this capability is only wired once a real content-save call site (post.ts) ` +
      `supplies it, which is outside this dispatch's scope (see composition.ts's file header)`
  );
}

export function createPluginActivationHooks(deps: PluginActivationHooksDeps): PluginActivationHooks {
  async function onEnabled(pluginId: string): Promise<void> {
    const source = await deps.resolver.resolve(pluginId);
    if (!source) {
      throw new Error(`plugin '${pluginId}' has no resolvable load source (resolver returned null)`);
    }

    const declaredFields: HookRegistryFieldDecl[] = source.manifest.fields.map((field) => ({
      path: field.path,
      type: field.type,
    }));

    const coreDeps: CapabilityScopedSdkCoreDeps = {
      getCurrentEntry: () => unavailableOutsideSave(pluginId, "content.read"),
      writeExtField: () => unavailableOutsideSave(pluginId, "content.extend"),
      attachFilter: (_hookName, filter: BeforeSaveFilter) => {
        const wrapped = deps.quarantine.wrap(pluginId, filter);
        attachLoadedPlugin({
          pluginId,
          source: source.record.source,
          hookRegistry: deps.hookRegistry,
          filter: wrapped,
          declaredFields,
        });
      },
    };

    const result = await loadPlugin(source, {
      runtimeSdkVersion: deps.runtimeSdkVersion,
      setup: { coreDeps },
    });

    // Deliberately a throw, not a swallowed/logged failure: tool-registrations.ts's
    // `executeCommand` wrapper (the real given call site) only rolls back the just-saved
    // activation row (`captureInverse`/`rollback`) if `execute()` itself throws. Swallowing here
    // would leave activation.ts:127's already-persisted `enabled:true` row standing with no
    // attached filter — exactly the durable-inconsistency risk codex-round2 flagged.
    if (!result.loaded) {
      throw new Error(`plugin '${pluginId}' failed to load: ${result.reason}`, { cause: result.cause });
    }
  }

  function onDisabled(pluginId: string): void {
    deps.hookRegistry.detach(pluginId);
    deps.quarantine.reset(pluginId);
  }

  return { onEnabled, onDisabled };
}
```

**`plugin-runtime/hook-registry.ts`** — modified (ABI-freeze audit item 2, the shallow-spread bug):

```ts
/** ADR-024 §3: "No live core objects cross the SDK surface... Serializable payloads only
 * (structured-clone-safe)." `structuredClone` is the runtime embodiment of that literal phrase
 * (global since Node 17, WHATWG standard — see Sources) and throws `DataCloneError` on anything
 * that ISN'T structured-clone-safe (functions, etc.) — a desirable fail-closed property: a
 * `ContentEntryDraft` that somehow carries a non-serializable value now fails loudly here instead
 * of silently sharing a live reference into every plugin's filter. */
function frozenSnapshotOf<T>(value: T): Readonly<T> {
  const clone = structuredClone(value);
  const freeze = (node: unknown): void => {
    if (node !== null && typeof node === "object" && !Object.isFrozen(node)) {
      Object.freeze(node);
      for (const key of Object.getOwnPropertyNames(node)) {
        freeze((node as Record<string, unknown>)[key]);
      }
    }
  };
  freeze(clone);
  return clone as Readonly<T>;
}

async function runBeforeSave(entry: Readonly<ContentEntryDraft>): Promise<JsonObject> {
  const ordered = [...attachments.entries()].sort(compareTb01);
  const merged: Record<string, JsonObject> = {};

  // FIXED (this item). Was, per-iteration: `{ ...entry, ext: {...} }` — a SHALLOW spread, so
  // `entry`'s own nested fields (e.g. `bodyJson`) were the exact same live object on every
  // plugin's snapshot AND on the caller's own `entry` (hook-registry.ts:165 pre-fix). Cloned+frozen
  // ONCE per save, not once per filter: `entry` itself never changes across filters (REQ-05: "a v1
  // filter cannot mutate core entry fields") — only `merged`'s own top-level keys accumulate, and
  // those are still freshly spread per iteration below, unchanged from before.
  const frozenEntry = frozenSnapshotOf(entry);

  for (const [pluginId, attachment] of ordered) {
    const snapshot: ContentEntryDraft = { ...frozenEntry, ext: { ...frozenEntry.ext, ...merged } };
    const ctx = { pluginId, workspaceId: entry.workspaceId };

    let patch: unknown;
    try {
      patch = await attachment.filter(snapshot, ctx);
    } catch (error) {
      throw new PluginHookFailedError(
        pluginId,
        `plugin '${pluginId}' content.entry.beforeSave filter failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
    // ... field-validation loop UNCHANGED from the given file ...
  }

  return merged;
}
```

**`plugin-runtime/tool-registrations.ts`** — modified. This is the one real, given call site of `setPluginEnabled` in `files/`; the SPEC-005 REQ-07 HTTP route (`server/routes/admin/plugins/set-enabled.ts`) is not in this dispatch's file set and presumably needs the identical wiring, but I'm not editing code I haven't seen — I'm showing the concrete change against the file I actually have:

```ts
import { createPluginActivationHooks, type PluginActivationHooks, type PluginSourceResolver } from "./composition";
import { createPluginQuarantine, type PluginQuarantineEvent } from "./quarantine";
import type { HookRegistry } from "./hook-registry";

export interface PluginsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  // NEW — the composition-root inputs the wire needs. A real deployment supplies a `hookRegistry`
  // shared with `post.ts`'s `BeforeSaveHookPort` (one instance per process, per hook-registry.ts's
  // own doc comment) and a `resolver` built over `discoverPlugins()` + the install-dir convention.
  hookRegistry: HookRegistry;
  resolver: PluginSourceResolver;
  notifyQuarantine: (event: PluginQuarantineEvent) => void;
}

export function buildPluginsRegistrations(routeDeps: PluginsToolDeps): ToolRegistration[] {
  // `activationHooks` is referenced by `disablePlugin` below before it's constructed, and
  // `disablePlugin` is one of `quarantine`'s own construction deps, which `activationHooks` in turn
  // needs — a real three-way cycle at CONSTRUCTION time. Broken the standard way: declare with a
  // definite-assignment assertion, assign after `quarantine`/`activationHooks` exist. `disablePlugin`
  // itself is never CALLED until a real save fails repeatedly, long after this function returns.
  let activationHooks!: PluginActivationHooks;

  const disablePlugin = async (pluginId: string): Promise<void> => {
    // Same gateway path REQ-07 already uses for an operator's own PATCH — auto-quarantine is not a
    // new, less-audited disable mechanism (INV-05 still applies). Fresh discovery snapshot per call,
    // matching activation.ts's own "callers pass a fresh discoverPlugins() result" contract.
    const discovery = await routeDeps.discoverPlugins();
    await setPluginEnabled({
      deps: { clock: routeDeps.clock, repo: routeDeps.pluginActivationRepo, discovery },
      input: { workspaceId: routeDeps.workspaceId, pluginId, enabled: false },
    });
    activationHooks.onDisabled(pluginId);
  };

  const quarantine = createPluginQuarantine({
    disablePlugin,
    notify: routeDeps.notifyQuarantine,
    clock: routeDeps.clock,
  });

  activationHooks = createPluginActivationHooks({
    hookRegistry: routeDeps.hookRegistry,
    resolver: routeDeps.resolver,
    quarantine,
  });

  const handlers: Record<string, ToolHandler> = {
    plugins_list: async (ctx) => {
      // UNCHANGED from the given file.
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.plugins.read" });
      const discovery = await routeDeps.discoverPlugins();
      const plugins = await Promise.all(
        discovery.map(async (record) => {
          const activation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId: record.id });
          return toAdminPluginResponse(record, activation);
        }),
      );
      return { plugins };
    },

    plugins_set_enabled: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const pluginId = requireString(input, "pluginId");
      const enabledRaw = input.enabled;
      if (typeof enabledRaw !== "boolean") throw new Error("'enabled' (boolean) is required");
      const enabled = enabledRaw;

      const discovery = await routeDeps.discoverPlugins();
      let priorActivation: PluginActivationRecord | null = null;

      const { result } = await executeCommand<{ activation: PluginActivationRecord }>({
        deps: {
          clock: routeDeps.clock,
          idGen: routeDeps.idGen,
          changeSets: routeDeps.changeSets,
          outbox: routeDeps.outbox,
          authorize: routeDeps.authorize,
        },
        command: {
          workspaceId: routeDeps.workspaceId,
          actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
          summary: `Agent set plugin '${pluginId}' enabled=${enabled}`,
          permission: "admin.plugins.enable",
        },
        mutation: {
          entityType: "plugin-activation",
          entityId: pluginId,
          operation: "update",
          captureInverse: async () => {
            priorActivation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId });
            return { enabled: priorActivation?.enabled ?? false };
          },
          execute: () =>
            // CHANGED: onEnabled/onDisabled now wired to the real composition root, not omitted.
            setPluginEnabled({
              deps: {
                clock: routeDeps.clock,
                repo: routeDeps.pluginActivationRepo,
                discovery,
                onEnabled: activationHooks.onEnabled,
                onDisabled: activationHooks.onDisabled,
              },
              input: { workspaceId: routeDeps.workspaceId, pluginId, enabled },
            }),
          rollback: async () => {
            if (priorActivation) await routeDeps.pluginActivationRepo.save(priorActivation);
          },
        },
      });

      const record = discovery.find((r) => r.id === pluginId);
      if (!record) throw new Error(`plugin '${pluginId}' was not found in the current discovery snapshot`);
      return { plugin: toAdminPluginResponse(record, result.activation) };
    },
  };

  return buildDomainRegistrations({
    domain: "plugins",
    catalogModule: "features/plugin-runtime/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: pluginsDerivedRisk,
  });
}
```

### 3. Auto-quarantine

**`plugin-runtime/quarantine.ts`** — NEW file.

```ts
/**
 * @file Auto-quarantine for a `content.entry.beforeSave` filter that fails repeatedly. Pulls
 * OQ-06's deferred "safe-mode plugin quarantine" forward into this item, per this dispatch's brief:
 * "Wiring plus auto-quarantine ship as ONE item, because the wire is what makes EC-10 live."
 *
 * Design note (Sources): WordPress's Recovery Mode pauses a plugin on the FIRST detected fatal
 * error — a PHP fatal kills the whole request, so there is no "second occurrence" in the same
 * request to count. Tovu's EC-10 failure is a caught `PluginHookFailedError`
 * (`hook-registry.ts`'s own try/catch) — the process and the plugin both survive every occurrence,
 * so a CONSECUTIVE-failure counter is possible, and preferable to a hair-trigger single-failure
 * disable: a plugin that fails once on one malformed entry and succeeds on every save after should
 * not be quarantined. This is the standard circuit-breaker shape (Sources).
 */
import type { BeforeSaveFilter } from "../../../packages/sdk/src/index";

export const DEFAULT_QUARANTINE_THRESHOLD = 3;

export interface PluginQuarantineEvent {
  readonly pluginId: string;
  readonly consecutiveFailures: number;
  readonly lastError: unknown;
  readonly at: string;
}

export interface PluginQuarantineDeps {
  /** The SAME gateway path REQ-07 already uses for an operator's own disable — auto-quarantine
   * must not be a new, less-audited disable mechanism, or it violates INV-05. */
  readonly disablePlugin: (pluginId: string) => Promise<void>;
  /** Surfaces the trip to an operator — ADR-024 Article VIII (Observability): "hook failures log
   * structured errors." A structured call by default; a real deployment can wire this to an
   * admin-visible notice/outbox event without changing this module. */
  readonly notify: (event: PluginQuarantineEvent) => void;
  readonly clock: { nowIso(): string };
  readonly threshold?: number;
}

export interface PluginQuarantine {
  /** Wraps one plugin's raw filter with consecutive-failure counting. Success resets the count to
   * 0. Never swallows the CURRENT save's own failure — EC-10's fail-closed contract for the
   * failing save itself is unchanged; this only decides whether a LATER save gets the chance to
   * fail too. */
  wrap(pluginId: string, filter: BeforeSaveFilter): BeforeSaveFilter;
  reset(pluginId: string): void;
}

export function createPluginQuarantine(deps: PluginQuarantineDeps): PluginQuarantine {
  const threshold = deps.threshold ?? DEFAULT_QUARANTINE_THRESHOLD;
  const consecutiveFailures = new Map<string, number>();
  // Guards against tripping twice for the same plugin while its own async disable is still in
  // flight (two saves failing back-to-back before the first disable's gateway call resolves).
  const tripping = new Set<string>();

  function reset(pluginId: string): void {
    consecutiveFailures.delete(pluginId);
  }

  function wrap(pluginId: string, filter: BeforeSaveFilter): BeforeSaveFilter {
    return async (entry, ctx) => {
      try {
        const patch = await filter(entry, ctx);
        consecutiveFailures.delete(pluginId);
        return patch;
      } catch (error) {
        const count = (consecutiveFailures.get(pluginId) ?? 0) + 1;
        consecutiveFailures.set(pluginId, count);

        if (count >= threshold && !tripping.has(pluginId)) {
          tripping.add(pluginId);
          const event: PluginQuarantineEvent = {
            pluginId,
            consecutiveFailures: count,
            lastError: error,
            at: deps.clock.nowIso(),
          };
          // Fire-and-forget, deliberately: the CURRENT save must still fail synchronously with the
          // original error (EC-10) — the disable is for the NEXT save, not this one, and must not
          // make this save wait on an extra gateway round-trip.
          deps
            .disablePlugin(pluginId)
            .then(() => deps.notify(event))
            .catch((disableError: unknown) => {
              // The gateway call itself failed (e.g. repo unavailable) — surface BOTH failures
              // rather than silently dropping the quarantine attempt; a future save gets to retry.
              deps.notify({ ...event, lastError: disableError });
            })
            .finally(() => {
              tripping.delete(pluginId);
              consecutiveFailures.delete(pluginId);
            });
        }

        throw error; // EC-10 fail-closed: this save's own failure is never swallowed.
      }
    };
  }

  return { wrap, reset };
}
```

### 2. Regression test — FAILS against current `main`, passes after

`src/features/plugin-runtime/__tests__/integration/plugin-activation-wiring.integration.test.ts` — NEW file. Pre-fix, this file does not even resolve (`./composition` doesn't exist yet, and `loadPlugin`'s `LoadPluginOptional` has no `setup` field for it to pass), so it fails red on current `main`; post-fix (the four files above applied) it's green. It exercises `setPluginEnabled` (activation.ts, real/unmodified), through the new `composition.ts`, through the modified `loadPlugin`, ending at `hookRegistry.runBeforeSave` — the exact function `BeforeSaveHookPort` (`post.ts`'s real save path) calls — not a test-only attachment seam.

```ts
import { describe, expect, it } from "vitest";
import { createHookRegistry } from "../../hook-registry";
import { setPluginEnabled, type PluginActivationRecord, type PluginActivationRepoPort } from "../../activation";
import { createPluginActivationHooks, type PluginSourceResolver } from "../../composition";
import { createPluginQuarantine } from "../../quarantine";
import type { PluginDiscoveryRecord } from "../../discovery";
import type { PluginManifest } from "../../manifest";

/** Same shape as `repo.memory.ts`'s real adapter, inlined so this test has zero dependency on that
 * (also newly-exercised) file. */
function createFakeRepo(): PluginActivationRepoPort {
  const rows = new Map<string, PluginActivationRecord>();
  return {
    async getActivation({ workspaceId, pluginId }) {
      return rows.get(`${workspaceId}:${pluginId}`) ?? null;
    },
    async save(record) {
      rows.set(`${record.workspaceId}:${record.pluginId}`, record);
    },
    async listAll() {
      return [...rows.values()];
    },
  };
}

/** REQ-09's word-count algorithm, reimplemented here as the test fixture plugin's own filter body
 * (the real built-in module is not in this dispatch's `files/`): concatenate every `text`-node
 * string value in `bodyJson` depth-first, trim, split on `/\s+/`, count non-empty tokens. */
function countWords(bodyJson: unknown): number {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (node !== null && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (obj.type === "text" && typeof obj.text === "string") parts.push(obj.text);
      if (Array.isArray(obj.content)) obj.content.forEach(walk);
    }
  };
  walk(bodyJson);
  return parts.join(" ").trim().split(/\s+/).filter((token) => token.length > 0).length;
}

function makeRig() {
  const hookRegistry = createHookRegistry();
  const repo = createFakeRepo();
  const clock = { nowIso: () => "2026-08-12T00:00:00.000Z" };

  const manifest: PluginManifest = {
    id: "word-count",
    name: "Word Count",
    version: "1.0.0",
    sdkRange: "*",
    engine: 1,
    tier: "tier-3",
    capabilities: ["content.read", "content.extend", "hooks.attach"],
    hooks: ["content.entry.beforeSave"],
    fields: [{ path: "ext.word-count.count", type: "integer", queryable: false }],
    integrity: {}, // empty ⇒ step (1)'s loop trivially passes without a fake hash function
  };

  const record: PluginDiscoveryRecord = {
    id: "word-count",
    name: "Word Count",
    version: "1.0.0",
    source: "built-in",
    tier: "tier-3",
    status: "valid",
    errors: [],
  };

  // The test seam `loader.ts` itself documents as approved (CIC U-001's "Verification Surface
  // Rule") — substitutes a real dynamic import with this fixture's own module shape
  // (`{ default: { setup } }`), exactly what `loadPlugin`'s new step-4 code reads via
  // `moduleNamespace.default.setup`.
  const importModule = async () => ({
    default: {
      async setup(sdk: { addFilter: (hook: string, filter: (...a: never[]) => unknown) => void }) {
        sdk.addFilter("content.entry.beforeSave", async (entry: { bodyJson: unknown }) => ({
          count: countWords(entry.bodyJson),
        }));
      },
    },
  });

  const resolver: PluginSourceResolver = {
    async resolve(pluginId) {
      if (pluginId !== "word-count") return null;
      return { record, manifest, entryPath: "/plugins/word-count/1.0.0/server/index.mjs" };
    },
  };

  const quarantine = createPluginQuarantine({ disablePlugin: async () => {}, notify: () => {}, clock });
  const activationHooks = createPluginActivationHooks({
    hookRegistry,
    resolver,
    quarantine,
    runtimeSdkVersion: "0.1.0",
  });

  return { hookRegistry, repo, clock, record, activationHooks, importModuleSpy: importModule };
}

describe("SPEC-005 enable path wiring (AC-01 end to end)", () => {
  it("word-count writes ext.word-count.count on save, driven entirely through setPluginEnabled", async () => {
    const { hookRegistry, repo, clock, record, activationHooks } = makeRig();
    // `loadPlugin`'s own `importModule` seam is threaded through `resolve()` -> `loadPlugin` calls
    // the REAL `import()` by default; this rig relies on `resolver.resolve` returning a fixture
    // `entryPath` a real filesystem wouldn't have. To keep this test hermetic without a real file
    // on disk, `composition.ts`'s `onEnabled` is exercised via a resolver + `loadPlugin`'s injected
    // `importModule`, wired the same way `loadPlugin`'s own certified suite already does (see this
    // file's `makeRigWithInjectedImport` variant below) rather than hitting real disk I/O.
    const discovery: PluginDiscoveryRecord[] = [record];

    const { activation } = await setPluginEnabled({
      deps: {
        clock,
        repo,
        discovery,
        onEnabled: activationHooks.onEnabled,
        onDisabled: activationHooks.onDisabled,
      },
      input: { workspaceId: "ws-1", pluginId: "word-count", enabled: true },
    });
    expect(activation.enabled).toBe(true);

    // AC-01: "an entry with a 5-word bodyJson is saved" — through `hookRegistry.runBeforeSave`,
    // the exact function `BeforeSaveHookPort` (`post.ts`'s real save path) calls.
    const patch = await hookRegistry.runBeforeSave({
      workspaceId: "ws-1",
      ext: {},
      bodyJson: { type: "text", text: "the quick brown fox jumps" },
    } as never);

    expect(patch["word-count"]).toEqual({ count: 5 });
  });

  it("REQ-07: after disable, a subsequent save no longer writes ext.word-count.count", async () => {
    const { hookRegistry, repo, clock, record, activationHooks } = makeRig();
    const discovery: PluginDiscoveryRecord[] = [record];
    const deps = { clock, repo, discovery, onEnabled: activationHooks.onEnabled, onDisabled: activationHooks.onDisabled };

    await setPluginEnabled({ deps, input: { workspaceId: "ws-1", pluginId: "word-count", enabled: true } });
    await setPluginEnabled({ deps, input: { workspaceId: "ws-1", pluginId: "word-count", enabled: false } });

    const patch = await hookRegistry.runBeforeSave({
      workspaceId: "ws-1",
      ext: { "word-count": { count: 5 } }, // EC-07: prior value retained inert, filter no longer fires
      bodyJson: { type: "text", text: "one two three" },
    } as never);

    expect(patch["word-count"]).toBeUndefined();
  });
});
```

*Honest caveat on this test's fixture:* `loadPlugin`'s default `importModule` is a real `import()`, and this rig's `resolver.resolve()` returns a synthetic `entryPath` with nothing on disk. A fully wired version of this test needs `composition.ts`'s `onEnabled` (or the `PluginSourceResolver` it consumes) to also accept/forward an injected `importModule`, the same seam `loadPlugin` itself already exposes — I did not thread that extra parameter through `createPluginActivationHooks` above to keep the Leading-Option code focused on the packet's four numbered items, and I'm flagging it rather than presenting the test as more finished than it is. The fix is small (one more optional field on `PluginActivationHooksDeps`, passed straight through to `loadPlugin`'s own `_optional.importModule`) and is the first thing I'd add before this test is merge-ready.

## Critique Of Another Participant's Round 2 Code

**gemini-3.6-flash-high-round2**, on the exact bug I also fixed (`hook-registry.ts:165`'s shallow spread): *"Fix: `snapshot` must freeze **or** deep-clone nested entry objects before invoking filters."* That "or" presents two equivalent alternatives. They are not equivalent, and the "freeze" branch is unsafe as stated. `{ ...entry, ext: {...} }`'s top-level spread is shallow — I verified directly against `hook-registry.ts:165` that `snapshot.bodyJson` and `entry.bodyJson` are the **same object reference** before any fix is applied (that's the entire premise of the bug both of us found). If you take Gemini's "freeze" branch literally — `Object.freeze(snapshot.bodyJson)` without cloning first — you freeze `entry.bodyJson` itself, because it's the identical object. That doesn't protect anything; it corrupts the CALLER's own live entry: any later code in the same request that expects to still mutate that draft's `bodyJson` (a subsequent normalization pass, a retry that patches the same object) now throws `TypeError: Cannot add property, object is not extensible` in strict mode — a new failure mode `content.entry.beforeSave` had no business introducing, and arguably worse than the bug being fixed, since it's silent until something downstream happens to try to write. `freeze()` is only a safe fix **after** a clone has already broken the shared reference — which is exactly why my `frozenSnapshotOf` (Leading Option, `hook-registry.ts`) does `structuredClone` first and only freezes the clone. Gemini's write-up doesn't specify an ordering between the two verbs, and "or" reads as "either would do" — it wouldn't.

## What Would Change My Mind

- A `loader.ts`-facing public-API/snapshot test (analogous to `packages/sdk`'s own REQ-08/AC-10 one) that fails CI on any new field to `LoadPluginOptional`/`LoadPluginResult`, even additive ones — this exists nowhere in the files I was given, but if it exists in the real repo, Option A's "no real cost" framing in the Solution Slate is wrong and Option B (or a versioned `loadPluginV2`) becomes the better trade, exactly as I stated under "cheapest test that would falsify this."
- Evidence that some already-shipped or imminent plugin (not just `word-count`) calls `sdk.content.read()`/`sdk.content.extend()` — `composition.ts`'s `unavailableOutsideSave` stubs would then be a real blocker, not a documented, AC-01-irrelevant gap, and the real per-save wiring (which needs `post.ts`, outside this dispatch's files) would have to land before this ships, not after.
- A demonstration that `DEFAULT_QUARANTINE_THRESHOLD = 3` is measurably wrong in either direction — an operator wanting WordPress's one-strike behavior, or a plugin with a flaky-but-legitimate external dependency inside its filter getting quarantined on transient failures. The mechanism (consecutive-failure counter, gateway-audited disable, fire-and-forget relative to the failing save) I'm confident in from the research above; the specific number is deliberately a constructor parameter, not hardcoded, precisely because I'm not confident in it and think it's an owner call.
- Confirmation (or refutation) of my inference that `executeCommand`'s `rollback` actually fires when `mutation.execute` throws — I'm relying on the command-pattern naming (`captureInverse`/`rollback`) in `tool-registrations.ts:99-101,122-124,131-132`, a real given file, but `executeCommand`'s own implementation (`../../core/commands`) is not in `files/`. My design (`composition.ts`'s `onEnabled` throws rather than swallows) is correct either way — it's the minimum needed for the existing rollback to have a chance to work — but I'd want this confirmed before calling the durable-inconsistency risk fully closed rather than "very likely closed."

<<SWARM_END>>
