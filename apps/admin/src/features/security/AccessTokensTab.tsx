import { forwardRef, useRef, type RefObject } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { formatTimestamp } from "../../lib/format-timestamp";
import { pickPlural } from "../../lib/template-i18n";
import type { Translate } from "../../lib/dictionary-translator";
import { removeDialogBody, removeDialogLastRowNote, removeDialogTitle } from "./security-i18n";
import {
  accessTokenProviderInfo,
  accessTokenProviderMatchesQuery,
  accessTokenReplaceReadyToSave,
  accessTokenRowReadyToSave,
  type AccessTokenFormFields,
  type AccessTokenProviderInfo,
  type AccessTokenProviderRef,
  type AccessTokenRow,
} from "./rules";
import { ConnectedMarkIcon, DisclosureChevronIcon, SearchIcon } from "./security-visuals";
import { useWiredAccessTokens } from "./hooks/use-access-tokens.hooks";
import type {
  AccessTokenAddFormState,
  AccessTokenExistingRowState,
  AccessTokenProviderGroupState,
  AccessTokensController,
} from "./hooks/use-access-tokens.hooks";

/**
 * @file The Access Tokens tab — `Security.tsx`'s one tab and this feature's actual content. Seven
 * always-visible provider groups (`ACCESS_TOKEN_PROVIDERS` order: GitHub Pages, Vercel, Netlify,
 * Cloudflare Pages, GitHub, GitLab, Bitbucket), each holding zero or more NAMED saved tokens — the
 * genuinely new capability this page adds (see `Security.tsx`'s own header for why "Create" living
 * here is not a repeat of what Static Site/Source Control already do).
 *
 * ## Search
 *
 * Matches a provider's brand label, its purpose subtitle ("Publishing"/"Source Control" — the
 * disambiguation `rules.ts`'s header calls "the two-store GitHub trap"), and a saved token's own
 * name. A group renders when EITHER its own provider info matches the query OR it has at least one
 * matching saved row — so typing "GitHub" surfaces both the GitHub Pages group (provider match) and
 * the GitHub · Source Control group (provider match), each rendering its own real rows, never merged
 * into one card.
 *
 * ## Component split
 *
 * Per-scope ESLint complexity gate (hard 9/9 cyclomatic/cognitive) — same "extract, don't inline"
 * discipline `ProvidersTab.tsx`/`StaticSiteTab.tsx` already use for the identical reason.
 */

export interface AccessTokensTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app. */
  useAccessTokensHook?: typeof useWiredAccessTokens;
}

function resolveAccessTokensHook(override: typeof useWiredAccessTokens | undefined): typeof useWiredAccessTokens {
  return override ?? useWiredAccessTokens;
}

export function AccessTokensTab(props: AccessTokensTabProps) {
  useAdminLocale();
  const useAccessTokensHook = resolveAccessTokensHook(props.useAccessTokensHook);
  const controller = useAccessTokensHook();

  return (
    <div
      className="access-tokens-tab"
      {...agentHandle("security-access-tokens", {
        role: "region",
        label: "Every saved access token across GitHub, Vercel, Netlify, Cloudflare Pages, GitLab, and Bitbucket, searchable by provider or name",
      })}
    >
      <AccessTokensBody controller={controller} />
    </div>
  );
}

/** Loading/error/populated split — pulled out of {@link AccessTokensTab} purely for the complexity
 *  gate, same reasoning `SourceControlCredentialsList` documents in `ProvidersTab.tsx`. */
function AccessTokensBody({ controller }: { controller: AccessTokensController }) {
  if (controller.loadError) {
    return (
      <p className="notice error" role="status" {...agentHandle("security-access-tokens-load-error", { role: "status", label: "Shows the error when saved access tokens could not be loaded" })}>
        {controller.loadError}
      </p>
    );
  }
  if (controller.groups === undefined) {
    return <p className="access-tokens-loading">{controller.t("Loading access tokens…")}</p>;
  }
  return (
    <>
      <AccessTokensSearch controller={controller} />
      <PartialInventoryNotice controller={controller} />
      <div className="access-tokens-tier">
        {controller.groups.map((group) => (
          <MaybeProviderGroup key={`${group.info.kind}:${group.info.providerId}`} group={group} controller={controller} query={controller.query} />
        ))}
      </div>
    </>
  );
}

