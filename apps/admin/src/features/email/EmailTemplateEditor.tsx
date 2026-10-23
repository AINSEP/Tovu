import { useEffect } from "react";
import { agentHandle } from "@jini-ai/agentic";
import { Icon } from "@jini-ai/ui";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import "@jini-ai/ui/settings-dialog.css";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { DEVICE_PREVIEW_WIDTHS } from "../../components/DevicePreview/DevicePreview.hooks";
import { DevicePreviewFrame } from "../../components/DevicePreview/DevicePreviewFrame";
import { DevicePreviewToggle } from "../../components/DevicePreview/DevicePreviewToggle";
import { adminHref } from "../../lib/router";
import { t as pageEditorT } from "../pages/page-editor-i18n";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "../pages/rules";
import { t } from "./email-i18n";
import { Chip, Loaded } from "./EmailParts";
import { useWiredEmailTemplateEditor, type EmailTemplateEditorController } from "./hooks/use-email-template-editor.hooks";
import { useEmailTemplateView, type EmailTemplateTab, type EmailTemplateViewState } from "./hooks/use-email-template-view.hooks";
import "./email.css";

/**
 * @file One email template's editor page (`/admin/email/templates/:id`), laid out like the Pages
 * editor (owner, 2026-10-22): back arrow + name, an HTML | Preview tab bar with the device-width
 * buttons, Save below it, then the full-width pane. Same chrome classes as `PageEditor.tsx`
 * (`content-editor-*`, `page-editor-toolbar`, `.segmented`, `page-html-source`) and the same shared
 * `DevicePreview*` components; the Pages translator supplies the shared control words.
 *
 * No Interactive tab on purpose: the Pages visual editor rewrites the HTML on save and can drop the
 * template's field declarations in `<head>`.
 *
 * The preview uses the Pages sandbox (`PAGE_PREVIEW_IFRAME_SANDBOX`: scripts run, but with no
 * same-origin access to the admin). "As sent" shows what a mail client gets — scripts stripped by
 * the server, static HTML.
 */

const TABS: ReadonlyArray<{ id: EmailTemplateTab; label: string }> = [
  { id: "html", label: "HTML" },
  { id: "preview", label: "Preview" },
];

function Fields(props: { controller: EmailTemplateEditorController; locale: string }) {
  const { controller, locale } = props;
  const missing = new Set(controller.preview.data?.missingFields ?? []);
  const undeclared = new Set(controller.preview.data?.undeclaredFields ?? []);
  return (
    <details className="email-template-fields" open>
      <summary className="jini-field-label">{t({ locale, key: "Fill-in fields (preview values)" })}</summary>
      {controller.fieldNames.length === 0 ? (
        <p className="jini-field-hint">{t({ locale, key: "No fill-in fields. Add {{name}} to the HTML to make one." })}</p>
      ) : (
        <div className="email-template-field-list">
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
        </div>
      )}
    </details>
  );
}

/** "As sent" sits beside the device buttons as one pressed/unpressed pill (Preview is the tab). */
function AsSentToggle(props: { controller: EmailTemplateEditorController; locale: string }) {
  const { controller, locale } = props;
  const sent = controller.mode === "sent";
  return (
    <div className="segmented email-template-as-sent" role="group" aria-label={t({ locale, key: "Preview mode" })}>
      <button type="button" aria-pressed={sent} className={sent ? "is-active" : undefined}
        onClick={() => controller.setMode(sent ? "admin" : "sent")}
        {...agentHandle({ handle: "email-template-mode-sent" }, { role: "button", label: "Toggle the As sent preview (scripts stripped, what a mail client gets)" })}>
        {t({ locale, key: "As sent" })}
      </button>
    </div>
  );
}

function Preview(props: { controller: EmailTemplateEditorController; view: EmailTemplateViewState; locale: string }) {
  const { controller, view, locale } = props;
  const { data, error, pending } = controller.preview;
  return (
    <div className="email-template-preview">
      <Fields controller={controller} locale={locale} />
      {error ? <p className="jini-field-error" role="alert">{t({ locale, key: error })}</p> : null}
      {controller.mode === "sent" ? <p className="jini-field-hint">{t({ locale, key: "Mail apps don't run scripts, so they are removed when it sends." })}</p> : null}
      <DevicePreviewFrame width={DEVICE_PREVIEW_WIDTHS[view.device]} frameRef={view.frameRef} paneWidth={view.paneWidth}>
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
      </DevicePreviewFrame>
    </div>
  );
}

