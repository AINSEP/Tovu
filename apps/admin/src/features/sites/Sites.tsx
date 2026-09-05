import { DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";

import { describeApiError, type AdminSiteListEntry, type AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { formatTimestamp } from "../../lib/format-timestamp";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { siteRowState, siteRowStateLabelKey, siteRowStateToneClass, type ActivationOutlook } from "./rules";
import { useWiredSites } from "./hooks/use-sites.hooks";

/**
 * @file Sites admin screen (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`) — the `/admin/sites` route. List the
 * site folders under `sites/`, create one, and choose which one this server serves NEXT.
 *
 * ## The design constraint that shapes every section below
 *
 * Activate cannot switch a running server. `siteDir()` resolves `TOVU_SITE_DIR`/`TOVU_SITE` once,
 * at boot, and `content.db`/uploads/themes all bind off that single resolution — so Activate
 * persists a choice to `.env` and a human restarts. The owner was told this and chose the design
 * anyway (that decision record, "Mechanism"); auto-restart via the `dev.mjs` supervisor was offered
 * and declined for this slice.
 *
 * That makes the screen's real job *not lying*. Three separate things could each produce a screen
 * that implies a switch happened when it did not, and each has its own section here:
 *
 * 1. **The live site may not be in the list at all.** `listSites` only counts a directory once it
 *    carries a valid `.site-meta.json` commit marker, and this repo's own `sites/tovu-com` predates
 *    that marker — so `sites[]` comes back EMPTY on a server that is plainly serving it. {@link
 *    NowServingCard} renders `currentSite` (the server's own live binding, not a row) FIRST and
 *    unconditionally, and says so explicitly when `listed` is false.
 * 2. **A pending choice is not a switch.** After Activate the activated row still reports
 *    `pending-restart`, never `serving`, because the server re-derives `currentSite` from what it
 *    actually booted with. {@link PendingActivationNotice} names what is still being served.
 * 3. **A pending choice can be inert.** `resolveSiteRoot` reads `TOVU_SITE_DIR` ABOVE the
 *    `TOVU_SITE` line Activate writes, so with that variable set the next boot ignores the choice
 *    entirely. `activationOutlook` (`rules.ts`) reports that case separately and the copy says the
 *    restart will NOT pick the choice up.
 *
 * The daemon rides the same restart and is called out in the copy for the same reason: the known
 * `reference_daemon_inherits_cwd_not_site_dir` trap is closed here (`daemon-supervisor.ts` threads
 * `TOVU_SITE_DIR` from the parent's own resolved `siteDir()` into every spawn, so the daemon cannot
 * drift onto a different site than the API) — but "closed" means both are on the OLD site until the
 * restart, which is a thing the operator has to be told, not a thing to leave implied.
 *
 * ## Markup only
 *
 * All state, effects, and `api.*` calls live in `hooks/use-sites.hooks.ts`; all derivations live in
 * `rules.ts`. What stays here is what renders. `t` is threaded down as a prop from `Sites`'s own
 * hook rather than each subcomponent resolving its own — see `Redirects.tsx`'s header for the
 * standing i18n rule.
 */

/** One `label / value` pair in the "Now serving" card. The value is a `.field-readonly` rather than
 *  plain text because both values it holds are absolute paths, which need to scroll rather than
 *  wrap or blow out the card. */
function ServingFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-readonly-row">
        <span className={mono ? "field-readonly field-mono" : "field-readonly"}>{value}</span>
      </div>
    </div>
  );
}

/** Shown when the served directory does not appear in the table below — see this file's header,
 *  point 1. Without this the screen reads as "you have no sites" on a running server. */
function UnlistedSiteNotice({ t }: { t: Translate }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("sites-unlisted-notice", {
        role: "status",
        label: "Warning that the site currently being served does not appear in the sites table",
      })}
    >
      {t("This site isn't in the table below, but it's still what's being served.")}
    </div>
  );
}

/** Shown when `TOVU_SITE_DIR` is set — see this file's header, point 3. */
function SiteDirOverrideNotice({ t }: { t: Translate }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("sites-dir-override-notice", {
        role: "status",
        label: "Warning that TOVU_SITE_DIR is set and outranks anything Activate writes",
      })}
    >
      {t("TOVU_SITE_DIR is set in this server's environment. It overrides Activate — restarting will keep serving this folder until it's unset.")}
    </div>
  );
}

/** The "a choice is saved but nothing has happened yet" line — see this file's header, point 2.
 *  Renders nothing when no choice is pending, so the caller has no conditional of its own.
 *
 *  This is the ONLY place a pending choice is reported. An earlier revision also rendered the
 *  activate response as its own separate notice below the card, which put the same sentence on
 *  screen twice the moment an operator clicked Activate; the response's one genuinely unique
 *  contribution is `restartInstructions` (the route's own prose, so the wording lives in one
 *  place), and that is threaded in here as `instructions` instead. It is `null` after a reload —
 *  the response is gone but the pending state is not, which is exactly the split `persistedSiteName`
 *  exists to cover. */
