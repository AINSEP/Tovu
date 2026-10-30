import { resolveSiteRoot } from "#src/platform/site-dir/index";
import { notifyExternalMcpRosterChanged } from "../../assistant/external-mcp-roster-change.js";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { readPluginInstallRequest, readPluginInstallArchive } from "#src/features/plugin-runtime/install-source";
import { composeAgentPluginMcp, composeAgentPluginPreferences, composePluginProviderFaces } from "../../server/runtime/composition/agent-plugin-service-ports.js";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { bundledAgentPluginsDir } from "../../server/runtime/composition/site-paths.js";
import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";
import { loadSourceControlProviderRegistry } from "#src/features/source-control/provider-registry";
import { loadCredentialSchemeRegistry } from "#src/features/agent-plugins/auth-schemes";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { describeSiteBinding } from "#src/platform/site-dir/index";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestSiteLayoutFixture {
  readonly siteDir: string;
  readonly deps: Pick<RouteDeps, "agentPluginLayout" | "skillLayout" | "siteBinding">;
  readonly cleanup: () => void;
}

/**
 * Creates fixed plugin, skill, and site ports in one private temporary site.
 * @param _input - No required configuration.
 * @param _options - Reserved fixture options.
 * @returns Ports to spread into test deps and cleanup to register with a test hook.
 * @throws Filesystem errors if the temporary site cannot be created or removed.
 * @complexity Setup is O(1); cleanup is O(n) in the site's files and directories.
 * @example const fixture = createTempSiteLayoutFixture({}); after(fixture.cleanup);
 */
export function createTempSiteLayoutFixture(_input: Record<string, never>, _options = {}): TestSiteLayoutFixture {
  const siteDir = mkdtempSync(path.join(tmpdir(), "tovu-test-site-layout-"));
  return {
    siteDir,
    deps: {
      agentPluginLayout: resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} }),
      skillLayout: resolveSkillLayout({ siteDir, env: {} }),
      siteBinding: describeSiteBinding({ cwd: siteDir, env: { TOVU_SITE_DIR: siteDir, TOVU_SITE_BINDING_NOT_SWITCHABLE: "1" } }),
    },
    cleanup: () => rmSync(siteDir, { recursive: true, force: true }),
  };
}

/** Legacy suites select their temp site after declaring shared contexts. Getters keep that test
 * setup order while production receives fixed layouts at boot. New binding tests use fixed ports. */
export function testSiteLayoutContext<T extends object>(input: T, _options = {}) {
  const services = input as Partial<RouteDeps>;
  const descriptors: PropertyDescriptorMap = {
    pluginInstallSource: { enumerable: true, configurable: true, value: { readRequest: readPluginInstallRequest, readArchive: readPluginInstallArchive } },
    bundledSourceRoot: { enumerable: true, configurable: true, get: () => bundledAgentPluginsDir() },
    mcp: { enumerable: true, configurable: true, get: () => composeAgentPluginMcp({ repo: services.externalMcpServerRepo!, sealer: services.siteAssistantSecretSealer!, keyring: services.siteAssistantSecretKeyring!, clock: services.clock! }) },
    preferences: { enumerable: true, configurable: true, get: () => composeAgentPluginPreferences({ settings: { repo: services.settingsRepo!, clock: services.clock!, ids: services.idGen!, authorize: services.authorize!, principals: createSettingsPrincipalLookup({ repo: services.principalRepo! }) }, read: services.getEffective, write: services.set }) },
    providerFaces: { enumerable: true, configurable: true, get: () => composePluginProviderFaces({ workspaceRoot: () => context.agentPluginLayout.forWorkspace(services.workspaceId!).root }) },
    bundledAgentPluginsSourceRoot: { enumerable: true, configurable: true, get: () => bundledAgentPluginsDir() },
    notifyRosterChanged: { enumerable: true, configurable: true, value: notifyExternalMcpRosterChanged },
    agentPluginLayout: { enumerable: true, configurable: true, get: () => resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }) },
    agentPluginLifecycle: { enumerable: true, configurable: true, get: () => createTovuAgentPluginLifecycle({ layout: context.agentPluginLayout }, { bundledSourceRoot: bundledAgentPluginsDir() }) },
    loadDeployOps: { enumerable: true, configurable: true, get: () => (ctx: { workspaceId: string }) => loadDeployOpsRegistry(ctx, { loadContributions: context.agentPluginLifecycle.loadPluginContributions }) },
    loadSourceControlProviders: { enumerable: true, configurable: true, get: () => (workspaceId: string) => loadSourceControlProviderRegistry({ workspaceId }, { loadContributions: context.agentPluginLifecycle.loadPluginContributions }) },
    loadAuthSchemes: { enumerable: true, configurable: true, get: () => async (ctx: { workspaceId: string }) => (await loadCredentialSchemeRegistry(ctx, { loadContributions: context.agentPluginLifecycle.loadPluginContributions })).rules },
    skillLayout: { enumerable: true, configurable: true, get: () => resolveSkillLayout() },
    siteBinding: { enumerable: true, configurable: true, get: () => describeSiteBinding() },
  };
  for (const key of Object.keys(descriptors)) {
    if (key in input) delete descriptors[key];
  }
  const context = Object.defineProperties(input, descriptors) as T & { bundledAgentPluginsSourceRoot: string; pluginInstallSource: import("../../contracts/headless/plugin-install-source.js").PluginInstallSourcePort } & Pick<RouteDeps, "agentPluginLayout" | "agentPluginLifecycle" | "skillLayout" | "siteBinding" | "loadDeployOps" | "loadSourceControlProviders" | "loadAuthSchemes" | "bundledSourceRoot" | "mcp" | "preferences" | "providerFaces" | "notifyRosterChanged">;
  return context;
}

/** A fixture port for failure-injection suites whose host factory is declared before temp setup. */
export const deferredTestAgentPluginLayout: ReturnType<typeof resolveAgentPluginLayout> = {
  get root() { return resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }).root; },
  get workspacesDir() { return resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }).workspacesDir; },
  forWorkspace(workspaceId) { return resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }).forWorkspace(workspaceId); },
};