/** Back arrow, the template name as the title, and its subject where Pages shows the slug. */
function Header(props: { controller: EmailTemplateEditorController; locale: string }) {
  const { controller, locale } = props;
  const subject = controller.preview.data?.subject ?? (controller.view.kind === "loaded" ? controller.view.data.subject : "");
  return (
    <div className="content-editor-header" {...agentHandle({ handle: "email-template-header" }, { role: "region", label: "Editor header — the back link, the template's name and its subject" })}>
      <h1 className="visually-hidden">{t({ locale, key: "Templates" })}</h1>
      <a
        className="content-editor-back"
        href={adminHref("/email?tab=templates")}
        aria-label={`${pageEditorT(locale, "Back")}: ${t({ locale, key: "Templates" })}`}
        {...agentHandle({ handle: "email-template-back" }, { role: "link", label: "Back to the email templates list" })}
      >
        <Icon name="arrow-left" size={22} aria-hidden="true" />
      </a>
      <label className="visually-hidden" htmlFor="email-template-name">{t({ locale, key: "Template name" })}</label>
      <input
        id="email-template-name"
        className="editor-title content-editor-title email-template-name"
        value={controller.name}
        maxLength={200}
        disabled={controller.view.kind !== "loaded"}
        onChange={(e) => controller.setName(e.target.value)}
        onBlur={() => void controller.commitName()}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        {...agentHandle({ handle: "email-template-name" }, { role: "field", label: "Template name" })}
      />
      {subject ? (
        <div className="editor-slug email-template-subject">
          <span>{t({ locale, key: "Subject" })}</span>
          <span className="email-template-subject-text" title={subject}>{subject}</span>
        </div>
      ) : null}
    </div>
  );
}

/** HTML | Preview tabs (Pages' segmented tablist and keyboard contract), device widths, As sent. */
function Toolbar(props: { controller: EmailTemplateEditorController; view: EmailTemplateViewState; locale: string }) {
  const { controller, view, locale } = props;
  const pageT = (key: string) => pageEditorT(locale, key);
  const { onKeyDown } = useTabBarKeyboard({ tabs: TABS, activeId: view.tab, onChange: (id) => view.setTab(id as EmailTemplateTab) });
  return (
    <div className="page-editor-toolbar">
      <div className="content-editor-toolbar-start">
        <div className="segmented" role="tablist" aria-label={pageT("Editor view")} onKeyDown={onKeyDown}>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={view.tab === entry.id}
              className={view.tab === entry.id ? "is-active" : undefined}
              tabIndex={resolveTabBarTabIndex({ tabs: TABS, activeId: view.tab, tab: entry })}
              onClick={() => view.setTab(entry.id)}
              {...agentHandle({ handle: `email-template-view-${entry.id}` }, { role: "button", label: `Switch to the ${entry.label} view` })}
            >
              {pageT(entry.label)}
            </button>
          ))}
        </div>
        {view.tab === "preview" ? (
          <>
            <DevicePreviewToggle device={view.device} setDevice={view.setDevice} t={pageT} handlePrefix="email-template-preview-width" />
            <AsSentToggle controller={controller} locale={locale} />
          </>
        ) : null}
      </div>
      {controller.preview.pending && view.tab === "preview" ? <span className="jini-field-hint" role="status">{t({ locale, key: "Updating…" })}</span> : null}
    </div>
  );
}

/** Save and its state word, in the row under the toolbar like the Pages editor's action row. */
function Actions(props: { controller: EmailTemplateEditorController; locale: string }) {
  const { controller, locale } = props;
  const status = editorStatus(controller);
  return (
    <div className="editor-action-row content-action-row" {...agentHandle({ handle: "email-template-actions" }, { role: "region", label: "Save and its status" })}>
      <div className="content-action-group">
        <button type="button" onClick={() => void controller.save()} disabled={!controller.dirty || controller.saving}
          {...agentHandle({ handle: "email-template-save" }, { role: "button", label: "Save this template's HTML" })}>
          {t({ locale, key: "Save" })}
        </button>
      </div>
      {status ? <span className={status === "Saved" ? "save-ok" : "jini-field-hint"} role="status">{t({ locale, key: status })}</span> : null}
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
  const view = useEmailTemplateView();
  useEditorKeys(controller);
  return (
    <div className="page content-editor-page email-template-page">
      <Header controller={controller} locale={locale} />
      {controller.renameError ? <p className="jini-field-error" role="alert">{t({ locale, key: controller.renameError })}</p> : null}
      {controller.saveError ? <div className="notice error" role="alert">{t({ locale, key: controller.saveError })}</div> : null}
      <Loaded view={controller.view} locale={locale}>
        {() => (
          <>
            <Toolbar controller={controller} view={view} locale={locale} />
            <Actions controller={controller} locale={locale} />
            {view.tab === "html" ? (
              <textarea
                className="page-html-source email-template-source"
                value={controller.html}
                onChange={(e) => controller.setHtml(e.target.value)}
                spellCheck={false}
                aria-label={t({ locale, key: "Template HTML" })}
                placeholder={t({ locale, key: "Write the email's HTML, or ask the assistant to." })}
                {...agentHandle({ handle: "email-template-html" }, { role: "field", label: "This email template's raw HTML" })}
              />
            ) : (
              <Preview controller={controller} view={view} locale={locale} />
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}
