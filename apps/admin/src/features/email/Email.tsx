import { agentHandle } from "@jini-ai/agentic";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import "@jini-ai/ui/settings-dialog.css";
import type { ReactNode } from "react";

import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { navigate } from "../../lib/router";
import { t } from "./email-i18n";
import { EmailActivityTab } from "./EmailActivityTab";
import { EmailOverviewTab } from "./EmailOverviewTab";
import { Chip, Section, Segments, type Tone } from "./EmailParts";
import { EmailProviderTab } from "./EmailProviderTab";
import { EmailSenderTab } from "./EmailSenderTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";
import { emailSummary, useWiredEmail, type EmailController, type EmailStatusView, type EmailSummary } from "./hooks/use-email.hooks";
import { useWiredEmailActivity, type EmailActivityController } from "./hooks/use-email-activity.hooks";
import { useWiredEmailOverview, type EmailOverviewController } from "./hooks/use-email-overview.hooks";
import { useWiredEmailProvider, type EmailProviderController } from "./hooks/use-email-provider.hooks";
import { useWiredEmailSender, type EmailSenderController } from "./hooks/use-email-sender.hooks";
import { useWiredEmailTemplates, type EmailTemplatesController } from "./hooks/use-email-templates.hooks";
// The segmented pill's look (`.jini-chat-settings-segmented`) lives with the chat dock's styles.
import "../../styles/assistant.css";
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
 *
 * Inside Overview, Provider and Sender & DNS, a segmented pill shows one section at a time (owner,
 * 2026-10-22: the stacked cards were too much to take in). The URL owns that choice too, as `?p=`:
 * an Overview section, a provider id, or `sender`/`dns`. A missing or unknown `p` falls back to the
 * first section (Provider: the active provider — see `EmailProviderTab.tsx`).
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

const OVERVIEW_PARTS = ["status", "uses", "test"] as const;
type OverviewPart = (typeof OVERVIEW_PARTS)[number];
const OVERVIEW_PART_LABELS: Record<OverviewPart, string> = { status: "Status", uses: "What uses email", test: "Send test email" };
const SENDER_PARTS = ["sender", "dns"] as const;
type SenderPart = (typeof SENDER_PARTS)[number];
const SENDER_PART_LABELS: Record<SenderPart, string> = { sender: "Sender", dns: "DNS" };

/** `p` when it names one of `parts`, else the first. Pure. */
function pickPart<T extends string>(parts: readonly T[], part: string | null | undefined): T {
  return parts.find((id) => id === part) ?? parts[0]!;
}

/** A segmented pill over fixed parts, labelled through the dictionary. */
function PartSegments<T extends string>(props: { name: string; label: string; labels: Record<T, string>; active: T; locale: string; onSelect: (part: string) => void }) {
  const items = (Object.keys(props.labels) as T[]).map((key) => ({ key, label: t({ locale: props.locale, key: props.labels[key] }) }));
  return <Segments name={props.name} label={props.label} items={items} active={props.active} onSelect={props.onSelect} />;
}

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

type PartProps = { hooks: EmailTabHooks; locale: string; part: string | null | undefined; onPart: (part: string) => void };

/** Overview's hook stays mounted across its segments, so the uses read and a typed test address survive a switch. */
function OverviewTab(props: PartProps & { label: string; status: ReactNode }) {
  const controller = props.hooks.overview();
  const part = pickPart(OVERVIEW_PARTS, props.part);
  return (
    <>
      <PartSegments name="email-overview-part" label={props.label} labels={OVERVIEW_PART_LABELS} active={part} locale={props.locale} onSelect={props.onPart} />
      {part === "status" ? props.status : <EmailOverviewTab controller={controller} locale={props.locale} part={part} />}
    </>
  );
}
function ProviderTab(props: PartProps & { status: EmailController }) {
  const controller = props.hooks.provider({ onChanged: props.status.retry });
  return (
    <EmailProviderTab controller={controller} status={props.status.view.kind === "loaded" ? props.status.view.status : null} locale={props.locale}
      selectedId={props.part} onSelect={props.onPart} />
  );
}
function SenderTab(props: PartProps & { label: string; status: EmailController }) {
  const controller = props.hooks.sender({ onChanged: props.status.retry });
  const part = pickPart(SENDER_PARTS, props.part);
  return (
    <>
      <PartSegments name="email-sender-part" label={props.label} labels={SENDER_PART_LABELS} active={part} locale={props.locale} onSelect={props.onPart} />
      <EmailSenderTab controller={controller} warnings={props.status.view.kind === "loaded" ? props.status.view.status.warnings ?? [] : []} locale={props.locale} part={part} />
    </>
  );
}
function TemplatesTab(props: { hooks: EmailTabHooks; locale: string }) {
  return <EmailTemplatesTab controller={props.hooks.templates({ newName: t({ locale: props.locale, key: "Untitled email" }) })} locale={props.locale} />;
}
function ActivityTab(props: { hooks: EmailTabHooks; locale: string }) {
  return <EmailActivityTab controller={props.hooks.activity()} locale={props.locale} />;
}

/**
 * The Email screen. `tabId` is the `?tab=` query value and `part` the `?p=` one (the section shown
 * inside that tab); `useEmailHook` and `tabHooks` are the DI seams — a test mounts them over fakes.
 */
export function Email(props: { tabId?: string | null; part?: string | null; useEmailHook?: () => EmailController; tabHooks?: Partial<EmailTabHooks> } = {}) {
  const controller = (props.useEmailHook ?? useWiredEmail)();
  const hooks: EmailTabHooks = { ...WIRED_TAB_HOOKS, ...props.tabHooks };
  const { view, locale } = controller;
  const themeBoundary = useAdminThemeBoundary({}, {});
  const activeId = resolveActiveTabId({ tabId: props.tabId, validIds: TAB_IDS, defaultId: "overview" });
  const tabs: TabBarTab[] = TAB_IDS.map((id) => ({
    id, label: t({ locale, key: TAB_LABELS[id] }), handle: `email-tab-${id}`, handleLabel: `Switch to the ${TAB_LABELS[id]} tab of Email`,
  }));
  const partProps: PartProps = {
    hooks, locale, part: props.part,
    onPart: (next) => navigate(`/email?tab=${activeId}&p=${encodeURIComponent(next)}`, { replace: true }),
  };
  const tabLabel = (id: EmailTabId) => t({ locale, key: TAB_LABELS[id] });
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
          <OverviewTab {...partProps} label={tabLabel("overview")} status={(
            <Section id="status" title={t({ locale, key: "Status" })}>
              <StatusBody view={view} locale={locale} retry={controller.retry} />
            </Section>
          )} />
        ) : null}
        {activeId === "provider" ? <ProviderTab {...partProps} status={controller} /> : null}
        {activeId === "sender" ? <SenderTab {...partProps} label={tabLabel("sender")} status={controller} /> : null}
        {activeId === "templates" ? <TemplatesTab hooks={hooks} locale={locale} /> : null}
        {activeId === "activity" ? <ActivityTab hooks={hooks} locale={locale} /> : null}
      </div>
    </div>
  );
}
