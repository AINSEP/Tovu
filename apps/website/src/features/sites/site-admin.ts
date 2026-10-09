import {
  createSite as createSiteReal,
  listSites as listSitesReal,
  persistActiveSite as persistActiveSiteReal,
  switcherBaseForBinding,
  InitDirNotEmptyError,
  ValidationError,
  resolveNewSiteAdminPassword,
  type SiteBinding,
  type SiteListEntry,
} from "#src/platform/site-dir/index";
import type { HttpClientPort } from "#src/platform/http/index";
import type { DevRestartPort } from "#src/platform/dev-supervisor/index";
import {
  bundledAgentPluginsSourceRoot,
  firstNewSiteAgentPluginTokenRefusal,
  parseNewSiteAgentPluginTokens,
  resolveBundledAgentPlugin,
} from "#src/features/agent-plugins/new-site-agent-plugin-tokens";
import { checkAgentPluginAccessToken as checkAgentPluginAccessTokenReal } from "#src/features/agent-plugins/token-sign-in";

/**
 * @file Create a site and switch the active site — the ONE implementation both the admin Sites
 * screen's HTTP routes (`server/inbound/admin-http/routes/system/sites.ts`) and the assistant's
 * `sites_create_site` / `sites_switch_site` tools call (2026-10-05, big-chat-capabilities plan S1).
 * Moved out of that route file so the chat tool and the button can never drift apart.
 *
 * Every function here returns a refusal VALUE (`{ ok: false, code, error }`) rather than an HTTP
 * status: the route maps `code` to a status, the tool turns it into a thrown error the model reads.
 * Authorization is deliberately NOT done here — the route uses `authorizeOrRespond`, the tool uses
 * `requireToolPermission`; both call {@link resolveSiteSwitchBase} first, then authorize, then the
 * action, in the same order (see that function's doc for why the gate comes before authorize).
 *
 * Create delegates to `site-registry.ts`'s `createSite`, itself a thin wrapper over the SAME
 * `initSite` `tovu init` calls — so a site created here and one created by the CLI are identical.
 *
 * Activate persists the choice (`active-site.ts`'s `persistActiveSite`) and returns explicit restart
 * instructions — it does NOT kill, signal, or re-exec any process (standing rule: no admin API
 * terminates the server on a click). The `restartRequired`/`restartInstructions` fields exist so the
 * UI never has to hardcode that prose itself. Since OD-S1 (2026-10-05) it may instead ASK the
 * `npm run dev` supervisor to restart the API child (`platform/dev-supervisor/dev-restart.ts`) —
 * the supervisor does the restart; this process still never ends itself.
 *
 * Create also takes an optional `agentPluginTokens: { [pluginId]: token }` (2026-09-29): each is
 * checked against the plugin's probe URL first (a rejected one refuses the create, nothing made),
 * then sealed with the NEW site's key into its folder and applied on that site's first boot
 * (`composition/pending-agent-plugin-tokens.ts`). Leaving it out creates the site exactly as before.
 */

/** The exact prose the UI should render after a successful Activate — one source of truth so a
 *  future wording change lands in one place, not wherever a caller happened to hardcode it. */
export const SITE_SWITCH_RESTART_INSTRUCTIONS =
  "Restart the dev server for this to take effect: stop `npm run dev` (Ctrl-C, or SIGTERM the " +
  "dev.mjs process — never a child PID) and start it again.";

export type SiteAdminRefusalCode =
  | "SITE_SWITCHING_DISABLED"
  | "SITE_BINDING_NOT_SWITCHABLE"
  | "VALIDATION_ERROR"
  | "SITE_ALREADY_EXISTS"
  | "SITE_NOT_FOUND"
  | "AGENT_PLUGIN_TOKEN_INVALID"
  | "AGENT_PLUGIN_TOKEN_UNSUPPORTED";

export interface SiteAdminRefusal {
  ok: false;
  code: SiteAdminRefusalCode;
  error: string;
  /** Set only on an `AGENT_PLUGIN_TOKEN_*` refusal: which plugin's token was refused. */
  pluginId?: string;
}

/** The refusal for a deployment with the site-switcher flag OFF (desktop, hosted). */
const SWITCHING_DISABLED: SiteAdminRefusal = {
  ok: false,
  code: "SITE_SWITCHING_DISABLED",
  error: "site switching is disabled on this deployment",
};

/**
 * The refusal for a boot whose `siteBinding.switcherCompatible` is `false` (2026-09-06,
 * composition-root fix) — an install-dir boot (`tovu serve <dir>`) has no `{cwd, env}`-relative
 * `sites/` tree to Create into or Activate against; `process.cwd()` could be any directory an
 * operator happened to be standing in. The route answers 409, not 403: this is a per-boot structural
 * fact about which `sites/` root exists, not a permissions or deployment-flag refusal.
 */
const BINDING_NOT_SWITCHABLE: SiteAdminRefusal = {
  ok: false,
  code: "SITE_BINDING_NOT_SWITCHABLE",
  error:
    "this server was started against a specific site directory (tovu serve <dir>) with no related sites/ folder to manage — Create/Activate are unavailable",
};

