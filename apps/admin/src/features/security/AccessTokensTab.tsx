import { forwardRef, useRef } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { resolveTabBarTabIndex, useTabBarKeyboard } from "../../components/TabBar.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { formatTimestamp } from "../../lib/format-timestamp";
import { pickPlural } from "../../lib/template-i18n";
import type { Translate } from "../../lib/dictionary-translator";
import { removeDialogBody, removeDialogLastRowNote, removeDialogTitle } from "./security-i18n";
import {
  ACCESS_TOKEN_CATEGORIES,
  accessTokenProviderMatchesQuery,
  accessTokenExistingRowReadyToSave,
  accessTokenRowProviderInfo,
  accessTokenRowReadyToSave,
  invalidAdditionalHostsEntries,
  providerGroupHandleLabel,
  tokenRowHandleLabel,
  type AccessTokenCategoryId,
  type AccessTokenFormFields,
  type AccessTokenProviderInfo,
  type AccessTokenProviderRef,
  type AccessTokenRow,
  type AccessTokenRowCategoryId,
} from "./rules";
import { ConnectedMarkIcon, DisclosureChevronIcon, SearchIcon } from "./security-visuals";
import { useWiredAccessTokens } from "./hooks/use-access-tokens.hooks";
import type {
  AccessTokenAddFormState,
  AccessTokenExistingRowState,
  AccessTokenProviderGroupState,
  AccessTokensController,
} from "./hooks/use-access-tokens.hooks";
import { useWiredOtherCredentials } from "./hooks/use-other-credentials.hooks";
import type { OtherCredentialsController } from "./hooks/use-other-credentials.hooks";
import { OtherCredentialsSection } from "./OtherCredentialsSection";
import { useRemoveConfirmDialog, useAddCustomCredentialDialog } from "./AccessTokensTab.hooks";

/**
 * @file The Access Tokens tab — `Security.tsx`'s one tab and this feature's actual content. One
 * flat, searchable, category-filtered list of every credential this install holds across all eight
 * stores `development/todos.md:1208` names — the 2026-08-16 owner ruling that replaced this page's
 * original two-surface shape (seven Tier 1 providers here, a banner naming six unread Tier 2 stores)
 * with a single list: "from a person's point of view a Cloudinary key and a GitHub token are the
 * same kind of thing — a secret this install holds." See `ADS-memory/reports/design/
 * 2026-08-16-access-tokens-visual-spec.md`'s "OWNER RULING" section for the ruling in full.
 *
 * Tier 1 (`ACCESS_TOKEN_PROVIDERS`, `rules.ts`: GitHub Pages, Vercel, Netlify, Cloudflare Pages,
 * GitHub, GitLab, Bitbucket) still gets `[+ Add]` and multiple operator-named rows per provider — the
 * genuinely new capability this page adds (see `Security.tsx`'s own header for why "Create" living
 * here is not a repeat of what Static Site/Source Control already do). Tier 2
 * (`OTHER_CREDENTIAL_STORES`, `rules.ts`, rendered by `OtherCredentialsSection.tsx`) gets Replace/
 * Remove and a deep link to wherever Create actually lives, never a second Create — the tier split
 * survives only as that per-row CAPABILITY difference now, not as two separate surfaces. The
 * "showing 7 of 8" partial-inventory banner this page used to render is deleted; there is nothing
 * left to disclose once every store is read.
 *
 * ## Search
 *
 * Matches a provider's/store's brand label, its purpose subtitle ("Publishing"/"Source Control"/
 * "AI"/… — the disambiguation `rules.ts`'s header calls "the two-store GitHub trap" for Tier 1, and
 * the same subtitle Tier 2 rows carry next to their own name), and a saved item's own name. A group
 * renders when EITHER its own info matches the query OR it has at least one matching saved row — so
 * typing "GitHub" surfaces both the GitHub Pages group (provider match) and the GitHub · Source
 * Control group (provider match), each rendering its own real rows, never merged into one card.
 *
 * ## Category filter
 *
 * `All / Source control / Hosting / Media / AI / Ops` (`rules.ts`'s `ACCESS_TOKEN_CATEGORIES`),
 * `All` default, borrowing Settings' wrapped icon-tab-row LOOK without adopting `SettingsDialogShell`
 * itself — that component bundles its own vertical sidebar plus a kicker/title/subtitle header that
 * fights this page's own `.page-header` (`Deployment.tsx`'s header documents the same rejection for
 * the identical reason). `.access-tokens-category-filter` is its own class, not an overload of
 * `.tab-bar` — a filter control, not a tab bar, and `.tab-bar` is shared by five other screens that
 * must not be affected by this page's own styling needs.
 *
 * ## Component split
 *
 * Per-scope ESLint complexity gate (hard 9/9 cyclomatic/cognitive) — same "extract, don't inline"
 * discipline `ProvidersTab.tsx`/`StaticSiteTab.tsx` already use for the identical reason.
 */

