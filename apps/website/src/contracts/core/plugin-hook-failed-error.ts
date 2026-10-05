/**
 * @file `PluginHookFailedError` and its model-facing refusal (moved here from
 * `features/plugin-runtime/hook-registry.ts`, 2026-10-05).
 *
 * Why it lives in `contracts/core`: `features/post` must recognize a plugin save-hook refusal to
 * tell the model about it, but it cannot import `features/plugin-runtime` — plugin-runtime already
 * imports `features/post`, and `post.ts` stays plugin-unaware. Both sides import this neutral
 * module instead; `hook-registry.ts` re-exports the class so its existing importers are unchanged.
 */
import { ToolInputError, type ToolHandler } from "@jini-ai/core";

/** Thrown (and caught by the caller, mapped to 500 `PLUGIN_HOOK_FAILED`) when a filter throws,
 * triggers `CapabilityDeniedError`, or returns an invalid `ext` write (BR-07/EC-10). */
export class PluginHookFailedError extends Error {
  readonly pluginId: string;
  /** The item a multi-item apply was writing when the hook refused (e.g. `post:<id>`), set only by
   * an apply that is NOT all-or-nothing (`publish-content/apply-loop.ts`), so items applied before
   * it stay saved. `null` for a single save, where the refusal means nothing was saved. */
  readonly refusedItemRef: string | null;

  constructor(pluginId: string, message: string, options?: { cause?: unknown; refusedItemRef?: string }) {
    super(message, options);
    this.name = "PluginHookFailedError";
    this.pluginId = pluginId;
    this.refusedItemRef = options?.refusedItemRef ?? null;
  }
}

/**
 * Re-classifies a plugin save-hook refusal into a `ToolInputError` the model can act on; anything
 * else is returned unchanged (and stays redacted by the transport).
 *
 * The message is FIXED apart from the plugin id (and, for a partly applied run, the refused item's
 * ref): a `PluginHookFailedError`'s own text quotes the plugin's thrown error (or a
 * quarantine-persistence error), which can carry a path, a SQL error or a secret — the same reason `ModelFacingErrorRule.message` exists. That rule shape cannot
 * interpolate the plugin id, which is why this is a function rather than a rule.
 *
 * @param err - Any rejection a tool handler threw.
 * @returns The value to re-throw.
 * @complexity O(1).
 */
export function toModelFacingPluginHookError(err: unknown): unknown {
  if (!(err instanceof PluginHookFailedError)) return err;
  // A refused item of a partly applied run must not claim "nothing was saved": the items before it
  // landed. The item ref is a stable id, never body content.
  return new ToolInputError({
    message: err.refusedItemRef === null
      ? `PLUGIN_HOOK_FAILED: a site plugin (${err.pluginId}) refused this save; the content was not saved`
      : `PLUGIN_HOOK_FAILED: a site plugin (${err.pluginId}) refused item ${err.refusedItemRef}; items applied before it stay saved, so check the import history before retrying`,
  });
}

/**
 * Wraps every handler in a map with {@link toModelFacingPluginHookError} — the whole map at once,
 * so no save handler can be the one that forgot (see `withModelFacingErrors`). Transparent on the
 * success path.
 *
 * @param handlers - A domain's handler map, keyed by tool id.
 * @returns A new map with the same keys; the input is not mutated.
 * @complexity O(h) at build time; O(1) per failed call.
 */
export function withPluginHookRefusals(handlers: Record<string, ToolHandler>): Record<string, ToolHandler> {
  return Object.fromEntries(
    Object.entries(handlers).map(([toolId, handler]) => [
      toolId,
      async (...args: Parameters<ToolHandler>) => {
        try {
          return await handler(...args);
        } catch (err) {
          throw toModelFacingPluginHookError(err);
        }
      },
    ])
  );
}
