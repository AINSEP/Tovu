import { useEffect, useState } from "react";
import { api, type AdminFormDefinition } from "../../../lib/api";

/**
 * @file Everything the Forms LIST does, so `FormsList.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`: `use-<thing>.hooks.ts`.
 * Feature-local because nothing outside `features/forms` needs it; promote to `src/hooks/` only
 * when a second feature actually does.
 */

export interface FormsListController {
  forms: AdminFormDefinition[] | null;
  error: string | null;
  /** In-flight row action (status toggle) — one at a time, same `rowSavingId` convention
   *  `Posts.tsx`/`Pages.tsx` use for their own row actions. */
  rowSavingId: string | null;
  toggleStatus: (form: AdminFormDefinition) => Promise<void>;
}

export function useFormsList(): FormsListController {
  const [forms, setForms] = useState<AdminFormDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function load() {
    api
      .listForms()
      .then((r) => setForms(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load forms"));
  }

  useEffect(load, []);

  async function toggleStatus(form: AdminFormDefinition) {
    setRowSavingId(form.id);
    setError(null);
    try {
      const { data: updated } = await api.updateForm(
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
