/**
 * @file The Sites list's remembered choices (sort, pins, hidden sites), stored per person in the
 * server's `core.interface` settings namespace, the same per-user ledger as Settings → User
 * Interface, so they follow the person rather than the browser. The hook itself is `useSiteListPrefs`
 * in `@jini-ai/ui/site-card`; Tovu binds the ledger and its error wording here.
 *
 * Cost: one read of that namespace (about a dozen small keys) each time the Sites page opens, and one
 * single-row write of under 1 KB per click on Sort by, a pin or Hide. No polling.
 */
import { useSiteListPrefs, type SiteListPrefsController, type SiteListPrefsPort } from "@jini-ai/ui/site-card";
import { describeApiError } from "@/lib/admin-http/request";
import { loadNamespaceValues, saveChangedEntries } from "@/lib/ledger-slice";
import { INTERFACE_NAMESPACE } from "@/lib/settings-tabs";

/** Registered by the server in `apps/website/src/features/settings/admin-interface.ts`. */
export const SITE_LIST_KEY = "sitesList";

export const defaultSiteListPrefsPort: SiteListPrefsPort = {
  load: async () => (await loadNamespaceValues({ namespace: INTERFACE_NAMESPACE })).get(SITE_LIST_KEY),
  save: async ({ next }, _optional = {}) => { await saveChangedEntries({ namespace: INTERFACE_NAMESPACE, scope: "user", candidates: [{ key: SITE_LIST_KEY, valueJson: next, changed: true }] }); },
};

const describeError = ({ error }: { error: unknown }): string => describeApiError({ e: error, fallback: String(error) });

/** The real ledger, for the Sites screen. */
export function useWiredSiteListPrefs(): SiteListPrefsController {
  return useSiteListPrefs({ port: defaultSiteListPrefsPort }, { describeError });
}
