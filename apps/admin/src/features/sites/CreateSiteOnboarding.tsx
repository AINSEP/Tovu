import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "../../lib/dictionary-translator";
import {
  resolveCreateInputDisabled,
  resolveCreateSubmitDisabled,
  resolveDatabaseOptionClassName,
  resolveSiteDatabaseOptions,
  type SiteDatabaseOption,
} from "./Sites.hooks";
import type { useWiredSites } from "./hooks/use-sites.hooks";

/**
 * @file The create-a-site form — the body of the **"New site" tab**, not a page of its own.
 *
 * Its CONTENT was ported from Tovu Runner's `CreateWebsiteOnboarding.tsx` and the owner kept it.
 * Its PLACEMENT was not hers and is now corrected: the port also moved creation onto a full-page
 * `?tab=new` screen reached from a header button, which deleted the tab bar she had asked for in
 * words, twice. See `Sites.tsx`'s header for the full sequence and the rule it produced. What
 * changed here is the frame — no back link, no page-title swap, Cancel returns to the first tab —
 * and nothing inside the card.
 *
 * ## What was ported, and what was rebuilt
 *
 * PORTED — the shape and the words: one sectioned card running "Site details" -> "Database" ->
 * actions, with Cancel beside the submit. The three database options keep Runner's own titles and
 * hint wording ("Default · …", "Hosted · requires a project URL and API key", "Any vendor · add its
 * endpoint and credential") so the two products read as one family, and each unavailable vendor
 * still shows the fields Runner shows for it.
 *
 * REBUILT — everything below the markup. Runner's version is backed by `useCreateWebsiteForm`, with
 * `database` state, `supabaseUrl`/`customProvider`/`customConnection` state, two credential refs,
 * and a `computeCanCreate` that varies by branch. None of that is ported, because Tovu's create
 * call takes a name and nothing else and this feature already owns its own controller
 * (`use-sites.hooks.ts`). Runner's CSS is not ported either — the classes here are Tovu admin's own
 * tokens, per the dispatch.
 *
 * ## Why Runner can offer three backends and this screen cannot
 *
 * **Site creation is SQLite and only SQLite, and porting Runner's pixels must not port a promise
 * this backend cannot keep.** Verified against the code, not assumed: `initSite`
 * (`apps/website/src/platform/site-dir/init-site.ts`) calls
 * `openContentDb(path.join(target, "content.db"), seed)` — hardcoded, with no dialect anywhere in
 * its input shape; the create route (`server/inbound/admin-http/routes/system/sites.ts`) reads
 * exactly one field off the request body (`parseCreateSiteName`) and silently discards the rest;
 * and `schema.postgres.ts`, though a real generated Postgres schema, is reachable only from
 * drift/parity tests. Supabase exists in this repo solely as an MCP server preset for the
 * assistant, which is a different feature.
 *
 * Runner gets to render all three live because Runner's create screen provisions nothing — its own
 * footer says as much, and it carries a `blocked` project status for precisely this case, commented
 * in its own source: *"A blocked project is waiting on database-provider support Tovu does not
 * have, so the only honest affordance is none — starting it would fail every time."* Tovu's button
 * really does create a site. So the same principle Runner states there is applied one step earlier
 * here: the affordance is shown, and it is not live.
 *
 * The guarantee is structural rather than cosmetic. **There is no state variable that can hold a
 * dialect.** SQLite's radio is a fixed `checked`/`readOnly` control; the other two are `disabled`;
 * and {@link CreateSiteOnboarding}'s submit handler calls `createSite()` — a zero-argument function
 * with nowhere to put a choice. Forcing a disabled radio on in the DOM (which a `disabled`
 * attribute alone would not survive) therefore changes nothing about the request, because nothing
 * reads it. "Chose Supabase, silently received SQLite" has no code path to travel down, which is
 * the standard the rest of this screen is already held to — see `Sites.tsx`'s header.
 *
 * ## Chat data
 *
 * "Chats always use SQLite" is literally true and deliberate rather than a simplification: chat
 * history lives in a separate `chat.db` sidecar (`platform/db/sqlite/chat-db.ts`), specifically so
 * a whole-file restore or duplicate of `content.db` can never carry — or erase — conversation
 * history.
 *
 * ## Guards
 *
 * All three create-form guards survive this move as they survived the last one, each with its own
 * test: the name field disables while a create is in flight or switching is off ({@link
 * resolveCreateInputDisabled}), the submit button keeps its four-condition guard ({@link
 * resolveCreateSubmitDisabled}), and every edit still routes through the controller's own
 * `setCreateName` rather than a local copy — which is also what clears the confirmation line.
 *
 * ## Where the "Created." line went
 *
 * To `AllSitesTab`. A successful create now returns to the "All sites" tab (the owner's own
 * requirement: *"That should go back to the first tab, and then we should see the new website
 * created there"*), so a confirmation rendered in this footer could only ever be seen in the state
 * where it is STALE — an operator coming back to this tab after a create, with the field already
 * cleared. The confirmation belongs where the new card is.
 */

