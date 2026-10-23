import { ConfirmDialog } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";

import { t } from "./email-i18n";
import type { MailActivityItem, MailFeedbackProviderSetup, MailSuppressionEntry } from "./email-api";
import { Chip, CopyButton, Loaded, Section, when, type Tone } from "./EmailParts";
import type { EmailActivityController, PagedList } from "./hooks/use-email-activity.hooks";

/**
 * @file The Activity tab: recent sends (filters, Load more, one send's feedback), blocked
 * addresses (search; Remove asks for a reason, then shows what removal means before the final
 * confirm — the server records the reason and only lets the owner do it), and whether provider
 * feedback (bounces, complaints) reaches this site.
 */

const OUTCOMES = ["accepted", "delivered", "bounced", "complained", "suppressed", "deferred", "failed", "unknown", "captured"] as const;

const OUTCOME: Record<string, { tone: Tone; label: string }> = {
  accepted: { tone: "ok", label: "Accepted" },
  delivered: { tone: "ok", label: "Delivered" },
  bounced: { tone: "error", label: "Bounced" },
  complained: { tone: "error", label: "Marked as spam" },
  suppressed: { tone: "warning", label: "Blocked" },
  deferred: { tone: "warning", label: "Delayed" },
  failed: { tone: "error", label: "Failed" },
  unknown: { tone: "neutral", label: "Unknown" },
  captured: { tone: "neutral", label: "Kept locally" },
};

const USE: Record<string, string> = {
  sign_in: "Sign-in link",
  newsletter_confirmation: "Newsletter confirmation",
  form_notification: "Form notification",
  newsletter: "Newsletter",
  test: "Test",
  unknown: "Other",
};

const SUPPRESSION_REASON: Record<MailSuppressionEntry["reason"], string> = {
  bounced: "Bounced",
  complained: "Marked as spam",
  manual: "Added by hand",
};

const FEEDBACK_STATE: Record<MailFeedbackProviderSetup["state"], { tone: Tone; label: string }> = {
  receiving: { tone: "ok", label: "Receiving" },
  no_events_yet: { tone: "neutral", label: "No events yet" },
  secret_missing: { tone: "warning", label: "Signing secret not saved" },
  unsupported: { tone: "neutral", label: "Not supported by this provider" },
};

function LoadMore<T>(props: { list: PagedList<T>; locale: string; handle: string }) {
  const { list, locale } = props;
  if (list.view.kind !== "loaded" || !list.view.data.nextCursor) return list.moreError ? <p className="jini-field-error">{t({ locale, key: list.moreError })}</p> : null;
  return (
    <div className="email-row">
      <button type="button" className="btn-secondary" disabled={list.loadingMore} onClick={() => void list.loadMore()} {...agentHandle({ handle: props.handle }, { role: "button", label: "Load more rows" })}>
        {list.loadingMore ? t({ locale, key: "Loading…" }) : t({ locale, key: "Load more" })}
      </button>
      {list.moreError ? <span className="jini-field-error">{t({ locale, key: list.moreError })}</span> : null}
    </div>
  );
}

function ActivityRow(props: { item: MailActivityItem; controller: EmailActivityController; locale: string; index: number }) {
  const { item, controller, locale } = props;
  const outcome = OUTCOME[item.outcome] ?? { tone: "neutral" as const, label: item.outcome };
  const open = item.id !== undefined && controller.openId === item.id;
  const detail = open ? controller.detail : null;
  return (
    <li className="email-activity">
      <div className="email-row">
        <Chip tone={outcome.tone}>{t({ locale, key: outcome.label })}</Chip>
        <span className="email-activity-recipient">{item.recipient}</span>
        <span className="jini-field-hint">{t({ locale, key: USE[item.use] ?? item.use })} · {when(item.createdAt, locale)}</span>
        {item.id ? (
          <button type="button" className="btn-secondary email-push-end" aria-expanded={open} onClick={() => controller.toggleDetail(item.id!)}
            {...agentHandle({ handle: `email-activity-${props.index}-details` }, { role: "button", label: "Show this send's details" })}>
            {open ? t({ locale, key: "Hide details" }) : t({ locale, key: "Details" })}
          </button>
        ) : null}
      </div>
      {detail ? (
        <div className="email-activity-detail">
          <Loaded view={detail} locale={locale}>
            {(data) => (
              <dl className="email-facts">
                <div className="email-fact"><dt className="jini-field-label">{t({ locale, key: "Provider" })}</dt><dd>{data.activity.providerId}</dd></div>
                {data.activity.originalRecipient ? (
                  <div className="email-fact"><dt className="jini-field-label">{t({ locale, key: "Meant for" })}</dt><dd>{data.activity.originalRecipient}</dd></div>
                ) : null}
                {data.activity.errorCode ? <div className="email-fact"><dt className="jini-field-label">{t({ locale, key: "Error" })}</dt><dd><code>{data.activity.errorCode}</code></dd></div> : null}
                {data.activity.providerMessageId ? <div className="email-fact"><dt className="jini-field-label">{t({ locale, key: "Message ID" })}</dt><dd><code>{data.activity.providerMessageId}</code></dd></div> : null}
                <div className="email-fact">
                  <dt className="jini-field-label">{t({ locale, key: "Feedback" })}</dt>
                  <dd>
                    {data.feedback.length === 0
                      ? <span className="jini-field-hint">{t({ locale, key: "None received yet" })}</span>
                      : data.feedback.map((event, i) => <span key={i} className="jini-field-hint">{t({ locale, key: OUTCOME[event.kind]?.label ?? event.kind })} · {when(event.receivedAt, locale)}</span>)}
                  </dd>
                </div>
              </dl>
            )}
          </Loaded>
        </div>
      ) : null}
    </li>
  );
}

