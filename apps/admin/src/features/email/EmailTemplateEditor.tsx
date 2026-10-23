import { useEffect } from "react";
import { agentHandle } from "@jini-ai/agentic";
import "@jini-ai/ui/settings-dialog.css";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { adminHref } from "../../lib/router";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "../pages/rules";
import { t } from "./email-i18n";
import { Chip, Loaded } from "./EmailParts";
import { useWiredEmailTemplateEditor, type EmailTemplateEditorController, type PreviewMode } from "./hooks/use-email-template-editor.hooks";
import "./email.css";

/**
 * @file One email template's editor page (`/admin/email/templates/:id`): raw HTML on the left, the
 * live preview on the right, the `{{field}}` fill-ins above. Reuses the Pages editor's raw-HTML
 * textarea look (`.page-html-source`) and its preview sandbox (`PAGE_PREVIEW_IFRAME_SANDBOX`: scripts
 * run, but with no same-origin access to the admin). "As sent" shows what a mail client gets —
 * scripts stripped by the server, static HTML.
 */

const MODES: { id: PreviewMode; label: string }[] = [
  { id: "admin", label: "Preview" },
  { id: "sent", label: "As sent" },
];

function Fields(props: { controller: EmailTemplateEditorController; locale: string }) {
  const { controller, locale } = props;
  const missing = new Set(controller.preview.data?.missingFields ?? []);
  const undeclared = new Set(controller.preview.data?.undeclaredFields ?? []);
  if (controller.fieldNames.length === 0) {
    return <p className="jini-field-hint">{t({ locale, key: "No fill-in fields. Add {{name}} to the HTML to make one." })}</p>;
  }
  return (
    <fieldset className="email-template-fields">
      <legend className="jini-field-label">{t({ locale, key: "Fill-in fields (preview values)" })}</legend>
      {controller.fieldNames.map((name) => (
        <div key={name} className="jini-field email-field">
          <label className="jini-field-label" htmlFor={`email-template-field-${name}`}>
            <code>{`{{${name}}}`}</code>
            {undeclared.has(name) ? <Chip tone="warning">{t({ locale, key: "Not declared" })}</Chip> : null}
          </label>
          <input id={`email-template-field-${name}`} className="jini-input" value={controller.values[name] ?? ""} aria-invalid={missing.has(name)}
            onChange={(e) => controller.setValue(name, e.target.value)}
            {...agentHandle({ handle: `email-template-field-${name}` }, { role: "field", label: `Preview value for ${name}` })} />
        </div>
      ))}
    </fieldset>
  );
}

function Preview(props: { controller: EmailTemplateEditorController; locale: string }) {
  const { controller, locale } = props;
  const { data, error, pending } = controller.preview;
  return (
    <div className="email-template-preview">
      <div className="email-row">
        <div className="segmented" role="group" aria-label={t({ locale, key: "Preview mode" })}>
          {MODES.map((mode) => (
            <button key={mode.id} type="button" aria-pressed={controller.mode === mode.id} className={controller.mode === mode.id ? "is-active" : undefined}
              onClick={() => controller.setMode(mode.id)} {...agentHandle({ handle: `email-template-mode-${mode.id}` }, { role: "button", label: `Show the ${mode.label} preview` })}>
              {t({ locale, key: mode.label })}
            </button>
          ))}
        </div>
        {pending ? <span className="jini-field-hint" role="status">{t({ locale, key: "Updating…" })}</span> : null}
      </div>
      {data ? <p className="email-template-subject"><span className="jini-field-label">{t({ locale, key: "Subject" })}</span> {data.subject}</p> : null}
      {error ? <p className="jini-field-error" role="alert">{t({ locale, key: error })}</p> : null}
      <div className="email-template-frame">
        {data ? (
          <iframe
            className="page-preview-iframe"
            title={t({ locale, key: "Email preview" })}
            sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
            srcDoc={data.html}
            {...agentHandle({ handle: "email-template-preview" }, { role: "region", label: "Live preview of this email" })}
          />
        ) : (
          <p className="jini-field-hint email-template-empty">{t({ locale, key: pending ? "Loading…" : "Write some HTML to see it here." })}</p>
        )}
      </div>
      {controller.mode === "sent" ? <p className="jini-field-hint">{t({ locale, key: "Mail apps don't run scripts, so they are removed when it sends." })}</p> : null}
    </div>
  );
}

