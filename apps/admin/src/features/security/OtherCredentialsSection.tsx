import { forwardRef, useRef, type RefObject } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { Translate } from "../../lib/dictionary-translator";
import { otherCredentialMatchesQuery, type OtherCredentialStoreInfo } from "./rules";
import { removeDialogBody, removeDialogTitle } from "./security-i18n";
import { DisclosureChevronIcon } from "./security-visuals";
import type { OtherCredentialGroupState, OtherCredentialRowState, OtherCredentialsController } from "./hooks/use-other-credentials.hooks";

/**
 * `agentHandle()` throws on anything that isn't lowercase words joined by single hyphens
 * (`@jini-ai/agentic`'s own `HANDLE_PATTERN`, `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — no underscores, no
 * colons, no spaces). Tier 1's providers are all drawn from this app's own fixed tables, so every
 * id there is already handle-safe by construction. Tier 2's per-item ids are NOT: `media-provider`'s
 * ids come from a vendor catalog, and `composio-connector`'s come straight from Composio's own live
 * connector list — this app does not own either spelling, and Composio in particular is known to use
 * underscores (`google_calendar`-shaped ids). The predecessor already caught the identical class of
 * bug once, for a raw provider LABEL fed into a Tier-1 handle (`AccessTokensTab.tsx`'s own
 * `NotConnectedRow` comment); this is the same trap for a raw ITEM ID here — caught live via a
 * headless-browser console check before this reached the owner's own screen, the same way it was
 * caught the first time. */
const HANDLE_SAFE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @file Tier 2 of the Access Tokens list — the six single-row/per-item credential stores
 * (`rules.ts`'s `OTHER_CREDENTIAL_STORES`), rendered as top-level entries in the SAME list Tier 1's
 * `AccessTokensTab.tsx` renders, per the 2026-08-16 owner ruling ("one list, not two surfaces").
 *
 * ## Why a Tier-2 "entry" has no separate parent heading the way a Tier-1 provider group does
 *
 * Tier 1's `ProviderGroup` shows one `<h3>` (the PROVIDER's name, e.g. "GitHub") with multiple named
 * `TokenRow`s underneath it, because one provider can hold several operator-named tokens. Nothing on
 * Tier 2 is named that way — `media-provider`/`composio-connector`/`external-mcp` can each hold more
 * than one ITEM (a provider, a connector, a server), but never more than one CREDENTIAL per item, so
 * there is nothing to nest. The owner's own mock reflects this directly: "Cloudinary (media)" reads
 * at the SAME indentation as "GitHub"/"Cloudflare", not nested under a "Media provider keys" parent —
 * each configured item (or, when a store has none configured, the store itself) gets its own
 * top-level entry, heading and all. {@link OtherCredentialEntry} is that entry; it structurally
 * mirrors `ProviderGroup` (one heading, one row) with exactly zero or one row inside, never more.
 */

/** One store's zero-or-more configured items, each rendered as its own top-level entry — a store
 *  with NO configured items still renders once, as a single placeholder entry named after the store
 *  itself (mirrors Tier 1's always-visible-even-when-not-connected provider row). */
export function OtherCredentialsSection({ controller, query }: { controller: OtherCredentialsController; query: string }) {
  if (controller.groups === undefined) return null;
  return (
    <>
      {controller.groups.map((group) => (
        <MaybeOtherCredentialGroup key={group.store.id} group={group} controller={controller} query={query} />
      ))}
    </>
  );
}

/** Renders {@link OtherCredentialGroup} only when this store is a search match — mirrors Tier 1's
 *  `MaybeProviderGroup` exactly (store-info match OR at least one already-filtered row present). */
function MaybeOtherCredentialGroup({ group, controller, query }: { group: OtherCredentialGroupState; controller: OtherCredentialsController; query: string }) {
  const visible = otherCredentialMatchesQuery(group.store, undefined, query) || group.rows.length > 0;
  if (!visible) return null;
  return <OtherCredentialGroup group={group} controller={controller} />;
}

/** One store's rendered entries — every configured row gets its own entry; an unconfigured store
 *  renders exactly one placeholder entry instead, never zero (a store is always findable by name,
 *  same "always-visible provider" convention Tier 1 uses). */
function OtherCredentialGroup({ group, controller }: { group: OtherCredentialGroupState; controller: OtherCredentialsController }) {
  if (group.rows.length === 0) return <OtherCredentialEntry store={group.store} row={undefined} controller={controller} />;
  return (
    <>
      {group.rows.map((row) => (
        <OtherCredentialEntry key={row.key} store={group.store} row={row} controller={controller} />
      ))}
    </>
  );
}

function entryHandleLabel(name: string, purposeLabel: string, configured: boolean): string {
  return configured ? `${name} — ${purposeLabel}, configured` : `${name} — ${purposeLabel}, not configured`;
}