/** Renders {@link ProviderGroup} only when this group is a search match — a provider's OWN
 *  info matching (found by name even with zero saved rows) OR at least one already-filtered row
 *  present (`use-access-tokens.hooks.ts` already filters `group.rows` by the query). Split out purely
 *  for the complexity gate. */
function MaybeProviderGroup({ group, controller, query }: { group: AccessTokenProviderGroupState; controller: AccessTokensController; query: string }) {
  const visible = accessTokenProviderMatchesQuery(group.info, query) || group.rows.length > 0;
  if (!visible) return null;
  return <ProviderGroup group={group} controller={controller} />;
}

function AccessTokensSearch({ controller }: { controller: AccessTokensController }) {
  const translate = controller.t;
  const tokenWord = pickPlural(controller.totalCount, { one: translate("token"), other: translate("tokens") });
  const countText =
    controller.query.trim() === ""
      ? `${controller.totalCount} ${tokenWord} ${translate("saved")}`
      : `${controller.matchCount} ${translate("of")} ${controller.totalCount} ${tokenWord} ${translate("matching")} “${controller.query}”`;
  return (
    <div className="access-tokens-search">
      <label className="visually-hidden" htmlFor="access-tokens-search">
        {translate("Search access tokens")}
      </label>
      <span className="access-tokens-search-icon">
        <SearchIcon />
      </span>
      <input
        id="access-tokens-search"
        className="access-tokens-search-input"
        type="search"
        value={controller.query}
        onChange={(e) => controller.setQuery(e.target.value)}
        placeholder={translate("Search by provider, name, or purpose")}
        {...agentHandle("security-access-tokens-search", { role: "field", label: "Search saved access tokens by provider, name, or purpose" })}
      />
      <p className="access-tokens-search-count" role="status" aria-live="polite">
        {countText}
      </p>
    </div>
  );
}

/** The disclosure banner naming which of the eight credential stores this page does not yet read
 *  from — `rules.ts`'s `OTHER_CREDENTIAL_STORES`, `development/todos.md:1208`'s own "confront or
 *  disclose partial" requirement. Always rendered in v1 (Tier 2 reads are not wired at all yet — see
 *  `Security.tsx`'s header); a future pass that starts reading some of those stores shrinks
 *  `missingStores` and this banner's own text follows automatically. */
function PartialInventoryNotice({ controller }: { controller: AccessTokensController }) {
  if (controller.missingStores.length === 0) return null;
  const names = controller.missingStores.map((store) => `${store.label} (${store.screenLabel})`).join(", ");
  return (
    <p
      className="notice warning"
      role="status"
      {...agentHandle("security-partial-inventory-notice", {
        role: "status",
        label: "States which credential stores this page does not yet read from",
      })}
    >
      {controller.t("This page shows GitHub, Vercel, Netlify, Cloudflare Pages, GitLab, and Bitbucket tokens.")} {controller.t("Not shown yet:")} {names}.
    </p>
  );
}

function providerGroupHandleLabel(info: AccessTokenProviderInfo, connectedCount: number): string {
  return `${info.label}'s saved access tokens — ${connectedCount} connected`;
}

function ProviderGroup({ group, controller }: { group: AccessTokenProviderGroupState; controller: AccessTokensController }) {
  const ref: AccessTokenProviderRef = { kind: group.info.kind, providerId: group.info.providerId };
  const hasRows = group.rows.length > 0;
  return (
    <section
      className="access-tokens-provider-group"
      {...agentHandle(`security-access-tokens-group-${group.info.kind}-${group.info.providerId}`, {
        role: "region",
        label: providerGroupHandleLabel(group.info, group.rows.length),
      })}
    >
      <h3 className="access-tokens-provider-heading">
        <span translate="no">{group.info.label}</span>
        <span className="access-tokens-provider-purpose"> · {controller.t(group.info.purposeLabel)}</span>
      </h3>
      {group.rows.map((row) => (
        <TokenRow key={row.row.id} state={row} controller={controller} groupRowCount={group.rows.length} t={controller.t} />
      ))}
      {!hasRows && !group.addForm.visible ? <NotConnectedRow ref={ref} label={group.info.label} onConnect={() => controller.openAddForm(ref)} t={controller.t} /> : null}
      {group.addForm.visible ? <AddTokenForm info={group.info} state={group.addForm} controller={controller} t={controller.t} /> : null}
      {hasRows && !group.addForm.visible ? <AddAnotherButton ref={ref} label={group.info.label} controller={controller} t={controller.t} /> : null}
    </section>
  );
}

