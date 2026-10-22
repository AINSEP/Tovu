import { agentHandle } from "@jini-ai/agentic";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import "@jini-ai/ui/settings-dialog.css";

import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { navigate } from "../../lib/router";
import { t } from "./email-i18n";
import { EmailActivityTab } from "./EmailActivityTab";
import { EmailOverviewTab } from "./EmailOverviewTab";
import { Chip, Section, type Tone } from "./EmailParts";
import { EmailProviderTab } from "./EmailProviderTab";
import { EmailSenderTab } from "./EmailSenderTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";
import { emailSummary, useWiredEmail, type EmailController, type EmailStatusView, type EmailSummary } from "./hooks/use-email.hooks";
import { useWiredEmailActivity, type EmailActivityController } from "./hooks/use-email-activity.hooks";
import { useWiredEmailOverview, type EmailOverviewController } from "./hooks/use-email-overview.hooks";
import { useWiredEmailProvider, type EmailProviderController } from "./hooks/use-email-provider.hooks";
import { useWiredEmailSender, type EmailSenderController } from "./hooks/use-email-sender.hooks";
import { useWiredEmailTemplates, type EmailTemplatesController } from "./hooks/use-email-templates.hooks";
import "./email.css";

/**
 * @file The Email screen — markup only; state lives in `hooks/use-email.hooks.ts`.
 *
 * Design: `ADS-memory/reports/2026-10-22-email-page-design-codex.md` (+ its "Owner decisions").
 * Phase 1 was the status read; round 2 (2026-10-22) wires every tab to its own routes, each tab's
 * state in its own hook (`hooks/use-email-*.hooks.ts`), mounted only while that tab shows so the
 * page does not fire every read at once. No provider-name branches: everything shown comes from the
 * server's data. A template's editor is its own page (`EmailTemplateEditor.tsx`).
 *
 * Tabs (`/admin/email?tab=overview|provider|sender|templates|activity`) use the shared `TabBar`, the
 * same as Admin UI and Cookie Consent: the URL owns the selection, so a reload or a link (the mail
 * banner's "Set up email" opens `?tab=provider`) lands on that tab.
 */

const TAB_IDS = ["overview", "provider", "sender", "templates", "activity"] as const;
type EmailTabId = (typeof TAB_IDS)[number];
const TAB_LABELS: Record<EmailTabId, string> = {
  overview: "Overview",
  provider: "Provider",
  sender: "Sender & DNS",
  templates: "Templates",
  activity: "Activity",
};

const SUMMARY: Record<EmailSummary, { tone: Tone; chip: string; line: string }> = {
  not_set_up: {
    tone: "warning",
    chip: "Not set up",
    line: "No mail provider is selected, so sign-in links, confirmations and form notifications are not sent.",
  },
  no_external_delivery: {
    tone: "neutral",
    chip: "No external delivery",
    line: "Mail is only written to the server log. Nothing is sent.",
  },
  needs_attention: { tone: "warning", chip: "Needs attention", line: "Some mail cannot be sent. Check the Provider and Sender & DNS tabs." },
  configured: { tone: "ok", chip: "Configured", line: "A provider is selected and its key is saved." },
};

function StatusBody(props: { view: EmailStatusView; locale: string; retry: () => void }) {
  const { view, locale } = props;
  if (view.kind === "loading") return <p className="jini-field-hint" role="status">{t({ locale, key: "Loading email status…" })}</p>;
  if (view.kind === "forbidden") return <p className="jini-field-hint">{t({ locale, key: "You don't have permission to view email status." })}</p>;
  if (view.kind === "error") {
    return (
      <div className="email-row" role="alert">
        <Chip tone="warning">{t({ locale, key: "Status unavailable" })}</Chip>
        <button type="button" className="btn-secondary" onClick={props.retry} {...agentHandle({ handle: "email-status-retry" }, { role: "button", label: "Retry the email status read" })}>
          {t({ locale, key: "Retry" })}
        </button>
      </div>
    );
  }
  const summary = SUMMARY[emailSummary({ status: view.status })];
  return (
    <>
      <div className="email-row">
        <Chip tone={summary.tone}>{t({ locale, key: summary.chip })}</Chip>
        <span className="jini-field-hint">{t({ locale, key: summary.line })}</span>
      </div>
      <p className="jini-field-hint">{t({ locale, key: "This checks configuration only. It does not prove that mail arrives." })}</p>
    </>
  );
}