export interface AccessTokensTabProps {
  /** DI seams for tests — same convention as every other wired-hook prop in this app. */
  useAccessTokensHook?: typeof useWiredAccessTokens;
  useOtherCredentialsHook?: typeof useWiredOtherCredentials;
}

function resolveAccessTokensHook(override: typeof useWiredAccessTokens | undefined): typeof useWiredAccessTokens {
  return override ?? useWiredAccessTokens;
}
function resolveOtherCredentialsHook(override: typeof useWiredOtherCredentials | undefined): typeof useWiredOtherCredentials {
  return override ?? useWiredOtherCredentials;
}

export function AccessTokensTab(props: AccessTokensTabProps) {
  useAdminLocale();
  const useAccessTokensHook = resolveAccessTokensHook(props.useAccessTokensHook);
  const useOtherCredentialsHook = resolveOtherCredentialsHook(props.useOtherCredentialsHook);
  const controller = useAccessTokensHook();
  // Tier 2 reads `query`/`category` FROM Tier 1's own controller rather than owning either — one
  // search box, one category filter, across both tiers (this file's own header). See
  // `use-other-credentials.hooks.ts`'s header for why that state isn't duplicated here instead.
  const otherController = useOtherCredentialsHook({ query: controller.query, category: controller.category });

  return (
    <div
      className="access-tokens-tab"
      {...agentHandle("security-access-tokens", {
        role: "region",
        label: "Every access token and other saved credential this install holds, across all eight stores, searchable and filterable by category",
      })}
    >
      <AccessTokensBody controller={controller} otherController={otherController} />
    </div>
  );
}

/** Loading/error/populated split — pulled out of {@link AccessTokensTab} purely for the complexity
 *  gate, same reasoning `SourceControlCredentialsList` documents in `ProvidersTab.tsx`. Waits for
 *  BOTH tiers' first load: rendering Tier 1's list before Tier 2 has resolved would put the category
 *  filter and the row list on screen a beat before Tier 2's own rows could ever appear under it,
 *  which reads as those rows being silently absent rather than still loading. */