function AddAnotherButton({ ref, label, controller, t: translate }: { ref: AccessTokenProviderRef; label: string; controller: AccessTokensController; t: Translate }) {
  return (
    <button
      type="button"
      className="link-button access-tokens-add-another"
      onClick={() => controller.openAddForm(ref)}
      {...agentHandle(`security-access-tokens-add-${ref.kind}-${ref.providerId}`, { role: "button", label: `Add another ${label} token` })}
    >
      {translate("Add another")} <span translate="no">{label}</span> {translate("token")}
    </button>
  );
}

function NotConnectedRow({ ref, label, onConnect, t: translate }: { ref: AccessTokenProviderRef; label: string; onConnect: () => void; t: Translate }) {
  return (
    <div className="access-tokens-row">
      <div className="access-tokens-row-summary">
        <span className="access-tokens-row-marker" aria-hidden="true" />
        <span className="access-tokens-row-name">{translate("Not connected")}</span>
        <button
          type="button"
          className="access-tokens-row-summary-expand"
          onClick={onConnect}
          // Handle built from `ref.kind`/`ref.providerId` (already lowercase, hyphen-safe — every
          // `AccessTokenProviderRef` in this app comes straight off `ACCESS_TOKEN_PROVIDERS`), never
          // from `label` — `agentHandle()` rejects any handle that isn't lowercase words joined by
          // single hyphens, and a proper-noun label like "GitHub Pages" (capitals, a space) throws
          // at render time. Caught live: an uncaught throw here unmounted this whole row with no
          // error boundary above it, which is worse than a defensive check — a crash, not a fallback.
          {...agentHandle(`security-access-tokens-connect-${ref.kind}-${ref.providerId}`, { role: "button", label: `Connect ${label}` })}
        >
          {translate("Connect")}
        </button>
      </div>
    </div>
  );
}

function tokenRowHandleLabel(name: string, providerLabel: string): string {
  return `${name} — ${providerLabel}, connected`;
}

function TokenRow({ state, controller, groupRowCount, t: translate }: { state: AccessTokenExistingRowState; controller: AccessTokensController; groupRowCount: number; t: Translate }) {
  const info = accessTokenProviderInfo(state.row);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const showDefaultUi = groupRowCount >= 2;
  return (
    <details
      className="access-tokens-row access-tokens-row-done"
      {...agentHandle(`security-access-tokens-row-${state.row.kind}-${state.row.providerId}-${state.row.id}`, {
        role: "region",
        label: tokenRowHandleLabel(state.name, info.label),
      })}
    >
      <summary className="access-tokens-row-summary">
        <span className="access-tokens-row-marker access-tokens-row-marker-done" aria-hidden="true">
          <ConnectedMarkIcon />
        </span>
        <span className="access-tokens-row-name">{state.name}</span>
        <TokenRowDefaultIndicator state={state} showDefaultUi={showDefaultUi} controller={controller} t={translate} />
        <span className="access-tokens-row-summary-meta">
          {translate("saved")} {formatTimestamp(state.row.updatedAt)}
        </span>
        <span className="access-tokens-row-summary-expand">
          {translate("Replace token")}
          <DisclosureChevronIcon />
        </span>
      </summary>
      <ExistingTokenFields state={state} controller={controller} info={info} onRemoveClick={() => dialogRef.current?.showModal()} t={translate} />
      <RemoveConfirmDialog ref={dialogRef} row={state.row} info={info} controller={controller} isLastForProvider={groupRowCount === 1} t={translate} />
    </details>
  );
}

/** The `isDefault` indicator + `Make default` link — only shown once a provider has 2+ saved
 *  tokens (`rules.ts`'s own doc on why a lone row has nothing to choose between). Split out purely
 *  for the complexity gate. */
function TokenRowDefaultIndicator({ state, showDefaultUi, controller, t: translate }: { state: AccessTokenExistingRowState; showDefaultUi: boolean; controller: AccessTokensController; t: Translate }) {
  if (!showDefaultUi) return null;
  if (state.row.isDefault) return <span className="status status-neutral">{translate("Default")}</span>;
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => void controller.makeDefault(state.row)}
      {...agentHandle(`security-access-tokens-default-${state.row.id}`, { role: "button", label: `Make ${state.name} the default token` })}
    >
      {translate("Make default")}
    </button>
  );
}

