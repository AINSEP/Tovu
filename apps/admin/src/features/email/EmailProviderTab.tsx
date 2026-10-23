import { ConfirmDialog } from "@jini-ai/admin/react";
import { agentHandle, agentHandleSegment } from "@jini-ai/agentic";

import type { AdminMailStatus } from "../../lib/api";
import { adminHref } from "../../lib/router";
import { t } from "./email-i18n";
import type { MailProviderConfiguration, MailProviderField } from "./email-api";
import { Chip, Loaded, Section, Segments, when, type Tone } from "./EmailParts";
import { isFullyActive, type EmailProviderController } from "./hooks/use-email-provider.hooks";

/**
 * @file The Provider tab: what sends each lane now (from the status read), then one card per
 * installed provider with its own declared key fields, **Save key** (saves or replaces the key,
 * does not switch) and **Use this provider** (switches both lanes, after a confirmation that says
 * so). No vendor branches: labels, fields and help links all come from the provider's data.
 *
 * With more than one provider, a segmented pill (one segment per installed provider, from the
 * same list) shows one card at a time (owner, 2026-10-22: every card stacked was too much). The
 * page keeps the choice in `?p=<provider id>`; with none, or an id no longer installed, the
 * active provider's card shows.
 */

const LANE_STATE: Record<string, { tone: Tone; label: string }> = {
  ready: { tone: "ok", label: "Ready" },
  unconfigured: { tone: "warning", label: "Not set up" },
  unknown_provider: { tone: "warning", label: "Not installed" },
  missing_credential: { tone: "warning", label: "Key not saved" },
  local_only: { tone: "neutral", label: "No external delivery" },
};

const LANE_LABEL = { transactional: "Transactional mail", bulk: "Bulk mail" } as const;