/** Warns before leaving with unsaved HTML, and saves on Cmd/Ctrl+S. */
function useEditorKeys(controller: EmailTemplateEditorController): void {
  const { dirty, save } = controller;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [dirty, save]);
}

/** The locale prop when a test passes one, else the operator's. */
function useEditorLocale(override: string | undefined): string {
  const adminLocale = useAdminLocale();
  return override ?? adminLocale;
}

/** The save-state word beside the Save button, or null before any edit. Pure. */
export function editorStatus(controller: Pick<EmailTemplateEditorController, "saving" | "dirty" | "savedAt">): string | null {
  if (controller.saving) return "Saving…";
  if (controller.dirty) return "Unsaved changes";
  return controller.savedAt ? "Saved" : null;
}

/**
 * The editor page. `useEditorHook` is the DI seam — a test mounts it over a fake controller.
 */
export function EmailTemplateEditor(props: { id: string; useEditorHook?: (required: { id: string }) => EmailTemplateEditorController; locale?: string }) {
  const useEditor = props.useEditorHook ?? useWiredEmailTemplateEditor;
  const controller = useEditor({ id: props.id });
  const locale = useEditorLocale(props.locale);
  useEditorKeys(controller);
  const status = editorStatus(controller);
  return (
    <div className="page email-template-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">
            <a href={adminHref("/email?tab=templates")} {...agentHandle({ handle: "email-template-back" }, { role: "link", label: "Back to the email templates list" })}>
              {translateAdminNavLabel({ locale, key: "Email" })} · {t({ locale, key: "Templates" })}
            </a>
          </p>
          <label className="visually-hidden" htmlFor="email-template-name">{t({ locale, key: "Template name" })}</label>
          <input
            id="email-template-name"
            className="page-title email-template-name"
            value={controller.name}
            maxLength={200}
            disabled={controller.view.kind !== "loaded"}
            onChange={(e) => controller.setName(e.target.value)}
            onBlur={() => void controller.commitName()}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            {...agentHandle({ handle: "email-template-name" }, { role: "field", label: "Template name" })}
          />
          {controller.renameError ? <p className="jini-field-error" role="alert">{t({ locale, key: controller.renameError })}</p> : null}
        </div>
        <div className="page-actions">
          {status ? <span className="jini-field-hint" role="status">{t({ locale, key: status })}</span> : null}
          <button type="button" onClick={() => void controller.save()} disabled={!controller.dirty || controller.saving}
            {...agentHandle({ handle: "email-template-save" }, { role: "button", label: "Save this template's HTML" })}>
            {t({ locale, key: "Save" })}
          </button>
        </div>
      </div>
      {controller.saveError ? <div className="notice error" role="alert">{t({ locale, key: controller.saveError })}</div> : null}
      <Loaded view={controller.view} locale={locale}>
        {() => (
          <>
            <Fields controller={controller} locale={locale} />
            <div className="email-template-split">
              <textarea
                className="page-html-source email-template-source"
                value={controller.html}
                onChange={(e) => controller.setHtml(e.target.value)}
                spellCheck={false}
                aria-label={t({ locale, key: "Template HTML" })}
                placeholder={t({ locale, key: "Write the email's HTML, or ask the assistant to." })}
                {...agentHandle({ handle: "email-template-html" }, { role: "field", label: "This email template's raw HTML" })}
              />
              <Preview controller={controller} locale={locale} />
            </div>
          </>
        )}
      </Loaded>
    </div>
  );
}
