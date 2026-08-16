import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { Translate } from "../../lib/dictionary-translator";
import { t } from "./source-control-i18n";
import {
  sourceControlCredentialRowReadyToSave,
  sourceControlProviderInfo,
  type SourceControlCredentialFormFields,
} from "./rules";
import { ConnectedMarkIcon, DisclosureChevronIcon } from "./source-control-visuals";
import { useWiredSourceControlCredentials } from "./hooks/use-source-control-credentials.hooks";
import type {
  SourceControlCredentialRowState,
  SourceControlCredentialsController,
} from "./hooks/use-source-control-credentials.hooks";

/**
 * @file The Providers tab — `SourceControl.tsx`'s one tab today, and this feature's actual content.
 * Three always-visible rows — GitHub, GitLab, Bitbucket, in that order (GitHub is the one that
 * matters; the other two are real connectable rows, not "coming soon" stubs) — never a second-level
 * tab bar of their own. Moved here verbatim out of `SourceControl.tsx` in the 2026-08-16 page-shell
 * pass — see that file's own header for why the row content did not change, only what wraps it.
 *
 * ## No outer `.card` — owner-corrected the same pass
 *
 * The first cut of this file wrapped the row list in its own `.card` (icon + "Providers"
 * `card-title`) sitting under the `TabBar`. Owner's direct read: that is a card inside a card inside
 * a tab — each `.source-control-row` below is ALREADY its own bordered surface, so a second
 * bordered/background box around the whole list added a layer of chrome with no content of its own.
 * `features/pages/Pages.tsx` (a real `TabBar`-driven list screen) never wraps its rows in a card
 * either — `.card` there is reserved for an EMPTY state, not the populated list — so this tab now
 * matches that: the rows render directly under the tab, no enclosing card. `SourceControlIcon`
 * (`source-control-visuals.tsx`) lost its only call site here and is currently unused; left defined
 * rather than deleted in case a later pass finds it a home.
 *
 * ## Two defects this page was briefed NOT to inherit
 *
 * 1. A connected/collapsed row needs a VISIBLE expand affordance — a text label plus a chevron —
 *    never a bare clickable row. See {@link SourceControlRowDone}'s own doc.
 * 2. A saved-credential timestamp says "saved," never "updated" — "updated" falsely implies the
 *    token was recently re-verified, and a revoked token still shows that same timestamp. No
 *    token-liveness indicator is shown anywhere on this page either, for the same reason.
 *
 * This tab reuses `deployment/StaticSiteTab.tsx`'s `PublishCredentialFields` VISUAL pattern
 * deliberately (connected/not-connected split, same hint-below-input idiom) but owns no code
 * dependency on `features/deployment/` — two different agents were building the two features in the
 * same session, and this page's own icons (`source-control-visuals.tsx`), CSS
 * (`styles/source-control.css`), and hook plumbing are drawn fresh rather than imported
 * cross-feature.
 */

export interface ProvidersTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app
   *  (`StaticSiteTabProps.usePublishCredentialsHook`). */
  useSourceControlCredentialsHook?: typeof useWiredSourceControlCredentials;
}

/** Resolves {@link ProvidersTabProps}'s one DI seam to its real hook when a caller passes none —
 *  same small-resolver shape `deployment/StaticSiteTab.tsx`'s `resolvePublishCredentialsHook`
 *  documents (a resolver counts one branch here rather than an inline `??` counting against the
 *  component body's own complexity budget). */
function resolveSourceControlCredentialsHook(
  override: typeof useWiredSourceControlCredentials | undefined
): typeof useWiredSourceControlCredentials {
  return override ?? useWiredSourceControlCredentials;
}

export function ProvidersTab(props: ProvidersTabProps) {
  const locale = useAdminLocale();
  const translate = (key: string): string => t(locale, key);
  const useSourceControlCredentialsHook = resolveSourceControlCredentialsHook(props.useSourceControlCredentialsHook);
  const controller = useSourceControlCredentialsHook();

  return (
    <div
      className="source-control-tab"
      {...agentHandle("source-control-providers", {
        role: "region",
        label: "Connect a GitHub, GitLab, or Bitbucket account so Tovu can read and later push to your repositories",
      })}
    >
      <SourceControlCredentialsList controller={controller} t={controller.t} />
    </div>
  );
}

/** The three provider rows — loading/error states, then one row per {@link SOURCE_CONTROL_PROVIDERS}
 *  entry. Split out of {@link ProvidersTab} purely for the complexity gate, same reasoning every
 *  other per-section split in this app documents: this repo's real `apps/admin` ESLint gate is a
 *  hard 9/9 cyclomatic/cognitive ceiling, and the loading/error branches plus the `.map()` counted
 *  directly in the tab component would have pushed it over budget alongside the header markup. */