export interface CreateSiteOnboardingProps {
  controller: Pick<
    ReturnType<typeof useWiredSites>,
    "createName" | "setCreateName" | "createNameError" | "createSite" | "creating" | "switchingEnabled" | "t"
  >;
  /** Back to the "All sites" tab, creating nothing. Supplied by `Sites.tsx` so this form owns no
   *  routing of its own — same seam Runner's own `onBack` is. */
  onCancel: () => void;
}

/** The vendor credential fields Runner shows under a selected Supabase option. Rendered here
 *  unconditionally rather than on selection (the option cannot be selected) and every control
 *  `disabled`, so the shape of the eventual flow is visible without a field that could collect a
 *  credential this product has nowhere to put. */
function SupabaseVendorFields({ t }: { t: Translate }) {
  return (
    <span className="site-db-vendor">
      <span className="field">
        <label className="field-label" htmlFor="site-db-supabase-url">
          {t("Supabase project URL")}
        </label>
        <input id="site-db-supabase-url" disabled placeholder="https://your-project.supabase.co" inputMode="url" />
      </span>
      <span className="field">
        <label className="field-label" htmlFor="site-db-supabase-key">
          {t("Supabase API key")}
        </label>
        <input id="site-db-supabase-key" type="password" disabled placeholder={t("Paste your API key")} autoComplete="off" />
        <span className="field-hint">{t("Shown for what's coming. It isn't stored anywhere yet.")}</span>
      </span>
    </span>
  );
}

/** The same treatment for Runner's third option. */
function CustomVendorFields({ t }: { t: Translate }) {
  return (
    <span className="site-db-vendor">
      <span className="field">
        <label className="field-label" htmlFor="site-db-custom-provider">
          {t("Provider name")}
        </label>
        <input id="site-db-custom-provider" disabled placeholder={t("e.g. Neon, PlanetScale, Turso")} />
      </span>
      <span className="field">
        <label className="field-label" htmlFor="site-db-custom-connection">
          {t("Connection string or API endpoint")}
        </label>
        <input id="site-db-custom-connection" disabled placeholder="https://… or postgres://…" autoComplete="off" />
        <span className="field-hint">{t("Shown for what's coming. It isn't stored anywhere yet.")}</span>
      </span>
    </span>
  );
}

/** Dispatches an option's vendor fields as a flat if-chain — a plain function rather than a ternary
 *  in {@link DatabaseOption}'s JSX, which would be counted against that component's own complexity.
 *  SQLite has none: there is nothing to configure, which is the point of it.
 *  @complexity O(1) — three mutually exclusive branches. */
function vendorFieldsFor(option: SiteDatabaseOption, t: Translate) {
  if (option.id === "supabase") return <SupabaseVendorFields t={t} />;
  if (option.id === "custom") return <CustomVendorFields t={t} />;
  return null;
}

/**
 * One database option.
 *
 * A `<div>` with sibling `<label htmlFor>`s rather than Runner's wrapping `<label>`: the two vendor
 * options each carry their own labelled controls, and a `<label>` nested inside another `<label>`
 * is invalid HTML whose accessible-name resolution is genuinely ambiguous. SQLite is built the same
 * way for symmetry.
 *
 * `available` decides both the radio's `disabled` and the status pill, from one source — so a card
 * cannot render as choosable while being refused, or vice versa.
 */
function DatabaseOption({ option, t }: { option: SiteDatabaseOption; t: Translate }) {
  const inputId = `site-db-${option.id}`;
  return (
    <div className={resolveDatabaseOptionClassName({ selected: option.available, available: option.available })}>
      <input
        type="radio"
        id={inputId}
        name="site-db"
        value={option.id}
        checked={option.available}
        disabled={!option.available}
        aria-disabled={option.available ? undefined : "true"}
        readOnly
      />
      <span className="site-db-option-text">
        <span className="site-db-option-head">
          <label className="site-db-option-name" htmlFor={inputId}>
            {option.title}
          </label>
          <span className={option.available ? "status status-ok" : "status status-neutral"}>
            {option.available ? t("Ready") : t("Not supported yet")}
          </span>
        </span>
        <span className="site-db-option-note">{option.hint}</span>
        {vendorFieldsFor(option, t)}
      </span>
    </div>
  );
}