/**
 * The two deployment-wide gates Create and Activate share, in order: the capability flag, then the
 * boot binding. Callers run this BEFORE authorizing — both are per-deployment/per-boot facts
 * independent of the caller's own permissions, so there is no reason to spend an authorize() call
 * on an operation that will be refused either way.
 *
 * Returns the served tree's own base — `null` from `switcherBaseForBinding` exactly when
 * `siteBinding.switcherCompatible` is false — which every write below is rooted at instead of
 * `process.cwd()`, which once created and activated in whatever tree the process was standing in.
 * @complexity O(1); cyclomatic 3.
 */
export function resolveSiteSwitchBase(required: {
  binding: SiteBinding;
  switchingEnabled: boolean;
}): { ok: true; switcherBase: string } | SiteAdminRefusal {
  if (!required.switchingEnabled) return SWITCHING_DISABLED;
  const switcherBase = switcherBaseForBinding(required.binding);
  return switcherBase === null ? BINDING_NOT_SWITCHABLE : { ok: true, switcherBase };
}

export interface CreateSiteForOwnerRequired {
  adminPassword?: unknown;
  workspaceId: string;
  /** From {@link resolveSiteSwitchBase}: the new site lands at `<switcherBase>/sites/<name>`. */
  switcherBase: string;
  name: string;
  /** Raw, unparsed `{ [pluginId]: token }` — parsed here with the parser `tovu init` shares. */
  agentPluginTokens?: unknown;
}

export interface CreateSiteForOwnerPorts {
  createSite?: typeof createSiteReal;
  /** The guarded outbound client a token check probes through. Absent, a given token is refused as
   *  not checkable rather than saved unchecked. */
  customCredentialsHttpClient?: HttpClientPort;
  checkAgentPluginAccessToken?: typeof checkAgentPluginAccessTokenReal;
  /** Seals checked tokens into the new site. Lives under `server/` (it needs the site key), so it is
   *  supplied by the caller. Absent, any token is refused before anything is created. */
  sealPendingAgentPluginTokens?: (required: { siteDir: string; siteKeyId: string; tokens: Readonly<Record<string, string>> }) => Promise<void>;
}

export interface CreateSiteForOwnerResult {
  ok: true;
  site: { name: string; dir: string; siteId: string };
  agentPluginTokens: { status: "none" | "saved" | "failed"; pluginIds: string[] };
}

/** The refusal for a token that failed its check, or `null` when every token may be stored. No
 *  guarded HTTP client in these ports means no check can run: every token is then `unsupported`. */
async function checkTokensBeforeCreate(
  workspaceId: string,
  ports: CreateSiteForOwnerPorts,
  tokens: Readonly<Record<string, string>>,
): Promise<SiteAdminRefusal | null> {
  const check = ports.checkAgentPluginAccessToken ?? checkAgentPluginAccessTokenReal;
  const httpClient = ports.customCredentialsHttpClient;
  const resolveInstalledPlugin = resolveBundledAgentPlugin(bundledAgentPluginsSourceRoot());
  const refusal = await firstNewSiteAgentPluginTokenRefusal(
    // Checked against the bundled plugin the NEW site's first boot seeds, not this site's install.
    async (input) => (httpClient ? check({ workspaceId, httpClient, resolveInstalledPlugin }, input) : "unsupported"),
    tokens,
  );
  return refusal ? { ok: false, ...refusal, code: refusal.code as SiteAdminRefusalCode } : null;
}

/** Seals the checked tokens into the new site. The site already exists, so a failure here is
 *  reported, not thrown: the person connects from chat instead. */
async function storeTokensForNewSite(
  ports: CreateSiteForOwnerPorts,
  site: { dir: string; siteId: string },
  tokens: Readonly<Record<string, string>>,
): Promise<CreateSiteForOwnerResult["agentPluginTokens"]> {
  const pluginIds = Object.keys(tokens);
  if (pluginIds.length === 0 || !ports.sealPendingAgentPluginTokens) return { status: "none", pluginIds };
  try {
    await ports.sealPendingAgentPluginTokens({ siteDir: site.dir, siteKeyId: site.siteId, tokens });
    return { status: "saved", pluginIds };
  } catch (err) {
    console.error(`[system/sites] the new site's access tokens could not be stored: ${err instanceof Error ? err.message : String(err)}`);
    return { status: "failed", pluginIds };
  }
}

/** Classifies a thrown `createSite()` error into a refusal, or `null` for anything unclassified
 *  that the caller should treat as an internal error. Keeps the mapping in one place so a future
 *  site-registry error type has exactly one spot to be taught about. @complexity O(1); cyclomatic 3. */
function classifyCreateSiteError(err: unknown): SiteAdminRefusal | null {
  if (err instanceof ValidationError) return { ok: false, code: "VALIDATION_ERROR", error: err.message };
  if (err instanceof InitDirNotEmptyError) return { ok: false, code: "SITE_ALREADY_EXISTS", error: err.message };
  return null;
}

