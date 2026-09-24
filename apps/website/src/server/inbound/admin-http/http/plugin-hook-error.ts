import type { Response } from "express";
import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";

/**
 * @file P0c fix (hooks v2 plan, 2026-09-23) — `PluginHookFailedError`'s own doc comment
 * (`hook-registry.ts`) has always claimed it is "caught by the caller, mapped to 500
 * `PLUGIN_HOOK_FAILED`", but no route ever actually did that: every content-save route's local
 * `send*Error` function fell through to the generic `{error:"internal error"}` 500 with no `code`
 * at all, so a client (admin UI or an agent tool) could never tell a plugin's hook failure apart
 * from any other internal error. One shared function so every content-save route's error mapper
 * gets the SAME shape instead of re-typing it (and risking a drift) at each call site.
 */

/**
 * If `err` is a `PluginHookFailedError`, writes the 500 `PLUGIN_HOOK_FAILED` envelope and returns
 * `true`. Returns `false` (writes nothing) for any other error, so a route's own error mapper can
 * call this first and fall through to its remaining branches unchanged.
 * @complexity O(1).
 */
export function sendPluginHookFailedError(res: Response, err: unknown): boolean {
  if (!(err instanceof PluginHookFailedError)) return false;
  res.status(500).json({ error: err.message, code: "PLUGIN_HOOK_FAILED", pluginId: err.pluginId });
  return true;
}