/** Each tab's state hook — the DI seam a test fills with fakes. Mounted only while its tab shows. */
export interface EmailTabHooks {
  overview: () => EmailOverviewController;
  provider: (optional: { onChanged?: () => void }) => EmailProviderController;
  sender: (optional: { onChanged?: () => void }) => EmailSenderController;
  templates: (optional: { newName?: string }) => EmailTemplatesController;
  activity: () => EmailActivityController;
}

const WIRED_TAB_HOOKS: EmailTabHooks = {
  overview: useWiredEmailOverview,
  provider: useWiredEmailProvider,
  sender: useWiredEmailSender,
  templates: useWiredEmailTemplates,
  activity: useWiredEmailActivity,
};

function OverviewTab(props: { hooks: EmailTabHooks; locale: string }) {
  return <EmailOverviewTab controller={props.hooks.overview()} locale={props.locale} />;
}
function ProviderTab(props: { hooks: EmailTabHooks; locale: string; status: EmailController }) {
  const controller = props.hooks.provider({ onChanged: props.status.retry });
  return <EmailProviderTab controller={controller} status={props.status.view.kind === "loaded" ? props.status.view.status : null} locale={props.locale} />;
}
function SenderTab(props: { hooks: EmailTabHooks; locale: string; status: EmailController }) {
  const controller = props.hooks.sender({ onChanged: props.status.retry });
  return <EmailSenderTab controller={controller} warnings={props.status.view.kind === "loaded" ? props.status.view.status.warnings ?? [] : []} locale={props.locale} />;
}
function TemplatesTab(props: { hooks: EmailTabHooks; locale: string }) {
  return <EmailTemplatesTab controller={props.hooks.templates({ newName: t({ locale: props.locale, key: "Untitled email" }) })} locale={props.locale} />;
}
function ActivityTab(props: { hooks: EmailTabHooks; locale: string }) {
  return <EmailActivityTab controller={props.hooks.activity()} locale={props.locale} />;
}

/**
 * The Email screen. `tabId` is the `?tab=` query value; `useEmailHook` and `tabHooks` are the DI
 * seams — a test mounts them over fakes.
 */
export function Email(props: { tabId?: string | null; useEmailHook?: () => EmailController; tabHooks?: Partial<EmailTabHooks> } = {}) {
  const controller = (props.useEmailHook ?? useWiredEmail)();
  const hooks: EmailTabHooks = { ...WIRED_TAB_HOOKS, ...props.tabHooks };
  const { view, locale } = controller;
  const themeBoundary = useAdminThemeBoundary({}, {});
  const activeId = resolveActiveTabId({ tabId: props.tabId, validIds: TAB_IDS, defaultId: "overview" });
  const tabs: TabBarTab[] = TAB_IDS.map((id) => ({
    id, label: t({ locale, key: TAB_LABELS[id] }), handle: `email-tab-${id}`, handleLabel: `Switch to the ${TAB_LABELS[id]} tab of Email`,
  }));
  return (
    <div className="page email-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{translateAdminNavLabel({ locale, key: "Administration" })}</p>
          <h1 className="page-title">{translateAdminNavLabel({ locale, key: "Email" })}</h1>
          <p className="page-description">
            {t({ locale, key: "Sign-in links, confirmations and form notifications depend on email." })}
          </p>
        </div>
      </div>
      <TabBar
        ariaLabel={translateAdminNavLabel({ locale, key: "Email" })}
        tabs={tabs}
        activeId={activeId}
        onChange={(next) => navigate(`/email?tab=${next}`, { replace: true })}
        containerHandle="email-tab-bar"
      />
      {/* Same wrapper classes as Authentication: `settings-ui-section` + the theme boundary is what
          gives `.jini-settings-section-card` its white Classic panel (styles/settings.css). */}
      <div className="settings-ui-section settings-ui-section--page-flow email-sections" {...themeBoundary}>
        {activeId === "overview" ? (
          <>
            <Section id="status" title={t({ locale, key: "Status" })}>
              <StatusBody view={view} locale={locale} retry={controller.retry} />
            </Section>
            <OverviewTab hooks={hooks} locale={locale} />
          </>
        ) : null}
        {activeId === "provider" ? <ProviderTab hooks={hooks} locale={locale} status={controller} /> : null}
        {activeId === "sender" ? <SenderTab hooks={hooks} locale={locale} status={controller} /> : null}
        {activeId === "templates" ? <TemplatesTab hooks={hooks} locale={locale} /> : null}
        {activeId === "activity" ? <ActivityTab hooks={hooks} locale={locale} /> : null}
      </div>
    </div>
  );
}
