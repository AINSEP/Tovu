import { buildAgentListHandles } from "@jini-ai/agentic";
import { useEffect, useState } from "react";
import type { RowMenuItem } from "@jini-ai/admin/react";
import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { LocalSitesController } from "./hooks/use-local-sites.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { interpolate } from "@jini-ai/ui/panel-kit";
import type { TabBarTab } from "@jini-ai/ui/tab-strip";
import { siteRegistration, siteRowState, siteRowStateLabelKey, siteRowStateToneClass } from "./rules";
import { AllSitesIcon, NewSiteIcon } from "./sites-visuals";
import type { CreateSitePluginTokenField, CreateSitePluginTokensController } from "./hooks/use-create-site-plugin-tokens.hooks";

/**
 * @file `Sites.tsx`'s own derived-value logic, split out per the `<Name>.tsx`/`<Name>.hooks.tsx`
 * pattern `TabBar.tsx`/`TabBar.hooks.tsx` establishes (admin TSX-logic-sweep, 2026-09-05) — this
 * repo's rule that a `.tsx` file carries no functions or derived logic of its own. Every export
 * here derives view values without rendering; `Sites.tsx` calls each directly
 * inline where it needs the value (same idiom `TabBar.tsx`'s `{...tabHandleProps(tab)}` uses), so a
 * caller never composes its own boolean/array logic on top of what these return.
 *
 * `Sites.rules.ts` already holds this feature's screen-independent domain logic (`siteRowState`,
 * `activationOutlook`, …) — testable without React and reused by more than this one screen's markup.
 * What lives here instead is logic that is specific to how `Sites.tsx` itself is laid out (which
 * props a given button's `disabled` depends on, which prefix a row's agent handles use, and which
 * onboarding radio discloses its fields): moving it
 * into `rules.ts` would make that file's own tests couple to `Sites.tsx`'s prop shapes for no reason.
 */

/** The create button's own multi-condition `disabled` state — previously a boolean expression
 *  composed directly in `Sites.tsx`'s JSX. */
export function resolveCreateSubmitDisabled(args: {
  creating: boolean;
  switchingEnabled: boolean;
  createNameError: string | null;
  createName: string;
}): boolean {
  return args.creating || !args.switchingEnabled || args.createNameError !== null || args.createName.trim().length === 0;
}

/** Credential copy contains only the public default or a description, never a custom secret.
 * @complexity O(1).
 */
export function resolveCreatedAdminLogin({ customPassword, t }: { customPassword: boolean; t: Translate }, _options: Record<string, never> = {}): string {
  return customPassword
    ? t("Admin login: admin / the one you set — change it later under Users")
    : t("Admin login: admin / tovu-dev — change it later under Users");
}

/** Mask/reveal presentation stays out of the form markup. @complexity O(1). */
export function resolveAdminPasswordPresentation({ revealed, t }: { revealed: boolean; t: Translate }, _options: Record<string, never> = {}) {
  return { inputType: revealed ? "text" : "password", revealLabel: t(revealed ? "Hide admin password" : "Show admin password") };
}

/** The create-name input's own `disabled` state: also disabled while a create is already in flight,
 *  not just when the deployment can't switch sites — an enabled field mid-request lets an operator
 *  type a second name that a same-tick success handler would silently overwrite (finding 24,
 *  2026-09-05 admin-tooling audit). */
export function resolveCreateInputDisabled(args: { creating: boolean; switchingEnabled: boolean }): boolean {
  return args.creating || !args.switchingEnabled;
}

/** `Sites`'s own per-row agent handles. Folder names are unique under `sites/` (they ARE the
 *  directory entries), so they disambiguate one row's controls from another's — see `Sites.tsx`'s
 *  own history for this reasoning. */
export function resolveSitesRowHandles(sites: readonly AdminSiteListEntry[]): string[] {
  return buildAgentListHandles({ prefix: "sites-row", ids: sites.map((site) => site.name) }
  );
}