/** A DOM-id/`agentHandle()`-safe form of `row.key` — `row.key` itself is `${storeId}:${itemId}`
 *  (a colon-joined React/draft-state map key, fine for those two uses), but `agentHandle()` throws
 *  on anything that isn't lowercase words joined by single hyphens, and a colon is also a live CSS
 *  pseudo-class delimiter that would break any `#id` selector built from it. Caught live, the exact
 *  same class of bug `AccessTokensTab.tsx`'s own `NotConnectedRow` comment records for Tier 1 (a raw
 *  provider LABEL there; a raw ROW KEY here) — every `id`/`htmlFor`/`agentHandle()` call in this file
 *  must build from this helper, never from `row.key` directly.
 *  @complexity O(1). */
function rowHandleBase(row: OtherCredentialRowState): string {
  return `${row.store.id}-${row.itemId}`;
}

/** `agentHandle()`'s own spread, guarded against an unsafe id — mirrors `TabBar.tsx`'s own
 *  `tabHandleProps` ("omit the spread entirely when there is nothing safe to hand it"), extended
 *  from "handle is absent" to "handle is present but not safe": a Composio/media-provider id this
 *  app doesn't control just never gets tagged, rather than crashing the row that would have rendered
 *  it — see this file's header for why the id can be unsafe at all. @complexity O(1). */
function safeAgentHandle(handle: string, options: Parameters<typeof agentHandle>[1]): ReturnType<typeof agentHandle> | Record<string, never> {
  if (!HANDLE_SAFE_PATTERN.test(handle)) return {};
  return agentHandle(handle, options);
}

/** One top-level Tier-2 entry — see this file's header for why this has no separate parent heading
 *  the way a Tier-1 `ProviderGroup` does. `row` is `undefined` for the not-configured placeholder. */
function OtherCredentialEntry({ store, row, controller }: { store: OtherCredentialStoreInfo; row: OtherCredentialRowState | undefined; controller: OtherCredentialsController }) {
  const translate = controller.t;
  const name = row?.name ?? store.label;
  return (
    <section
      className="access-tokens-provider-group"
      {...safeAgentHandle(`security-other-credentials-${store.id}-${row?.itemId ?? "none"}`, {
        role: "region",
        label: entryHandleLabel(name, store.purposeLabel, row !== undefined),
      })}
    >
      <h3 className="access-tokens-provider-heading">
        <span translate="no">{name}</span>
        <span className="access-tokens-provider-purpose"> · {translate(store.purposeLabel)}</span>
      </h3>
      <OtherCredentialEntryBody store={store} row={row} controller={controller} />
    </section>
  );
}

/** The entry's body — placeholder / static-configured / replaceable-configured, split out purely for
 *  the complexity gate (this repo's hard 9/9 cyclomatic/cognitive ceiling — `eslint.config.mjs`'s
 *  `F06 option B`). */
function OtherCredentialEntryBody({ store, row, controller }: { store: OtherCredentialStoreInfo; row: OtherCredentialRowState | undefined; controller: OtherCredentialsController }) {
  if (row === undefined) return <OtherCredentialPlaceholderRow store={store} t={controller.t} />;
  if (store.supportsReplace) return <OtherCredentialReplaceableRow row={row} controller={controller} />;
  return <OtherCredentialStaticRow row={row} controller={controller} />;
}

function DeepLink({ store, t: translate }: { store: OtherCredentialStoreInfo; t: Translate }) {
  return (
    <a className="btn-secondary" href={`/admin${store.screenPath}`}>
      {translate("Manage on")} {translate(store.screenLabel)} ↗
    </a>
  );
}

/** Nothing configured yet — same "always show it, invite the reader to go set it up" role Tier 1's
 *  `NotConnectedRow` plays, minus a `[Connect]` affordance: Tier 2 owns no Create flow (`rules.ts`'s
 *  own header on why), so the deep link IS this row's only action. */
function OtherCredentialPlaceholderRow({ store, t: translate }: { store: OtherCredentialStoreInfo; t: Translate }) {
  return (
    <div className="access-tokens-row">
      <div className="access-tokens-row-summary">
        <span className="access-tokens-row-marker" aria-hidden="true" />
        <span className="access-tokens-row-name">{translate("Not configured")}</span>
      </div>
      <div className="access-tokens-row-actions">
        <DeepLink store={store} t={translate} />
      </div>
    </div>
  );
}

/** Configured, but this store does not support inline Replace (`composio-connector`/`external-mcp`
 *  — see `rules.ts`'s `OtherCredentialStoreInfo.supportsReplace` doc for why) — just the value fact,
 *  Remove, and the deep link, no disclosure to expand. */
