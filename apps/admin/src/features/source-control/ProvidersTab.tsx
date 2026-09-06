import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { Translate } from "../../lib/dictionary-translator";
import type { AdminSourceControlProviderId } from "../../lib/api";
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
 * ## Second density pass (2026-08-16) — an accordion, not three open forms
 *
 * The page-shell pass above shipped, the owner looked at it twice, and both times called it "a wall
 * of text" — the same complaint `deployment/StaticSiteTab.tsx`'s own "seventh pass" doc records for
 * the identical symptom (all four of ITS providers' full credential forms rendering at once). That
 * file's fix was a tab bar showing one provider's fields at a time; this page has no per-provider tab
 * bar by deliberate, still-standing decision (see the top of this file), so the equivalent fix here
 * is a native accordion: every row — connected or not — now renders behind `<details
 * name="source-control-provider">`. The shared `name` makes the three rows one EXCLUSIVE group
 * (Baseline since 2024 — Chrome 120, Safari 17.4, Firefox 129): opening one closes whichever other
 * row was open, no click handler or React state involved, so it stays presentation-layer.
 * {@link firstUnconnectedProviderId} decides which row starts open — the first one still needing a
 * token — so a first-time visitor already sees the one form they came to fill in, not three, and the
 * open row naturally advances to the next unconnected provider once the current one saves. This
 * supersedes {@link SourceControlRowTodo}'s old "always open, there is nothing to disclose FROM here"
 * reasoning (removed, not merely extended) — with three rows open at once that reasoning was exactly
 * what produced the wall the owner flagged twice.
 *
 * The per-row subtitle ("Save a personal access token so Tovu can use this account.") was identical
 * on all three rows and added nothing the heading plus the "Access token" field label didn't already
 * say — cut, along with its now-orphaned translation key across all 21 locale dictionaries. The
 * scope-guidance sentence stays exactly as owner-narrowed on 2026-08-15 (`rules.ts`'s own header) —
 * cutting ITS words was never the ask, only its default visibility — so it now sits behind its own
 * small nested "Which token do I need?" `<details>` inside {@link SourceControlCredentialFields},
 * reachable in one click rather than always-rendered.
 *
 * ## Two defects this page was briefed NOT to inherit
 *
 * 1. A connected/collapsed row needs a VISIBLE expand affordance — a text label plus a chevron —
 *    never a bare clickable row. See {@link SourceControlRowSummary}'s own doc.
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
      <ManageAccessTokensLink t={controller.t} />
    </div>
  );
}

/**
 * Cross-link to the Access Tokens tab on the Security page — the same "ONE credential home" pattern
 * `deployment/StaticSiteTab.tsx`'s own `ManageAccessTokensLink` documents (2026-08-16 owner ruling,
 * `ADS-memory/reports/2026-08-17-source-control-ui.md`: "Security → Access Tokens is the ONE
 * credential home. Source Control keeps only real source hosts; Static Site picks a saved
 * credential."). The three rows above still handle the common case inline (one token per provider,
 * paste-and-save) — this is the escape hatch to what only Security's Access Tokens tab can do: save a
 * SECOND named token for GitHub/GitLab/Bitbucket, rename one, or manage every credential this install
 * holds (including the four publish providers) in one place.
 *
 * Deliberately NOT a 7-`VendorId` picker — a picker built from `VendorId` would list Netlify/Vercel/
 * Cloudflare/S3 as places to keep SOURCE CODE, which they are not; this page's own three rows
 * (`SOURCE_CONTROL_PROVIDERS`, `rules.ts`) are the correct, narrower provider set for what this page
 * actually does. See `AdminSourceControlProviderId`'s own three-member union in `lib/api.ts`.
 * @complexity O(1) — no branches.
 */
