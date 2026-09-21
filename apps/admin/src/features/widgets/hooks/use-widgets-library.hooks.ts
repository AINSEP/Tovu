import { useCallback, useEffect, useState } from "react";

import { ApiError, describeApiError, type AdminWidget, type AdminWidgetType } from "@/lib/api";
import { WIDGETS_LIBRARY_RESOURCE, describeReferencingLocations } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { WIDGETS_DICT, t as translate } from "../widgets-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultWidgetsPort } from "./widgets-dependencies.hooks";
import type { WidgetsPort } from "./widgets-port.hooks";

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
 *
 * `deps.port`/`deps.locale` are injected (see `widgets-port.hooks.ts`) rather than reaching for
 * `lib/api`'s `api` and `useAdminLocale()` directly, sharing the `WidgetsPort`
 * `use-widget-instance-editor.hooks.ts` also injects — both hooks read/write the same widget-
 * instance resource. `widgets-i18n.ts`'s own `t(locale, key)` — aliased `translate` here to avoid
 * colliding with this file's own bound `(key) => string` closure — stays a direct import for this
 * hook's OWN error strings: a pure `DICT[locale]?.[key] ?? key` lookup with no host boundary, same
 * "pure, no-I/O" category the convention doc names for `describeApiError`.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import, same shape `use-pages.hooks.ts`
 * established): injected so `WidgetsLibrary.tsx` sources its UI copy from this hook instead of its
 * own `useAdminLocale()`/`WIDGETS_DICT` import. `locale` is ALSO exposed, not just `t`: this
 * screen passes the raw string on to `widgetTypeLabel` (`../rules.ts`), same "row-menu/label
 * builder is a different, out-of-scope thing" precedent `use-pages.hooks.ts` cites for
 * `pageRowMenuItems`.
 *
 * `useContentRefreshSubscription` (staleness-bug generalization pass — see that hook's own header):
 * `load` is pulled into a `useCallback` so it can also be handed to that hook, which re-runs it
 * whenever `widgets_create_instance`/`widgets_update_instance`/`widgets_trash_instance`
 * (`apps/website/src/features/widgets/agent-tools.ts`) writes a widget instance from an assistant
 * run this screen otherwise has no way to learn about.
 */

export interface WidgetsLibraryDependencies {
  port: WidgetsPort;
  locale: string;
  t: Translate;
}

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
  /** The widget a "Delete permanently" click is asking to confirm — `null` when that first-stage
   *  dialog is closed. Set by `trashOrPurge` on a trashed widget instead of purging immediately, so
   *  no network call happens before the operator confirms (standing rule: permanent deletion always
   *  goes through a confirm modal). */
  pendingPurge: AdminWidget | null;
  /** True only while the CONFIRMED purge for {@link pendingPurge} is in flight — same
   *  `pendingX !== null && xId === pendingX.id` shape `use-media.hooks.ts` uses. */
  purging: boolean;
  confirmPurge: () => Promise<void>;
  cancelPurge: () => void;
  trashOrPurge: (widget: AdminWidget) => Promise<void>;
  /** Bound translator — `WidgetsLibrary.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
  /** The raw resolved locale — exposed only because `widgetTypeLabel` (`../rules.ts`) genuinely
   *  needs it, not `t`. */
  locale: string;
}

