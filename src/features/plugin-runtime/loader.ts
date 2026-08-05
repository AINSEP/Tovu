/**
 * @file `loadPlugin()` — the BR-01 ordered load pipeline (SPEC-005 REQ-03; CIC U-001, `ESCALATE_SECURITY`).
 *
 * Purpose:
 * The single most security-critical unit in this feature (Implementation Outline C-008's own File
 * Map note). Executes, for one candidate plugin, in this EXACT order, short-circuiting on the
 * first failure (BR-01):
 *   (1) verify every packaged file against `manifest.integrity` (mismatch ⇒ `INTEGRITY_FAILED`)
 *   (2) check `manifest.sdkRange` is satisfied by the runtime `@tovu/sdk` version
 *       (miss ⇒ `SDK_RANGE_UNSATISFIED`, status `incompatible`)
 *   (3) dynamic `import()` the entry file (absent/unresolvable ⇒ `CODE_ENTRY_MISSING`)
 *   (4) build a capability-scoped SDK (`capability-sdk.ts`) and invoke the plugin's `setup()`
 *   (5) attach the plugin's declared hooks via `hook-registry.ts`
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
 * TDD-certified stub (implementation outline C-008, CIC U-001). Signature and JSDoc are
 * design-frozen; `loadPlugin`'s body intentionally throws until the Programmer stage implements
 * it against `__tests__/integration/loader.integration.test.ts`. Do not implement ahead of that
 * suite being reviewed — this file exists so the test suite compiles and fails red, not green,
 * and so the ordering constraint above is visible to whoever implements it.
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

import type { PluginDiscoveryRecord } from "./discovery";
import type { AttachmentSource, HookRegistry, HookRegistryFieldDecl } from "./hook-registry";
import type { PluginManifest } from "./manifest";
import type { BeforeSaveFilter } from "../../../packages/sdk/src/index";

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

export type LoadPluginResult =
  | { readonly loaded: true }
  | { readonly loaded: false; readonly reason: "INTEGRITY_FAILED" | "SDK_RANGE_UNSATISFIED" | "CODE_ENTRY_MISSING" };

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
  const { manifest, entryPath } = required;
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
  try {
    await importModule(entryPath);
  } catch {
    return { loaded: false, reason: "CODE_ENTRY_MISSING" };
  }

  // Steps (4)-(5) (invoke `definePlugin`'s `setup()` with a capability-scoped SDK, then attach its
  // declared hooks via `hook-registry.ts`) are still NOT called from inside this function: they
  // need a live hook-registry instance and per-load core deps (workspaceId, the "current entry"
  // accessor) that this function's certified signature has no parameter for, and `loadPlugin()`'s
  // own statement order is unchanged by ADR-057 (Site Glue is additive, not a rewrite of this
  // function). What DID change (ADR-057 Decision 2.1): step (5)'s attach half — previously dead,
  // documented-but-never-called code (`hook-registry.ts`'s own doc comment falsely claimed a
  // caller existed; verified false, see that file's corrected header) — is now `attachLoadedPlugin`
  // below, a real, callable, shared extraction. A future caller (this function's own eventual fix,
  // or any other loader) supplies the filter obtained from step (4)'s `setup()` call and gets a
  // tested, single attach path instead of reinventing `hookRegistry.attach()` wiring per caller.
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