function Lanes(props: { status: AdminMailStatus | null; providers: readonly MailProviderConfiguration[]; locale: string }) {
  const { status, locale } = props;
  const lanes = status?.lanes ?? [];
  if (lanes.length === 0) return null;
  const label = (id: string | null) => (id === null ? t({ locale, key: "None" }) : props.providers.find((p) => p.id === id)?.label ?? id);
  return (
    <dl className="email-facts">
      {lanes.map((lane) => {
        const state = LANE_STATE[lane.state] ?? { tone: "neutral" as const, label: lane.state };
        return (
          <div key={lane.lane} className="email-fact">
            <dt className="jini-field-label">{t({ locale, key: LANE_LABEL[lane.lane] })}</dt>
            <dd>
              <span className="jini-field-hint">{label(lane.providerId)}</span>
              <Chip tone={state.tone}>{t({ locale, key: state.label })}</Chip>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The input type for a declared field; a secret shows as text only while revealed. Pure. */
function inputType(field: MailProviderField, shown: boolean): string {
  if (field.type === "secret") return shown ? "text" : "password";
  return field.type === "text" ? "text" : field.type;
}

function KeyField(props: { provider: MailProviderConfiguration; field: MailProviderField; controller: EmailProviderController; locale: string }) {
  const { provider, field, controller, locale } = props;
  const key = field.key as "token" | "username" | "baseUrl";
  const id = `email-provider-${provider.id}-${field.key}`;
  const secret = field.type === "secret";
  const shown = controller.revealed[provider.id] === true;
  const replacing = secret && provider.credential.saved;
  const placeholder = replacing ? t({ locale, key: "Saved — enter a new key to replace it" }) : field.placeholder ?? field.defaultValue;
  return (
    <div className="jini-field email-field">
      <label className="jini-field-label" htmlFor={id}>{field.label}</label>
      <div className="email-input-row">
        <input
          id={id}
          className="jini-input"
          type={inputType(field, shown)}
          // `new-password`, not `off`, on the key: Chrome ignores `off` and silently filled the admin
          // sign-in into these fields (see `security/AccessTokensTab.tsx`'s token input).
          autoComplete={secret ? "new-password" : "off"}
          spellCheck={false}
          value={controller.drafts[provider.id]?.[key] ?? ""}
          placeholder={placeholder}
          onChange={(event) => controller.setDraftField(provider.id, key, event.target.value)}
          {...agentHandle({ handle: `email-provider-${provider.id}-${agentHandleSegment({ value: field.key })}` }, { role: "field", label: `${provider.label} ${field.label}` })}
        />
        {secret ? (
          <button type="button" className="btn-secondary" aria-pressed={shown} onClick={() => controller.toggleReveal(provider.id)}>
            {t({ locale, key: shown ? "Hide" : "Show" })}
          </button>
        ) : null}
      </div>
      {field.help ? <span className="jini-field-hint">{field.help}</span> : null}
    </div>
  );
}

type CardProps = { provider: MailProviderConfiguration; controller: EmailProviderController; locale: string };

function ProviderChips({ provider, locale }: CardProps) {
  const active = provider.lanes.length > 0;
  const saved = provider.credential.saved;
  return (
    <div className="email-row">
      <strong className="email-provider-name">{provider.label}</strong>
      {active ? <Chip tone="ok">{t({ locale, key: isFullyActive(provider) ? "Active" : "Active for one lane" })}</Chip> : null}
      {provider.credential.required ? <Chip tone={saved ? "ok" : "warning"}>{t({ locale, key: saved ? "Key saved" : "Key not saved" })}</Chip> : null}
      {provider.hosted ? null : <Chip tone="neutral">{t({ locale, key: "Local only" })}</Chip>}
    </div>
  );
}

function ProviderKeyForm({ provider, controller, locale }: CardProps) {
  const fields = provider.credential.required ? provider.setup.fields : [];
  if (fields.length === 0) return null;
  const updatedAt = provider.credential.saved ? provider.credential.updatedAt : undefined;
  return (
    <form className="email-provider-form" onSubmit={(event) => { event.preventDefault(); void controller.saveKey(provider); }}>
      {updatedAt ? <span className="jini-field-hint">{t({ locale, key: "Key updated {when}" }).replace("{when}", when(updatedAt, locale))}</span> : null}
      {fields.map((field) => <KeyField key={field.key} provider={provider} field={field} controller={controller} locale={locale} />)}
      <div className="email-row">
        <button type="submit" className="btn-secondary" disabled={controller.busyId === provider.id}
          {...agentHandle({ handle: `email-provider-${provider.id}-save` }, { role: "button", label: `Save the ${provider.label} key` })}>
          {t({ locale, key: provider.credential.saved ? "Replace key" : "Save key" })}
        </button>
        {provider.setup.helpUrl ? <a href={provider.setup.helpUrl} target="_blank" rel="noreferrer">{t({ locale, key: "Where do I get a key?" })}</a> : null}
      </div>
    </form>
  );
}

function ProviderSwitch({ provider, controller, locale }: CardProps) {
  if (isFullyActive(provider)) return null;
  return (
    <>
      {/* MOVE: Credential presence is structured state; refusal text contains server internals. */}
      {provider.selectable || !provider.refusal ? null : <span className="jini-field-hint">{t({ locale, key: provider.credential.required && !provider.credential.saved ? "Add this provider's key first." : "Not set up" })}</span>}
      <div className="email-row">
        <button type="button" disabled={controller.busyId === provider.id || !provider.selectable} onClick={() => controller.askSwitch(provider)}
          {...agentHandle({ handle: `email-provider-${provider.id}-use` }, { role: "button", label: `Send all mail with ${provider.label}` })}>
          {t({ locale, key: "Use this provider" })}
        </button>
      </div>
    </>
  );
}

function ProviderNoticeLine({ provider, controller, locale }: CardProps) {
  const notice = controller.notice;
  if (notice?.providerId !== provider.id) return null;
  const error = notice.tone === "error";
  return <p className={error ? "jini-field-error" : "jini-field-hint"} role={error ? "alert" : "status"}>{t({ locale, key: notice.text })}</p>;
}

function ProviderCard(props: CardProps) {
  return (
    <li className="email-provider" {...agentHandle({ handle: `email-provider-${props.provider.id}` }, { role: "region", label: `Mail provider ${props.provider.label}` })}>
      <ProviderChips {...props} />
      <ProviderKeyForm {...props} />
      <ProviderSwitch {...props} />
      <ProviderNoticeLine {...props} />
    </li>
  );
}

/**
 * The card to show: `selectedId` when installed, else the provider sending all mail, else one
 * sending some, else the first. Pure.
 */
export function shownProviderId(providers: readonly MailProviderConfiguration[], selectedId: string | null | undefined): string | undefined {
  const pick = providers.find((p) => p.id === selectedId) ?? providers.find(isFullyActive) ?? providers.find((p) => p.lanes.length > 0) ?? providers[0];
  return pick?.id;
}

/**
 * A segment's name: the provider's label without a trailing "(…)" aside — "Console (local
 * development, sends nothing)" reads as "Console"; the card keeps the full label. Pure.
 */
export function segmentLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, "") || label;
}

function ProviderCards(props: { providers: readonly MailProviderConfiguration[]; controller: EmailProviderController; locale: string; selectedId?: string | null | undefined; onSelect?: ((id: string) => void) | undefined }) {
  const { providers, controller, locale } = props;
  const shownId = shownProviderId(providers, props.selectedId);
  const shown = providers.length > 1 ? providers.filter((p) => p.id === shownId) : providers;
  return (
    <>
      {providers.length > 1 ? (
        <Segments name="email-provider-pick" label={t({ locale, key: "Provider" })} active={shownId ?? ""} onSelect={(id) => props.onSelect?.(id)}
          items={providers.map((p) => ({ key: p.id, label: segmentLabel(p.label) }))} />
      ) : null}
      <ul className="email-list email-providers">
        {shown.map((provider) => <ProviderCard key={provider.id} provider={provider} controller={controller} locale={locale} />)}
      </ul>
    </>
  );
}

export function EmailProviderTab(props: { controller: EmailProviderController; status: AdminMailStatus | null; locale: string; selectedId?: string | null | undefined; onSelect?: ((id: string) => void) | undefined }) {
  const { controller, locale } = props;
  const pending = controller.pendingSwitch;
  return (
    <Section id="provider" title={t({ locale, key: "Provider" })} hideTitle>
      <Loaded view={controller.view} locale={locale} retry={controller.reload}>
        {(report) => (
          <>
            <Lanes status={props.status} providers={report.providers} locale={locale} />
            {report.providers.length === 0 ? (
              <p className="jini-field-hint">
                {t({ locale, key: "No mail providers are installed." })}{" "}
                <a href={adminHref("/agent-plugins")}>{t({ locale, key: "Manage agent plugins" })}</a>
              </p>
            ) : (
              <ProviderCards providers={report.providers} controller={controller} locale={locale} selectedId={props.selectedId} onSelect={props.onSelect} />
            )}
            {report.refusals.length > 0 ? (
              <>
                <h3 className="jini-field-label email-subhead">{t({ locale, key: "Not loaded" })}</h3>
                <ul className="email-list">
                  {report.refusals.map((reason) => <li key={reason} className="jini-field-hint">{reason}</li>)}
                </ul>
              </>
            ) : null}
          </>
        )}
      </Loaded>
      <ConfirmDialog
        open={pending !== null}
        agentHandle="email-provider-switch"
        title={t({ locale, key: "Switch email provider?" })}
        body={<p>{t({ locale, key: "All email — sign-in links, confirmations, notifications and newsletters — will send with {provider}." }).replace("{provider}", pending?.label ?? "")}</p>}
        confirmLabel={t({ locale, key: "Switch" })}
        pending={pending !== null && controller.busyId === pending.id}
        onConfirm={() => void controller.confirmSwitch()}
        onCancel={() => controller.askSwitch(null)}
      />
    </Section>
  );
}
