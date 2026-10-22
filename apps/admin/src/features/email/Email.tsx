import type { ReactNode } from "react";
import { agentHandle } from "@jini-ai/agentic";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import "@jini-ai/ui/settings-dialog.css";

import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import type { AdminMailStatus } from "../../lib/api";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { adminHref, navigate } from "../../lib/router";
import { t } from "./email-i18n";
import { emailSummary, useWiredEmail, type EmailController, type EmailStatusView, type EmailSummary } from "./hooks/use-email.hooks";
import "./email.css";

/**
 * @file The Email screen — markup only; state lives in `hooks/use-email.hooks.ts`.
 *
 * Phase 1 of `ADS-memory/reports/2026-10-22-email-page-design-codex.md`: configuration diagnostics
 * from the existing mail-status read. Every section keeps its place; the ones whose data has no
 * server contract yet (DNS records, test send, uses, templates, activity) say "Coming next" instead
 * of showing made-up rows. No provider-name branches: everything shown comes from the status payload.
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

type Tone = "ok" | "warning" | "neutral";

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
  needs_attention: { tone: "warning", chip: "Needs attention", line: "Some mail cannot be sent. See Provider and Sender below." },
  configured: { tone: "ok", chip: "Configured", line: "A provider is selected and its key is saved." },
};

const LANE_STATE: Record<string, { tone: Tone; label: string }> = {
  ready: { tone: "ok", label: "Ready" },
  unconfigured: { tone: "warning", label: "Not set up" },
  unknown_provider: { tone: "warning", label: "Not installed" },
  missing_credential: { tone: "warning", label: "Key not saved" },
  local_only: { tone: "neutral", label: "No external delivery" },
};

const LANE_LABEL = { transactional: "Transactional mail", bulk: "Bulk mail" } as const;

const SENDER_WARNING = {
  sender_unknown: "No sender address is set.",
  sender_unverified: "The provider has not verified the sender's domain.",
} as const;

function Chip(props: { tone: Tone; children: ReactNode }) {
  return <span className={`status status-${props.tone}`}>{props.children}</span>;
}

/** One titled card; `id` doubles as the in-page anchor within its tab. */
function Section(props: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={props.id} className="jini-settings-section email-section" aria-labelledby={`email-${props.id}-title`}>
      <div className="jini-settings-section-card email-card">
        <h2 className="jini-byok-card-title" id={`email-${props.id}-title`}>{props.title}</h2>
        {props.children}
      </div>
    </section>
  );
}

/** The honest placeholder for a section whose data does not exist yet. */
function ComingNext(props: { locale: string; text: string }) {
  return (
    <p className="email-coming-next">
      <Chip tone="neutral">{t({ locale: props.locale, key: "Coming next" })}</Chip>
      <span className="jini-field-hint">{t({ locale: props.locale, key: props.text })}</span>
    </p>
  );
}

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

function providerLabel(status: AdminMailStatus, id: string | null, locale: string): string {
  if (id === null) return t({ locale, key: "None" });
  return status.providers?.find((provider) => provider.id === id)?.label ?? id;
}

