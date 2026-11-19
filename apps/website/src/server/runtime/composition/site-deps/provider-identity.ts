import { localOwnerStoreEnabled, openProjectStore, type ProjectStore, type ProjectVaultScope } from "../project-store.js";
import { withAttachedProject, withUnavailableProject, type ProviderConfigSource } from "../provider-config-source.js";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import { bootProviderPlugins, type SiteIdentity } from "../provider-plugins.js";
import type { SiteKeyReferences } from "#src/features/project-keys/site-references";
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { attachedOnlyVault } from "#src/features/project-keys/attached-vault";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { formatErrorForLog } from "@jini-ai/core";
import { homedir } from "node:os";
import { isSiteIdToken, readSiteMetaId } from "#src/features/webhooks/site-key-sources";
import { ownerKeyHandleOnly, siteGrantedSealer } from "#src/features/project-keys/site-sealer";
import { projectKeyCreateVault } from "#src/features/project-keys/create-vault";
import { telemetryEnvironment } from '../build-release.js';
import type { CreateSiteRouteDepsOverrides } from "./overrides.js";

/** The provider-plugin boot to run: the test seam when supplied, else the real selection. */
export function providerPluginBoot({ overrides }: { overrides: Partial<CreateSiteRouteDepsOverrides> }): typeof bootProviderPlugins {
  return overrides.bootProviderPlugins ?? bootProviderPlugins;
}

/**
 * Provider settings: the project store (closed with the site store) when one opens; the site vault
 * when there is none (remote production). An unavailable owner store means no shared keys;
 * independently owned local keys remain usable. No key rows are moved during boot.
 */
export async function composeProviderConfig({ overrides, runtimeMode, onStoreClose, site, binding, references }: {
  overrides: Partial<CreateSiteRouteDepsOverrides>; runtimeMode: RuntimeMode; onStoreClose: (required: { registration: () => void }, optional?: Record<string, never>) => void; site: ProviderConfigSource; binding: { dir: string; name: string }; references: SiteKeyReferences;
}): Promise<{ siteId: string; projectStore?: ProjectStore; providerConfigSource: ProviderConfigSource; projectId: string | undefined; projectVault?: ProjectVaultScope }> {
  const siteId = acceptedSiteId({ value: readSiteMetaId({ siteDir: binding.dir }), source: "site meta" }) ?? "";
  if (!siteId) return { siteId, providerConfigSource: site, projectId: undefined };
  const projectStore = await projectStoreFor({ overrides, runtimeMode });
  if (!projectStore) return { siteId, providerConfigSource: site, projectId: undefined };
  if ("unavailable" in projectStore) return { siteId, providerConfigSource: withUnavailableProject({ site, reason: projectStore.unavailable }), projectId: undefined };
  onStoreClose({ registration: () => projectStore.close({}) });
  if (siteId) await projectStore.attachments.renameSite({ siteId, siteName: binding.name }).catch(error => {
    console.warn(`[project-store] Site name could not be refreshed; local keys remain available. ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`);
  });
  const owner = projectStore.vault.repo;
  const repo = attachedOnlyVault({ vault: owner, siteId, attachments: projectStore.attachments });
  return { siteId, projectStore, providerConfigSource: withAttachedProject({ site }, { project: projectStore.config, attachments: projectStore.attachments, siteId, siteName: binding.name, references, transaction: input => projectStore.transaction(input) }),
    projectId: projectStore.projectId, projectVault: { ...projectStore.vault, repo, createRepo: projectKeyCreateVault({ owner, view: repo }), replaceRepo: projectKeyCreateVault({ owner, view: repo }, { allowReplacement: true, transaction: input => projectStore.transaction(input) }), keyring: ownerKeyHandleOnly({ keyring: projectStore.vault.keyring }), sealer: siteGrantedSealer({ allowed: async ({ credentialId }) => projectStore.attachments.isAttached({ siteId, keyId: credentialId }), sealer: projectStore.vault.sealer }) } };
}