function ManageAccessTokensLink({ t: translate }: { t: Translate }) {
  return (
    <p className="source-control-action-reason">
      {translate("Need to save more than one token, rename one, or manage every saved credential in one place?")}{" "}
      <button
        type="button"
        className="link-button"
        onClick={() => navigate("/access-tokens?tab=access-tokens")}
        {...agentHandle("source-control-manage-tokens-link", {
          role: "button",
          label: "Go to the Access Tokens tab on the Security page to create, rename, or manage saved tokens",
        })}
      >
        {translate("Create access token")}
      </button>
    </p>
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
  const defaultOpenProviderId = firstUnconnectedProviderId(controller.rows);
  return (
    <div className="source-control-rows">
      {controller.rows.map((row) => (
        <SourceControlProviderRow
          key={row.providerId}
          row={row}
          controller={controller}
          t={translate}
          defaultOpen={row.providerId === defaultOpenProviderId}
        />
      ))}
    </div>
  );
}

/** The first provider still missing a saved connection, in {@link SOURCE_CONTROL_PROVIDERS} order —
 *  the one row {@link SourceControlProviderRow} defaults open. `undefined` once every provider is
 *  connected, matching every row starting collapsed (this file's own header explains why an
 *  accordion exists at all). Pure and React-free like this page's `rules.ts` helpers, but kept here
 *  rather than moved there: this decides a disclosure default, a presentation choice, not a fact
 *  about a credential — `rules.ts` stays the file with no opinion about what is open on screen.
 *  @complexity O(n) in the fixed, size-3 provider list. */
function firstUnconnectedProviderId(rows: readonly SourceControlCredentialRowState[]): AdminSourceControlProviderId | undefined {
  return rows.find((row) => row.saved === undefined)?.providerId;
}

/**
 * One provider's row — a native `<details name="source-control-provider">`, connected or not, so
 * the three rows form one exclusive accordion group (this file's own header explains why). Replaces
 * the old {@link SourceControlRowTodo}/{@link SourceControlRowDone} split: both states now share this
 * one shell, differing only in the marker glyph and {@link SourceControlRowSummary}'s content —
 * mirrors `PublishCredentialsSection`'s single-row-at-a-time shape in `deployment/StaticSiteTab.tsx`,
 * built for the identical density complaint.
 *
 * `open={defaultOpen}` is intentionally uncontrolled: React sets it once per computed value and
 * otherwise leaves the DOM alone (it never re-asserts a prop that hasn't itself changed), so a
 * reader's own manual expand/collapse clicks survive re-renders of sibling rows — typing a token
 * into THIS row does not fight the accordion state of another.
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
 * The affordance's insertion point, once that data exists: directly below {@link
 * SourceControlRowSummary}, ABOVE {@link SourceControlCredentialFields} — same "settled fact first,
 * fields second" order the connected summary already establishes, so a reader sees "a GitHub Pages
 * credential already exists" before being asked to type a new token into the fields underneath. It
 * needs to read, per provider, from the controller: whether a matching publish credential exists,
 * and when it was saved (same shape `AdminSourceControlCredentialSummary.updatedAt` already carries
 * for THIS store's own rows) — `SourceControlCredentialsController`/`useSourceControlCredentialsHook`
 * (`hooks/use-source-control-credentials.hooks.ts`) has neither field today; adding them is that
 * follow-up's job, not this pass's. No placeholder button renders here in the meantime — an inert
 * "Reuse token" control pointing at nothing would be a worse defect than the wait.
 */
function SourceControlProviderRow({
  row,
  controller,
  t: translate,
  defaultOpen,
}: {
  row: SourceControlCredentialRowState;
  controller: SourceControlCredentialsController;
  t: Translate;
  defaultOpen: boolean;
}) {
  const info = sourceControlProviderInfo(row.providerId);
  const connected = row.saved !== undefined;
  return (
    <details
      className={connected ? "source-control-row source-control-row-done" : "source-control-row"}
      open={defaultOpen}
      name="source-control-provider"
      {...agentHandle(`source-control-credentials-row-${row.providerId}`, {
        role: "region",
        label: `${info.label}'s saved source control connection — ${connected ? "connected" : "not yet connected"}`,
      })}
    >
      <SourceControlRowSummary row={row} label={info.label} connected={connected} t={translate} />
      <SourceControlCredentialFields row={row} controller={controller} t={translate} />
    </details>
  );
}

/**
 * A row's `<summary>` — split out of {@link SourceControlProviderRow} purely for this app's
 * complexity gate, same reasoning every other per-state split in this file documents.
 *
 * Not-connected: an empty ring marker plus a heading ("Connect GitHub") — the heading text is
 * already the call to action, so no separate subtitle repeats it (the old subtitle line, identical
 * on all three rows, was cut for exactly this reason — see this file's own header).
 *
 * Connected: the same summary line this page has always shown — a filled checkmark marker, the
 * settled trust fact ("token stored, encrypted"), and the SAVED time, never "updated" ("updated"
 * would falsely imply the token was recently re-verified, and a revoked token still carries whatever
 * timestamp is stored here regardless). No liveness/verification indicator is shown anywhere on this
 * row — this admin has no way to check a token is still valid without trying to use it, and claiming
 * otherwise would be exactly the kind of unbacked trust signal `CredentialStepDone`'s own doc in
 * `deployment/StaticSiteTab.tsx` warns against.
 *
 * Both states end in a trailing chevron — connected pairs it with visible "Replace token" text,
 * REQUIRED rather than a bare clickable row: a settled `<summary>` with its native disclosure
 * triangle stripped and no replacement was owner-reported as undiscoverable on the Static Site tab's
 * own credential rows (a reader with a rotated token had no way to tell the row could be reopened).
 * The not-connected chevron carries no extra label — its own heading text is already the action, so a
 * second "Add token" label next to it would repeat, not clarify.
 */
function SourceControlRowSummary({
  row,
  label,
  connected,
  t: translate,
}: {
  row: SourceControlCredentialRowState;
  label: string;
  connected: boolean;
  t: Translate;
}) {
  return (
    <summary className="source-control-row-summary">
      <span className={connected ? "source-control-row-marker source-control-row-marker-done" : "source-control-row-marker"} aria-hidden="true">
        {connected ? <ConnectedMarkIcon /> : null}
      </span>
      <span className="source-control-row-summary-text">
        {connected ? (
          <>
            <span translate="no">{label}</span> {translate("connected")} · {translate("token stored, encrypted")} ·{" "}
            {translate("saved")} {formatTimestamp(row.saved!.updatedAt)}
          </>
        ) : (
          <h3 className="source-control-row-title">
            {translate("Connect")} <span translate="no">{label}</span>
          </h3>
        )}
      </span>
      <span className="source-control-row-summary-expand">
        {connected ? translate("Replace token") : null}
        <DisclosureChevronIcon />
      </span>
    </summary>
  );
}

/**
 * A row's fields — token input, Bitbucket's required username, and the Save action. Shared between
 * both {@link SourceControlProviderRow} states, same split `PublishCredentialFields` uses in
 * `deployment/StaticSiteTab.tsx` and for the same reason: the fields and Save behavior are
 * identical in both states, only whether the reader has opened the row to see them differs.
 *
 * Every hint renders BELOW its input as `.field-hint`, never as placeholder text inside it — a
 * placeholder sitting in an empty box reads as a saved value at a glance, the exact confusion the
 * Static Site tab's own credential form was corrected out of. The token and username inputs below
 * carry no `placeholder` prop at all, connected or not.
 *
 * The scope-guidance sentence (which token, which scopes) sits behind its own nested "Which token do
 * I need?" `<details>` rather than rendering by default — this file's own header records why: the
 * words themselves are the owner's own 2026-08-15 narrowing (`rules.ts`), untouched here, only their
 * default visibility changed. No `name` attribute on this inner `<details>` — it has nothing to stay
 * exclusive WITH, and giving it the outer accordion's own group name would fold it into that group by
 * mistake.
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
            // `new-password`, not `off` — Chrome ignores `off` on credential-shaped fields by
            // design. See `security/AccessTokensTab.tsx`'s token input for the full reasoning.
            autoComplete="new-password"
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
          <details className="source-control-scope-guidance">
            <summary className="source-control-scope-guidance-summary">
              {translate("Which token do I need?")}
              <DisclosureChevronIcon size={10} />
            </summary>
            <p className="field-hint">
              {translate(info.scopeGuidanceKey)}{" "}
              <a
                href={info.tokenPageUrl}
                target="_blank"
                rel="noreferrer"
                {...agentHandle(`source-control-credentials-token-page-${row.providerId}`, {
                  role: "link",
                  label: `Open ${info.label}'s own page for creating a personal access token`,
                })}
              >
                {translate("Create a token")}
              </a>
            </p>
          </details>
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
