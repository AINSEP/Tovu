import { useEffect, useState } from "react";

import { describeApiError, type AdminContentType } from "../../../lib/api";
import type { LifecycleConfirmOp } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { lifecycleFailureMessage, t } from "../collections-i18n";
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
}

export interface CollectionsDependencies {
  port: CollectionsPort;
  locale: string;
}

export function useCollections(deps: CollectionsDependencies): CollectionsController {
  const { port, locale } = deps;
  const [types, setTypes] = useState<AdminContentType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingLifecycle, setPendingLifecycle] = useState<{ op: LifecycleConfirmOp; contentType: AdminContentType } | null>(null);
  const [editingFieldsFor, setEditingFieldsFor] = useState<AdminContentType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    port
      .listContentTypes()
      .then((r) => setTypes(r.items))
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load content types"))));
  }

  // `port` is added to the effect's dependency array — see `use-page-editor.hooks.ts`'s identical
  // note: it's a function-scoped value ESLint's exhaustive-deps rule can see, and it is
  // referentially stable in production (`useWiredCollections` always passes the same module-level
  // singleton), so this changes nothing about when the effect re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [port]);

  async function runLifecycle(contentType: AdminContentType, op: "deprecate" | "reactivate" | "tombstone") {
    setActionError(null);
    try {
      await port.contentTypeLifecycle({ key: contentType.key, op, expectedVersion: contentType.version });
      load();
    } catch (e) {
      setActionError(describeApiError(e, lifecycleFailureMessage(locale, op, contentType.label)));
    }
  }

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
    load,
    runLifecycle,
  };
}

/**
 * Binds the real `/api/.../content-types` client and the resolved `useAdminLocale()` value — see
 * `collections-dependencies.hooks.ts`. The zero-argument-deps half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Collections.tsx` composes this and a test composes {@link useCollections}
 * with `createFakeCollectionsPort`.
 */
export function useWiredCollections(): CollectionsController {
  const locale = useAdminLocale();
  return useCollections({ port: defaultCollectionsPort, locale });
}
