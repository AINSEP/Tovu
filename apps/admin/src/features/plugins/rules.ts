import { ApiError, describeApiError as describeApiErrorDefault, type AdminPlugin } from "../../lib/api";
import { t } from "./plugins-i18n";

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

export function pluginToggleControl(plugin: AdminPlugin, rowSavingId: string | null, locale: string): PluginToggleControl {
  if (!(plugin.enabled || plugin.status === "valid")) {
    return { visible: false, disabled: false, label: "" };
  }
  const savingThisRow = rowSavingId === plugin.id;
  return {
    visible: true,
    disabled: savingThisRow,
    // The busy-state "…" is locale-neutral (no established translated bare-ellipsis precedent
    // elsewhere in this app — every other busy label pairs it with a word, e.g. posts-i18n.ts's
    // "Creating…") and stays untranslated here on purpose.
    label: savingThisRow ? "…" : plugin.enabled ? t(locale, "Disable") : t(locale, "Enable"),
  };
}

/**
 * The toggle button's `aria-label` — every row's button reads "Enable"/"Disable"/"…" on its own,
 * identical across every plugin, so a screen reader or a generic browser agent reading the
 * accessibility tree (roles + accessible names — not this repo's own `agentHandle()`, whose
 * `label` option is a private `data-agent-label` attribute neither one can see) has no way to tell
 * one row's control from another's without the plugin's own name in the accessible name.
 *
 * Names the target action (Enable/Disable), not the transient "…" busy word — the visible "…" plus
 * `disabled` already signal in-flight to a sighted operator, and an accessible name that kept
 * switching between "…" and a real verb mid-interaction would be a worse read than one that stays
 * "Enable {name}"/"Disable {name}" throughout.
 *
 * @complexity O(1).
 */
export function pluginToggleAriaLabel(plugin: AdminPlugin, locale: string): string {
  return `${plugin.enabled ? t(locale, "Disable") : t(locale, "Enable")} ${plugin.name}`;
}