function SourceControlCredentialsList({ controller, t: translate }: { controller: SourceControlCredentialsController; t: Translate }) {
  if (controller.loadError) {
    return (
      <p
        className="notice error"
        role="status"
        {...agentHandle("source-control-load-error", {
          role: "status",
          label: "Shows the error when saved source control connections could not be loaded",
        })}
      >
        {controller.loadError}
      </p>
    );
  }
  if (controller.rows === undefined) {
    return <p className="source-control-action-reason">{translate("Loading connections…")}</p>;
  }
  return (
    <div className="source-control-rows">
      {controller.rows.map((row) => (
        <SourceControlProviderRow key={row.providerId} row={row} controller={controller} t={translate} />
      ))}
    </div>
  );
}

/** One provider's row — dispatches to {@link SourceControlRowTodo} (nothing saved yet) or
 *  {@link SourceControlRowDone} (a connection already exists), mirroring
 *  `PublishCredentialsSection`'s own dispatch in `deployment/StaticSiteTab.tsx`. */
function SourceControlProviderRow({
  row,
  controller,
  t: translate,
}: {
  row: SourceControlCredentialRowState;
  controller: SourceControlCredentialsController;
  t: Translate;
}) {
  if (row.saved !== undefined) {
    return <SourceControlRowDone row={row} controller={controller} t={translate} />;
  }
  return <SourceControlRowTodo row={row} controller={controller} t={translate} />;
}

/**
 * A row's fields — token input, Bitbucket's required username, and the Save action. Shared between
 * {@link SourceControlRowTodo} (always open) and {@link SourceControlRowDone} (one click away, for
 * replacing an already-saved token), same split `PublishCredentialFields` uses in
 * `deployment/StaticSiteTab.tsx` and for the same reason: the fields and Save behavior are
 * identical in both states, only whether the reader sees them by default differs.
 *
 * Every hint renders BELOW its input as `.field-hint`, never as placeholder text inside it — a
 * placeholder sitting in an empty box reads as a saved value at a glance, the exact confusion the
 * Static Site tab's own credential form was corrected out of. The token and username inputs below
 * carry no `placeholder` prop at all, connected or not.
 */
