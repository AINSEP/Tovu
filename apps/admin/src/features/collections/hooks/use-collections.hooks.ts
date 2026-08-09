import { useEffect, useState } from "react";

import { api, describeApiError, type AdminContentType } from "../../../lib/api";
import type { LifecycleConfirmOp } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { lifecycleFailureMessage, t } from "../collections-i18n";

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

export function useCollections(): CollectionsController {
  const locale = useAdminLocale();
  const [types, setTypes] = useState<AdminContentType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingLifecycle, setPendingLifecycle] = useState<{ op: LifecycleConfirmOp; contentType: AdminContentType } | null>(null);
  const [editingFieldsFor, setEditingFieldsFor] = useState<AdminContentType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    api
      .listContentTypes()
      .then((r) => setTypes(r.items))
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load content types"))));
  }

  useEffect(load, []);

  async function runLifecycle(contentType: AdminContentType, op: "deprecate" | "reactivate" | "tombstone") {
    setActionError(null);
    try {
      await api.contentTypeLifecycle({ key: contentType.key, op, expectedVersion: contentType.version });
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
