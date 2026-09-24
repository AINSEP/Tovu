import { api, type AdminContentType, type AdminFormDefinition, type AdminMenu } from "../../lib/api";
import type { WidgetConfigFieldsPort } from "./widget-config-fields-port.hooks";

/**
 * @file The only place under `components/WidgetConfigFields` that reaches `lib/api` — see
 * `widget-config-fields-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `theme-pages-
 *  dependencies.hooks.ts`'s `defaultThemePagesPort`. */
export const defaultWidgetConfigFieldsPort: WidgetConfigFieldsPort = {
  listMenus: () => api.listMenus(),
  listForms: () => api.listForms(),
  listContentTypes: () => api.listContentTypes(),
};

/** Seed state for {@link createFakeWidgetConfigFieldsPort}. */
export interface FakeWidgetConfigFieldsPortOptions {
  menus?: AdminMenu[];
  forms?: AdminFormDefinition[];
  contentTypes?: AdminContentType[];
  /** When set, `listMenus()` rejects with this instead of resolving — for load-failure tests. */
  listMenusError?: Error;
  /** When set, `listForms()` rejects with this instead of resolving — for load-failure tests. */
  listFormsError?: Error;
  /** When set, `listContentTypes()` rejects with this instead of resolving — for load-failure
   *  tests. */
  listContentTypesError?: Error;
}

/**
 * An in-memory {@link WidgetConfigFieldsPort} for tests — "every port gets a fake" (see
 * `theme-pages-dependencies.hooks.ts`).
 */
export function createFakeWidgetConfigFieldsPort(options: FakeWidgetConfigFieldsPortOptions = {}): WidgetConfigFieldsPort {
  return {
    async listMenus() {
      if (options.listMenusError) throw options.listMenusError;
      return { menus: options.menus ?? [] };
    },
    async listForms() {
      if (options.listFormsError) throw options.listFormsError;
      return { data: options.forms ?? [] };
    },
    async listContentTypes() {
      if (options.listContentTypesError) throw options.listContentTypesError;
      return { items: options.contentTypes ?? [] };
    },
  };
}