function RecentSends(props: { controller: EmailActivityController; locale: string }) {
  const { controller, locale } = props;
  return (
    <Section id="activity" title={t({ locale, key: "Recent sends" })}>
      <div className="email-filters">
        <select className="jini-input" aria-label={t({ locale, key: "Outcome" })} value={controller.filter.outcome ?? ""}
          onChange={(e) => controller.setFilter({ ...controller.filter, outcome: e.target.value || undefined })}
          {...agentHandle({ handle: "email-activity-outcome" }, { role: "field", label: "Filter sends by outcome" })}>
          <option value="">{t({ locale, key: "All outcomes" })}</option>
          {OUTCOMES.map((value) => <option key={value} value={value}>{t({ locale, key: OUTCOME[value]!.label })}</option>)}
        </select>
        <input className="jini-input" type="search" aria-label={t({ locale, key: "Recipient" })} placeholder={t({ locale, key: "Search by recipient" })}
          value={controller.filter.recipient ?? ""} onChange={(e) => controller.setFilter({ ...controller.filter, recipient: e.target.value })}
          {...agentHandle({ handle: "email-activity-recipient" }, { role: "field", label: "Filter sends by recipient address" })} />
      </div>
      <Loaded view={controller.activity.view} locale={locale} retry={controller.activity.reload}>
        {(page) => (
          <>
            {page.access === "masked" ? <p className="jini-field-hint">{t({ locale, key: "Addresses are partly hidden for your role." })}</p> : null}
            {page.items.length === 0 ? (
              <p className="jini-field-hint">{t({ locale, key: page.empty === "no_matches" ? "No sends match." : "No sends recorded yet." })}</p>
            ) : (
              <ul className="email-list">{page.items.map((item, i) => <ActivityRow key={item.id ?? `${item.createdAt}-${i}`} item={item} controller={controller} locale={locale} index={i} />)}</ul>
            )}
          </>
        )}
      </Loaded>
      <LoadMore list={controller.activity} locale={locale} handle="email-activity-more" />
    </Section>
  );
}

