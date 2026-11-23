import type { AdminContentType } from "@jini-ai/admin/screens/collections/api/collections-api.types";
import type { AdminMenu } from "@jini-ai/admin/screens/menus/api/menus-api.types";
import type { AdminFormDefinition } from "@jini-ai/admin/screens/forms/api/forms-api.types";

/**
 * @file What `WidgetConfigFields.tsx`'s `MenuConfigFields`/`ContactFormConfigFields`/
 * `RecentEntriesConfigFields` need from the outside world, as an interface rather than a direct
 * `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `theme-pages-port.hooks.ts`.
 *
 * Scoped to the three routes these sub-components actually call — narrower than `lib/api`'s full
 * `api` namespace, the same narrowing precedent `theme-pages-port.hooks.ts` documents.
 * `listContentTypes` was added for the Collections plan A1 (2026-09-23): the "Collection list"
 * widget's config fields (Collection/Sort/Fields/Filter) need the content-type registry the same
 * way the Collections screen itself does.
 */
export interface WidgetConfigFieldsPort {
  listMenus(): Promise<{ menus: AdminMenu[] }>;
  listForms(): Promise<{ data: AdminFormDefinition[] }>;
  listContentTypes(): Promise<{ items: AdminContentType[] }>;
}