function ProviderBody(props: { status: AdminMailStatus; locale: string }) {
  const { status, locale } = props;
  const providers = status.providers ?? [];
  const active = new Set((status.lanes ?? []).map((lane) => lane.providerId));
  return (
    <>
      {(status.lanes ?? []).length > 0 ? (
        <dl className="email-facts">
          {status.lanes!.map((lane) => {
            const state = LANE_STATE[lane.state] ?? { tone: "neutral" as const, label: lane.state };
            return (
              <div key={lane.lane} className="email-fact">
                <dt className="jini-field-label">{t({ locale, key: LANE_LABEL[lane.lane] })}</dt>
                <dd>
                  <span className="jini-field-hint">{providerLabel(status, lane.providerId, locale)}</span>
                  <Chip tone={state.tone}>{t({ locale, key: state.label })}</Chip>
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      <h3 className="jini-field-label email-subhead">{t({ locale, key: "Installed providers" })}</h3>
      {providers.length === 0 ? (
        <p className="jini-field-hint">
          {t({ locale, key: "No mail providers are installed." })}{" "}
          <a href={adminHref("/agent-plugins")}>{t({ locale, key: "Manage agent plugins" })}</a>
        </p>
      ) : (
        <ul className="email-list">
          {providers.map((provider) => (
            <li key={provider.id} className="email-row">
              <span className="jini-field-hint">{provider.label}</span>
              {active.has(provider.id) ? <Chip tone="ok">{t({ locale, key: "Active" })}</Chip> : null}
              {provider.hosted ? null : <Chip tone="neutral">{t({ locale, key: "Local only" })}</Chip>}
            </li>
          ))}
        </ul>
      )}
      {(status.refusals ?? []).length > 0 ? (
        <>
          <h3 className="jini-field-label email-subhead">{t({ locale, key: "Not loaded" })}</h3>
          <ul className="email-list">
            {status.refusals!.map((reason) => <li key={reason} className="jini-field-hint">{reason}</li>)}
          </ul>
        </>
      ) : null}
      <ComingNext locale={locale} text="Switching providers and saving keys here." />
    </>
  );
}

function SenderBody(props: { status: AdminMailStatus; locale: string }) {
  const { status, locale } = props;
  const warnings = status.warnings ?? [];
  return (
    <>
      {warnings.length === 0 ? (
        <p className="jini-field-hint">{t({ locale, key: "No sender warnings reported." })}</p>
      ) : (
        <ul className="email-list">
          {warnings.map((warning) => (
            <li key={warning} className="email-row">
              <Chip tone="warning">{t({ locale, key: "Needs attention" })}</Chip>
              <span className="jini-field-hint">{t({ locale, key: SENDER_WARNING[warning] })}</span>
            </li>
          ))}
        </ul>
      )}
      <ComingNext locale={locale} text="Editing the sender name and address here." />
    </>
  );
}

/**
 * The Email screen. `tabId` is the `?tab=` query value; `useEmailHook` is the DI seam — a test
 * mounts it over a fake port.
 */
export function Email(props: { tabId?: string | null; useEmailHook?: () => EmailController } = {}) {
  const controller = (props.useEmailHook ?? useWiredEmail)();
  const { view, locale } = controller;
  const themeBoundary = useAdminThemeBoundary({}, {});
  const loaded = view.kind === "loaded" ? view.status : null;
  const activeId = resolveActiveTabId({ tabId: props.tabId, validIds: TAB_IDS, defaultId: "overview" });
  const tabs: TabBarTab[] = TAB_IDS.map((id) => ({
    id, label: t({ locale, key: TAB_LABELS[id] }), handle: `email-tab-${id}`, handleLabel: `Switch to the ${TAB_LABELS[id]} tab of Email`,
  }));
  // A tab whose data is the status read shows the read's own loading / 403 / error-with-Retry line
  // until it loads, so landing on `?tab=provider` never shows an empty card.
  const pending = <StatusBody view={view} locale={locale} retry={controller.retry} />;
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
            <Section id="uses" title={t({ locale, key: "What uses email" })}>
              <ComingNext locale={locale} text="Whether sign-in links, confirmations and form notifications can send." />
            </Section>
            <Section id="test" title={t({ locale, key: "Send test email" })}>
              <ComingNext locale={locale} text="Send a test message and see the provider's answer." />
            </Section>
          </>
        ) : null}
        {activeId === "provider" ? (
          <Section id="provider" title={t({ locale, key: "Provider" })}>
            {loaded ? <ProviderBody status={loaded} locale={locale} /> : pending}
          </Section>
        ) : null}
        {activeId === "sender" ? (
          <>
            <Section id="sender" title={t({ locale, key: "Sender" })}>
              {loaded ? <SenderBody status={loaded} locale={locale} /> : pending}
            </Section>
            <Section id="dns" title={t({ locale, key: "DNS" })}>
              <ComingNext locale={locale} text="The records your domain needs, with a live check." />
            </Section>
          </>
        ) : null}
        {activeId === "templates" ? (
          <Section id="templates" title={t({ locale, key: "Templates" })}>
            <ComingNext locale={locale} text="HTML email templates you or the assistant edit like Pages, with a live preview." />
          </Section>
        ) : null}
        {activeId === "activity" ? (
          <Section id="activity" title={t({ locale, key: "Activity" })}>
            <ComingNext locale={locale} text="Recent sends, failures, bounces and blocked addresses." />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
