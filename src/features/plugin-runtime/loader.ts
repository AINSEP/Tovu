/**
 * @file `loadPlugin()` — the BR-01 ordered load pipeline (SPEC-005 REQ-03; CIC U-001, `ESCALATE_SECURITY`).
 *
 * Purpose:
 * The single most security-critical unit in this feature (Implementation Outline C-008's own File
 * Map note). BR-01 defines the following five steps; `loadPlugin()` currently implements steps
 * (1)-(3) in this EXACT order, short-circuiting on the first failure:
 *   (1) verify every packaged file against `manifest.integrity` (mismatch ⇒ `INTEGRITY_FAILED`)
 *   (2) check `manifest.sdkRange` is satisfied by the runtime `@tovu/sdk` version
 *       (miss ⇒ `SDK_RANGE_UNSATISFIED`, status `incompatible`)
 *   (3) dynamic `import()` the entry file (absent/unresolvable ⇒ `CODE_ENTRY_MISSING`)
 *   (4) build a capability-scoped SDK (`capability-sdk.ts`) and invoke the plugin's `setup()` —
 *       not yet called from `loadPlugin()`
 *   (5) attach the plugin's declared hooks via `hook-registry.ts` — not yet called from
 *       `loadPlugin()`; the attach half is implemented separately as `attachLoadedPlugin()`
 *
 * **CIC U-001 (Binding, ESCALATE_SECURITY):** steps (1) and (2) must BOTH complete successfully
 * before step (3) ever runs. A tampered or `sdkRange`-incompatible plugin's code must NEVER be
 * evaluated, even transiently at module-eval time. Any deviation from this ordering requires a
 * recorded `[CIC_DEVIATION_APPROVED]` entry — see
 * `reports/pipeline/005-plugin-system/critical-internal-constraints.md` U-001 before changing the
 * statement order below.
 *
 * Test seams (deliberate, approved — CIC's Verification Surface Rule prefers an observable seam
 * over asserting call-graph shape): `importModule` and `computeFileHash` are injectable so the
 * certified test suite can substitute a spy import function to prove step (3) was never reached
 * for a rejected plugin, without depending on a real dynamic-import/module-resolution environment.
 * Real callers (loader's actual production wiring) omit both and get the real `import()`/SHA-256
 * behavior.
 *
 * Architectural role:
 * TDD-certified implementation of steps (1)-(3) (implementation outline C-008, CIC U-001).
 * Signature and JSDoc are design-frozen; `loadPlugin()` verifies integrity and SDK compatibility
 * before importing code, returning classified expected failures. Steps (4)-(5) remain the
 * documented wiring gap described above and at the successful return path below.
 *
 * **Added 2026-08-04 (ADR-057 Decision 2.1):** `attachLoadedPlugin()`, below `loadPlugin()` in this
 * file, is the real (not stub) extraction of step (5)'s previously-dead attach logic, widened to a
 * `"glue"` source. `loadPlugin()` itself is unchanged — see `attachLoadedPlugin`'s own doc comment
 * for what is and is not covered by the extraction.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import * as semver from "semver";

import { buildCapabilityScopedSdk, type CapabilityScopedSdkCoreDeps } from "./capability-sdk.js";
import type { PluginDiscoveryRecord } from "./discovery.js";
import type { AttachmentSource, HookRegistry, HookRegistryFieldDecl } from "./hook-registry.js";
import type { PluginManifest } from "./manifest.js";
import type { BeforeSaveFilter, Plugin } from "../../../packages/sdk/src/index.js";

/**
 * The runtime's own installed `@tovu/sdk` version, used for the sdkRange check (step 2) when a
 * caller doesn't supply `runtimeSdkVersion` explicitly. `@tovu/sdk`'s own `exports` map
 * deliberately blocks a deep import of its `package.json` (ADR-005 rule 1: public surface = the
 * pinned runtime exports only), so this cannot be resolved through the package itself — it is a
 * plain constant that must be bumped alongside `packages/sdk/package.json`'s own `version` field.
 * Every certified test supplies `runtimeSdkVersion` explicitly, so this default is exercised only
 * by real production/dev boot, never by the certified suite.
 */
const DEFAULT_RUNTIME_SDK_VERSION = "0.1.0";

/** A packaged artifact's file layout is fixed (ADR-004): `tovu.plugin.json` + `server/index.mjs` at
 * the plugin root. `entryPath` is always `<pluginRoot>/server/index.mjs`, so the root two
 * directories up from it is where `manifest.integrity`'s relative file paths resolve from. */
