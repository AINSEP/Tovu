import { useEffect, useState } from "react";
import type { AdminFormDefinition } from "../../../lib/api";
import { defaultFormsPort } from "./forms-dependencies.hooks";
import type { FormsPort } from "./forms-port.hooks";

/**
 * @file Everything the Forms LIST does, so `FormsList.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`: `use-<thing>.hooks.ts`.
 * Feature-local because nothing outside `features/forms` needs it; promote to `src/hooks/` only
 * when a second feature actually does.
 *
 * `port` is injected — see `forms-port.hooks.ts` (shared with `use-form-editor.hooks.ts`, since
 * both read/write the same `AdminFormDefinition` resource) — rather than importing `lib/api`
 * directly, so a test can describe list/write outcomes against `createFakeFormsPort` instead of
 * stubbing global `fetch`. `useWiredFormsList` below is the zero-argument pair `FormsList.tsx`
 * actually mounts.
 */

export interface FormsListController {
  forms: AdminFormDefinition[] | null;
  error: string | null;
  /** In-flight row action (status toggle) — one at a time, same `rowSavingId` convention
   *  `Posts.tsx`/`Pages.tsx` use for their own row actions. */
  rowSavingId: string | null;
  toggleStatus: (form: AdminFormDefinition) => Promise<void>;
}

export function useFormsList(port: FormsPort): FormsListController {
  const [forms, setForms] = useState<AdminFormDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function load() {
    port
      .listForms()
      .then((r) => setForms(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load forms"));
  }

  useEffect(load, [port]);

  async function toggleStatus(form: AdminFormDefinition) {
    setRowSavingId(form.id);
    setError(null);
    try {
      const { data: updated } = await port.updateForm(
        { id: form.id },
        { status: form.status === "active" ? "disabled" : "active" }
      );
      setForms((prev) => (prev ? prev.map((f) => (f.id === updated.id ? updated : f)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update form status");
    } finally {
      setRowSavingId(null);
    }
  }

  return { forms, error, rowSavingId, toggleStatus };
}

/**
 * Binds the real `/api/.../forms` client — see `forms-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `FormsList.tsx`
 * composes this and a test composes {@link useFormsList} with `createFakeFormsPort`.
 */
export function useWiredFormsList(): FormsListController {
  return useFormsList(defaultFormsPort);
}