/** One grid card's `state` badge: the tone class and copy key together, so `Sites.tsx`'s
 *  `SiteCard` consumes one function's result rather than composing
 *  `siteRowStateToneClass`/`siteRowStateLabelKey` on top of its own `siteRowState` call. */
export function resolveSiteStateDisplay(
  site: AdminSiteListEntry,
  snapshot: AdminSitesSnapshot,
): { toneClass: string; labelKey: string } {
  const state = siteRowState(site, snapshot);
  const local = snapshot.localSites?.find((entry) => entry.name === site.name);
  if (state !== "serving" && local && local.status !== "stopped") {
    const states = { starting: { toneClass: "status-warning", labelKey: "Starting…" },
      running: { toneClass: "status-ok", labelKey: "Running" }, crashed: { toneClass: "status-error", labelKey: "Crashed" } };
    return states[local.status];
  }
  return { toneClass: siteRowStateToneClass(state), labelKey: siteRowStateLabelKey(state) };
}

/** One grid card's own class name: adds `site-card-serving` for whichever card is genuinely the
 *  live binding (2026-09-05 card-grid redesign) — a purely visual echo of the same
 *  `siteRowState`/`"serving"` fact the badge in {@link resolveSiteStateDisplay} already states in
 *  words, so the two can never disagree (one source, two renderings), and never a substitute for
 *  the badge itself. */
export function resolveSiteCardClassName(site: AdminSiteListEntry, snapshot: AdminSitesSnapshot): string {
  return siteRowState(site, snapshot) === "serving" ? "site-card site-card-serving" : "site-card";
}

/**
 * The card's hover tooltip: the site folder's absolute path.
 *
 * The path used to be a permanently-visible line in the "Now serving" panel above the grid. The
 * owner removed that panel and asked for "just a regular square card with a hover tooltip for the
 * actual folder directory", so the path moves here — one `title` on the card, which is the idiom
 * this screen already used for the same value (the old panel truncated the path and put the full
 * string in a `title` for exactly this reason).
 *
 * @complexity Time/space: O(1).
 */
export function resolveSiteCardTitle(site: AdminSiteListEntry): string {
  return site.dir;
}

/**
 * The card's second line, or `null` when there is nothing worth saying.
 *
 * `initSite` defaults `config.json.name` to the folder's own basename, so on most sites the display
 * name and the folder name are the same string — and rendering it twice is the kind of filler the
 * compact card has no room for. It appears only when an operator has actually given the site a
 * different display name.
 *
 * @complexity Time/space: O(1).
 */
export function resolveSiteSubtitle(site: Pick<AdminSiteListEntry, "name" | "displayName">): string | null {
  return site.displayName === site.name ? null : site.displayName;
}

/**
 * The small "this is not really a site directory" badge, or `null` for a normal row.
 *
 * This is where the fact the full-width amber banner used to carry now lives. The banner said "This
 * site isn't listed below, but it's still what's being served." — a sentence that stopped being true
 * the moment the served directory got a card of its own. What is still true, and still worth
 * knowing, is narrower: this folder has no `config.json`/`.site-meta.json`, so `tovu serve` would
 * refuse it. Losing that would make the card promise something the CLI will not honor.
 *
 * The `title` is not decoration either: the badge alone would read as a defect rather than a
 * specific, fixable state, so the tooltip names the two files and what refuses without them.
 *
 * @complexity Time/space: O(1).
 */
export function resolveSiteRegistrationBadge(
  site: AdminSiteListEntry,
  snapshot: AdminSitesSnapshot,
): { labelKey: string; titleKey: string } | null {
  if (siteRegistration(site, snapshot) === "registered") return null;
  return {
    labelKey: "Not initialized",
    titleKey: "No config.json or .site-meta.json in this folder — tovu serve would refuse it.",
  };
}