/** Shared input markup for BOTH the "add a new token" form and an existing row's "replace" fields —
 *  same split `PublishCredentialFields`/`SourceControlCredentialFields` use for the identical
 *  connected/not-connected duality. Every hint renders below its input as `.field-hint`, never as
 *  placeholder text — same "placeholder-as-label reads as a saved value" defect this app has already
 *  fixed twice (`ProvidersTab.tsx`'s own header). */
function TokenInputFields({
  idPrefix,
  info,
  name,
  token,
  accountId,
  username,
  onNameChange,
  onTokenChange,
  onAccountIdChange,
  onUsernameChange,
  connected,
  t: translate,
}: {
  idPrefix: string;
  info: AccessTokenProviderInfo;
  name: string;
  token: string;
  accountId: string;
  username: string;
  onNameChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onAccountIdChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  connected: boolean;
  t: Translate;
}) {
  const needsAccountId = info.requiredFields.includes("accountId");
  const needsUsername = info.requiredFields.includes("username");
  return (
    <div className="access-tokens-row-fields">
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-name`}>
          {translate("Name")}
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          {...agentHandle(`${idPrefix}-name`, { role: "field", label: "This token's display name" })}
        />
        <p className="field-hint">{translate("A short label so you can tell this token apart from others for the same provider.")}</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-token`}>
          {translate("Access token")}
        </label>
        <input id={`${idPrefix}-token`} type="password" autoComplete="off" value={token} onChange={(e) => onTokenChange(e.target.value)} />
        <p className="field-hint">
          {connected ? translate("Leave blank to keep the current token.") : translate("Stored encrypted on the server. Once saved, Tovu never displays it again.")}
        </p>
        <details className="access-tokens-scope-guidance">
          <summary className="access-tokens-scope-guidance-summary">
            {translate("Which token do I need?")}
            <DisclosureChevronIcon size={10} />
          </summary>
          <p className="field-hint">
            {translate(info.scopeGuidanceKey)}{" "}
            <a href={info.tokenPageUrl} target="_blank" rel="noreferrer">
              {translate("Create a token")}
            </a>
          </p>
        </details>
      </div>
      {needsAccountId ? (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-account`}>
            {translate("Account ID")}
          </label>
          <input id={`${idPrefix}-account`} type="text" value={accountId} onChange={(e) => onAccountIdChange(e.target.value)} />
          <p className="field-hint">{translate("Shown on your Cloudflare dashboard's own sidebar — Cloudflare cannot resolve a project without it.")}</p>
        </div>
      ) : null}
      {needsUsername ? (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-username`}>
            {translate("Username")}
          </label>
          <input id={`${idPrefix}-username`} type="text" value={username} onChange={(e) => onUsernameChange(e.target.value)} />
          <p className="field-hint">{translate("The Bitbucket username this API token belongs to.")}</p>
        </div>
      ) : null}
    </div>
  );
}

