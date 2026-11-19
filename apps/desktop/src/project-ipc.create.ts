import { withFileLock as withDirectoryFileLock } from "@jini-ai/platform/fs";
import { createSitesWorkspace, shareSiteDirectories, type SitesWorkspace } from "./shared-sites.ts";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import fs from "node:fs";
import path from "node:path";
import { uniqueSiteName } from "./site-name-policy.ts";
import { siteNameError } from "./contracts/site-name.ts";
import { SITE_ORIGIN, readTrackedSites, trackSite } from "./tracked-sites.ts";
import { readSiteIdentity } from "./project-delete-guard.ts";
import { assertTokensCanReachFolder, cleanCreateTokens, initTokenOptions, listTokenSignInPlugins as listTokenSignInPluginsReal, withCreatedTokens } from "./agent-plugin-tokens.ts";
import type { TokenSignInPlugin } from "@jini-ai/agent-plugins/connect";
import { type CreateSiteInput, type ProjectIpcDeps } from "./project-ipc.types.ts";
import { otherSiteNames, rememberSiteName, rememberSiteAlias } from "./project-ipc.catalog.ts";
import { buildSiteRecord } from "./project-ipc.records.ts";


/** Plan a new Tovu site without creating folders or reserving the destination.
 * The workspace owns home resolution and volume admission for both Create and its preview.
 * @throws {Error} if the name is not a string or the home volume is unavailable.
 * @complexity O(n + k) for n name characters and k conflicting folders; O(n) space.
 */
export function planNewSiteDir({ name }: { name: string }, {
  workspace = createSitesWorkspace({}),
}: { workspace?: Pick<SitesWorkspace, "home" | "homeAvailable"> } = {}): string {
  if (typeof name !== "string") throw new Error("Website name must be a string.");
  const home = workspace.home({});
  if (!workspace.homeAvailable({})) throw new Error(`Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`);
  const folder = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "website";
  let target = path.join(home, folder), suffix = 2;
  while (fs.existsSync(target)) {
    target = path.join(home, `${folder}-${suffix}`);
    suffix++;
  }
  return target;
}

/**
 * "+ Create website" has no folder in its input — `CreateSiteInput` is a display name plus a
 * database choice, ported from Tovu-Runner's own provisioner-backed form. This shell has no such
 * provisioner, so each new project gets a free directory under the configured sites home;
 * `input.displayName` becomes `tovu init`'s `--name`.
 *
 * **The database choice is REFUSED rather than ignored (D-02).** Knowing the field was dead and
 * narrowing it silently was the defect: `buildSiteRecord` hard-codes `{kind: "sqlite"}`, so an
 * operator who chose Supabase — and whom `computeCanCreate` then FORCED to type a project URL and
 * an API key before the button would enable — got a local SQLite site reported back as a success,
 * with their credential discarded. A contract this process does not honour must fail loudly at its
 * boundary; the renderer's own fix (disabling the options it cannot deliver) is the first line,
 * and this is the one that holds whoever calls the channel next.
 *
 * Refused BEFORE planning the destination, deliberately: nobody should prepare a site that was
 * never going to be made. An absent `database` is the same as `sqlite` — every existing caller
 * omits it, and omitting it is not a claim about a provider.
 *
 * @returns the new site record.
 * @throws {Error} for invalid input, an unavailable sites home, or a creation race.
 * @complexity O(k) destination probes for k conflicting folders, plus initialization.
 */
export async function handleCreate(
  input: CreateSiteInput,
  deps: Pick<ProjectIpcDeps, "classifySiteDir" | "adoptSiteDir" | "repoRoot" | "statePath" | "cliMode" | "projectsPath" | "openSites" | "readSiteName" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime">
) {
  const agentPluginTokens = validateCreateInput({ input });

  const target = planNewSiteDir({ name: input.displayName }, { workspace: deps.sharedSites });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // BEFORE `adoptSiteDir`, because afterwards the answer is gone: it returns the same path whether
  // it ran `tovu init` into an empty folder or simply recognized a site that was already there. Only
  // the first of those is a directory this app made, and only that one may ever be erased again —
  // see `project-delete-guard.ts`. Create must refuse a folder another app took before either
  // classification, rather than recording its existing site as one this app made.
  const wasEmpty = deps.classifySiteDir({ dir: target }) === "empty";
  assertTokensCanReachFolder({ tokens: agentPluginTokens, folderWasEmpty: wasEmpty });
  if (!wasEmpty && input.adminPassword !== undefined) throw new Error("An admin password can only be set while creating a new site. Change an existing site's password under Users.");
  if (!wasEmpty) throw new Error("The new website folder was created by another app. Try creating this website again.");
  const names = otherSiteNames({ deps, siteDir: target });
  const displayName = uniqueSiteName({ name: input.displayName, names });
  const init = { output: "" };
  const adopt = async () => {
    if (deps.classifySiteDir({ dir: target }) !== "empty") throw new Error("The new website folder was created by another app. Try creating this website again.");
    return deps.adoptSiteDir({
    dir: target,
    repoRoot: deps.repoRoot,
    statePath: deps.statePath,
    name: displayName,
    adminPassword: input.adminPassword,
    cliMode: deps.cliMode,
    ...initTokenOptions(agentPluginTokens, init),
    });
  };
  const siteDir = await withDirectoryFileLock({ lockPath: `${target}.creation.lock`, run: adopt }, { staleMs: Infinity });
  return withCreatedTokens({ record: recordCreatedSite({ siteDir, displayName }, deps), initOutput: init.output });
}