/**
 * Creates `<switcherBase>/sites/<name>` (a full `initSite`), optionally checking and sealing access
 * tokens for its bundled Agent Plugins first.
 * @returns the new site, or a refusal (bad name, name taken, a token that failed its check).
 * @throws anything `createSite` throws that is not a known refusal — the caller's 500.
 * @complexity Bounded by `initSite` plus one outbound check per token; cyclomatic 7.
 */
export async function createSiteForOwner(
  required: CreateSiteForOwnerRequired,
  ports: CreateSiteForOwnerPorts = {},
): Promise<CreateSiteForOwnerResult | SiteAdminRefusal> {
  try {
    const adminPassword = resolveNewSiteAdminPassword(required);
    const parsedTokens = parseNewSiteAgentPluginTokens(required.agentPluginTokens);
    if (!parsedTokens.ok) return { ok: false, code: "VALIDATION_ERROR", error: parsedTokens.error };
    if (Object.keys(parsedTokens.tokens).length > 0 && !ports.sealPendingAgentPluginTokens) {
      return { ok: false, code: "VALIDATION_ERROR", error: "access tokens can't be stored from here — create the site without them and connect later from chat" };
    }
    const refusal = await checkTokensBeforeCreate(required.workspaceId, ports, parsedTokens.tokens);
    if (refusal) return refusal;
    const result = await (ports.createSite ?? createSiteReal)({ name: required.name, adminPassword }, { cwd: required.switcherBase });
    const agentPluginTokens = await storeTokensForNewSite(ports, result, parsedTokens.tokens);
    return { ok: true, site: { name: result.name, dir: result.dir, siteId: result.siteId }, agentPluginTokens };
  } catch (err) {
    const classified = classifyCreateSiteError(err);
    if (classified) return classified;
    throw err;
  }
}

/** What the person is told when the dev supervisor is restarting the server for them (S2). */
export const SITE_SWITCH_RESTARTING_NOTICE =
  "The dev server is restarting onto the new site now. The admin reconnects by itself in a few seconds — nothing to do.";

export interface ActivateSiteRequired {
  /** From {@link resolveSiteSwitchBase}. Both the lookup and the `.env` write are rooted here. */
  switcherBase: string;
  name: string;
  /** Ask the dev supervisor to restart now (OD-S1, 2026-10-05). Ignored when there is none. */
  restartNow?: boolean;
  /** `siteBinding.dirOverridden`: `TOVU_SITE_DIR` wins over `TOVU_SITE`, so a restart would come
   *  back on the SAME site — never restart for nothing. */
  dirOverridden?: boolean;
}

export interface ActivateSitePorts {
  listSites?: (optional?: { cwd?: string }) => readonly SiteListEntry[];
  persistActiveSite?: typeof persistActiveSiteReal;
  /** Present only under `npm run dev` (`platform/dev-supervisor`). `null`/absent = no supervisor. */
  devRestart?: DevRestartPort | null;
}

export interface ActivateSiteResult {
  ok: true;
  activeSiteName: string;
  restartRequired: true;
  restartInstructions: string;
  /** Set only when `restartNow` was asked: whether a restart was actually requested. */
  restarting?: boolean;
}

/** Whether to fire the restart, and if not, why (so the person is told the real reason). */
function restartDecision(required: ActivateSiteRequired, devRestart: DevRestartPort | null | undefined): { restart: boolean; note?: string } {
  if (!required.restartNow) return { restart: false };
  if (devRestart?.canSwitchSite === false) return { restart: false };
  if (required.dirOverridden) {
    return { restart: false, note: " Not restarting: TOVU_SITE_DIR is set, so a restart would come back on the same site — unset it first." };
  }
  return devRestart ? { restart: true } : { restart: false };
}

/**
 * Makes `name` the site the NEXT dev-server start serves (`TOVU_SITE=<name>` in the switcher tree's
 * `.env`). Looks the name up with the strict `listSites()` — an `unregistered` served folder is not
 * a valid target, because `tovu serve` would refuse it.
 *
 * With `restartNow` and a dev supervisor (`ports.devRestart`, only under `npm run dev`), it also asks
 * the supervisor to restart the API child onto the new site. Still never kills this process itself.
 * @complexity O(sites) for the lookup plus one `.env` rewrite; cyclomatic 4.
 */
export function activateSite(
  required: ActivateSiteRequired,
  ports: ActivateSitePorts = {},
): ActivateSiteResult | SiteAdminRefusal {
  const { switcherBase, name } = required;
  const match = (ports.listSites ?? listSitesReal)({ cwd: switcherBase }).find((site) => site.name === name);
  if (!match) return { ok: false, code: "SITE_NOT_FOUND", error: `site '${name}' was not found` };
  (ports.persistActiveSite ?? persistActiveSiteReal)({ name }, { cwd: switcherBase });
  const base = { ok: true as const, activeSiteName: name, restartRequired: true as const };
  if (!required.restartNow) return { ...base, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS };
  const decision = restartDecision(required, ports.devRestart);
  if (!decision.restart) return { ...base, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS + (decision.note ?? ""), restarting: false };
  ports.devRestart!.requestRestart({ reason: `switch site to '${name}'` });
  return { ...base, restartInstructions: SITE_SWITCH_RESTARTING_NOTICE, restarting: true };
}