function ExistingTokenFields({
  state,
  controller,
  info,
  onRemoveClick,
  t: translate,
}: {
  state: AccessTokenExistingRowState;
  controller: AccessTokensController;
  info: AccessTokenProviderInfo;
  onRemoveClick: () => void;
  t: Translate;
}) {
  const fields: AccessTokenFormFields = {
    ref: { kind: state.row.kind, providerId: state.row.providerId },
    name: state.name,
    token: state.token,
    accountId: state.accountId,
    username: state.username,
  };
  const readyToSave = accessTokenReplaceReadyToSave(fields, state.row.name);
  return (
    <>
      <TokenInputFields
        idPrefix={`security-existing-${state.row.id}`}
        info={info}
        name={state.name}
        token={state.token}
        accountId={state.accountId}
        username={state.username}
        onNameChange={(v) => controller.setExistingField(state.row.id, { name: v })}
        onTokenChange={(v) => controller.setExistingField(state.row.id, { token: v })}
        onAccountIdChange={(v) => controller.setExistingField(state.row.id, { accountId: v })}
        onUsernameChange={(v) => controller.setExistingField(state.row.id, { username: v })}
        connected
        t={translate}
      />
      <div className="access-tokens-row-actions">
        <button
          type="button"
          disabled={!readyToSave || state.saving}
          onClick={() => void controller.replaceToken(state.row)}
          {...agentHandle(`security-access-tokens-save-${state.row.id}`, { role: "button", label: `Save this ${info.label} token` })}
        >
          {state.saving ? translate("Saving…") : translate("Save")}
        </button>
        <button type="button" className="btn-danger" onClick={onRemoveClick}>
          {translate("Remove from Tovu")}
        </button>
        {state.error ? (
          <p className="save-error" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    </>
  );
}

function AddTokenForm({ info, state, controller, t: translate }: { info: AccessTokenProviderInfo; state: AccessTokenAddFormState; controller: AccessTokensController; t: Translate }) {
  const ref: AccessTokenProviderRef = { kind: info.kind, providerId: info.providerId };
  const fields: AccessTokenFormFields = { ref, name: state.name, token: state.token, accountId: state.accountId, username: state.username };
  const readyToSave = accessTokenRowReadyToSave(fields);
  return (
    <div className="access-tokens-row">
      <TokenInputFields
        idPrefix={`security-add-${info.kind}-${info.providerId}`}
        info={info}
        name={state.name}
        token={state.token}
        accountId={state.accountId}
        username={state.username}
        onNameChange={(v) => controller.setAddField(ref, { name: v })}
        onTokenChange={(v) => controller.setAddField(ref, { token: v })}
        onAccountIdChange={(v) => controller.setAddField(ref, { accountId: v })}
        onUsernameChange={(v) => controller.setAddField(ref, { username: v })}
        connected={false}
        t={translate}
      />
      <div className="access-tokens-row-actions">
        <button
          type="button"
          disabled={!readyToSave || state.saving}
          onClick={() => void controller.createToken(ref)}
          {...agentHandle(`security-access-tokens-create-${info.kind}-${info.providerId}`, { role: "button", label: `Save this ${info.label} token` })}
        >
          {state.saving ? translate("Saving…") : translate("Save")}
        </button>
        <button type="button" className="link-button" onClick={() => controller.closeAddForm(ref)}>
          {translate("Cancel")}
        </button>
        {state.error ? (
          <p className="save-error" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Native `<dialog>` confirm — same `.confirm-dialog` foundation `styles.css:2880` documents (`[open]`-
 * scoped `display`, never a bare-class rule — that comment's own header records the live bug an
 * unscoped rule caused). "Remove from Tovu," never "Revoke" — `rules.ts`'s own header, this page's
 * one load-bearing copy constraint: deleting Tovu's row does not revoke the credential at the
 * provider, and this dialog is the one place that fact has to be stated in words, not implied by a
 * button label.
 *
 * Confirm button carries no `agentHandle` — destructive, same boundary
 * `StaticSiteTab.tsx`'s own credential-entry fields already draw (no agent read/act surface over a
 * credential action); the row's own SUMMARY stays tagged (`TokenRow`'s `agentHandle`), only this
 * dialog's destructive action does not.
 */
const RemoveConfirmDialog = forwardRef<HTMLDialogElement, { row: AccessTokenRow; info: AccessTokenProviderInfo; controller: AccessTokensController; isLastForProvider: boolean; t: Translate }>(
  function RemoveConfirmDialog({ row, info, controller, isLastForProvider, t: translate }, ref) {
    const locale = useAdminLocale();
    function close() {
      (ref as RefObject<HTMLDialogElement>).current?.close();
    }
    function confirm() {
      close();
      void controller.removeToken(row);
    }
    return (
      <dialog ref={ref} className="confirm-dialog">
        <h2>{removeDialogTitle(locale, row.name)}</h2>
        <p className="confirm-dialog-body">{removeDialogBody(locale, info.label)}</p>
        <p>
          <a href={info.tokenPageUrl} target="_blank" rel="noreferrer">
            {translate("Revoke it on")} <span translate="no">{info.label}</span> ↗
          </a>
        </p>
        {isLastForProvider ? <p className="confirm-dialog-body">{removeDialogLastRowNote(locale, info.label)}</p> : null}
        <div className="confirm-dialog-actions">
          <button type="button" onClick={close}>
            {translate("Cancel")}
          </button>
          <button type="button" className="btn-danger" onClick={confirm}>
            {translate("Remove from Tovu")}
          </button>
        </div>
      </dialog>
    );
  }
);
