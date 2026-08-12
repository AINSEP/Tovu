import { useState } from "react";

import { describeApiError, type AdminContentType } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { KEYS, type LifecycleConfirmOp } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { COLLECTIONS_DICT, lifecycleFailureMessage, t as translate } from "../collections-i18n";
import { defaultCollectionsPort } from "./collections-dependencies.hooks";
import type { CollectionsPort } from "./collections-port.hooks";

/**
 * @file Everything the Collections LIST screen (content-type registry + the three dialogs' open/
 * close state) does, so `Collections`'s exported component in `Collections.tsx` is only markup.
 *
 * Extracted verbatim — same state, same load, same lifecycle-action error handling. Each dialog's
 * OWN state (`NewContentTypeDialog`, `EditFieldsDialog`, `LifecycleConfirmDialog`) lives in its own
 * hook file — this hook only owns which dialog is open and the shared `runLifecycle` action all
 * three lifecycle row-menu items and the confirm dialog ultimately call.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/collections` needs it.
 *
 * `port`/`locale` are injected — see `collections-port.hooks.ts` — rather than reaching `lib/api`/
 * `useAdminLocale()` directly, so a test can describe load/lifecycle outcomes against
 * `createFakeCollectionsPort` instead of stubbing global `fetch`. `useWiredCollections` below is
 * the pair `Collections.tsx` actually mounts.
 *
 * `t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that hook,
 * not its own `useAdminLocale()`/dictionary import, same shape `use-pages.hooks.ts` established):
 * injected alongside `port`/`locale` because `Collections.tsx` and its three dialogs need translated
 * UI copy. `collections-i18n.ts`'s own `t(locale, key)` — aliased `translate` here to avoid
 * colliding with this file's own bound `(key) => string` closure — stays a direct, uninjected
 * import: it's a pure `COLLECTIONS_DICT[locale]?.[key] ?? key` lookup that already takes `locale`
 * as an explicit argument, not a host reach (see wired-hooks-convention.md's "pure, no-I/O rules"
 * carve-out). `useAdminLocale()` and `COLLECTIONS_DICT` are read only inside
 * {@link useWiredCollections}.
 *
 * `lib/fetch-query` migration (2026-08-12): the content-type list read is now `useFetchQuery({ key:
 * KEYS.list, ... })`; `runLifecycle` is a `useFetchMutation` that `invalidates: [KEYS.list]` — which
 * cascades to every entries list and open entry editor too, per `rules.ts`'s `KEYS` doc, since a
 * lifecycle change (or a field-schema edit via `EditFieldsDialog`) can change what those screens show.
 */

export interface CollectionsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  types: AdminContentType[] | null;
  error: string | null;
  showNewDialog: boolean;
  setShowNewDialog: (show: boolean) => void;
  /** The lifecycle op a row-menu selection is asking to confirm, and which content type it targets
   *  — `null` when `LifecycleConfirmDialog` is closed. Reactivate skips this entirely (see
   *  `runLifecycle`'s call sites): only Deprecate/Tombstone are confirm-gated. */
  pendingLifecycle: { op: LifecycleConfirmOp; contentType: AdminContentType } | null;
  setPendingLifecycle: (value: { op: LifecycleConfirmOp; contentType: AdminContentType } | null) => void;
  /** The content type `EditFieldsDialog` is open for — `null` when it is closed. */
  editingFieldsFor: AdminContentType | null;
  setEditingFieldsFor: (value: AdminContentType | null) => void;
  actionError: string | null;
  load: () => void;
  runLifecycle: (contentType: AdminContentType, op: "deprecate" | "reactivate" | "tombstone") => Promise<void>;
  /** Bound translator — `Collections.tsx`'s and its three dialogs' only source of UI copy; see this
   *  file's own header for why it arrives via the hook rather than direct `useAdminLocale()`. */
  t: (key: string) => string;
  /** The raw resolved locale — exposed only because `contentTypeMenuItems` (`../rules.ts`)
   *  genuinely needs it, not `t`, same "row-menu builder is a different, out-of-scope thing"
   *  precedent `use-pages.hooks.ts` cites for `pageRowMenuItems`. */
  locale: string;
}

export interface CollectionsDependencies {
  port: CollectionsPort;
  locale: string;
  t: (key: string) => string;
}

export function useCollections(deps: CollectionsDependencies): CollectionsController {
  const { port, locale, t } = deps;
  const list = useFetchQuery({ key: KEYS.list, fetch: () => port.listContentTypes() });
  const types = list.data?.items ?? null;

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingLifecycle, setPendingLifecycle] = useState<{ op: LifecycleConfirmOp; contentType: AdminContentType } | null>(null);
  const [editingFieldsFor, setEditingFieldsFor] = useState<AdminContentType | null>(null);
  // The op/label the CURRENTLY (or most recently) in-flight `runLifecycle` call was for — needed
  // because `lifecycleFailureMessage` names both, but `pendingLifecycle` is the CONFIRM DIALOG's own
  // state and is `null` for Reactivate (never confirm-gated — see `runLifecycle`'s call sites), so it
  // cannot be reused here without misattributing a failed Reactivate's message to "deprecate".
  const [lastAttempt, setLastAttempt] = useState<{
    op: "deprecate" | "reactivate" | "tombstone";
    contentType: AdminContentType;
  } | null>(null);

  const lifecycleMutation = useFetchMutation({
    run: (input: { key: string; op: "deprecate" | "reactivate" | "tombstone"; expectedVersion: number }) =>
      port.contentTypeLifecycle(input),
    invalidates: [KEYS.list],
  });

  async function runLifecycle(contentType: AdminContentType, op: "deprecate" | "reactivate" | "tombstone") {
    setLastAttempt({ op, contentType });
    try {
      await lifecycleMutation.mutate({ key: contentType.key, op, expectedVersion: contentType.version });
    } catch {
      // already surfaced through lifecycleMutation.error -> actionError below
    }
  }

  const error = list.error ? describeApiError(list.error, translate(locale, "failed to load content types")) : null;
  const actionError =
    lifecycleMutation.error && lastAttempt
      ? describeApiError(lifecycleMutation.error, lifecycleFailureMessage(locale, lastAttempt.op, lastAttempt.contentType.label))
      : null;

  return {
    types,
    error,
    showNewDialog,
    setShowNewDialog,
    pendingLifecycle,
    setPendingLifecycle,
    editingFieldsFor,
    setEditingFieldsFor,
    actionError,
    load: list.refetch,
    runLifecycle,
    t,
    locale,
  };
}

/**
 * Binds the real `/api/.../content-types` client, the resolved `useAdminLocale()` value, and a
 * `COLLECTIONS_DICT`-bound translator — see
 * `collections-dependencies.hooks.ts`. The zero-argument-deps half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Collections.tsx` composes this and a test composes {@link useCollections}
 * with `createFakeCollectionsPort`.
 */
export function useWiredCollections(): CollectionsController {
  const locale = useAdminLocale();
  const t = (key: string): string => COLLECTIONS_DICT[locale]?.[key] ?? key;
  return useCollections({ port: defaultCollectionsPort, locale, t });
}
