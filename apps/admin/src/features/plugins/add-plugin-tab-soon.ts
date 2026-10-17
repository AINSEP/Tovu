import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";

/**
 * @file The "Soon" tags on the Agent Plugins and Plugins tab labels: "Add a plugin" (owner,
 * 2026-10-06) and "Marketplace" (owner, 2026-10-17). A tagged tab stays fully clickable and usable;
 * the tag only says the flow is still settling. To drop a tag from both pages, set
 * {@link ADD_PLUGIN_TAB_SOON} or {@link MARKETPLACE_TAB_SOON} to `false`.
 */
export const ADD_PLUGIN_TAB_SOON = false;

/** The Marketplace tab's tag: nothing is fetched or listed there yet (see each page's panel). */
export const MARKETPLACE_TAB_SOON = true;

/**
 * The tag text for the "Add a plugin" tab: the admin sidebar's own translated "Soon" word, so the
 * tab and the sidebar badge read the same in every locale.
 *
 * @param locale Admin locale code; an unknown one falls back to English.
 * @param enabled Defaults to {@link ADD_PLUGIN_TAB_SOON}; passed explicitly by tests, and by Plugins
 *   on a server that refuses local installs.
 * @returns The tag text, or `undefined` (an untagged tab) when the flag is off.
 */
export function addPluginTabSoonTag(locale: string, enabled: boolean = ADD_PLUGIN_TAB_SOON): string | undefined {
  return enabled ? translateAdminNavLabel({ locale: locale, key: "Soon" }) : undefined;
}

/**
 * The tag text for the "Marketplace" tab — the same translated "Soon" word as
 * {@link addPluginTabSoonTag}.
 *
 * @param locale Admin locale code; an unknown one falls back to English.
 * @param enabled Defaults to {@link MARKETPLACE_TAB_SOON}; passed explicitly only by tests.
 * @returns The tag text, or `undefined` (an untagged tab) when the flag is off.
 */
export function marketplaceTabSoonTag(locale: string, enabled: boolean = MARKETPLACE_TAB_SOON): string | undefined {
  return addPluginTabSoonTag(locale, enabled);
}