/** The "Database" section. Runner's own section blurb, plus the one sentence Runner has no need for
 *  — the reason two of its three options are inert here. */
function DatabaseSection({ t }: { t: Translate }) {
  return (
    <div className="onboarding-section">
      <div className="onboarding-section-head">
        <h3 className="onboarding-section-title">{t("Database")}</h3>
        <p className="onboarding-section-lead">{t("SQLite is the zero-configuration default. Bring a hosted vendor when you need one.")}</p>
      </div>
      <div
        className="site-db-options"
        role="group"
        aria-label={t("Database")}
        {...agentHandle("sites-create-database", {
          role: "region",
          label: "Which database backs the new site — SQLite is the only one Tovu can create today",
        })}
      >
        {resolveSiteDatabaseOptions(t).map((option) => (
          <DatabaseOption key={option.id} option={option} t={t} />
        ))}
      </div>
      <p className="field-hint">{t("Tovu creates every site's content database as SQLite today, so the other two can't be chosen yet. Chats always use SQLite, in a separate chat.db — restoring content never touches conversation history.")}</p>
    </div>
  );
}

/** The "Site details" section — Runner's "Website details", named for what this product calls the
 *  thing. The hint is Runner's ("This becomes the isolated local workspace folder") rewritten for
 *  the fact that in Tovu the name IS the folder, not a slug derived from one. */
function DetailsSection({ controller }: { controller: CreateSiteOnboardingProps["controller"] }) {
  const { createName, setCreateName, createNameError, creating, switchingEnabled, t } = controller;
  return (
    <div className="onboarding-section">
      <div className="onboarding-section-head">
        <h3 className="onboarding-section-title">{t("Site details")}</h3>
        <p className="onboarding-section-lead">{t("Name the isolated workspace folder for this site.")}</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="site-name">
          {t("Folder name")}
        </label>
        <input
          id="site-name"
          name="name"
          className="site-name-input"
          value={createName}
          disabled={resolveCreateInputDisabled({ creating, switchingEnabled })}
          placeholder="my-second-site"
          autoComplete="off"
          onChange={(e) => setCreateName(e.target.value)}
          {...agentHandle("sites-create-name", { role: "field", label: "New site folder name" })}
        />
        {createNameError ? (
          <p className="field-error">{createNameError}</p>
        ) : (
          <p className="field-hint">{t("Lowercase letters, digits, and dashes. This becomes the folder under sites/.")}</p>
        )}
      </div>
    </div>
  );
}

/** The card's footer: the restart truth, then Cancel and the submit — Runner's own `onboarding__
 *  actions` shape, where a sentence about what will actually happen sits beside the buttons.
 *  Creating never switches the running server, and this is the moment an operator would otherwise
 *  assume it did. */
function OnboardingActions({ controller, onCancel }: CreateSiteOnboardingProps) {
  const { createName, createNameError, creating, switchingEnabled, t } = controller;
  return (
    <footer className="onboarding-actions">
      <p className="onboarding-actions-note">{t("Creating a site never switches this server onto it. Activate it from All sites, then restart.")}</p>
      <div className="onboarding-actions-buttons">
        <button type="button" className="btn-secondary" onClick={onCancel} {...agentHandle("sites-create-cancel", { role: "button", label: "Go back to the site list without creating anything" })}>
          {t("Cancel")}
        </button>
        <button
          type="submit"
          disabled={resolveCreateSubmitDisabled({ creating, switchingEnabled, createNameError, createName })}
          {...agentHandle("sites-create-submit", { role: "button", label: "Create the site folder" })}
        >
          {creating ? t("Creating…") : t("Create site")}
        </button>
      </div>
    </footer>
  );
}

export function CreateSiteOnboarding({ controller, onCancel }: CreateSiteOnboardingProps) {
  return (
    <form
      className="onboarding"
      {...agentHandle("sites-create-form", { role: "form", label: "Create a new site folder under sites/" })}
      onSubmit={(e) => {
        e.preventDefault();
        controller.createSite();
      }}
    >
      <div className="onboarding-card">
        <DetailsSection controller={controller} />
        <DatabaseSection t={controller.t} />
        <OnboardingActions controller={controller} onCancel={onCancel} />
      </div>
    </form>
  );
}