function AccessTokensBody({ controller, otherController }: { controller: AccessTokensController; otherController: OtherCredentialsController }) {
  const addCustomDialogRef = useRef<HTMLDialogElement>(null);
  if (controller.loadError) {
    return (
      <p className="notice error" role="status" {...agentHandle("security-access-tokens-load-error", { role: "status", label: "Shows the error when saved access tokens could not be loaded" })}>
        {controller.loadError}
      </p>
    );
  }
  if (otherController.loadError) {
    return (
      <p className="notice error" role="status" {...agentHandle("security-other-credentials-load-error", { role: "status", label: "Shows the error when other saved credentials could not be loaded" })}>
        {otherController.loadError}
      </p>
    );
  }
  if (controller.groups === undefined || otherController.groups === undefined) {
    return <p className="access-tokens-loading">{controller.t("Loading access tokens…")}</p>;
  }
  return (
    <>
      <AccessTokensSearch controller={controller} otherController={otherController} />
      <AccessTokensCategoryFilter controller={controller} onAddCustomProvider={() => addCustomDialogRef.current?.showModal()} />
      <div className="access-tokens-tier">
        {controller.groups.map((group) => (
          <MaybeProviderGroup key={`${group.info.kind}:${group.info.providerId}`} group={group} controller={controller} query={controller.query} />
        ))}
        <OtherCredentialsSection controller={otherController} query={controller.query} />
      </div>
      <AddCustomCredentialDialog ref={addCustomDialogRef} controller={controller} t={controller.t} />
    </>
  );
}

/** The `All / Source control / Hosting / Media / AI / Ops` filter row, PLUS the "Add custom
 *  provider" button — see this file's header for why the filter row borrows Settings' wrapped
 *  icon-tab-row LOOK rather than the component itself. The button is a deliberately SEPARATE
 *  control after the mapped category pills (`margin-left: auto` in `access-tokens.css` pushes it to
 *  the far right of the row), not a pill itself — it opens a create form, it does not filter
 *  anything, so it must never read as an eighth category to a search/scan of this row. Pulled out
 *  of {@link AccessTokensBody} for the complexity gate; its own branching is a single `.map()` plus
 *  one static button, so this split is about readability/reuse rather than a budget this one
 *  function would otherwise exceed. */
function AccessTokensCategoryFilter({ controller, onAddCustomProvider }: { controller: AccessTokensController; onAddCustomProvider: () => void }) {
  const translate = controller.t;
  // Reuses `TabBar.hooks.tsx`'s WAI-ARIA tabs keyboard helpers rather than reimplementing them —
  // `ACCESS_TOKEN_CATEGORIES`'s `{ id, label }` shape structurally satisfies `TabBarTab`, and none
  // of these categories are ever disabled. `[role="tab"]` scoping already skips the non-tab
  // "+ Add custom provider" button below (this file's own header on why that button stays out of
  // the tablist's tab order).
  const { onKeyDown } = useTabBarKeyboard(ACCESS_TOKEN_CATEGORIES, controller.category, (id) => controller.setCategory(id as AccessTokenCategoryId));
  return (
    <div
      className="access-tokens-category-filter"
      role="tablist"
      aria-label={translate("Filter by category")}
      onKeyDown={onKeyDown}
      {...agentHandle("security-access-tokens-category-filter", { role: "region", label: "Filter the credential list by category" })}
    >
      {ACCESS_TOKEN_CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          className="access-tokens-category-filter-item"
          aria-selected={controller.category === c.id}
          tabIndex={resolveTabBarTabIndex(ACCESS_TOKEN_CATEGORIES, controller.category, c)}
          onClick={() => controller.setCategory(c.id as AccessTokenCategoryId)}
          {...agentHandle(`security-access-tokens-category-${c.id}`, { role: "button", label: `Filter the credential list to ${c.label}` })}
        >
          {translate(c.label)}
        </button>
      ))}
      <button
        type="button"
        className="access-tokens-add-custom-button"
        onClick={onAddCustomProvider}
        {...agentHandle("security-access-tokens-add-custom-provider", { role: "button", label: "Add a custom provider not in the built-in list" })}
      >
        {translate("+ Add custom provider")}
      </button>
    </div>
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

/** The search box and its own match-count line — counts are the SUM of both tiers'
 *  `totalCount`/`matchCount` (this file's header on why the combined count stays a GLOBAL fact,
 *  unaffected by the category filter below it). "tokens" stays the noun even though the count now
 *  spans Tier 2's keys/credentials too — the existing e2e suite pins the exact string
 *  (`development/e2e/access-tokens.spec.ts`'s `/^0 tokens saved$/`), and nothing in this pass asked
 *  for new copy here; a person calling a Composio key a "token" loosely is the same shorthand this
 *  page's own tab name already uses for the whole install. */
