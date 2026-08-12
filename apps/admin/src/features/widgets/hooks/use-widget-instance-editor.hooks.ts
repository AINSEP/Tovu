import { useEffect, useState } from "react";

import { ApiError, describeApiError, type AdminWidget, type AdminWidgetType, type AdminWidgetWhereUsed } from "../../../lib/api";
import { navigate as realNavigate } from "../../../lib/router";
import { defaultWidgetConfig } from "../../../components/WidgetConfigFields/WidgetConfigFields";
import { resolveEditorWidgetType, widgetConfigFieldErrors } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { WIDGETS_DICT, t as translate } from "../widgets-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import { defaultWidgetsPort } from "./widgets-dependencies.hooks";
import type { WidgetsPort } from "./widgets-port.hooks";

/**
 * @file Everything the `WidgetInstanceEditor` screen does, so `WidgetInstanceEditor.tsx` is only
 * markup.
 *
 * Extracted verbatim — same state, same effect deps, same error handling. The doc comments below
 * moved WITH the functions they describe. Naming follows `hooks/use-settings-slice.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/widgets` needs it.
 *
 * `deps.port`/`deps.locale`/`deps.navigate` are injected (see `widgets-port.hooks.ts`) rather than
 * reaching for `lib/api`'s `api`, `useAdminLocale()`, and `lib/router`'s `navigate` directly,
 * sharing the `WidgetsPort` `use-widgets-library.hooks.ts` also injects — both read/write the same
 * widget-instance resource. `widgets-i18n.ts`'s own `t(locale, key)` — aliased `translate` here to
 * avoid colliding with this file's own bound `(key) => string` closure — stays a direct import for
 * this hook's OWN error strings: a pure `DICT[locale]?.[key] ?? key` lookup with no host boundary,
 * same "pure, no-I/O" category the convention doc names for `describeApiError`.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — see `use-widgets-library.hooks.ts`'s identical note):
 * injected so `WidgetInstanceEditor.tsx` sources its UI copy from this hook instead of its own
 * `useAdminLocale()`/`WIDGETS_DICT` import. `locale` is ALSO exposed, not just `t`: this screen
 * passes the raw string on to `widgetTypeLabel` (`../rules.ts`), same "row-menu/label builder is a
 * different, out-of-scope thing" precedent `use-pages.hooks.ts` cites for `pageRowMenuItems`.
 */

export interface WidgetInstanceEditorDependencies {
  port: WidgetsPort;
  locale: string;
  navigate: (path: string) => void;
  t: Translate;
}

/** Locale-aware replacement for the old `STALE_VERSION_MESSAGE` constant — this string is only
 *  ever read inside this hook itself (after a `WIDGETS_VERSION_CONFLICT` 409), so it can be a
 *  function of `locale` instead of a locale-blind module constant. */
export function staleVersionMessage(locale: string): string {
  return translate(locale, "This widget changed since you loaded it, refresh and try again.");
}

/** The subset of `WidgetInstanceEditor`'s props this hook needs — the DI seam prop itself stays
 *  the component's own concern. */
export interface WidgetInstanceEditorHookProps {
  widgetId: string | null;
  widgetType: string | null;
}

export interface WidgetInstanceEditorController {
  isNew: boolean;
  widget: AdminWidget | null;
  whereUsed: AdminWidgetWhereUsed;
  title: string;
  setTitle: (title: string) => void;
  config: Record<string, unknown>;
  setConfig: (config: Record<string, unknown>) => void;
  message: string | null;
  error: string | null;
  fieldErrors: Array<{ field: string; reason: string }>;
  loading: boolean;
  saving: boolean;
  /** The type this editor is configuring — the `?type=` query param while creating, the loaded
   *  widget's own type once one exists. `null` when neither is available. */
  widgetType: AdminWidgetType | null;
  save: () => Promise<void>;
  /** Bound translator — `WidgetInstanceEditor.tsx`'s only source of UI copy; see this file's own
   *  header. */
  t: Translate;
  /** The raw resolved locale — exposed only because `widgetTypeLabel` (`../rules.ts`) genuinely
   *  needs it, not `t`. */
  locale: string;
}

