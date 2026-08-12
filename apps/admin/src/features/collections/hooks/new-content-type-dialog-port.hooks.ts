import type { AdminContentType, ContentTypeFieldDef } from "../../../lib/api";

/**
 * @file What `use-new-content-type-dialog.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface NewContentTypeDialogPort {
  createContentType(input: {
    key: string;
    label: string;
    fields: ContentTypeFieldDef[];
  }): Promise<{ contentType: AdminContentType }>;
}
