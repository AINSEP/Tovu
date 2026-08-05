import { useEffect, useState } from "react";

import { ApiError, api, describeApiError, type AdminWidget, type AdminWidgetType, type AdminWidgetWhereUsed } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { defaultWidgetConfig } from "../../../components/WidgetConfigFields";
import { resolveEditorWidgetType, widgetConfigFieldErrors } from "../rules";

/**
 * @file Everything the `WidgetInstanceEditor` screen does, so `WidgetInstanceEditor.tsx` is only
 * markup.
 *
 * Extracted verbatim — same state, same effect deps, same error handling. The doc comments below
 * moved WITH the functions they describe. Naming follows `hooks/use-settings-slice.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/widgets` needs it.
 */

export const STALE_VERSION_MESSAGE = "This widget changed since you loaded it, refresh and try again.";

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
}

export function useWidgetInstanceEditor(props: WidgetInstanceEditorHookProps): WidgetInstanceEditorController {
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

  useEffect(() => {
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
    api
      .getWidget(props.widgetId as string)
      .then((r) => {
        setWidget(r.widget);
        setTitle(r.widget.title);
        setConfig(r.widget.config);
        setWhereUsed(r.whereUsed);
      })
      .catch((e) => setError(describeApiError(e, "failed to load widget")))
      .finally(() => setLoading(false));
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
        const { widget: created } = await api.createWidget({ widgetType, title, config });
        navigate(`/widgets/${created.id}`);
        return;
      }
      if (!widget) return;
      const { widget: saved } = await api.updateWidget({ id: widget.id, baseVersion: widget.version, config });
      setWidget(saved);
      setConfig(saved.config);
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_VERSION_CONFLICT") {
        setError(STALE_VERSION_MESSAGE);
      } else if (e instanceof ApiError && e.code === "WIDGETS_CONFIG_VALIDATION_ERROR") {
        setFieldErrors(widgetConfigFieldErrors(e));
        setError(describeApiError(e, "save failed"));
      } else {
        setError(describeApiError(e, "save failed"));
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
  };
}