/**
 * This screen's two TABS — the site list, and the create-a-site form.
 *
 * Tabs, and this is the third time this has been settled. The owner asked for a tab system in
 * words, twice: *"the first tab is all sites. Second tab is create new"*, and then again after a
 * pass replaced them with a header button and a full-page `?tab=new` screen — *"What I wanted was a
 * tab system. I specifically told you a tab system … It shouldn't go to another page."* The header
 * button came from a Tovu Runner screenshot being relayed as a correction; **a reference screenshot
 * is not an instruction, and when a reference conflicts with what the owner said in words, the
 * words win.** Runner's own tab strip means something else entirely — see `Sites.tsx`'s header.
 *
 * The URL key is `?tab=`, the same one every other tabbed admin screen uses and the one
 * `panels.tsx` threads in, so the two tabs stay deep-linkable and bookmarkable.
 */
export const SITES_TAB_IDS = ["all", "new", "trash"] as const;
export type SitesTabId = (typeof SITES_TAB_IDS)[number];

/** Falls back to the list for an absent or unrecognized `?tab=` value, through the same shared
 *  guard `Deployment.tsx`/`Database.tsx`/`Themes.tsx` use — a stale bookmark or a typo must open the
 *  list, never a blank panel. */
export function resolveSitesTabId(tabId: string | null | undefined): SitesTabId {
  return resolveActiveTabId({ tabId: tabId, validIds: SITES_TAB_IDS, defaultId: "all" });
}

/**
 * The two tabs themselves, in the shape `TabBar` takes.
 *
 * The count is `listedCount` and nothing else — never nudged up to include a live binding that is
 * not in the list, which would restate the exact lie the `Not initialized` badge exists to prevent.
 * "New site" carries no count: it is an action, not a collection.
 *
 * @complexity Time/space: O(1) — a fixed two-element array.
 */
export function resolveSitesTabs(
  { t, listedCount }: { t: Translate; listedCount: number },
  { localManagementEnabled = false, trashCount = 0 }: { localManagementEnabled?: boolean; trashCount?: number } = {},
): TabBarTab[] {
  return [
    {
      id: "all",
      label: t("All sites"),
      icon: <AllSitesIcon />,
      count: listedCount,
      handle: "sites-tab-all",
      handleLabel: "Switch to the All sites tab — every site folder listed under sites/",
    },
    {
      id: "new",
      label: t("New site"),
      icon: <NewSiteIcon />,
      handle: "sites-tab-new",
      handleLabel: "Switch to the New site tab — the form that creates a site folder",
    },
    ...(localManagementEnabled ? [{ id: "trash", label: t("Trash"), count: trashCount, handle: "sites-tab-trash", handleLabel: "Switch to the site Trash tab" }] : []),
  ];
}

/** Whether the site list renders its empty state instead of the grid. Its own function rather than
 *  a `sites.length === 0` written in the JSX, per this file's header. */
export function resolveSitesEmpty(sites: readonly AdminSiteListEntry[]): boolean {
  return sites.length === 0;
}

/** One database backend the onboarding screen offers. `available` is the whole honesty seam: it is
 *  a property of what Tovu's `initSite` can actually produce, never of what the operator picked. */
export interface SiteDatabaseOption {
  id: "sqlite" | "supabase" | "custom";
  title: string;
  hint: string;
  available: boolean;
}

/**
 * The three options, ported from Runner's own `DatabasePicker` (titles and hints kept close to its
 * wording so the two products read as one family) with one field added that Runner has no need
 * for: `available`.
 *
 * Runner can offer all three because Runner's create screen provisions nothing — its own footer
 * says so ("Provisioning the copy and securely saving vendor credentials needs the Runner
 * supervisor connection"), and it carries a whole `blocked` project status for exactly this, whose
 * code comment reads: "A blocked project is waiting on database-provider support Tovu does not
 * have, so the only honest affordance is none." Tovu's Create button, by contrast, REALLY creates a
 * site — `initSite` runs, hardcoded to SQLite — so shipping Runner's three live options here would
 * turn Runner's honest mockup into Tovu's silent lie. `available` is what stops that, and Runner's
 * own comment above is the precedent for it rather than a departure from it.
 *
 * @complexity Time/space: O(1) — a fixed three-element array.
 */
