import { useCallback, useEffect, useState } from "react";

import { ApiError, describeApiError, type AdminWidget, type AdminWidgetType } from "@/lib/api";
import { WIDGETS_LIBRARY_RESOURCE } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { t as translate } from "../widgets-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultWidgetsPort } from "./widgets-dependencies.hooks";
import type { WidgetsPort } from "./widgets-port.hooks";

/**
 * @file Everything the `WidgetsLibrary` screen does, so `WidgetsLibrary.tsx` is only markup.
 *
 * Trash rewrite (2026-09-21, `trash-delete-architecture.md`): the widget-specific purge/
 * force-purge escalation (`WIDGETS_REFERENCED` 409, "Delete permanently") is gone — the server's
 * widget purge route was removed, and every admin delete button now goes through the generic
 * `POST .../trash/items` (`port.trashWidget`, which binds to `api.trash({ type: "widget", id })`).
 * `load()` no longer asks for `includeInactive` — the server's default (active-only) already does
 * what this screen wants, since a trashed widget belongs on the Trash screen, not here.
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
  /** The widget a "Trash" click is asking to confirm — `null` when the dialog is closed. Set by
   *  `requestTrash`; no network call happens until {@link confirmTrash}. */
  pendingTrash: AdminWidget | null;
  /** True only while the CONFIRMED trash for {@link pendingTrash} is in flight — same
   *  `pendingX !== null && xId === pendingX.id` shape `use-media.hooks.ts` uses. */
  trashing: boolean;
  requestTrash: (widget: AdminWidget) => void;
  confirmTrash: () => Promise<void>;
  cancelTrash: () => void;
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
  // The widget a "Trash" click is asking to confirm — `null` when the dialog is closed.
  // `ConfirmDialog` stays mounted unconditionally in `WidgetsLibrary.tsx`; this is what drives its
  // `open` prop.
  const [pendingTrash, setPendingTrash] = useState<AdminWidget | null>(null);
  const [trashingId, setTrashingId] = useState<string | null>(null);
  // Latest-wins guard for `load()` (S1, plan-content2.md 2026-09-20): a mount read, the content
  // refresh bus, and a write-triggered reload can all be in flight together with no ordering
  // guarantee between them. Without this, trashing A then B races two `load()` calls — if A's
  // stale read answers after B's, B renders as present again even though the server already
  // trashed it. Its siblings `use-widget-regions.hooks.ts` and `use-widget-region-editor.hooks.ts`
  // guard the same shape.
  const loadSettlement = useSettlementGeneration();

  const load = useCallback(() => {
    const generation = loadSettlement.next();
    port
      .listWidgets()
      .then((r) => {
        if (!loadSettlement.isCurrent(generation)) return;
        // No `includeInactive` — the server's default (active-only) is exactly this screen's view
        // now that a trashed widget is the Trash screen's concern, not this list's. See this
        // file's own header for why the old client-side `purged` filter is gone too.
        setWidgets(r.widgets);
        setSkippedCount(r.skippedCount ?? 0);
      })
      .catch((e) => {
        if (!loadSettlement.isCurrent(generation)) return;
        setError(describeApiError(e, translate(locale, "failed to load widgets")));
      });
    // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
    // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
    // nothing about when this callback's identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  useEffect(load, [load]);
  useContentRefreshSubscription(WIDGETS_LIBRARY_RESOURCE, load);

  /** Opens the "Move to trash?" confirm for `widget` — no network call happens until
   *  {@link confirmTrash}. */
  function requestTrash(widget: AdminWidget) {
    setError(null);
    setPendingTrash(widget);
  }

  function cancelTrash() {
    setPendingTrash(null);
  }

  /** The confirmed trash request. Maps the two error shapes the generic Trash route defines
   *  (`items.ts`): a `409 TRASH_VERSION_CHANGED` (the row changed since this screen last read it —
   *  shown so the operator can reload) and a `404 NOT_FOUND` (it's already gone — no error to show,
   *  just a quiet re-read so the row drops out of the list). Any other failure falls back to the
   *  generic "delete failed" message.
   *
   * @complexity Time/space: O(1) plus `load()`'s own re-read cost. */
  async function confirmTrash() {
    if (!pendingTrash) return;
    const widget = pendingTrash;
    setTrashingId(widget.id);
    setError(null);
    try {
      await port.trashWidget(widget.id);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") {
        load();
      } else if (e instanceof ApiError && e.code === "TRASH_VERSION_CHANGED") {
        setError(translate(locale, "This item changed since you loaded it. Reload and try again."));
      } else {
        setError(describeApiError(e, translate(locale, "delete failed")));
      }
    } finally {
      setTrashingId((current) => (current === widget.id ? null : current));
      setPendingTrash((current) => (current?.id === widget.id ? null : current));
    }
  }

  return {
    widgets,
    error,
    skippedCount,
    createType,
    setCreateType,
    pendingTrash,
    trashing: pendingTrash !== null && trashingId === pendingTrash.id,
    requestTrash,
    confirmTrash,
    cancelTrash,
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
  const t = (key: string): string => translate(locale, key);
  return useWidgetsLibrary({ port: defaultWidgetsPort, locale, t });
}
