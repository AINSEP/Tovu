/**
 * @file Shared plugin hook error identity and Tovu's model-facing refusal.
 *
 * Why it lives in `contracts/core`: `features/post` must recognize a plugin save-hook refusal to
 * tell the model about it, but it cannot import `features/plugin-runtime` — plugin-runtime already
 * imports `features/post`, and `post.ts` stays plugin-unaware. Both sides import this neutral
 * module instead; `hook-registry.ts` re-exports the class so its existing importers are unchanged.
 */
import { ToolInputError, type ToolHandler } from "@jini-ai/core";

// One class identity across Jini runtime, post and product refusal adapters.
import { PluginHookFailedError } from "@jini-ai/plugins/host";
export { PluginHookFailedError };

/**
 * The public text for a save-hook refusal — what an agent tool and every HTTP route return instead
 * of the error's own message.
 *
 * The text is FIXED apart from the plugin id (and, for a partly applied run, the refused item's
 * ref): a `PluginHookFailedError`'s own text quotes the plugin's thrown error (or a
 * quarantine-persistence error), which can carry a path, a SQL error or a secret — the same reason `ModelFacingErrorRule.message` exists.
 *
 * @complexity O(1).
 */
export function pluginHookRefusalText(err: PluginHookFailedError): string {
  // A refused item of a partly applied run must not claim "nothing was saved": the items before it
  // landed. The item ref is a stable id, never body content.
  return err.refusedItemRef === null
    ? `a site plugin (${err.pluginId}) refused this save; the content was not saved`
    : `a site plugin (${err.pluginId}) refused item ${err.refusedItemRef}; items applied before it stay saved, so check the import history before retrying`;
}

/**
 * Re-classifies a plugin save-hook refusal into a `ToolInputError` the model can act on; anything
 * else is returned unchanged (and stays redacted by the transport). The message is
 * {@link pluginHookRefusalText}; a `ModelFacingErrorRule` cannot interpolate the plugin id, which is
 * why this is a function rather than a rule.
 *
 * @param err - Any rejection a tool handler threw.
 * @returns The value to re-throw.
 * @complexity O(1).
 */
export function toModelFacingPluginHookError(err: unknown): unknown {
  if (!(err instanceof PluginHookFailedError)) return err;
  return new ToolInputError({ message: `PLUGIN_HOOK_FAILED: ${pluginHookRefusalText(err)}` });
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