/**
 * What every site this app made gets: its catalog row with the identity `tovu` just stamped, its
 * shared-registry entry, and its display name. Create and Import both end here.
 * @throws {Error} when the catalog entry cannot be read back.
 * @complexity O(n) in tracked rows.
 */
export function recordCreatedSite(
  { siteDir, displayName }: { siteDir: string; displayName: string },
  deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime">,
) {
  // Read AFTER `adoptSiteDir`, because before it there is no site there to have an identity: this is
  // the id `tovu init` just stamped into `.site-meta.json`. Recording it here is the only moment
  // this app can honestly say "the site at this path is one I made" — every later reader is looking
  // at a path, and a path is not an identity. See `project-delete-guard.ts`'s test 3.
  // `null` when the folder has no readable identity: the row is then recorded without one, the fail-closed direction.
  const siteId = readSiteIdentity({ siteDir });
  trackSite({ projectsPath: deps.projectsPath, siteDir }, { origin: SITE_ORIGIN.created, siteId });
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [siteDir], createdBy: "Desktop" });
  // Remember the created site's parent beyond MRU eviction/card
  // removal, so a site created beside it by the CLI or web admin can appear on the next scan.
  try { deps.siteFolders?.rememberCreated({ siteDir }); }
  catch (error) { console.warn("tovu desktop: could not remember the created website folder; the website was created successfully.", formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)); }
  rememberSiteName({ projectsPath: deps.projectsPath, siteDir, displayName });
  const displayNameAlias = displayName !== deps.readSiteName({ siteDir }) ? displayName : undefined;
  rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir, displayNameAlias });
  const tracked = readTrackedSites({ projectsPath: deps.projectsPath }).find((row) => row.siteDir === siteDir);
  if (!tracked) throw new Error("The website was created, but its desktop catalog entry is missing. Use Import to add the folder again.");
  return buildSiteRecord({ ...tracked, displayNameAlias }, deps);
}

/** Validate creation before planning the destination; return the existing cleaned token contract.
 * @throws {Error} for unsupported providers, names, tokens or passwords.
 * @complexity O(n) in token count, delegated to cleanCreateTokens.
 */
function validateCreateInput({ input }: { input: CreateSiteInput }, _options = {}) {
  const nameError = siteNameError({ name: input.displayName });
  if (nameError) throw new Error(nameError);
  const kind = input.database?.kind;
  if (kind !== undefined && kind !== "sqlite") {
    throw new Error(`This app only creates SQLite sites, which live in the folder you choose. "${kind}" needs a hosted-database provisioner this app does not have.`);
  }
  // Checked before the dialog for the same reason as the database choice: a malformed map is refused
  // before anyone picks a folder.
  const agentPluginTokens = cleanCreateTokens({ raw: input.agentPluginTokens });
  if (input.adminPassword !== undefined && (typeof input.adminPassword !== "string" || input.adminPassword.length === 0)) {
    throw new Error("Admin password must be a nonempty string.");
  }
  return agentPluginTokens;
}

/**
 * The services "+ Create website" can offer a token field for (`agent-plugin-tokens.ts`). A failure
 * is an empty list, never an error: the form then offers no services and creates the site as before.
 *
 * @complexity One CLI spawn.
 */
export async function handleTokenSignInPlugins(deps: Pick<ProjectIpcDeps, "repoRoot" | "cliMode" | "listTokenSignInPlugins">): Promise<TokenSignInPlugin[]> {
  try {
    return await (deps.listTokenSignInPlugins ?? listTokenSignInPluginsReal)({ repoRoot: deps.repoRoot, cliMode: deps.cliMode });
  } catch (error) {
    console.warn(`[desktop] could not list the services a new site can connect: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