function RemovalBody(props: { controller: EmailActivityController; locale: string }) {
  const { controller, locale } = props;
  const step = controller.removal;
  if (!step) return null;
  if (step.kind === "reason") {
    return (
      <div className="email-removal">
        <p>{t({ locale, key: "{address} won't be blocked anymore. Why?" }).replace("{address}", step.entry.address)}</p>
        <label className="jini-field-label" htmlFor="email-removal-reason">{t({ locale, key: "Reason (kept in the record)" })}</label>
        <textarea id="email-removal-reason" className="jini-input" rows={3} value={step.reason} onChange={(e) => controller.setRemovalReason(e.target.value)}
          {...agentHandle({ handle: "email-removal-reason" }, { role: "field", label: "Why this address may get email again" })} />
        {step.error ? <p className="jini-field-error" role="alert">{t({ locale, key: step.error })}</p> : null}
      </div>
    );
  }
  return (
    <div className="email-removal">
      <p>
        {t({ locale, key: "Blocked since {when} ({why})." }).replace("{when}", when(step.plan.suppressedAt, locale)).replace("{why}", t({ locale, key: SUPPRESSION_REASON[step.plan.suppressionReason] }))}
      </p>
      <ul className="email-reasons">{step.plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      <p className="jini-field-hint">{t({ locale, key: "Reason: {reason}" }).replace("{reason}", step.plan.reason)}</p>
      {step.error ? <p className="jini-field-error" role="alert">{t({ locale, key: step.error })}</p> : null}
    </div>
  );
}

function BlockedAddresses(props: { controller: EmailActivityController; locale: string }) {
  const { controller, locale } = props;
  const step = controller.removal;
  return (
    <Section id="blocked" title={t({ locale, key: "Blocked addresses" })}>
      <p className="jini-field-hint">{t({ locale, key: "Addresses that bounced, marked mail as spam, or were blocked by hand. Nothing is sent to them." })}</p>
      <input className="jini-input" type="search" aria-label={t({ locale, key: "Search blocked addresses" })} placeholder={t({ locale, key: "Search blocked addresses" })}
        value={controller.search} onChange={(e) => controller.setSearch(e.target.value)}
        {...agentHandle({ handle: "email-blocked-search" }, { role: "field", label: "Search blocked addresses" })} />
      {controller.removedNotice ? <p className="jini-field-hint" role="status">{t({ locale, key: "{address} can get email again." }).replace("{address}", controller.removedNotice)}</p> : null}
      <Loaded view={controller.suppressions.view} locale={locale} retry={controller.suppressions.reload}>
        {(page) => (page.items.length === 0 ? (
          <p className="jini-field-hint">{t({ locale, key: page.empty === "no_matches" ? "No blocked addresses match." : "No blocked addresses." })}</p>
        ) : (
          <ul className="email-list">
            {page.items.map((entry, i) => (
              <li key={`${entry.address}-${entry.scope}`} className="email-row email-blocked">
                <span className="email-activity-recipient">{entry.address}</span>
                <Chip tone={entry.reason === "manual" ? "neutral" : "warning"}>{t({ locale, key: SUPPRESSION_REASON[entry.reason] })}</Chip>
                <span className="jini-field-hint">{t({ locale, key: entry.scope === "bulk" ? "Newsletters only" : "All email" })} · {when(entry.createdAt, locale)}</span>
                <button type="button" className="btn-secondary email-push-end" onClick={() => controller.startRemoval(entry)}
                  {...agentHandle({ handle: `email-blocked-${i}-remove` }, { role: "button", label: `Unblock ${entry.address}` })}>
                  {t({ locale, key: "Unblock" })}
                </button>
              </li>
            ))}
          </ul>
        ))}
      </Loaded>
      <LoadMore list={controller.suppressions} locale={locale} handle="email-blocked-more" />
      <ConfirmDialog
        open={step !== null}
        agentHandle="email-blocked-remove"
        title={t({ locale, key: step?.kind === "confirm" ? "Unblock this address?" : "Unblock an address" })}
        body={<RemovalBody controller={controller} locale={locale} />}
        confirmLabel={t({ locale, key: step?.kind === "confirm" ? "Unblock" : "Continue" })}
        destructive={step?.kind === "confirm"}
        pending={step?.pending ?? false}
        onConfirm={() => void controller.continueRemoval()}
        onCancel={controller.cancelRemoval}
      />
    </Section>
  );
}

function FeedbackSetup(props: { controller: EmailActivityController; locale: string }) {
  const { controller, locale } = props;
  return (
    <Section id="feedback" title={t({ locale, key: "Bounce and spam reports" })}>
      <Loaded view={controller.feedback} locale={locale}>
        {(report) => (!report.available || report.providers.length === 0 ? (
          <p className="jini-field-hint">{t({ locale, key: "No active provider reports bounces here." })}</p>
        ) : (
          <ul className="email-list">
            {report.providers.map((provider) => {
              const state = FEEDBACK_STATE[provider.state];
              return (
                <li key={provider.providerId} className="email-provider">
                  <div className="email-row">
                    <strong className="email-provider-name">{provider.label}</strong>
                    <Chip tone={state.tone}>{t({ locale, key: state.label })}</Chip>
                  </div>
                  {provider.supported ? (
                    provider.webhookUrl ? (
                      <div className="email-row">
                        <span className="jini-field-label">{t({ locale, key: "Webhook URL" })}</span>
                        <code className="email-break">{provider.webhookUrl}</code>
                        <CopyButton text={provider.webhookUrl} label={t({ locale, key: "{provider} webhook URL" }).replace("{provider}", provider.label)} locale={locale} handle={`email-feedback-${provider.providerId}-copy`} />
                      </div>
                    ) : <span className="jini-field-hint">{t({ locale, key: "Verify the site's address first; the webhook URL needs it." })}</span>
                  ) : null}
                  {provider.lastVerifiedEvent ? (
                    <span className="jini-field-hint">{t({ locale, key: "Last report: {when}" }).replace("{when}", when(provider.lastVerifiedEvent.receivedAt, locale))}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ))}
      </Loaded>
    </Section>
  );
}

export function EmailActivityTab(props: { controller: EmailActivityController; locale: string }) {
  return (
    <>
      <RecentSends {...props} />
      <BlockedAddresses {...props} />
      <FeedbackSetup {...props} />
    </>
  );
}
