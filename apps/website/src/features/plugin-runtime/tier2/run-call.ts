/**
 * @file `runTier2Call()` — the worker-side half of one Tier-2 plugin call (ADR-024 §3/§4).
 *
 * Pure apart from the injected importer: import the plugin, validate its `definePlugin()` export
 * with the SAME check `loadPlugin()` uses, build the SAME capability-scoped SDK over the SAME
 * invocation backing the in-process path uses, run `setup()`, then either report the attached hooks
 * (`probe`) or run the beforeSave filter on one entry (`beforeSave`). Every failure becomes a
 * `{ ok: false, stage, error }` reply instead of a throw, so the server can tell "the plugin's code
 * failed" (a reply) from "the worker itself died or ran out of time" (a rejected call).
 *
 * The server-side manifest checks (integrity, sdkRange — CIC U-001) have already run before any
 * request reaches this function; it never sees a plugin the loader has not cleared.
 */
import { HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import { buildCapabilityScopedSdk } from "../capability-sdk.js";
import { createPluginInvocationCoreDeps } from "../invocation-core-deps.js";
import { readDefinedPlugin } from "../plugin-export.js";
import type { Tier2FailureStage, Tier2Reply, Tier2Request } from "./protocol.js";

export interface RunTier2CallRequired {
  readonly request: Tier2Request;
  /** Imports the plugin entry. The worker entry supplies real `import()` after registering the
   * `@tovu/sdk` resolver; tests supply a fake. */
  readonly importModule: (entryPath: string) => Promise<unknown>;
}

export type RunTier2CallOptional = {};

function failed(stage: Tier2FailureStage, error: unknown): Tier2Reply {
  return { ok: false, stage, error: error instanceof Error ? error.message : String(error) };
}

/**
 * Runs one Tier-2 request against the plugin's code in the current thread.
 *
 * @returns A structured-clone-safe reply; never rejects for a plugin-side failure.
 * @complexity O(1) own work plus the plugin's import, setup and filter cost (bounded by the
 *   worker's timeout and heap limits on the server side, not here).
 */
export async function runTier2Call(required: RunTier2CallRequired, _optional: RunTier2CallOptional = {}): Promise<Tier2Reply> {
  const { request, importModule } = required;
  const { pluginId, entryPath, capabilities, hooks } = request.plugin;

  let moduleValue: unknown;
  try {
    moduleValue = await importModule(entryPath);
  } catch (error) {
    return failed("import", error);
  }
  const plugin = readDefinedPlugin(moduleValue);
  if (!plugin) return failed("export", `plugin '${pluginId}' does not default-export definePlugin(...)`);

  const invocation = createPluginInvocationCoreDeps({ pluginId, declaredHooks: hooks });
  const sdk = buildCapabilityScopedSdk({ pluginId, capabilities, coreDeps: invocation.coreDeps });
  try {
    await plugin.definition.setup(sdk);
  } catch (error) {
    return failed("setup", error);
  }

  const filter = invocation.capturedFilter();
  if (request.kind === "probe") {
    return { ok: true, kind: "probe", hooks: filter ? [HOOK_CONTENT_ENTRY_BEFORE_SAVE] : [] };
  }
  if (!filter) return failed("hook", `plugin '${pluginId}' attached no beforeSave filter`);

  let patch: unknown;
  try {
    patch = await filter(request.entry, request.ctx);
  } catch (error) {
    return failed("hook", error);
  }
  try {
    // postMessage would otherwise throw a DataCloneError outside any reply, which the server can
    // only see as a crashed worker; checking here keeps it a plugin-attributed hook failure.
    return { ok: true, kind: "beforeSave", patch: structuredClone(patch) };
  } catch (error) {
    return failed("hook", `plugin '${pluginId}' returned a value that cannot cross the worker boundary: ${(error as Error).message}`);
  }
}