export function resolveSiteDatabaseOptions(t: Translate): SiteDatabaseOption[] {
  return [
    { id: "sqlite", title: t("SQLite"), hint: t("Default · created inside this site's own folder"), available: true },
    { id: "supabase", title: t("Supabase"), hint: t("Hosted · not for site content yet."), available: false },
    { id: "custom", title: t("Custom DB Provider"), hint: t("Any vendor · add its endpoint and credential"), available: false },
  ];
}

/** One database option's own class name. `available: false` never combines with `selected: true`:
 *  nothing on this screen can select an unavailable backend (see `CreateSiteOnboarding.tsx`'s own
 *  header for why that is structural rather than a matter of which flags happen to be passed here).
 *
 *  @complexity Time/space: O(1). */
export function resolveDatabaseOptionClassName(args: { selected: boolean; available: boolean }): string {
  if (!args.available) return "site-db-option is-unavailable";
  return args.selected ? "site-db-option is-selected" : "site-db-option";
}

/** The picker markup consumes these decisions directly; availability and selection are distinct. */
export interface SiteDatabaseDisclosure extends SiteDatabaseOption {
  inputId: string;
  disclosureId: string;
  selected: boolean;
  disabled: boolean;
  ariaDisabled: boolean | undefined;
  ariaExpanded: boolean | undefined;
  ariaControls: string | undefined;
  className: string;
  statusClassName: string;
  statusLabel: string;
  tokenField: CreateSitePluginTokenField | null;
  showCustomFields: boolean;
  onSelect: () => void;
}

/**
 * Admin's database disclosures, using its existing token controller rather than a second token
 * lifecycle. Hosted content databases remain unavailable in production: injected options exercise
 * the selected states without promising provisioning that `initSite` cannot deliver.
 *
 * Leaving Supabase clears its hidden token, and leaving the form clears all tokens, so a later
 * SQLite create cannot send a credential from an earlier disclosure. Empty still means connect
 * later; the token controller remains the owner of normalization and submission.
 * Derive disclosures here so their branching stays out of markup. No installed Supabase plugin
 * means no token field; other plugins do not acquire a parallel standalone section.
 * SQLite has no fields: there is nothing to configure, which is the point of it.
 * @complexity O(p + d) time, O(d) space for p plugins and the fixed three database options.
 */
export function useCreateSiteDatabase(
  { t, pluginTokens }: { t: Translate; pluginTokens: CreateSitePluginTokensController },
  { options = resolveSiteDatabaseOptions(t) }: { options?: readonly SiteDatabaseOption[] } = {},
): { options: SiteDatabaseDisclosure[] } {
  const [database, setDatabase] = useState<SiteDatabaseOption["id"]>("sqlite");
  const { setToken, clear } = pluginTokens;
  useEffect(() => () => clear(), [clear]);
  const supabase = pluginTokens.fields.find((field) => field.pluginId === "supabase") ?? null;

  return { options: options.map((option) => {
    const selected = option.available && database === option.id;
    const tokenField = selected && option.id === "supabase" ? supabase : null;
    const showCustomFields = selected && option.id === "custom";
    const hasDisclosure = option.id === "custom" || (option.id === "supabase" && supabase !== null);
    const disclosureId = `site-db-${option.id}-fields`;
    return {
      ...option,
      inputId: `site-db-${option.id}`,
      disclosureId,
      selected,
      disabled: !option.available,
      ariaDisabled: option.available ? undefined : true,
      ariaExpanded: hasDisclosure ? selected : undefined,
      ariaControls: hasDisclosure ? disclosureId : undefined,
      className: resolveDatabaseOptionClassName({ selected, available: option.available }),
      statusClassName: option.available ? "status status-ok" : "status status-neutral",
      statusLabel: option.available ? t("Ready") : t("Not supported yet"),
      tokenField,
      showCustomFields,
      onSelect: () => {
        // Refuse DOM-forced selection too: a disabled attribute alone is not the boundary.
        if (!option.available) return;
        if (option.id !== "supabase") setToken("supabase", "");
        setDatabase(option.id);
      },
    };
  }) };
}