function derivePluginRoot(entryPath: string): string {
  return path.dirname(path.dirname(entryPath));
}

async function defaultComputeFileHash(absoluteFilePath: string): Promise<string> {
  const bytes = await readFile(absoluteFilePath);
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

export interface LoadPluginRequired {
  /** The plugin's already-discovered, statically-valid record (a plugin with a non-`valid` static
   * `status` must never reach `loadPlugin` at all — that guard lives in the caller, BR-05). */
  readonly record: PluginDiscoveryRecord;
  readonly manifest: PluginManifest;
  /** Absolute filesystem path (or, for a built-in, an in-process module identifier) to the
   * plugin's entry point — the exact thing step (3) `import()`s. */
  readonly entryPath: string;
  /** Per-load core handles composed by the application root. `loadPlugin()` owns the imported
   * module and therefore owns building the capability-scoped SDK passed to its `setup()` call;
   * the root owns what each granted handle actually delegates to. */
  readonly coreDeps: CapabilityScopedSdkCoreDeps;
}

export interface LoadPluginOptional {
  /** The runtime's own `@tovu/sdk` version, checked against `manifest.sdkRange` in step (2).
   * Defaults to the runtime's real installed SDK version when omitted. */
  readonly runtimeSdkVersion?: string;
  /** Test seam (approved, CIC U-001 Verification Surface): overrides step (3)'s dynamic import.
   * Defaults to real `import()`. */
  readonly importModule?: (entryPath: string) => Promise<unknown>;
  /** Test seam: overrides step (1)'s per-file SHA-256 computation. Defaults to real hashing of
   * the file at the given absolute path. */
  readonly computeFileHash?: (absoluteFilePath: string) => Promise<string>;
}

export type PluginLoadFailureReason =
  | "INTEGRITY_FAILED"
  | "SDK_RANGE_UNSATISFIED"
  | "CODE_ENTRY_MISSING"
  | "PLUGIN_EXPORT_INVALID"
  | "PLUGIN_SETUP_FAILED";

export type PluginEnableFailureReason = PluginLoadFailureReason | "PLUGIN_HOOK_NOT_ATTACHED" | "PLUGIN_HOOK_ATTACH_FAILED";

/** Raised by the composition root after converting `loadPlugin()`'s expected early-return result
 * into the enable path's error channel. HTTP maps this to `PLUGIN_LOAD_FAILED`; agent tools receive
 * the same typed error directly. */
export class PluginLoadError extends Error {
  readonly pluginId: string;
  readonly reason: PluginEnableFailureReason;

  constructor(pluginId: string, reason: PluginEnableFailureReason, options?: { cause?: unknown }) {
    super(`plugin '${pluginId}' failed to load (${reason})`, options);
    this.name = "PluginLoadError";
    this.pluginId = pluginId;
    this.reason = reason;
  }
}

export type LoadPluginResult =
  | { readonly loaded: true }
  | {
      readonly loaded: false;
      readonly reason: PluginLoadFailureReason;
    };

/** `definePlugin()`'s runtime return shape. A plain `{ setup() {} }` export is deliberately not
 * accepted: only the SDK helper's opaque `{ definition }` wrapper is a valid plugin ABI value. */
function readDefinedPlugin(moduleValue: unknown): Plugin | null {
  if (typeof moduleValue !== "object" || moduleValue === null) return null;
  const candidate = (moduleValue as { default?: unknown }).default;
  if (typeof candidate !== "object" || candidate === null) return null;
  const definition = (candidate as { definition?: unknown }).definition;
  if (typeof definition !== "object" || definition === null) return null;
  return typeof (definition as { setup?: unknown }).setup === "function" ? (candidate as Plugin) : null;
}

/**
 * Executes BR-01's 5-step ordered pipeline for one plugin. See CIC U-001 above for the binding
 * ordering constraint this function's statement order must never invert.
 *
 * @throws Never for an expected pipeline failure (those are reported via the returned `reason`);
 * may propagate an unexpected infrastructure error (e.g. a real filesystem I/O failure unrelated
 * to integrity mismatch).
 * @complexity O(file count) for integrity hashing; the `import()`/`setup()` cost beyond that is
 * plugin-defined and unbounded — no latency budget is specified (ADR `scalability` axis, a
 * disclosed open gap, not a defect of this function).
 */
export async function loadPlugin(
  required: LoadPluginRequired,
  _optional: LoadPluginOptional = {}
): Promise<LoadPluginResult> {
  const { record, manifest, entryPath, coreDeps } = required;
  const importModule = _optional.importModule ?? ((p: string) => import(p));
  const computeFileHash = _optional.computeFileHash ?? defaultComputeFileHash;
  const runtimeSdkVersion = _optional.runtimeSdkVersion ?? DEFAULT_RUNTIME_SDK_VERSION;

  // --- CIC U-001-ORD1: step (1), integrity, MUST complete successfully before step (2)/(3). ---
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

  // --- CIC U-001-ORD1: step (2), sdkRange, MUST complete successfully before step (3). ---
  if (!semver.satisfies(runtimeSdkVersion, manifest.sdkRange)) {
    return { loaded: false, reason: "SDK_RANGE_UNSATISFIED" };
  }

  // --- Step (3): only now, after both prior checks pass, is the plugin's code ever evaluated. ---
  let importedModule: unknown;
  try {
    importedModule = await importModule(entryPath);
  } catch {
    return { loaded: false, reason: "CODE_ENTRY_MISSING" };
  }

  // --- Step (4): validate the `definePlugin()` export, build the per-load gated SDK, run setup. ---
  const plugin = readDefinedPlugin(importedModule);
  if (!plugin) {
    return { loaded: false, reason: "PLUGIN_EXPORT_INVALID" };
  }

  const sdk = buildCapabilityScopedSdk({
    pluginId: record.id,
    capabilities: manifest.capabilities as readonly import("./manifest.js").PluginCapability[],
    coreDeps,
  });
  try {
    await plugin.definition.setup(sdk);
  } catch {
    return { loaded: false, reason: "PLUGIN_SETUP_FAILED" };
  }

  // Step (5) remains composition-owned: setup's gated `addFilter()` handle captures the filter in
  // the caller's `coreDeps`; only after this successful return does the root call the shared
  // `attachLoadedPlugin()` path below. That split prevents a late setup failure from leaving a
  // partially-attached filter behind.
  return { loaded: true };
}

export interface AttachLoadedPluginRequired {
  /** The plugin/glue-module id `hookRegistry.attach()` files this attachment under. */
  readonly pluginId: string;
  /** Who attached this filter — widened by ADR-057 Decision 3 to include `"glue"`, so Site Glue's
   * content-lifecycle attachment point can call this function directly rather than forking it. */
  readonly source: AttachmentSource;
  /** The live registry this load's filter attaches to — one long-lived instance per process
   * (`hook-registry.ts`'s own doc comment), supplied by the caller, never constructed here. */
  readonly hookRegistry: HookRegistry;
  /** The filter obtained from step (4) — i.e. whatever the caller's own `setup()` invocation (with
   * a capability-scoped SDK gating `hooks.attach`) produced. This function does not invoke `setup()`
   * itself: the SDK shape a `setup()` call receives differs by caller (plugin-runtime's own 3-member
   * `PluginCapability` vocabulary for real plugins; Site Glue's 8-member `GlueCapability` vocabulary
   * for glue modules), so building and gating that SDK stays the caller's responsibility. What is
   * genuinely shared — and was genuinely dead before this extraction — is the attach step itself. */
  readonly filter: BeforeSaveFilter;
  readonly declaredFields: readonly HookRegistryFieldDecl[];
}

export type AttachLoadedPluginOptional = {};

/**
 * The real (not stub) extraction of `loadPlugin()`'s dead step (5) — ADR-057 Decision 2.1. Attaches
 * one already-obtained filter to the given hook registry under `(pluginId, source)`, widened beyond
 * `loader.ts`'s original `"built-in" | "site"` scope to also accept `"glue"`. Before ADR-057, no
 * production code ever called `hookRegistry.attach()` at all (verified by grep, see `hook-registry.ts`'s
 * corrected header) — Site Glue's content-lifecycle attachment point is this function's first real
 * caller; a future fix to `loadPlugin()`'s own dead steps (4)-(5) is expected to call this same
 * function from its real activation path rather than re-implementing the attach step a second time.
 *
 * @throws Nothing of its own — propagates whatever `hookRegistry.attach()` itself throws (today,
 * nothing; `attach()` is a plain `Map.set`).
 * @complexity O(1) — a single delegated call, no iteration or I/O of its own.
 * @overallScore 100/100
 */
export function attachLoadedPlugin(
  required: AttachLoadedPluginRequired,
  _optional: AttachLoadedPluginOptional = {}
): void {
  const { pluginId, source, hookRegistry, filter, declaredFields } = required;
  hookRegistry.attach(pluginId, source, filter, declaredFields);
}