function AccessTokensSearch({ controller, otherController }: { controller: AccessTokensController; otherController: OtherCredentialsController }) {
  const translate = controller.t;
  const totalCount = controller.totalCount + otherController.totalCount;
  const matchCount = controller.matchCount + otherController.matchCount;
  const tokenWord = pickPlural(totalCount, { one: translate("token"), other: translate("tokens") });
  const countText =
    controller.query.trim() === ""
      ? `${totalCount} ${tokenWord} ${translate("saved")}`
      : `${matchCount} ${translate("of")} ${totalCount} ${tokenWord} ${translate("matching")} “${controller.query}”`;
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
        autoComplete="off"
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
      {/* No `[+ Add another]` for a `"custom"` group — it has no shared provider identity a second
          saved row could join; a second custom credential is a wholly new one, created through the
          standalone "Add custom provider" dialog, not this per-provider affordance. */}
      {hasRows && !group.addForm.visible && group.info.kind !== "custom" ? <AddAnotherButton ref={ref} label={group.info.label} controller={controller} t={controller.t} /> : null}
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
          // `aria-label`, not just the visible "Connect" text: every not-yet-connected provider on
          // this page renders this exact same bare word, so with two or more not-connected rows on
          // screen at once (the common case — most installs have not connected every one of the
          // seven providers), `getByRole("button", { name: "Connect" })` — or an agent resolving by
          // accessible name — cannot tell GitHub's row from GitLab's. `label` here is already the
          // provider's own display label (e.g. "GitHub Pages"), so this starts with the exact
          // visible word (WCAG 2.5.3 Label in Name).
          aria-label={`${translate("Connect")} ${label}`}
          // Handle built from `ref.kind`/`ref.providerId` (already lowercase, hyphen-safe — every
          // `AccessTokenProviderRef` in this app comes straight off `ACCESS_TOKEN_PROVIDERS`), never
          // from `label` — `agentHandle()` rejects any handle that isn't lowercase words joined by
          // single hyphens, and a proper-noun label like "GitHub Pages" (capitals, a space) throws
          // at render time. Caught live: an uncaught throw here unmounted this whole row with no
          // error boundary above it, which is worse than a defensive check — a crash, not a fallback.
          {...agentHandle(`security-access-tokens-connect-${ref.kind}-${ref.providerId}`, { role: "button", label: `Connect ${label}` })}
        >
          {translate("Connect")}
          <DisclosureChevronIcon />
        </button>
      </div>
    </div>
  );
}

