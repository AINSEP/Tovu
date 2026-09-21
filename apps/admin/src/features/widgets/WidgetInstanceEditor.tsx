import { WidgetConfigFields } from "../../components/WidgetConfigFields/WidgetConfigFields";
import { t as sharedComponentsT } from "../../components/shared-components-i18n";
import { agentHandle } from "@jini-ai/agentic";
import { isKnownWidgetType, widgetTypeLabel } from "./rules";
import { useWiredWidgetInstanceEditor } from "./hooks/use-widget-instance-editor.hooks";
import type { AdminWidget, AdminWidgetWhereUsed } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";

/**
 * @file `WidgetInstanceEditorScreen` (`ui.spec.md` §2.2/§3.3/§4.3) — create/edit one widget
 * instance, `/admin/widgets/new?type=X` and `/admin/widgets/{id}` — markup only. Mirrors
 * `MenuEditor.tsx`'s editor-shell shape; config editing delegates to the shared
 * `WidgetConfigFields` (§3.4).
 *
 * State, the fetch, and save live in `hooks/use-widget-instance-editor.hooks.ts`; the field-error
 * extraction, the known-type check, and the type label live in `rules.ts`.
 */

/** REQ-34/`ui.spec.md` §3.5 — rendered only when `references.length > 0`, before the config form. */
function WhereUsedBanner(props: { whereUsed: AdminWidgetWhereUsed; t: Translate }) {
  const { t } = props;
  if (props.whereUsed.count === 0) return null;
  return (
    <div className="notice widget-where-used-banner">
      <strong>
        {props.whereUsed.count === 1
          ? t("Used in 1 place:")
          : t("Used in {count} places:").replace("{count}", String(props.whereUsed.count))}
      </strong>
      <ul>
        {props.whereUsed.references.map((ref, i) => (
          <li key={i}>
            {ref.kind === "region" ? t("Region area") : t("Inline embed")} ({ref.sourceEntryId})
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The four early-exit states `WidgetInstanceEditor` can be in before the full editor shell is
 *  reachable. Decided together as one pure function rather than four sequential `if`s in the
 *  component body — a top-level function, not a nested closure, so it both leaves the component's
 *  own branch count (this is what dropped it from 14/11 to under the ceiling) AND is independently
 *  testable without mounting the component or its hook. */
export type WidgetInstanceGuard =
  | { kind: "fetch-error"; message: string }
  | { kind: "loading" }
  | { kind: "no-type" }
  | { kind: "unknown-type"; widgetType: string };

export function widgetInstanceGuard(state: {
  error: string | null;
  isNew: boolean;
  widget: AdminWidget | null;
  loading: boolean;
  widgetType: string | null;
}): WidgetInstanceGuard | null {
  if (state.error && !state.isNew && !state.widget) return { kind: "fetch-error", message: state.error };
  if (state.loading) return { kind: "loading" };
  if (!state.widgetType) return { kind: "no-type" };
  // Missing `?type=` is the "no-type" guard above; a GARBAGE one previously wasn't caught (audit
  // Major finding): `widgetType` is a query param cast to `AdminWidgetType` with no runtime check,
  // so an unrecognized value reached a full live editor shell — title field, working Save button —
  // with zero config fields and zero explanation (`WidgetConfigFields`'s switch has no `default`
  // beyond `return null`). Scoped to `isNew` only: an already-saved widget's type was validated
  // server-side at creation, so this guards the one confirmed-reachable path (a hand-typed or
  // bookmarked `?type=` value) rather than second-guessing already-loaded data.
  if (state.isNew && !isKnownWidgetType(state.widgetType)) return { kind: "unknown-type", widgetType: state.widgetType };
  return null;
}

/** Renders the notice for whichever guard applies — split from `widgetInstanceGuard` itself so the
 *  decision (data in, data out) and the rendering stay separately testable. */
function WidgetInstanceGuardNotice({ guard }: { guard: WidgetInstanceGuard }) {
  switch (guard.kind) {
    case "fetch-error":
      return <div className="notice error">{guard.message}</div>;
    case "loading":
      return <div className="notice">Loading widget…</div>;
    case "no-type":
      return <div className="notice error">No widget type specified.</div>;
    case "unknown-type":
      return <div className="notice error">Unknown widget type "{guard.widgetType}".</div>;
  }
}

export interface WidgetInstanceEditorProps {
  widgetId: string | null;
  widgetType: string | null;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWidgetInstanceEditorHook?: typeof useWiredWidgetInstanceEditor;
}

export function WidgetInstanceEditor(props: WidgetInstanceEditorProps) {
  const { widgetId, widgetType: queryWidgetType, useWidgetInstanceEditorHook = useWiredWidgetInstanceEditor } = props;
  const {
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
  } = useWidgetInstanceEditorHook({ widgetId, widgetType: queryWidgetType });

  const guard = widgetInstanceGuard({ error, isNew, widget, loading, widgetType });
  if (guard) return <WidgetInstanceGuardNotice guard={guard} />;
  // Unreachable in practice — `widgetInstanceGuard`'s "no-type" case already covers a null
  // `widgetType` above — but TS can't see through that opaque function call, so this narrows the
  // type for the JSX below rather than asserting it with `!`.
  if (!widgetType) return null;

  // `WidgetConfigFields`'s own copy lives in `shared-components-i18n.ts`, a DIFFERENT dictionary
  // from this screen's own `t` (bound to `widgets-i18n.ts`'s `WIDGETS_DICT` — see the hook import
  // above) — reusing `t` here would look "Text"/"Menu"/etc. up in the wrong dictionary and silently
  // render the English fallback in every non-English locale. Bound off the same `locale` this
  // screen already resolves, mirroring `WidgetPickerDialog.hooks.tsx`'s `t = (key) =>
  // sharedComponentsT(locale, key)` shape exactly.
  const sharedT: Translate = (key) => sharedComponentsT(locale, key);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t(isNew ? "New widget" : "Edit widget")}</h1>
          <p className="page-description">{t("Configure this widget's title and settings.")}</p>
        </div>
        <div className="page-actions">
          <a
            className="btn-secondary"
            href="/admin/widgets"
            {...agentHandle("widget-instance-back", { role: "link", label: "Back to Widgets" })}
          >
            ← {t("Widgets")}
          </a>
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? (
            <span className="save-error" role="alert">
              {error}
            </span>
          ) : null}
          <button
            onClick={save}
            disabled={saving}
            {...agentHandle("widget-instance-save", { role: "button", label: "Save this widget" })}
          >
            {saving ? t("Saving…") : t("Save")}
          </button>
        </div>
      </div>

      {widget ? <WhereUsedBanner whereUsed={whereUsed} t={t} /> : null}

      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title field
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). */}
      <label className="a11y-label-wrap">
        <span className="visually-hidden">Widget title</span>
        <input
          className="editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("Widget title")}
          {...agentHandle("widget-instance-title", { role: "field", label: "This widget's title" })}
        />
      </label>
      <p className="muted-cell">{t("Type:")} {widgetTypeLabel(widgetType, locale)}</p>

      <div className="widget-config-form">
        <WidgetConfigFields
          widgetType={widgetType}
          config={config}
          onChange={setConfig}
          agentHandle="widget-instance-config"
          t={sharedT}
        />
        {fieldErrors.map((fe, i) => (
          <p key={i} className="save-error" role="alert">
            {fe.field}: {fe.reason}
          </p>
        ))}
      </div>
    </div>
  );
}