function OtherCredentialStaticRow({ row, controller }: { row: OtherCredentialRowState; controller: OtherCredentialsController }) {
  const translate = controller.t;
  return (
    <div className="access-tokens-row access-tokens-row-done">
      <div className="access-tokens-row-summary">
        <span className="access-tokens-row-marker access-tokens-row-marker-done" aria-hidden="true" />
        <span className="access-tokens-row-name">{row.valueFact}</span>
        {row.updatedAt ? (
          <span className="access-tokens-row-summary-meta">
            {translate("saved")} {formatTimestamp(row.updatedAt)}
          </span>
        ) : null}
      </div>
      <div className="access-tokens-row-actions">
        <DeepLink store={row.store} t={translate} />
        <button
          type="button"
          className="btn-danger"
          onClick={() => void controller.remove(row)}
          {...safeAgentHandle(`security-other-credentials-remove-${rowHandleBase(row)}`, { role: "button", label: `Remove ${row.name} from Tovu` })}
        >
          {translate("Remove from Tovu")}
        </button>
        {row.error ? (
          <p className="save-error" role="alert">
            {row.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Configured, and this store supports retyping the key — a `<details>` row, closed by default (the
 *  step is done, same "get out of the way" reasoning `StaticSiteTab.tsx`'s `CredentialStepDone`
 *  documents), expanding to a single Access token field. */
function OtherCredentialReplaceableRow({ row, controller }: { row: OtherCredentialRowState; controller: OtherCredentialsController }) {
  const translate = controller.t;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const readyToSave = row.token.trim() !== "";
  return (
    <details className="access-tokens-row access-tokens-row-done">
      <summary className="access-tokens-row-summary">
        <span className="access-tokens-row-marker access-tokens-row-marker-done" aria-hidden="true" />
        <span className="access-tokens-row-name">{row.valueFact}</span>
        {row.updatedAt ? (
          <span className="access-tokens-row-summary-meta">
            {translate("saved")} {formatTimestamp(row.updatedAt)}
          </span>
        ) : null}
        <span className="access-tokens-row-summary-expand">
          {translate("Replace token")}
          <DisclosureChevronIcon />
        </span>
      </summary>
      <div className="access-tokens-row-fields">
        <div className="field">
          <label className="field-label" htmlFor={`security-other-credential-${rowHandleBase(row)}`}>
            {translate("Access token")}
          </label>
          <input
            id={`security-other-credential-${rowHandleBase(row)}`}
            type="password"
            autoComplete="off"
            value={row.token}
            onChange={(e) => controller.setDraftToken(row.key, e.target.value)}
            {...safeAgentHandle(`security-other-credential-token-${rowHandleBase(row)}`, { role: "field", label: `${row.name}'s replacement access token` })}
          />
          <p className="field-hint">{translate("Stored encrypted on the server. Once saved, Tovu never displays it again.")}</p>
        </div>
      </div>
      <div className="access-tokens-row-actions">
        <DeepLink store={row.store} t={translate} />
        <button
          type="button"
          disabled={!readyToSave || row.saving}
          onClick={() => void controller.replace(row)}
          {...safeAgentHandle(`security-other-credential-save-${rowHandleBase(row)}`, { role: "button", label: `Save this ${row.name} token` })}
        >
          {row.saving ? translate("Saving…") : translate("Save")}
        </button>
        <button type="button" className="btn-danger" onClick={() => dialogRef.current?.showModal()}>
          {translate("Remove from Tovu")}
        </button>
        {row.error ? (
          <p className="save-error" role="alert">
            {row.error}
          </p>
        ) : null}
      </div>
      <OtherCredentialRemoveDialog ref={dialogRef} row={row} controller={controller} t={translate} />
    </details>
  );
}

/**
 * Native `<dialog>` confirm, mirroring Tier 1's `RemoveConfirmDialog` exactly — same "Remove from
 * Tovu, never Revoke" load-bearing copy constraint (`rules.ts`'s own header): deleting Tovu's row
 * does not revoke the credential at the provider, and this dialog is the one place that fact gets
 * stated in words. No equivalent "this is the last row for this provider" note: every Tier-2 store
 * already caps at one row per item, so removing it is always the only-row case — the sentence would
 * be true on every single Remove and therefore say nothing new.
 *
 * Confirm button carries no `agentHandle`, same destructive-action boundary Tier 1's own confirm
 * dialog draws.
 */
const OtherCredentialRemoveDialog = forwardRef<HTMLDialogElement, { row: OtherCredentialRowState; controller: OtherCredentialsController; t: Translate }>(
  function OtherCredentialRemoveDialog({ row, controller, t: translate }, ref) {
    const locale = useAdminLocale();
    function close() {
      (ref as RefObject<HTMLDialogElement>).current?.close();
    }
    function confirm() {
      close();
      void controller.remove(row);
    }
    return (
      <dialog ref={ref} className="confirm-dialog">
        <h2>{removeDialogTitle(locale, row.name)}</h2>
        <p className="confirm-dialog-body">{removeDialogBody(locale, row.store.purposeLabel)}</p>
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
