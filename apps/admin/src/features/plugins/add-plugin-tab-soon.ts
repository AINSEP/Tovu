import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";

/**
 * @file The "Soon" tag on the "Add a plugin" tab label, Agent Plugins and Plugins alike (owner,
 * 2026-10-06). The tab stays fully clickable and usable; the tag only says the install flow is
 * still settling. To drop the tag from both pages, set {@link ADD_PLUGIN_TAB_SOON} to `false`.
 */
export const ADD_PLUGIN_TAB_SOON = true;

/**
 * The tag text for the "Add a plugin" tab: the admin sidebar's own translated "Soon" word, so the
 * tab and the sidebar badge read the same in every locale.
 *
 * @param locale Admin locale code; an unknown one falls back to English.
 * @param enabled Defaults to {@link ADD_PLUGIN_TAB_SOON}; passed explicitly only by tests.
 * @returns The tag text, or `undefined` (an untagged tab) when the flag is off.
 */
export function addPluginTabSoonTag(locale: string, enabled: boolean = ADD_PLUGIN_TAB_SOON): string | undefined {
  return enabled ? translateAdminNavLabel(locale, "Soon") : undefined;
}
