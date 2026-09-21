import { useCallback, useState } from "react";
import type { AdminFormDefinition } from "@/lib/api";
import { useFetchMutation, useFetchQuery, useInvalidate } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { FORMS_LIST_RESOURCE, KEYS, formsListError } from "../rules";
import { t as translate } from "../forms-i18n";
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
 *
 * `lib/fetch-query` migration (2026-08-12): `toggleStatus` is one `useFetchMutation` that
 * `invalidates: [KEYS.list]` — same idiom `use-taxonomy.hooks.ts`'s deletes use, so this list stays
 * in sync with a status change made from `FormEditor.tsx` too (a `KEYS.list`-invalidating write
 * elsewhere in the app, not just this screen's own toggle). This DOES cost one extra background GET
 * per toggle that the pre-migration `setForms((prev) => prev.map(...))` optimistic patch avoided —
 * a deliberate trade for cross-screen consistency (`lib/fetch-query/index.ts`'s own header names
 * this exact "two screens showing the same resource silently drift apart" bug as the reason the
 * library exists at all); `FormsList.unit.test.tsx`'s old "only one GET" assertion is updated
 * accordingly, not preserved. `rowSavingId` stays local `useState` rather than reading off the
 * mutation directly — one shared `useFetchMutation` object has no per-call "which row" of its own,
 * the exact case this migration's own dispatch brief calls out as the intended `useState` out.
 *
 * `useContentRefreshSubscription` (staleness-bug generalization pass, see that hook's own header):
 * `forms_create_definition`/`forms_update_definition`/`forms_set_definition_status`
 * (`apps/website/src/features/forms/agent-tools.ts`) are agent-callable, so this list re-invalidates
 * `KEYS.list` on an out-of-band content-refresh notification the same way `use-taxonomy.hooks.ts`
 * does for its own resource.
 */

export interface FormsListController {
  forms: AdminFormDefinition[] | null;
  error: string | null;
  /** In-flight row action (status toggle) — one at a time, same `rowSavingId` convention
   *  `Posts.tsx`/`Pages.tsx` use for their own row actions. */
  rowSavingId: string | null;
  /** No-op while a previous call is still in flight (`rowSavingId` set) — see this function's own
   *  comment; the caller never has to guard against a double toggle itself. */
  toggleStatus: (form: AdminFormDefinition) => Promise<void>;
  /** Bound translator — see this file's own header for why it arrives via the hook rather than
   *  `FormsList.tsx` calling `useAdminLocale()`/`FORMS_DICT` directly. */
  t: (key: string) => string;
}

export function useFormsList(deps: { port: FormsPort; t: (key: string) => string }): FormsListController {
  const { port, t } = deps;
  const list = useFetchQuery({ key: KEYS.list, fetch: () => port.listForms() });
  const invalidate = useInvalidate();
  // Stable identity — see `use-media.hooks.ts`'s identical `invalidateList` for why an inline arrow
  // here would resubscribe `useContentRefreshSubscription` on every render for no benefit.
  const invalidateList = useCallback(() => invalidate(KEYS.list), [invalidate]);
  useContentRefreshSubscription(FORMS_LIST_RESOURCE, invalidateList);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  const toggleMutation = useFetchMutation({
    run: (form: AdminFormDefinition) =>
      port.updateForm({ id: form.id }, { status: form.status === "active" ? "disabled" : "active" }),
    invalidates: [KEYS.list],
  });

  // In-flight guard lives here, not in `FormsList.tsx`'s `onToggleStatus` closure — `RowMenu` has no
  // per-item `disabled`, so this is what stops a second toggle firing while the first is still
  // saving. Same shape `use-redirects.hooks.ts`'s own `onToggleStatus` uses for its identical
  // `if (saving) return;` guard (that hook's own comment on why: `disabled={saving}` on the old
  // inline buttons moved into each handler once `RowMenu` replaced them).
  async function toggleStatus(form: AdminFormDefinition) {
    if (rowSavingId) return;
    setRowSavingId(form.id);
    try {
      await toggleMutation.mutate(form);
    } catch {
      // already surfaced through toggleMutation.error -> error below
    } finally {
      setRowSavingId(null);
    }
  }

  const forms = list.data?.data ?? null;
  const error = formsListError({ toggleError: toggleMutation.error, listError: list.error, hasForms: forms !== null });

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
  const t = (key: string): string => translate(locale, key);
  return useFormsList({ port: defaultFormsPort, t });
}