function PendingActivationNotice({
  outlook,
  currentName,
  instructions,
  t,
}: {
  outlook: ActivationOutlook;
  currentName: string;
  instructions: string | null;
  t: Translate;
}) {
  if (outlook.kind === "none") return null;
  return (
    <div
      className={outlook.kind === "pending" ? "notice warning" : "notice error"}
      {...agentHandle("sites-pending-activation", {
        role: "status",
        label: "Which site is queued for the next restart, and whether that restart will honor it",
      })}
    >
      <p>
        <strong>{outlook.name}</strong>{" "}
        {outlook.kind === "pending"
          ? t("is saved to serve next. Nothing has switched yet — this server and its agent daemon are both still on")
          : t("is saved, but TOVU_SITE_DIR overrides it, so a restart will not pick it up. This server and its agent daemon are both still on")}{" "}
        <strong>{currentName}</strong>
        {t(".")}
      </p>
      {instructions === null ? <p>{t("Restart the dev server to apply it.")}</p> : <p>{instructions}</p>}
    </div>
  );
}

/** The live binding, first and unconditional — never a row from the table, which may not contain
 *  it. See this file's header. */
function NowServingCard({
  snapshot,
  outlook,
  instructions,
  t,
}: {
  snapshot: AdminSitesSnapshot;
  outlook: ActivationOutlook;
  /** The last activate response's own restart prose, or `null` when there has not been one this
   *  page load — see {@link PendingActivationNotice}. */
  instructions: string | null;
  t: Translate;
}) {
  return (
    <div
      className="card"
      {...agentHandle("sites-now-serving", {
        role: "region",
        label: "The site this server process is actually bound to right now, and any queued change to it",
      })}
    >
      <h2 className="card-title">{t("Now serving")}</h2>
      <div className="field-group">
        <ServingFact label={t("Folder")} value={snapshot.currentSite.name} />
        <ServingFact label={t("Path")} value={snapshot.currentSite.dir} mono />
      </div>
      {snapshot.currentSite.listed ? null : <UnlistedSiteNotice t={t} />}
      {snapshot.currentSite.dirOverridden ? <SiteDirOverrideNotice t={t} /> : null}
      <PendingActivationNotice outlook={outlook} currentName={snapshot.currentSite.name} instructions={instructions} t={t} />
    </div>
  );
}

export interface CreateSiteFormProps {
  controller: Pick<
    ReturnType<typeof useWiredSites>,
    "createName" | "setCreateName" | "createNameError" | "createSite" | "creating" | "createdName" | "switchingEnabled" | "t"
  >;
}

/** Create a site folder through the same `initSite` path `tovu init` uses, so an admin-created site
 *  and a CLI-created one are identical. Creating never touches the running server's binding — the
 *  new site sits on disk until it is activated and the server restarts, which is what the hint
 *  under the button says. */
function CreateSiteForm({ controller }: CreateSiteFormProps) {
  const { createName, setCreateName, createNameError, createSite, creating, createdName, switchingEnabled, t } = controller;
  return (
    <form
      className="card"
      {...agentHandle("sites-create-form", { role: "form", label: "Create a new site folder under sites/" })}
      onSubmit={(e) => {
        e.preventDefault();
        createSite();
      }}
    >
      <h2 className="card-title">{t("Create a site")}</h2>
      <p className="card-lead">
        {t("Makes a new folder under sites/ with its own database, uploads, themes, and a starting home page — the same thing tovu init produces.")}
      </p>
      <div className="field">
        <label className="field-label" htmlFor="site-name">
          {t("Folder name")}
        </label>
        <input
          id="site-name"
          name="name"
          value={createName}
          disabled={!switchingEnabled}
          placeholder="my-second-site"
          onChange={(e) => setCreateName(e.target.value)}
          {...agentHandle("sites-create-name", { role: "field", label: "New site folder name" })}
        />
        {createNameError ? (
          <p className="field-error">{createNameError}</p>
        ) : (
          <p className="field-hint">{t("Lowercase letters, digits, and dashes. This is the folder name, and the name Activate takes.")}</p>
        )}
      </div>
      <div className="editor-actions form-actions">
        <button
          type="submit"
          disabled={creating || !switchingEnabled || createNameError !== null || createName.trim().length === 0}
          {...agentHandle("sites-create-submit", { role: "button", label: "Create the site folder" })}
        >
          {creating ? t("Creating…") : t("Create site")}
        </button>
        {createdName ? (
          <span className="save-ok">{t("Created. Activate it below to serve it after the next restart.")}</span>
        ) : null}
      </div>
    </form>
  );
}

/** Why Create and Activate are inert on this deployment. Rendered instead of a button that would
 *  403 — the capability is a deployment fact, not a permission the operator can fix here. */
