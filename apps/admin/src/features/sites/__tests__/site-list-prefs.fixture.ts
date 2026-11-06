import { DEFAULT_SITE_LIST_PREFS } from "@jini-ai/ui/site-card";
import type { SiteListPrefsController } from "../hooks/use-site-list-prefs.hooks";

/** Choices that are already loaded and go nowhere, for tests that are not about them. */
export function staticListPrefs(overrides: Partial<SiteListPrefsController> = {}): SiteListPrefsController {
  return { prefs: DEFAULT_SITE_LIST_PREFS, ready: true, onPrefsChange: () => {}, loadError: null, saveError: null, ...overrides };
}
