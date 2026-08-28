import type { AdminContentType, ContentTypeFieldDef } from "@/lib/api";

/**
 * @file What `use-edit-fields-dialog.hooks.ts` needs from the outside world, as an interface rather
 * than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented
 * in `development/docs/architecture/wired-hooks-convention.md`.
 *
 * `describeEditFieldsError` (this hook's error-message rule) is deliberately NOT part of this port
 * — it is a pure, no-I/O function, injected the way `assistant-chats-port.hooks.ts`'s own
 * `persistableMessages` is not: imported directly.
 */
export interface EditFieldsDialogPort {
  updateContentTypeFields(input: {
    key: string;
    fields: ContentTypeFieldDef[];
    expectedVersion: number;
  }): Promise<{ contentType: AdminContentType }>;
}
