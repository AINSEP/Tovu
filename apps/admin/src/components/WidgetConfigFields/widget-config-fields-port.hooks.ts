import type { AdminFormDefinition, AdminMenu } from "../../lib/api";

/**
 * @file What `WidgetConfigFields.tsx`'s `MenuConfigFields`/`ContactFormConfigFields` need from the
 * outside world, as an interface rather than a direct `lib/api` import. Follows the
 * `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `theme-pages-port.hooks.ts`.
 *
 * Scoped to the two routes these two sub-components actually call — narrower than `lib/api`'s
 * full `api` namespace, the same narrowing precedent `theme-pages-port.hooks.ts` documents.
 */
export interface WidgetConfigFieldsPort {
  listMenus(): Promise<{ menus: AdminMenu[] }>;
  listForms(): Promise<{ data: AdminFormDefinition[] }>;
}
