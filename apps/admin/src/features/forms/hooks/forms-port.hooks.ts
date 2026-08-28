import type { AdminFormDefinition, AdminFormField, AdminFormNotify } from "@/lib/api";

/**
 * @file What `useFormEditor` and `useFormsList` need from the outside world, as an interface
 * rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects` and
 * `features/pages`: this file declares, `forms-dependencies.hooks.ts` binds the real `api` client,
 * and nothing else under `features/forms/hooks` imports `lib/api` for these four routes.
 *
 * One shared port rather than two overlapping ones — `useFormEditor` and `useFormsList` both read
 * and write the SAME `AdminFormDefinition` resource (both call `updateForm`: `useFormsList` for its
 * row status toggle, `useFormEditor` for both its save and its own status toggle), the same
 * "genuinely matches" case `redirects-port.hooks.ts` names for its own three hooks. Deliberately
 * NOT shared with `form-submissions-port.hooks.ts` — submissions are a different sub-resource with
 * no method overlap; see that port's own doc comment.
 */
export interface FormsPort {
  listForms(): Promise<{ data: AdminFormDefinition[] }>;
  getForm(id: string): Promise<{ data: AdminFormDefinition }>;
  createForm(
    input: { name: string; slug: string; fields: AdminFormField[] },
    options?: { notify?: AdminFormNotify }
  ): Promise<{ data: AdminFormDefinition }>;
  updateForm(
    target: { id: string },
    options?: { name?: string; fields?: AdminFormField[]; notify?: AdminFormNotify; status?: "active" | "disabled" }
  ): Promise<{ data: AdminFormDefinition }>;
}