/** Card lifecycle facts come from host state, with serving binding taking precedence. */
export function resolveLocalSiteCard(
  { site, snapshot, busyName }: { site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; busyName: string | null },
  _optional = {},
) {
  const serving = site.dir === snapshot.currentSite.dir;
  const local = snapshot.localSites?.find((row) => row.name === site.name);
  const status = local?.status ?? "stopped";
  const live = status === "starting" || status === "running" || local?.pid != null;
  const busy = busyName !== null;
  const enabled = snapshot.localManagementEnabled === true;
  const statusKeys = { starting: "Starting…", running: "Running", stopped: "Stopped", crashed: "Crashed" };
  return {
    enabled, serving, status, statusLabel: statusKeys[status], port: local?.port ?? null,
    action: live ? "stop" as const : "start" as const,
    actionLabel: live ? "Stop" : "Start",
    disabled: busy || !enabled,
    deleteDisabled: busy || !enabled || serving || live,
    openUrl: serving ? "/admin/" : status === "running" ? local?.adminUrl ?? null : null,
    switchEnabled: snapshot.canSwitchNow === true && !serving,
    defaultLabel: snapshot.persistedSiteName === site.name ? "Default" : "Make default",
  };
}

/** Trash rows must opt in to permanent deletion individually; restoration needs no checkbox. */
export function resolveTrashDeleteDisabled({ id, checked, busyName }: { id: string; checked: Record<string, boolean>; busyName: string | null }, _optional = {}) {
  return checked[id] !== true || busyName !== null;
}

/** Trash card controls: the permanent-delete button exists only once its row is selected. */
export function resolveTrashCardActions({ id, checked, busyName }: { id: string; checked: Record<string, boolean>; busyName: string | null }, _optional = {}) {
  return { selected: checked[id] === true, restoreDisabled: busyName !== null, deleteDisabled: resolveTrashDeleteDisabled({ id, checked, busyName }) };
}

/** The site the next launch boots: the saved choice, or the serving site when nothing is saved.
 *  @complexity O(1). */
function isDefaultSite(site: AdminSiteListEntry, snapshot: AdminSitesSnapshot): boolean {
  return site.name === (snapshot.persistedSiteName ?? snapshot.currentSite.name);
}

/** Overflow-menu entries a card can carry, in menu order — the destructive one always last. */
export type SiteCardMenuAction = "make-default" | "switch" | "trash";

/**
 * Everything a site card's controls render, decided once (2026-10-08 card polish).
 *
 * One visible lifecycle action (Start, or Stop for a live process) plus Open for a ready admin;
 * every other action lives in the overflow menu and is LEFT OUT when it does not apply, instead of
 * rendering disabled. The rules are the same ones the old disabled states encoded: the serving
 * site is never started, stopped, trashed, switched to or re-made default; a live process is never
 * trashed; Make default waits while another activation is in flight.
 * @param input - The card's site, snapshot, busy/activating names, the capability flag, and
 *   `managed` (whether a local-sites controller is wired at all).
 * @returns The lifecycle button (or `null`), the Open URL (or `null`) and the menu actions.
 * @complexity O(n) in `snapshot.localSites` (one lookup).
 */