function SwitchingDisabledNotice({ t }: { t: Translate }) {
  return (
    <div
      className="notice"
      {...agentHandle("sites-switching-disabled", {
        role: "status",
        label: "Explanation that this deployment cannot switch sites, and what to use instead",
      })}
    >
      {t("Creating and activating sites is turned off on this deployment. Tovu-Runner switches sites itself, and a hosted install uses workspaces instead. The site being served is still shown above.")}
    </div>
  );
}

/** One row's Activate control. Its own component rather than an inline `cell` body so the four
 *  conditions that decide its disabled state and label are counted against this function's own
 *  complexity budget rather than `Sites`'s — the same reason `deployment-visuals.tsx` splits its
 *  own row renderers out. Disabled for the site already being served: activating what is already
 *  live would write a `.env` line that changes nothing and imply a restart is needed. */
function ActivateButton({
  site,
  snapshot,
  handle,
  switchingEnabled,
  activatingName,
  onActivate,
  t,
}: {
  site: AdminSiteListEntry;
  snapshot: AdminSitesSnapshot;
  handle: string;
  switchingEnabled: boolean;
  activatingName: string | null;
  onActivate: (name: string) => void;
  t: Translate;
}) {
  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={!switchingEnabled || activatingName !== null || siteRowState(site, snapshot) === "serving"}
      onClick={() => onActivate(site.name)}
      {...agentHandle(handle, {
        role: "button",
        label: `Save ${site.name} as the site to serve after the next restart`,
      })}
    >
      {activatingName === site.name ? t("Saving…") : t("Serve after restart")}
    </button>
  );
}

export interface SitesProps {
  /** Dependency injection seam for tests — same convention as every other wired-hook prop in this
   *  app. See `PostsProps.usePostsHook` for the full rationale. */
  useSitesHook?: typeof useWiredSites;
}

/** Resolves {@link SitesProps.useSitesHook} to the real hook when a caller passes none — a call out
 *  to a separately-scoped resolver rather than a destructuring default plus a `= {}` parameter
 *  default keeps `Sites`'s own ESLint cyclomatic-complexity count from counting a second branch for
 *  the empty-props case (same reasoning `OverviewTab.tsx`'s `resolveDeploymentOverviewHook`
 *  documents for its own props). */
function resolveSitesHook(override: typeof useWiredSites | undefined): typeof useWiredSites {
  return override ?? useWiredSites;
}

export function Sites(props: SitesProps = {}) {
  const controller = resolveSitesHook(props.useSitesHook)();
  const { snapshot, sites, listStatus, listError, writeError, switchingEnabled, outlook, activate, activatingName, restartInstructions, t } =
    controller;

  if (listStatus === "error" && !snapshot) {
    return <div className="notice error">{describeApiError(listError, t("Could not load the site list."))}</div>;
  }
  if (!snapshot) return <div className="notice">{t("Loading sites…")}</div>;

  // Folder names are unique under `sites/` (they ARE the directory entries), so they disambiguate
  // one row's controls from another's — same reasoning as every other list on this workstream.
  const rowHandles = buildAgentListHandles(
    "sites-row",
    sites.map((site: AdminSiteListEntry) => site.name),
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Overview")}</p>
          <h1 className="page-title">{t("Sites")}</h1>
          <p className="page-description">
            {t("Every site folder under sites/. Each one owns its own content, uploads and themes. Switching between them takes a restart.")}
          </p>
        </div>
      </div>

      {writeError ? <div className="notice error">{writeError}</div> : null}
      {switchingEnabled ? null : <SwitchingDisabledNotice t={t} />}

      <NowServingCard snapshot={snapshot} outlook={outlook} instructions={restartInstructions} t={t} />

      <CreateSiteForm controller={controller} />

      <DataTable
        rows={sites}
        rowKey={(site: AdminSiteListEntry) => site.name}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No sites are listed yet. Create one above.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "name", header: t("Folder"), cell: (site: AdminSiteListEntry) => site.name },
          { key: "displayName", header: t("Name"), cell: (site: AdminSiteListEntry) => site.displayName },
          {
            key: "created",
            header: t("Created"),
            cell: (site: AdminSiteListEntry) => <span className="muted-cell">{formatTimestamp(site.createdAt)}</span>,
          },
          {
            key: "state",
            header: t("State"),
            cell: (site: AdminSiteListEntry) => {
              const state = siteRowState(site, snapshot);
              return <span className={`status ${siteRowStateToneClass(state)}`}>{t(siteRowStateLabelKey(state))}</span>;
            },
          },
          {
            key: "actions",
            header: t("Activate"),
            cell: (site: AdminSiteListEntry, index: number) => (
              <ActivateButton
                site={site}
                snapshot={snapshot}
                handle={`${rowHandles[index]}-activate`}
                switchingEnabled={switchingEnabled}
                activatingName={activatingName}
                onActivate={activate}
                t={t}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
