import { forwardRef, useRef } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { Translate } from "../../lib/dictionary-translator";
import { otherCredentialMatchesQuery, type OtherCredentialStoreInfo } from "./rules";
import { otherCredentialRemoveDialogBody, removeDialogTitle } from "./security-i18n";
import type { OtherCredentialGroupState, OtherCredentialRowState, OtherCredentialsController } from "./hooks/use-other-credentials.hooks";
import { useOtherCredentialRemoveDialog } from "./OtherCredentialsSection.hooks";

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

/** @param handleSuffix - Distinguishes this deep link from every other row's — a bare store id for
 *  the unconfigured placeholder (only one ever renders per store) or {@link rowHandleBase} for a
 *  real row, since a store like `media-provider` can hold more than one configured item. */
function DeepLink({ store, handleSuffix, t: translate }: { store: OtherCredentialStoreInfo; handleSuffix: string; t: Translate }) {
  return (
    <a
      className="btn-secondary"
      href={`/admin${store.screenPath}`}
      {...safeAgentHandle(`security-other-credentials-manage-${handleSuffix}`, {
        role: "link",
        label: `Open ${store.screenLabel} to manage this credential`,
      })}
    >
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
        <DeepLink store={store} handleSuffix={store.id} t={translate} />
      </div>
    </div>
  );
}

/** Configured, but this store does not support inline Replace (`composio-connector`/`external-mcp`
 *  — see `rules.ts`'s `OtherCredentialStoreInfo.supportsReplace` doc for why) — just the value fact,
 *  Remove, and the deep link, no disclosure to expand. Remove asks first, through the same
 *  {@link OtherCredentialRemoveDialog} the replaceable row uses: these two stores are the most
 *  destructive on the page (an External MCP delete loses a sealed OAuth secret for good, a Composio
 *  disconnect revokes the account at Composio), and this button used to fire on the first click. */
function OtherCredentialStaticRow({ row, controller }: { row: OtherCredentialRowState; controller: OtherCredentialsController }) {
  const translate = controller.t;
  const dialogRef = useRef<HTMLDialogElement>(null);
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
        <DeepLink store={row.store} handleSuffix={rowHandleBase(row)} t={translate} />
        <button
          type="button"
          className="btn-danger"
          onClick={() => dialogRef.current?.showModal()}
          // `aria-label`: a store can hold more than one configured item (this file's own
          // `handleSuffix` doc comment above names `media-provider` as an example), and every row
          // renders unconditionally — no accordion, no menu — so two configured items under the
          // same store put two identically-labeled "Remove from Tovu" buttons on screen at once.
          // `row.name` is this row's own display name, already visible in its heading.
          aria-label={`${translate("Remove from Tovu")} — ${row.name}`}
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
      <OtherCredentialRemoveDialog ref={dialogRef} row={row} controller={controller} t={translate} />
    </div>
  );
}

/** Configured, and this store supports retyping the key on its own dedicated screen (`DeepLink`) —
 *  always rendered open, no accordion: unlike Tier 1's `TokenRow`, there is no inline form here worth
 *  hiding behind a click. The Access token field shown below is the same masked `row.valueFact` the
 *  summary line already carries, rendered `disabled` — a natural, familiar "this is set, go elsewhere
 *  to change it" cue, not an editable draft. Deliberately carries no `agentHandle()` — a disabled
 *  field tagged as fillable would have an assistant try to type into it, find it inert, and get stuck;
 *  the `DeepLink` below is the one actionable path to actually change this value, same as a person
 *  reading this row would use. */