export function useWidgetsLibrary({ port, locale, t }: WidgetsLibraryDependencies): WidgetsLibraryController {
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
  // First-stage "Delete permanently" confirm (#2 fix, 2026-09-20) — `trashOrPurge` on a trashed
  // widget used to call `purge()` immediately on click, with no confirmation at all; the ONLY
  // dialog that existed was `pendingForcePurge`'s escalation, which opens solely from a
  // `WIDGETS_REFERENCED` 409 (i.e. only for a widget still in use). An unreferenced widget went
  // straight from click to an irreversible purge. `pendingPurge`/`purgingId` mirror
  // `use-media.hooks.ts`'s `pendingPurge`/`rowSavingId` shape exactly.
  const [pendingPurge, setPendingPurge] = useState<AdminWidget | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  // Monotonic per-call id (extracted into `useSettlementGeneration` 2026-09-06, same shape as
  // `use-theme-explore.hooks.ts`'s own `renameSettlement`): nothing disables a row's delete button
  // during a widget's FIRST purge attempt (`force: false`, before any dialog is showing), so the
  // operator can click "Delete permanently" on two DIFFERENT widgets back to back, racing two
  // independent `WIDGETS_REFERENCED` 409s. Without this, whichever 409 lands LAST wins
  // `pendingForcePurge` regardless of click order — and confirming that dialog calls
  // `port.purgeWidget` with THAT widget's id, so the bug is not just cosmetic: it force-purges the
  // WRONG widget.
  const purgeSettlement = useSettlementGeneration();

  const load = useCallback(() => {
    port
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
      .catch((e) => setError(describeApiError(e, translate(locale, "failed to load widgets"))));
    // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
    // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
    // nothing about when this callback's identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  useEffect(load, [load]);
  useContentRefreshSubscription(WIDGETS_LIBRARY_RESOURCE, load);

  /** REQ-42/`ui.spec.md` §4.2: the first purge attempt is always `force: false` — only on a
   * `WidgetReferencedError` 409 (naming every referencing location) does a `force: true` retry
   * become an option, and only after an explicit confirmation. Never `force` on the first try.
   *
   * The escalation confirmation now gates via a `ConfirmDialog` modal (`setPendingForcePurge`)
   * rather than a `window.confirm` built from the same dynamic "still used in: ..." message —
   * computed here, at the point the 409 is caught, same as before; only where it's rendered
   * (a real dialog body instead of a blocking prompt string) changed. */
  async function purge(widget: AdminWidget) {
    const generation = purgeSettlement.next();
    setError(null);
    try {
      await port.purgeWidget({ id: widget.id }, { force: false });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_REFERENCED") {
        // Superseded by a newer purge attempt (on ANY widget) started after this one — that later
        // attempt owns `pendingForcePurge` now, and opening this stale 409's dialog would let
        // whichever attempt happens to 409 LAST win regardless of which widget was actually
        // clicked last. See `purgeSettlement`'s doc comment above.
        if (!purgeSettlement.isCurrent(generation)) return;
        const locations = (e.body?.details as { referencingLocations?: Array<{ kind: string; entryId: string }> } | undefined)?.referencingLocations ?? [];
        const summary = describeReferencingLocations(locations);
        // Close the first-stage confirm (if it's still naming THIS widget) in the same render that
        // opens "Still in use", so the two dialogs never stack.
        setPendingPurge((c) => (c?.id === widget.id ? null : c));
        setPendingForcePurge({ widget, summary });
        return;
      }
      setError(describeApiError(e, translate(locale, "delete failed")));
    }
  }

  async function confirmForcePurge() {
    if (!pendingForcePurge) return;
    const { widget } = pendingForcePurge;
    setForcePurging(true);
    try {
      await port.purgeWidget({ id: widget.id }, { force: true });
      load();
    } catch (e2) {
      setError(describeApiError(e2, translate(locale, "force-purge failed")));
    } finally {
      setForcePurging(false);
      // Only close the dialog for THIS widget — a newer purge attempt (started while this
      // force-purge was in flight) may have already opened `pendingForcePurge` for a DIFFERENT
      // widget, and an unconditional reset would silently dismiss that one too. Same shape as
      // `use-roles.hooks.ts`'s `runRowDelete`'s `clearPending` fix.
      setPendingForcePurge((current) => (current?.widget.id === widget.id ? null : current));
    }
  }

  /** An active widget trashes immediately (reversible, ADR-047 §7 — unconditional, never gated). A
   *  trashed widget's "Delete permanently" no longer purges on click: it opens the confirm dialog
   *  and returns, so no network call happens until {@link confirmPurge}. */
  async function trashOrPurge(widget: AdminWidget) {
    setError(null);
    try {
      if (widget.status === "active") {
        await port.trashWidget(widget.id);
        load();
        return;
      }
      setPendingPurge(widget);
      return;
    } catch (e) {
      setError(describeApiError(e, translate(locale, "delete failed")));
    }
  }

  async function confirmPurge() {
    if (!pendingPurge) return;
    const widget = pendingPurge;
    setPurgingId(widget.id);
    try {
      await purge(widget);
    } finally {
      setPurgingId((current) => (current === widget.id ? null : current));
      setPendingPurge((current) => (current?.id === widget.id ? null : current));
    }
  }

  function cancelPurge() {
    setPendingPurge(null);
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
    pendingPurge,
    purging: pendingPurge !== null && purgingId === pendingPurge.id,
    confirmPurge,
    cancelPurge,
    trashOrPurge,
    t,
    locale,
  };
}

/**
 * Binds the real `/api/.../widgets` client, the real `useAdminLocale()`, and a `WIDGETS_DICT`-bound
 * translator — see `widgets-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `WidgetsLibrary.tsx` composes this and a test composes {@link useWidgetsLibrary} with
 * `createFakeWidgetsPort`.
 */
export function useWiredWidgetsLibrary(): WidgetsLibraryController {
  const locale = useAdminLocale();
  const t = (key: string): string => WIDGETS_DICT[locale]?.[key] ?? key;
  return useWidgetsLibrary({ port: defaultWidgetsPort, locale, t });
}
