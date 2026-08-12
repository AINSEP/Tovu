import { useEffect, useState } from "react";
import type { AdminFormDefinition } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { FORMS_DICT } from "../forms-i18n";
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
 *
 * `t` (standing i18n rule — a component with a hook gets a BOUND `t` from that hook, not its own
 * `useAdminLocale()`/dictionary import, same shape `use-post-editor.hooks.ts` established for this
 * conversion): injected alongside `port` rather than `FormsList.tsx` importing `useAdminLocale`
 * and `FORMS_DICT` itself. Pre-bound to `(key: string) => string` so a test can inject
 * `t: (k) => k` and every assertion stays stable against copy changes. `useAdminLocale()` and
 * `FORMS_DICT` are called/read only inside {@link useWiredFormsList}.
 */

export interface FormsListController {
  forms: AdminFormDefinition[] | null;
  error: string | null;
  /** In-flight row action (status toggle) — one at a time, same `rowSavingId` convention
   *  `Posts.tsx`/`Pages.tsx` use for their own row actions. */
  rowSavingId: string | null;
  toggleStatus: (form: AdminFormDefinition) => Promise<void>;
  /** Bound translator — see this file's own header for why it arrives via the hook rather than
   *  `FormsList.tsx` calling `useAdminLocale()`/`FORMS_DICT` directly. */
  t: (key: string) => string;
}

export function useFormsList(deps: { port: FormsPort; t: (key: string) => string }): FormsListController {
  const { port, t } = deps;
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

  return { forms, error, rowSavingId, toggleStatus, t };
}

/**
 * Binds the real `/api/.../forms` client and a `FORMS_DICT`-bound translator — see
 * `forms-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `FormsList.tsx`
 * composes this and a test composes {@link useFormsList} with `createFakeFormsPort` and a fake
 * `t`.
 */
export function useWiredFormsList(): FormsListController {
  const locale = useAdminLocale();
  const t = (key: string): string => FORMS_DICT[locale]?.[key] ?? key;
  return useFormsList({ port: defaultFormsPort, t });
}