function OtherCredentialReplaceableRow({ row, controller }: { row: OtherCredentialRowState; controller: OtherCredentialsController }) {
  const translate = controller.t;
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="access-tokens-row">
      {/* One shared block, not two independent rows — `align-items: stretch` in a column-direction
          inline-flex makes the (naturally narrow) token field stretch to match the actions row's own
          content width below it, so both edges line up instead of the field looking arbitrarily
          short next to a wider button group. */}
      <div className="access-tokens-row-block">
        <div className="access-tokens-row-fields access-tokens-row-fields-top">
          <div className="field">
            <label className="field-label" htmlFor={`security-other-credential-${rowHandleBase(row)}`}>
              {translate("Access token")}
              {row.updatedAt ? (
                <span className="access-tokens-row-summary-meta access-tokens-field-label-meta">
                  {translate("saved")} {formatTimestamp(row.updatedAt)}
                </span>
              ) : null}
            </label>
            {/* `type="text"`, not `"password"` — `row.valueFact` is already a pre-masked display
                string (leading dots + last 4 real characters); a password-type input would mask the
                last 4 a second time, hiding the one part of this value that's meant to stay visible. */}
            <input
              id={`security-other-credential-${rowHandleBase(row)}`}
              className="access-tokens-row-field-disabled"
              type="text"
              value={row.valueFact}
              disabled
            />
          </div>
        </div>
        <div className="access-tokens-row-actions access-tokens-row-actions-top">
          <DeepLink store={row.store} handleSuffix={rowHandleBase(row)} t={translate} />
          <button
            type="button"
            className="btn-danger"
            onClick={() => dialogRef.current?.showModal()}
            // Same multi-item-per-store ambiguity as `OtherCredentialStaticRow`'s identical button
            // above.
            aria-label={`${translate("Remove from Tovu")} — ${row.name}`}
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
      <OtherCredentialRemoveDialog ref={dialogRef} row={row} controller={controller} t={translate} />
    </div>
  );
}

/**
 * Native `<dialog>` confirm, mirroring Tier 1's `RemoveConfirmDialog` — same "Remove from Tovu,
 * never Revoke" load-bearing copy constraint (`rules.ts`'s own header) for the four replaceable
 * stores: deleting Tovu's row does not revoke the credential at the provider, and this dialog is the
 * one place that fact gets stated in words. The two static-row stores state their own, different
 * fact instead (`otherCredentialRemoveDialogBody`). No equivalent "this is the last row for this provider" note: every Tier-2 store
 * already caps at one row per item, so removing it is always the only-row case — the sentence would
 * be true on every single Remove and therefore say nothing new.
 *
 * Confirm button carries no `agentHandle`, same destructive-action boundary Tier 1's own confirm
 * dialog draws.
 */
const OtherCredentialRemoveDialog = forwardRef<HTMLDialogElement, { row: OtherCredentialRowState; controller: OtherCredentialsController; t: Translate }>(
  function OtherCredentialRemoveDialog({ row, controller, t: translate }, ref) {
    const locale = useAdminLocale();
    const { close, confirm } = useOtherCredentialRemoveDialog(ref, row, controller);
    // `aria-labelledby`, not left implicit — same fix, same reasoning, as Tier 1's own
    // `RemoveConfirmDialog` (`AccessTokensTab.tsx`): a native `<dialog>` gets no accessible name
    // for free from an `<h2>` inside it, and this doc comment's own header already promises this
    // dialog "mirrors Tier 1's `RemoveConfirmDialog` exactly" — this brings that true for the title
    // link too. `rowHandleBase(row)` (already this row's DOM-id-safe base, used below by its own
    // input/deep-link ids) keeps this id unique across every Tier-2 row's own dialog.
    const titleId = `security-other-credentials-remove-title-${rowHandleBase(row)}`;
    return (
      <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{removeDialogTitle(locale, row.name)}</h2>
        {/* Per-store body — `otherCredentialRemoveDialogBody`'s own doc: the shared "does NOT
            revoke" sentence is kept for the four replaceable stores and would be false for a
            Composio disconnect, which DOES revoke at Composio. */}
        <p className="confirm-dialog-body">{otherCredentialRemoveDialogBody(locale, row.store)}</p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            onClick={close}
            {...safeAgentHandle(`security-other-credentials-remove-cancel-${rowHandleBase(row)}`, { role: "button", label: "Close this dialog without removing the credential" })}
          >
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
