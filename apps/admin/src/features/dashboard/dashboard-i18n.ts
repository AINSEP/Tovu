import { createDashboardTranslator } from "@jini-ai/admin/screens/dashboard/dashboard-i18n";
import { COMMON_I18N } from "../../lib/i18n-common";
/**
 * @file Host binding of the Dashboard dictionary (`DASHBOARD_DICT`, in `@jini-ai/admin`) to THIS
 * app's common dictionary. `COMMON_I18N` composes the admin's neutral common words with the entries
 * that name the product (the Publish dialog's older-destination notice), so the Dashboard and the
 * Publish dialog it owns translate those too — the package's own neutral `t` cannot carry them.
 *
 * `DASHBOARD_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key`. Imported by `App.tsx` (the
 * Publish dialog's copy), `use-publish-section-button.hooks.ts` and `use-dashboard.hooks.ts`.
 */
export const t = createDashboardTranslator({ commonDictionary: COMMON_I18N });