export function useWidgetInstanceEditor(
  props: WidgetInstanceEditorHookProps,
  { port, locale, navigate, t }: WidgetInstanceEditorDependencies
): WidgetInstanceEditorController {
  const isNew = props.widgetId === null;
  const [widget, setWidget] = useState<AdminWidget | null>(null);
  const [whereUsed, setWhereUsed] = useState<AdminWidgetWhereUsed>({ count: 0, references: [] });
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; reason: string }>>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const widgetType = resolveEditorWidgetType(isNew, props.widgetType, widget);

  // Stale-response guard (2026-08-12 audit finding): this is a route-param loader — the panel
  // router reuses this same component/hook for `/new` and every `/:id`, so navigating from one
  // widget to another (or from an existing widget to `/new`) can let an OLDER `getWidget` response
  // land after a NEWER one, overwriting the currently-viewed widget with a previous one's data (or,
  // for `/new`, populating a blank editor with a stale record). `cancelled` is flipped by this same
  // effect's own cleanup the instant `props.widgetId`/`props.widgetType`/`isNew` changes again,
  // before the new run starts — guarded on every completion path (`then`/`catch`/`finally`), not
  // just the success path, since an unguarded `finally` clearing `loading` is the one most likely to
  // leave stale data on screen with no spinner to flag it.
  useEffect(() => {
    let cancelled = false;
    if (isNew) {
      setWidget(null);
      setTitle("");
      setConfig(defaultWidgetConfig((props.widgetType as AdminWidgetType) ?? "text"));
      setWhereUsed({ count: 0, references: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    port
      .getWidget(props.widgetId as string)
      .then((r) => {
        if (cancelled) return;
        setWidget(r.widget);
        setTitle(r.widget.title);
        setConfig(r.widget.config);
        setWhereUsed(r.whereUsed);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describeApiError(e, translate(locale, "failed to load widget")));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.widgetId, props.widgetType, isNew]);

  async function save() {
    if (!widgetType) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    setFieldErrors([]);
    try {
      if (isNew) {
        const { widget: created } = await port.createWidget({ widgetType, title, config });
        navigate(`/widgets/${created.id}`);
        return;
      }
      if (!widget) return;
      const { widget: saved } = await port.updateWidget({ id: widget.id, baseVersion: widget.version, config });
      setWidget(saved);
      setConfig(saved.config);
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_VERSION_CONFLICT") {
        setError(staleVersionMessage(locale));
      } else if (e instanceof ApiError && e.code === "WIDGETS_CONFIG_VALIDATION_ERROR") {
        setFieldErrors(widgetConfigFieldErrors(e));
        setError(describeApiError(e, translate(locale, "save failed")));
      } else {
        setError(describeApiError(e, translate(locale, "save failed")));
      }
    } finally {
      setSaving(false);
    }
  }

  return {
    isNew,
    widget,
    whereUsed,
    title,
    setTitle,
    config,
    setConfig,
    message,
    error,
    fieldErrors,
    loading,
    saving,
    widgetType,
    save,
    t,
    locale,
  };
}

/**
 * Binds the real `/api/.../widgets` client, the real `useAdminLocale()`, the real `lib/router`
 * `navigate`, and a `WIDGETS_DICT`-bound translator — see `widgets-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `WidgetInstanceEditor.tsx` composes this and a test composes {@link useWidgetInstanceEditor}
 * with `createFakeWidgetsPort`.
 */
export function useWiredWidgetInstanceEditor(props: WidgetInstanceEditorHookProps): WidgetInstanceEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => WIDGETS_DICT[locale]?.[key] ?? key;
  return useWidgetInstanceEditor(props, { port: defaultWidgetsPort, locale, navigate: realNavigate, t });
}