/**
 * The project half of a credential store (owner 2026-10-25: keys save to the project by default;
 * `features/custom-credentials/store.ts`'s and `features/deployments/publish-credentials/store.ts`'s
 * scope rule): `repo` builds that store's own repo over the project's vault. Absent where no project
 * store is configured — remote production keeps its site store. Unavailable Shared Keys contributes
 * no shared half; local rows retain their independent ownership.
 */
export function credentialProject<R>({ projectVault, repo }: { projectVault: ProjectVaultScope | undefined; repo: (vault: ProjectVaultScope["repo"]) => R }, _optional = {}): { project?: { workspaceId: string; repo: R; createRepo?: R; replaceRepo?: R; sealer: ProjectVaultScope["sealer"]; keyring: ProjectVaultScope["keyring"] } } {
  if (!projectVault) return {};
  const { workspaceId, sealer, keyring } = projectVault;
  return { project: { workspaceId, repo: repo(projectVault.repo), ...(projectVault.createRepo ? { createRepo: repo(projectVault.createRepo) } : {}), ...(projectVault.replaceRepo ? { replaceRepo: repo(projectVault.replaceRepo) } : {}), sealer, keyring } };
}

/** A site id from `source`, or undefined (warned) when it is not a short token. */
function acceptedSiteId({ value, source }: { value: string | undefined; source: string }, _optional = {}): string | undefined {
  if (value === undefined || isSiteIdToken({ value })) return value;
  console.warn(`[site-identity] ${source} holds ${JSON.stringify(value.slice(0, 80))}, which is not a valid site id; it is ignored`);
  return undefined;
}

/**
 * Which site sends every provider signal. NOT the workspace id: every starter-template site seeds the
 * same one (`workspace-local`), so two sites would report as one. The site's own `.site-meta.json` id
 * (`readSiteMetaId`) names it. A deployed server usually has no meta (production never mints one), so
 * next comes `TOVU_SITE_ID`, which `tovu deploy config` sets from the local site's meta: the deployed
 * copy reports as the same site. The meta wins over the env so one env shared by several local sites
 * can never merge them. The workspace id is only the last resort. The slug is the site folder's name;
 * Fly (production) has no project store, so its project is the site itself. Either source is taken
 * only as a short token (`isSiteIdToken`); anything else is warned about and skipped.
 */
export function siteIdentityFor({ workspaceId, binding, runtimeMode, projectId }: { workspaceId: string; binding: { name: string; dir: string }; runtimeMode: RuntimeMode; projectId: string | undefined }, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): SiteIdentity {
  const environment = telemetryEnvironment({ env, runtimeMode });
  const siteId = acceptedSiteId({ value: readSiteMetaId({ siteDir: binding.dir }), source: `${binding.dir}/.site-meta.json` })
    ?? acceptedSiteId({ value: env.TOVU_SITE_ID || undefined, source: "TOVU_SITE_ID" }) ?? workspaceId;
  return { siteId, siteSlug: binding.name, environment, projectId: projectId ?? siteId };
}

/**
 * The project store both local apps share (`project-store.ts`); production (Fly, single site) has
 * none — the project is the site there. A store that cannot open (its folder can't be created, an
 * unreadable key, a damaged file) is reported and returned as `unavailable`, so a project-level fault
 * never stops a site booting, and its saves are refused rather than sent to the site vault.
 */
async function projectStoreFor({ overrides, runtimeMode }: { overrides: Partial<CreateSiteRouteDepsOverrides>; runtimeMode: RuntimeMode }): Promise<ProjectStore | { unavailable: string } | undefined> {
  const open = overrides.openProjectStore ?? (async () => {
    if (!localOwnerStoreEnabled({ runtimeMode, env: process.env })) return undefined;
    const workspace = createSitesWorkspace({});
    return openProjectStore({ sitesHome: workspace.home({}), home: homedir(), appDataDir: workspace.config({}).appData });
  });
  return open().catch(error => {
    const detail = formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS);
    const reason = `Shared Keys could not open. Existing site keys remain available. Retry Shared Keys after reopening the app. Details: P25_OWNER_STORE_UNAVAILABLE; ${detail}`;
    console.warn(`[project-store] ${reason}`);
    return { unavailable: reason };
  });
}