function TokenRow({ state, controller, groupRowCount, t: translate }: { state: AccessTokenExistingRowState; controller: AccessTokensController; groupRowCount: number; t: Translate }) {
  const info = accessTokenRowProviderInfo(state.row);
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
 *  for the complexity gate.
 *
 * This button lives inside `TokenRow`'s own `<summary>`, a descendant of the native disclosure
 * toggle, so its click would otherwise ALSO open/close the enclosing `<details>` (the browser runs
 * `<summary>`'s toggle as the click event's default action regardless of which descendant was
 * actually clicked, unless that default action is cancelled) — `preventDefault`/`stopPropagation`
 * in the handler below is what keeps a "Make default" click from also expanding the row, same
 * pattern as `deployment/StaticSiteTab.tsx`'s `CredentialVerifyAction`. */
function TokenRowDefaultIndicator({ state, showDefaultUi, controller, t: translate }: { state: AccessTokenExistingRowState; showDefaultUi: boolean; controller: AccessTokensController; t: Translate }) {
  if (!showDefaultUi) return null;
  if (state.row.isDefault) return <span className="status status-neutral">{translate("Default")}</span>;
  return (
    <button
      type="button"
      className="link-button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void controller.makeDefault(state.row);
      }}
      // `aria-label`, not just the visible "Make default" text: this button renders once per
      // non-default row in a provider group that has 2+ saved tokens (the ONLY case it renders at
      // all — this function's own guard above), so with 3+ saved tokens for one provider, multiple
      // identically-labeled "Make default" buttons are on screen simultaneously. `state.name` is
      // this row's own operator-chosen display name, already unique enough to pick one out.
      aria-label={`${translate("Make default")} — ${state.name}`}
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
  // `optionalFields` (e.g. a custom row's Username — `rules.ts`'s `AccessTokenProviderInfo` doc)
  // shows the field WITHOUT gating readiness on it — only `requiredFields` does that (see
  // `accessTokenRowReadyToSave`/`accessTokenReplaceReadyToSave`, which never read this field).
  const needsUsername = info.requiredFields.includes("username") || (info.optionalFields ?? []).includes("username");
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
        {/* `autoComplete="new-password"`, NOT `"off"` — Chrome deliberately ignores `off` on
            credential-shaped fields (a long-standing intentional decision, not a bug), and `off`
            here is what let the reported autofill through. `new-password` is the documented signal
            for "this field is not a saved-login field", which suppresses both the saved-credential
            dropdown and the silent fill.

            This input is why the SEARCH BOX at the top of the page was being filled with "admin":
            `TokenRow`'s `<details>` renders `ExistingTokenFields` unconditionally, so every saved
            token leaves a live password input in the DOM even while its row is collapsed. Chrome's
            formless credential heuristic groups a page's text-like fields with any password field
            by DOM proximity — no `<form>` required, and there is none in this feature — so the page
            read as a login surface and the first text-like field (the search box) got the site's
            saved username. Fixing the search box's own attribute could not work: the search box was
            the symptom, these fields are the trigger. */}
        <input
          id={`${idPrefix}-token`}
          type="password"
          autoComplete="new-password"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          {...agentHandle(`${idPrefix}-token`, { role: "field", label: "This token's secret value — stored encrypted, never shown again once saved" })}
        />
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
            <a
              href={info.tokenPageUrl}
              target="_blank"
              rel="noreferrer"
              {...agentHandle(`${idPrefix}-token-page`, { role: "link", label: `Open ${info.label}'s own page for creating a personal access token` })}
            >
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
          <input
            id={`${idPrefix}-account`}
            type="text"
            value={accountId}
            onChange={(e) => onAccountIdChange(e.target.value)}
            {...agentHandle(`${idPrefix}-account`, { role: "field", label: "This provider's account id" })}
          />
          <p className="field-hint">{translate("Shown on your Cloudflare dashboard's own sidebar — Cloudflare cannot resolve a project without it.")}</p>
        </div>
      ) : null}
      {needsUsername ? (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-username`}>
            {translate("Username")}
          </label>
          <input
            id={`${idPrefix}-username`}
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            {...agentHandle(`${idPrefix}-username`, { role: "field", label: "The username this token authenticates against, when this provider needs one" })}
          />
          <p className="field-hint">
            {info.kind === "custom"
              ? translate("Optional — only needed if this provider authenticates a token against a username.")
              : translate("The Bitbucket username this API token belongs to.")}
          </p>
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
  const readyToSave = accessTokenExistingRowReadyToSave(fields, state.row);
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
          // `aria-label`, not just the visible "Save"/"Saving…" text: a provider group can hold
          // several saved tokens (`AddAnotherButton` above), each opened via its own `<details>`
          // (unlike `RowMenu`'s exclusive-open items, more than one can be expanded at once) — with
          // two rows open, both show an identical bare "Save" button. `state.name` is this row's own
          // display name, already visible in its `<summary>` heading, so it disambiguates the same
          // way a sighted reader already can. Mirrors the visible text's own saving/idle split so the
          // accessible name never says "Save" while the button reads "Saving…" (WCAG 2.5.3).
          aria-label={`${state.saving ? translate("Saving…") : translate("Save")} — ${state.name}`}
          {...agentHandle(`security-access-tokens-save-${state.row.id}`, { role: "button", label: `Save this ${info.label} token` })}
        >
          {state.saving ? translate("Saving…") : translate("Save")}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={onRemoveClick}
          // Same multi-row-open ambiguity as Save above, on this page's one destructive action —
          // see `rules.ts`'s `restoreButtonAccessibleName` (`recovery/rules.ts`) for the identical
          // reasoning applied to a different screen's own always-visible destructive control.
          aria-label={`${translate("Remove from Tovu")} — ${state.name}`}
          {...agentHandle(`security-access-tokens-remove-${state.row.id}`, { role: "button", label: `Open the confirm dialog to remove this ${info.label} token from Tovu` })}
        >
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
          // `aria-label`: more than one provider's "Add" form can be open at once (each provider
          // group owns its own independent `addForm.visible`), and every one of them renders this
          // same bare "Save"/"Saving…" text — `info.label` is the one thing that tells them apart
          // here (there is no operator-chosen name yet to use, unlike `ExistingTokenFields`' own
          // fix above, since this token has not been saved).
          aria-label={`${state.saving ? translate("Saving…") : translate("Save")} — ${info.label}`}
          {...agentHandle(`security-access-tokens-create-${info.kind}-${info.providerId}`, { role: "button", label: `Save this ${info.label} token` })}
        >
          {state.saving ? translate("Saving…") : translate("Save")}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => controller.closeAddForm(ref)}
          aria-label={`${translate("Cancel")} adding this ${info.label} token`}
          {...agentHandle(`security-access-tokens-cancel-${info.kind}-${info.providerId}`, { role: "button", label: "Close this add-token form without saving" })}
        >
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
    const { close, confirm } = useRemoveConfirmDialog(ref, row, controller);
    // `aria-labelledby`, not left implicit: a native `<dialog>` has no accessible name of its own
    // from an `<h2>` sitting inside it — that link has to be stated, the same way the shared
    // `ConfirmDialog` (`@jini-ai/admin/react`) already does via its own `titleId`. Without it, every
    // one of this page's per-row remove dialogs reads to an accessibility tree as an unnamed
    // "dialog", indistinguishable from any other open dialog on the page. Scoped by `row.id` (not a
    // static id) because one `RemoveConfirmDialog` is mounted per token row, all in the DOM at once.
    const titleId = `security-access-tokens-remove-title-${row.id}`;
    return (
      <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{removeDialogTitle(locale, row.name)}</h2>
        <p className="confirm-dialog-body">{removeDialogBody(locale, info.label, info.vendorLabel)}</p>
        <p>
          {/* `info.vendorLabel`, NOT `info.label` — this line says WHERE to revoke, and "GitHub
              Pages"/"Cloudflare Pages" are destinations with no revoke console of their own. See
              `rules.ts`'s `AccessTokenProviderInfo.vendorLabel` doc for the full reasoning; every
              other `info.label` on this page still names the destination on purpose. */}
          <a
            href={info.tokenPageUrl}
            target="_blank"
            rel="noreferrer"
            {...agentHandle(`security-access-tokens-revoke-page-${row.id}`, { role: "link", label: `Open ${info.vendorLabel} to revoke this token at the source` })}
          >
            {translate("Revoke it on")} <span translate="no">{info.vendorLabel}</span> ↗
          </a>
        </p>
        {isLastForProvider ? <p className="confirm-dialog-body">{removeDialogLastRowNote(locale, info.label)}</p> : null}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            onClick={close}
            {...agentHandle(`security-access-tokens-remove-cancel-${row.id}`, { role: "button", label: "Close this dialog without removing the token" })}
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

/** The red-star marker on a required field's label — Name/API base URL/Access token in the form
 *  below (Username stays unmarked, Category always carries a value so it's never actually blank).
 *  `aria-label`, not `aria-hidden`, so a screen reader announces "required" — same convention
 *  `Authentication.tsx`'s own `source-config-field-required` marker uses. */
function RequiredFieldMarker() {
  return (
    <span className="access-tokens-field-required" aria-label="required">
      {" "}
      *
    </span>
  );
}

/** The "Additional hosts" field — split out of {@link AddCustomCredentialDialog} purely so that
 *  function's own complexity stays under this repo's gate; the inline-error branch below adds one
 *  more decision point to whichever function renders it, and `AddCustomCredentialDialog` already
 *  carries a full field set's worth. */
function AdditionalHostsField({ value, onChange, translate }: { value: string; onChange: (value: string) => void; translate: Translate }) {
  const invalid = invalidAdditionalHostsEntries(value);
  return (
    <div className="field">
      <label className="field-label" htmlFor="security-add-custom-additional-hosts">
        {translate("Additional hosts")}
      </label>
      <textarea
        id="security-add-custom-additional-hosts"
        rows={2}
        value={value}
        placeholder="https://api.machines.dev"
        onChange={(e) => onChange(e.target.value)}
        {...agentHandle("security-access-tokens-add-custom-additional-hosts", {
          role: "field",
          label: "Extra API hosts this same credential is also allowed to call, beyond the base URL",
        })}
      />
      <p className="field-hint">
        {translate("Optional — some providers use more than one API host for the same account (e.g. fly.io's api.fly.io and api.machines.dev). One per line, or comma-separated.")}
      </p>
      {invalid.length > 0 ? <p className="field-error">{translate("Each additional host must be a valid http:// or https:// URL.")}</p> : null}
    </div>
  );
}

/**
 * The "Add custom provider" form (`AccessTokensCategoryFilter`'s own button opens it) — a
 * standalone native `<dialog>`, not a per-provider `AddTokenForm` (this file's own header on why a
 * custom row has no shared provider group to attach an inline add-form to). Collects the four
 * fields the brief specifies (API base URL, Access token with a show/hide toggle, optional
 * Username, Category) plus a Name field every other row on this page already requires (the display
 * name the list/search will show — `TokenInputFields`' own "Name" field doc gives the identical
 * reasoning). Deliberately does NOT reuse `TokenInputFields`: that shared component's field set
 * (Name/Token/AccountId/Username) has no Base URL or Category concept, and both of those are
 * create-only here (see `rules.ts`'s `accessTokenRowProviderInfo` doc for why Replace on an
 * existing custom row does not re-collect them) — bolting a fifth, create-only field onto a
 * component shared with the seven catalog providers' Replace flow would risk it leaking there too.
 */
const AddCustomCredentialDialog = forwardRef<HTMLDialogElement, { controller: AccessTokensController; t: Translate }>(
  function AddCustomCredentialDialog({ controller, t: translate }, ref) {
    const { showToken, toggleShowToken, readyToSave, baseUrlInvalid, close, save } = useAddCustomCredentialDialog(ref, controller);
    const form = controller.customAddForm;
    // Same `aria-labelledby` fix as `RemoveConfirmDialog` above — one instance of this dialog per
    // page, so a static id is fine (contrast the per-row `row.id`-scoped id there).
    const titleId = "security-access-tokens-add-custom-title";

    return (
      <dialog
        ref={ref}
        className="confirm-dialog access-tokens-add-custom-dialog"
        aria-labelledby={titleId}
        {...agentHandle("security-access-tokens-add-custom-dialog", { role: "region", label: "Add a custom provider not in the built-in list" })}
      >
        <h2 id={titleId}>{translate("Add custom provider")}</h2>
        <div className="field">
          <label className="field-label" htmlFor="security-add-custom-name">
            {translate("Name")}
            <RequiredFieldMarker />
          </label>
          <input
            id="security-add-custom-name"
            type="text"
            value={form.name}
            onChange={(e) => controller.setCustomAddField({ name: e.target.value })}
            {...agentHandle("security-access-tokens-add-custom-name", { role: "field", label: "This custom provider's display name, e.g. name.com" })}
          />
          <p className="field-hint">{translate("A short label so you can tell this apart from your other saved credentials.")}</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="security-add-custom-base-url">
            {translate("API base URL")}
            <RequiredFieldMarker />
          </label>
          <input
            id="security-add-custom-base-url"
            type="url"
            value={form.baseUrl}
            placeholder="https://api.example.com"
            onChange={(e) => controller.setCustomAddField({ baseUrl: e.target.value })}
            {...agentHandle("security-access-tokens-add-custom-base-url", { role: "field", label: "This provider's API base URL" })}
          />
          {baseUrlInvalid ? <p className="field-error">{translate("Enter a valid http:// or https:// URL.")}</p> : null}
        </div>
        <AdditionalHostsField
          value={form.additionalHosts}
          onChange={(value) => controller.setCustomAddField({ additionalHosts: value })}
          translate={translate}
        />
        <div className="field">
          <label className="field-label" htmlFor="security-add-custom-token">
            {translate("Access token")}
            <RequiredFieldMarker />
          </label>
          <div className="access-tokens-token-input-row">
            <input
              id="security-add-custom-token"
              type={showToken ? "text" : "password"}
              autoComplete="new-password"
              value={form.token}
              onChange={(e) => controller.setCustomAddField({ token: e.target.value })}
              {...agentHandle("security-access-tokens-add-custom-token", { role: "field", label: "This provider's access token" })}
            />
            <button
              type="button"
              className="access-tokens-token-toggle"
              onClick={toggleShowToken}
              {...agentHandle("security-access-tokens-add-custom-token-toggle", { role: "button", label: showToken ? "Hide the access token" : "Show the access token" })}
            >
              {showToken ? translate("Hide") : translate("Show")}
            </button>
          </div>
          <p className="field-hint">{translate("This will not be shown again for security purposes.")}</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="security-add-custom-username">
            {translate("Username")}
          </label>
          <input
            id="security-add-custom-username"
            type="text"
            value={form.username}
            onChange={(e) => controller.setCustomAddField({ username: e.target.value })}
            {...agentHandle("security-access-tokens-add-custom-username", { role: "field", label: "This provider's username, if it authenticates a token against one" })}
          />
          <p className="field-hint">{translate("Optional — only needed if this provider authenticates a token against a username.")}</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="security-add-custom-category">
            {translate("Category")}
          </label>
          <select
            id="security-add-custom-category"
            value={form.category}
            onChange={(e) => controller.setCustomAddField({ category: e.target.value as AccessTokenRowCategoryId })}
            {...agentHandle("security-access-tokens-add-custom-category", { role: "field", label: "Which category this credential is filed under" })}
          >
            {ACCESS_TOKEN_CATEGORIES.filter((c) => c.id !== "all").map((c) => (
              <option key={c.id} value={c.id}>
                {translate(c.label)}
              </option>
            ))}
          </select>
        </div>
        {form.error ? (
          <p className="save-error" role="alert">
            {form.error}
          </p>
        ) : null}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            onClick={close}
            {...agentHandle("security-access-tokens-add-custom-cancel", { role: "button", label: "Close this dialog without saving a custom provider" })}
          >
            {translate("Cancel")}
          </button>
          <button
            type="button"
            disabled={!readyToSave || form.saving}
            onClick={() => void save()}
            {...agentHandle("security-access-tokens-add-custom-save", { role: "button", label: "Save this custom provider credential" })}
          >
            {form.saving ? translate("Saving…") : translate("Save")}
          </button>
        </div>
      </dialog>
    );
  }
);
