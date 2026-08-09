import { useEffect, useState } from "react";

import { ApiError, api, describeApiError, type AdminWidget, type AdminWidgetType } from "../../../lib/api";
import { describeReferencingLocations } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../widgets-i18n";

/**
 * @file Everything the `WidgetsLibrary` screen does, so `WidgetsLibrary.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. The doc comments
 * below moved WITH the functions they describe; several are decision records (why the escalation
 * gates on `ConfirmDialog` instead of `window.confirm`, why the skipped-row count is a quiet note
 * rather than an error) and a comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/widgets` needs it.
 */

export interface WidgetsLibraryController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  widgets: AdminWidget[] | null;
  error: string | null;
  /** Count of widget-instance rows the server silently skipped (unparseable `fields_json`) — see
   *  the state's own declaration below for the full Dossier C5 rationale. `0` and `undefined` both
   *  mean "nothing to say". */
  skippedCount: number;
  createType: AdminWidgetType;
  setCreateType: (type: AdminWidgetType) => void;
  /** The widget + its referencing-locations summary a `WIDGETS_REFERENCED` 409 is asking to
   *  force-purge past — `null` when the dialog is closed. */
  pendingForcePurge: { widget: AdminWidget; summary: string } | null;
  cancelForcePurge: () => void;
  forcePurging: boolean;
  confirmForcePurge: () => Promise<void>;
  trashOrPurge: (widget: AdminWidget) => Promise<void>;
}

export function useWidgetsLibrary(): WidgetsLibraryController {
  const locale = useAdminLocale();
  const [widgets, setWidgets] = useState<AdminWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Dossier C5 follow-up (2026-08-03): `listWidgetInstances` silently skips a widget-instance row
  // whose `fields_json` doesn't parse into the expected shape, rather than 500ing the whole
  // screen — correct, but it used to be invisible. The server now counts the skips; this just
  // surfaces that count as a quiet note, never as an error (nothing failed — some rows just
  // aren't shown). `undefined`/`0` both mean "nothing to say", handled identically below.
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [createType, setCreateType] = useState<AdminWidgetType>("text");
  // The widget + its referencing-locations summary a `WIDGETS_REFERENCED` 409 (below) is asking to
  // force-purge past — `null` when the dialog is closed. `ConfirmDialog` stays mounted
  // unconditionally below (see its own doc comment on why); this is what drives its `open` prop.
  const [pendingForcePurge, setPendingForcePurge] = useState<{ widget: AdminWidget; summary: string } | null>(null);
  const [forcePurging, setForcePurging] = useState(false);

  function load() {
    api
      .listWidgets({ includeInactive: true })
      .then((r) => {
        // `includeInactive: true` deliberately asks the server for both `trash` and `purged` rows
        // (see `src/server/routes/admin/widgets/list.ts`), because `purgeWidgetInstance` never
        // hard-deletes — ADR-047 Amendment 4: "never deleted, only active⇄disabled" — it only
        // flips status to the terminal `purged` state. `trash` stays reversible and visible here
        // (its row still offers "Delete permanently"); `purged` has nothing left to do or show, so
        // it's filtered out client-side rather than dropped from the wire contract other
        // `includeInactive` callers may still rely on.
        setWidgets(r.widgets.filter((w) => w.status !== "purged"));
        setSkippedCount(r.skippedCount ?? 0);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load widgets"))));
  }

  useEffect(load, []);

  /** REQ-42/`ui.spec.md` §4.2: the first purge attempt is always `force: false` — only on a
   * `WidgetReferencedError` 409 (naming every referencing location) does a `force: true` retry
   * become an option, and only after an explicit confirmation. Never `force` on the first try.
   *
   * The escalation confirmation now gates via a `ConfirmDialog` modal (`setPendingForcePurge`)
   * rather than a `window.confirm` built from the same dynamic "still used in: ..." message —
   * computed here, at the point the 409 is caught, same as before; only where it's rendered
   * (a real dialog body instead of a blocking prompt string) changed. */
  async function purge(widget: AdminWidget) {
    setError(null);
    try {
      await api.purgeWidget({ id: widget.id }, { force: false });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_REFERENCED") {
        const locations = (e.body?.details as { referencingLocations?: Array<{ kind: string; entryId: string }> } | undefined)?.referencingLocations ?? [];
        const summary = describeReferencingLocations(locations);
        setPendingForcePurge({ widget, summary });
        return;
      }
      setError(describeApiError(e, t(locale, "delete failed")));
    }
  }

  async function confirmForcePurge() {
    if (!pendingForcePurge) return;
    const { widget } = pendingForcePurge;
    setForcePurging(true);
    try {
      await api.purgeWidget({ id: widget.id }, { force: true });
      load();
    } catch (e2) {
      setError(describeApiError(e2, t(locale, "force-purge failed")));
    } finally {
      setForcePurging(false);
      setPendingForcePurge(null);
    }
  }

  async function trashOrPurge(widget: AdminWidget) {
    setError(null);
    try {
      if (widget.status === "active") {
        await api.trashWidget(widget.id);
        load();
        return;
      }
      await purge(widget);
    } catch (e) {
      setError(describeApiError(e, t(locale, "delete failed")));
    }
  }

  function cancelForcePurge() {
    setPendingForcePurge(null);
  }

  return {
    widgets,
    error,
    skippedCount,
    createType,
    setCreateType,
    pendingForcePurge,
    cancelForcePurge,
    forcePurging,
    confirmForcePurge,
    trashOrPurge,
  };
}
