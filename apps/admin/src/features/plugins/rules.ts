import { ApiError, describeApiError as describeApiErrorDefault, type AdminPlugin } from "../../lib/api";

/**
 * @file Pure logic for the `plugins` feature — everything that computes a value rather than
 * rendering one. Follows the `posts/rules.ts` convention: no React import, no hooks, directly
 * testable.
 *
 * Moved here from `Plugins.tsx`: the screen's own `describeApiError` override, and the toggle
 * cell's visibility/label decision (`pluginToggleControl`) — previously an inline double ternary
 * inside a `DataTable` cell closure, reachable only by rendering the table.
 */

/** Maps this screen's two calls' error codes to `errors.spec.md`'s operator-facing guidance text
 * (ui.spec.md §8), falling back to the server's own message.
 *
 * @complexity O(1).
 * @overallScore 100
 */
/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`). */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "PLUGIN_NOT_FOUND") return "No plugin with that id is installed.";
    if (e.code === "PLUGIN_INVALID") return "This plugin failed validation and cannot be enabled.";
    if (e.code === "PLUGIN_INCOMPATIBLE") return "This plugin requires a different SDK version.";
  }
  return describeApiErrorDefault(e, fallback);
}

/** What the "Enabled" cell should show for one row — `visible: false` for AC-21 (enabling this row
 *  is already known to 422, so no enable-capable control is offered at all; `Roles.tsx`'s
 *  built-in-row `—` idiom). The caller renders `visible` as a plain ternary (button vs. the muted
 *  `—` fallback) on this already-computed result.
 *
 * @complexity O(1).
 */
export interface PluginToggleControl {
  visible: boolean;
  disabled: boolean;
  label: string;
}

export function pluginToggleControl(plugin: AdminPlugin, rowSavingId: string | null): PluginToggleControl {
  if (!(plugin.enabled || plugin.status === "valid")) {
    return { visible: false, disabled: false, label: "" };
  }
  const savingThisRow = rowSavingId === plugin.id;
  return {
    visible: true,
    disabled: savingThisRow,
    label: savingThisRow ? "…" : plugin.enabled ? "Disable" : "Enable",
  };
}
