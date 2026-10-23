import { ConfirmDialog } from "@jini-ai/admin/react";
import { agentHandle, agentHandleSegment } from "@jini-ai/agentic";

import type { AdminMailStatus } from "../../lib/api";
import { agentPluginDisplayName } from "../plugins/rules";
import { t } from "./email-i18n";
import type { MailProviderConfiguration, MailProviderField } from "./email-api";
import { Chip, Loaded, Section, Segments, when, type Tone } from "./EmailParts";
import { isFullyActive, type EmailProviderController } from "./hooks/use-email-provider.hooks";

/**
 * @file One provider card at a time (owner, 2026-10-22: every card stacked was too much).
 * Drafts survive URL segment changes. Save key does not switch delivery; Use this provider
 * switches both lanes after confirmation. No vendor branches: labels, fields and help links
 * all come from the provider's data. Unknown links fall back to the active, then first provider.
 * `_add-provider` lists disabled email plugins and enables through the Plugins API.
 * `_capabilities` is the final segment and shows the existing lane readiness rows.
 */

const LANE_STATE: Record<string, { tone: Tone; label: string }> = {
  ready: { tone: "ok", label: "Ready" },
  unconfigured: { tone: "warning", label: "Not set" },
  unknown_provider: { tone: "warning", label: "Not set" },
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

export const ADD_PROVIDER_PART = "_add-provider";
export const CAPABILITIES_PART = "_capabilities";

function AddProvider(props: { controller: EmailProviderController; locale: string; onSelect?: ((id: string) => void) | undefined }) {
  const { controller, locale } = props;
  const select = (id: string | undefined) => { if (id) props.onSelect?.(id); };
  return (
    <>
      {controller.addError ? <div className="email-row" role="alert">
        <span className="jini-field-error">{t({ locale, key: controller.addError })}</span>
        <button type="button" className="btn-secondary" disabled={controller.adding !== null} onClick={() => void controller.retryAdd().then(select)}
          {...agentHandle({ handle: "email-add-provider-retry" }, { role: "button", label: "Retry adding an email provider" })}>{t({ locale, key: "Retry" })}</button>
      </div> : null}
      {controller.choices === null && !controller.addError ? <p className="jini-field-hint" role="status">{t({ locale, key: "Loading…" })}</p> : (
        <ul className="email-list">
          {controller.choices?.map((plugin) => <li key={plugin.pluginId} className="email-row">
            <span className="email-provider-name">{agentPluginDisplayName(plugin)}</span>
            <span className="jini-field-hint">{plugin.summary ?? plugin.description}</span>
            <button type="button" disabled={controller.adding !== null} onClick={() => void controller.addProvider({ pluginId: plugin.pluginId }).then(select)}
              {...agentHandle({ handle: `email-add-provider-${plugin.pluginId}` }, { role: "button", label: `Add ${agentPluginDisplayName(plugin)} as an email provider` })}>
              {t({ locale, key: controller.adding === plugin.pluginId ? "Adding…" : "Add" })}
            </button>
          </li>)}
          {controller.choices?.length === 0 && !controller.addError ? <li className="jini-field-hint">{t({ locale, key: "No more email providers to add." })}</li> : null}
        </ul>
      )}
    </>
  );
}

function ProviderCards(props: { providers: readonly MailProviderConfiguration[]; controller: EmailProviderController; status: AdminMailStatus | null; locale: string; selectedId?: string | null | undefined; onSelect?: ((id: string) => void) | undefined }) {
  const { providers, controller, locale } = props;
  const shownId = props.selectedId === ADD_PROVIDER_PART || props.selectedId === CAPABILITIES_PART ? props.selectedId : shownProviderId(providers, props.selectedId) ?? ADD_PROVIDER_PART;
  const items = [...providers.map((p) => ({ key: p.id, label: segmentLabel(p.label) })),
    { key: ADD_PROVIDER_PART, label: t({ locale, key: "+ Add provider" }) }, { key: CAPABILITIES_PART, label: t({ locale, key: "Capabilities" }) }];
  return (
    <>
      <Segments name="email-provider-pick" label={t({ locale, key: "Provider" })} active={shownId} onSelect={(id) => props.onSelect?.(id)} items={items} />
      {shownId === CAPABILITIES_PART ? <Lanes status={props.status} providers={providers} locale={locale} /> : null}
      {shownId === ADD_PROVIDER_PART ? <AddProvider controller={controller} locale={locale} onSelect={props.onSelect} /> : null}
      <ul className="email-list email-providers">
        {providers.filter((p) => p.id === shownId).map((provider) => <ProviderCard key={provider.id} provider={provider} controller={controller} locale={locale} />)}
      </ul>
    </>
  );
}

export function EmailProviderTab(props: { controller: EmailProviderController; status: AdminMailStatus | null; locale: string; selectedId?: string | null | undefined; onSelect?: ((id: string) => void) | undefined }) {
  const { controller, locale } = props;
  const pending = controller.pendingSwitch;
  return (
    <Section id="provider" title={t({ locale, key: "Provider" })} hideTitle>
      {controller.addWarning ? <p className="jini-field-hint" role="status">{controller.addWarning}</p> : null}
      <Loaded view={controller.view} locale={locale} retry={controller.reload}>
        {(report) => (
          <>
            <ProviderCards providers={report.providers} controller={controller} status={props.status} locale={locale} selectedId={props.selectedId} onSelect={props.onSelect} />
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
