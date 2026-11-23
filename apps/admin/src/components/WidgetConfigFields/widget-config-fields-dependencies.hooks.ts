import type { AdminContentType } from "@jini-ai/admin/screens/collections/api/collections-api.types";
import { collectionsApi } from "../../features/collections/api/collections-api";
import type { AdminMenu } from "../../features/menus/api/menus-api.types";
import { menusApi } from "../../features/menus/api/menus-api";
import type { AdminFormDefinition } from "../../features/forms/api/forms-api.types";
import { formsApi } from "../../features/forms/api/forms-api";
import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { WORKSPACE_ID } from "../../lib/admin-http/config";
import type { WidgetConfigFieldsPort } from "./widget-config-fields-port.hooks";

/**
 * @file The only place under `components/WidgetConfigFields` that reaches `lib/api` — see
 * `widget-config-fields-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `theme-pages-
 *  dependencies.hooks.ts`'s `defaultThemePagesPort`. */
export const defaultWidgetConfigFieldsPort: WidgetConfigFieldsPort = {
  listMenus: () => menusApi.listMenus(),
  listForms: () => formsApi.listForms(),
  listContentTypes: () => collectionsApi.listContentTypes(),
};

/** Tovu's authenticated preview adapter; the server owns widget rendering and active-theme CSS.
 * @complexity O(n) JSON parsing plus one abortable HTTP request.
 */
export async function renderWidgetPreviewDocument(
  { source }: { source: string },
  { signal, request = authenticatedAdminRequest }: { signal?: AbortSignal; request?: typeof authenticatedAdminRequest } = {},
): Promise<string> {
  const result = await request<{ html: string; document: string }>({
    path: `/workspaces/${WORKSPACE_ID}/widgets/preview`, method: 'POST', body: JSON.parse(source),
  }, { signal });
  return result.document;
}

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