function SourceControlCredentialFields({
  row,
  controller,
  t: translate,
}: {
  row: SourceControlCredentialRowState;
  controller: SourceControlCredentialsController;
  t: Translate;
}) {
  const info = sourceControlProviderInfo(row.providerId);
  const connected = row.saved !== undefined;
  const fields: SourceControlCredentialFormFields = { providerId: row.providerId, token: row.token, username: row.username };
  const readyToSave = sourceControlCredentialRowReadyToSave(fields);
  const needsUsername = info.requiredFields.includes("username");

  return (
    <>
      <div className="source-control-credential-fields">
        <div className="field">
          <label className="field-label" htmlFor={`source-control-credentials-token-${row.providerId}`}>
            {translate("Access token")}
          </label>
          <input
            id={`source-control-credentials-token-${row.providerId}`}
            type="password"
            autoComplete="off"
            value={row.token}
            onChange={(e) => controller.setToken(row.providerId, e.target.value)}
            {...agentHandle(`source-control-credentials-token-${row.providerId}`, {
              role: "field",
              label: `${info.label} access token — stored encrypted, never shown again once saved`,
            })}
          />
          <p className="field-hint">
            {connected
              ? translate("Leave blank to keep the current token.")
              : translate("Stored encrypted on the server. Once saved, Tovu never displays it again.")}
          </p>
          <p className="field-hint">
            {translate(info.scopeGuidanceKey)}{" "}
            <a href={info.tokenPageUrl} target="_blank" rel="noreferrer">
              {translate("Create a token")}
            </a>
          </p>
        </div>

        {needsUsername ? (
          <div className="field">
            <label className="field-label" htmlFor={`source-control-credentials-username-${row.providerId}`}>
              {translate("Username")}
            </label>
            <input
              id={`source-control-credentials-username-${row.providerId}`}
              type="text"
              value={row.username}
              onChange={(e) => controller.setUsername(row.providerId, e.target.value)}
              {...agentHandle(`source-control-credentials-username-${row.providerId}`, {
                role: "field",
                label: "Bitbucket username this API token belongs to — required, Bitbucket authenticates the pair",
              })}
            />
            <p className="field-hint">{translate("The Bitbucket username this API token belongs to.")}</p>
          </div>
        ) : null}
      </div>

      <div className="source-control-action">
        <button
          type="button"
          disabled={!readyToSave || row.saving}
          onClick={() => void controller.save(row.providerId)}
          {...agentHandle(`source-control-credentials-save-${row.providerId}`, {
            role: "button",
            label: `Save the ${info.label} access token`,
          })}
        >
          {row.saving ? translate("Saving…") : translate("Save")}
        </button>
        {row.error ? (
          <p className="save-error" role="alert">
            {row.error}
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * A row, not yet connected — open and prominent. Plain fields, not a `<details>`: there is nothing
 * to progressively disclose FROM here, since this IS the thing the reader still has to do.
 *
 * ## Seam for the not-yet-built "reuse the publish token" affordance
 *
 * 2026-08-16 owner decision: when a not-yet-connected row's provider already has a matching
 * Deployment publish credential saved (checked directly against the database this session — e.g.
 * `publish_credential_sets` already has a `github-pages` row for a workspace whose
 * `source_control_credential_sets` is empty), this row should offer a one-click "reuse that
 * credential" path instead of asking the operator to paste the same token twice. NOT built here —
 * it needs a server-side read across both credential stores plus a decrypt-and-reseal from one
 * sealed store into the other, both squarely outside this feature's fence (`lib/api.ts` wire types,
 * `src/**`). Dispatched separately.
 *
 * The affordance's insertion point, once that data exists: directly below
 * `.source-control-row-subtitle` just below, ABOVE {@link SourceControlCredentialFields} — same
 * "settled fact first, fields second" order {@link SourceControlRowDone}'s summary already
 * establishes for the connected state, so a reader sees "a GitHub Pages credential already exists"
 * before being asked to type a new token into the fields underneath. It needs to read, per
 * provider, from the controller: whether a matching publish credential exists, and when it was
 * saved (same shape `AdminSourceControlCredentialSummary.updatedAt` already carries for THIS
 * store's own rows) — `SourceControlCredentialsController`/`useSourceControlCredentialsHook`
 * (`hooks/use-source-control-credentials.hooks.ts`) has neither field today; adding them is that
 * follow-up's job, not this pass's. No placeholder button renders here in the meantime — an inert
 * "Reuse token" control pointing at nothing would be a worse defect than the wait.
 */
function SourceControlRowTodo({
  row,
  controller,
  t: translate,
}: {
  row: SourceControlCredentialRowState;
  controller: SourceControlCredentialsController;
  t: Translate;
}) {
  const info = sourceControlProviderInfo(row.providerId);
  return (
    <div
      className="source-control-row"
      {...agentHandle(`source-control-credentials-row-${row.providerId}`, {
        role: "region",
        label: `${info.label}'s saved source control connection — not yet connected`,
      })}
    >
      <div className="source-control-row-head">
        <span className="source-control-row-marker" aria-hidden="true" />
        <div className="source-control-row-headings">
          <h3 className="source-control-row-title">
            {translate("Connect")} <span translate="no">{info.label}</span>
          </h3>
          <p className="source-control-row-subtitle">{translate("Save a personal access token so Tovu can use this account.")}</p>
        </div>
      </div>
      <SourceControlCredentialFields row={row} controller={controller} t={translate} />
    </div>
  );
}

/**
 * A row, connected — collapsed to one settled summary line behind a native `<details>`, closed by
 * default: the connection is done, so it gets out of the way, the mirror image of
 * {@link SourceControlRowTodo} staying open because its step is not done.
 *
 * The summary states the trust fact directly — "token stored, encrypted" — and the SAVED time, never
 * "updated": "updated" would falsely imply the token was recently re-verified, and a revoked token
 * still carries whatever timestamp is stored here regardless. No liveness/verification indicator is
 * shown anywhere on this row — this admin has no way to check a token is still valid without trying
 * to use it, and claiming otherwise would be exactly the kind of unbacked trust signal
 * `CredentialStepDone`'s own doc in `deployment/StaticSiteTab.tsx` warns against.
 *
 * The trailing "Replace token" text plus {@link DisclosureChevronIcon} is the row's expand
 * affordance, and it is REQUIRED to be visible, not just implied by the row being clickable — a
 * settled `<summary>` with its native disclosure triangle stripped and no replacement was
 * owner-reported as undiscoverable on the Static Site tab's own credential rows (a reader with a
 * rotated token had no way to tell the row could be reopened). This page's summary carries both a
 * checkmark-style connected marker at the START (via {@link ConnectedMarkIcon}, stating the fact)
 * and this label-plus-chevron pair at the END (stating the action), so the two never compete for
 * "which glyph means what."
 */
function SourceControlRowDone({
  row,
  controller,
  t: translate,
}: {
  row: SourceControlCredentialRowState;
  controller: SourceControlCredentialsController;
  t: Translate;
}) {
  const info = sourceControlProviderInfo(row.providerId);
  return (
    <details
      className="source-control-row source-control-row-done"
      {...agentHandle(`source-control-credentials-row-${row.providerId}`, {
        role: "region",
        label: `${info.label}'s saved source control connection — connected`,
      })}
    >
      <summary className="source-control-row-summary">
        <span className="source-control-row-marker source-control-row-marker-done" aria-hidden="true">
          <ConnectedMarkIcon />
        </span>
        <span className="source-control-row-summary-text">
          <span translate="no">{info.label}</span> {translate("connected")} · {translate("token stored, encrypted")} ·{" "}
          {translate("saved")} {formatTimestamp(row.saved!.updatedAt)}
        </span>
        <span className="source-control-row-summary-expand">
          {translate("Replace token")}
          <DisclosureChevronIcon />
        </span>
      </summary>
      <SourceControlCredentialFields row={row} controller={controller} t={translate} />
    </details>
  );
}