export function resolveSiteCardView(
  { site, snapshot, busyName, switchingEnabled, activatingName, managed }: {
    site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; busyName: string | null;
    switchingEnabled: boolean; activatingName: string | null; managed: boolean;
  },
  _optional = {},
) {
  const local = resolveLocalSiteCard({ site, snapshot, busyName });
  const lifecycle = managed && local.enabled;
  const live = local.action === "stop";
  const menu: SiteCardMenuAction[] = [];
  if (switchingEnabled && activatingName === null && !local.serving && !isDefaultSite(site, snapshot)) menu.push("make-default");
  if (lifecycle && local.switchEnabled) menu.push("switch");
  if (lifecycle && !local.serving && !live) menu.push("trash");
  return {
    lifecycle: lifecycle && !local.serving
      ? { action: local.action, labelKey: local.actionLabel, className: live ? "btn-secondary" : "btn-primary", disabled: local.disabled }
      : null,
    openUrl: lifecycle ? local.openUrl : null,
    menu,
  };
}

/**
 * The card's status pill. With local management on, a non-serving card states its process
 * (`Running on :3101`, `Starting…`, `Stopped`, `Crashed`); otherwise the binding state as before.
 * @complexity O(n) in `snapshot.localSites` (one lookup).
 */
export function resolveSiteStatusPill(
  { site, snapshot, t }: { site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; t: Translate },
  _optional = {},
): { toneClass: string; label: string } {
  if (snapshot.localManagementEnabled !== true || siteRowState(site, snapshot) === "serving") {
    const { toneClass, labelKey } = resolveSiteStateDisplay(site, snapshot);
    return { toneClass, label: t(labelKey) };
  }
  const local = snapshot.localSites?.find((row) => row.name === site.name);
  const status = local?.status ?? "stopped";
  if (status === "running" && local?.port != null) {
    return { toneClass: "status-ok", label: interpolate({ template: t("Running on :{port}"), vars: { port: String(local.port) } }) };
  }
  const pills = {
    starting: { toneClass: "status-warning", labelKey: "Starting…" }, running: { toneClass: "status-ok", labelKey: "Running" },
    stopped: { toneClass: "status-neutral", labelKey: "Stopped" }, crashed: { toneClass: "status-error", labelKey: "Crashed" },
  };
  return { toneClass: pills[status].toneClass, label: t(pills[status].labelKey) };
}

/**
 * The muted line under the name: only facts the pill does not already state — a starting
 * process's port, `Default`, and `Saving…` while this card's Make default is in flight.
 * @returns The joined line, or `null` when there is nothing to add.
 * @complexity O(n) in `snapshot.localSites` (one lookup).
 */
export function resolveSiteCardMeta(
  { site, snapshot, activatingName, t }: { site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; activatingName: string | null; t: Translate },
  _optional = {},
): string | null {
  const local = snapshot.localSites?.find((row) => row.name === site.name);
  const parts: string[] = [];
  if (local?.status === "starting" && local.port !== null) parts.push(`:${local.port}`);
  if (isDefaultSite(site, snapshot)) parts.push(t("Default"));
  if (activatingName === site.name) parts.push(t("Saving…"));
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * The overflow menu's items for {@link resolveSiteCardView}'s `menu`. Switch now and Delete… go
 * through the local-sites controller, which owns their confirmation; Delete… is danger-toned.
 * @complexity O(k) in the menu's length (at most three).
 */
export function buildSiteCardMenuItems(
  { site, menu, onActivate, controller, t }: {
    site: AdminSiteListEntry; menu: readonly SiteCardMenuAction[]; onActivate: (name: string) => void;
    controller?: LocalSitesController; t: Translate;
  },
  _optional = {},
): RowMenuItem[] {
  const items: Record<SiteCardMenuAction, RowMenuItem> = {
    "make-default": { key: "make-default", label: t("Make default"), onSelect: () => onActivate(site.name) },
    switch: { key: "switch", label: t("Switch now"), onSelect: () => void controller?.run(site.name, "switch") },
    trash: { key: "trash", label: t("Delete…"), tone: "danger", onSelect: () => void controller?.run(site.name, "trash") },
  };
  return menu.map((action) => items[action]);
}
