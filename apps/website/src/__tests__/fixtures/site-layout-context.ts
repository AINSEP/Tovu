import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import * as externalMcpStore from "#src/assistant/index";
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
      agentPluginLayout: resolveAgentPluginLayout({ siteDir, env: {} }),
      skillLayout: resolveSkillLayout({ siteDir, env: {} }),
      siteBinding: describeSiteBinding({ cwd: siteDir, env: { TOVU_SITE_DIR: siteDir, TOVU_SITE_BINDING_NOT_SWITCHABLE: "1" } }),
    },
    cleanup: () => rmSync(siteDir, { recursive: true, force: true }),
  };
}

/** Legacy suites select their temp site after declaring shared contexts. Getters keep that test
 * setup order while production receives fixed layouts at boot. New binding tests use fixed ports. */
export function testSiteLayoutContext<T extends object>(input: T, _options = {}) {
  const descriptors: PropertyDescriptorMap = {
    externalMcpStore: { enumerable: true, configurable: true, value: externalMcpStore },
    notifyRosterChanged: { enumerable: true, configurable: true, value: externalMcpStore.notifyExternalMcpRosterChanged },
    agentPluginLayout: { enumerable: true, configurable: true, get: () => resolveAgentPluginLayout() },
    agentPluginLifecycle: { enumerable: true, configurable: true, get: () => createTovuAgentPluginLifecycle({ layout: context.agentPluginLayout }) },
    loadDeployOps: { enumerable: true, configurable: true, get: () => (ctx: { workspaceId: string }) => loadDeployOpsRegistry(ctx, { loadContributions: context.agentPluginLifecycle.loadPluginContributions }) },
    loadSourceControlProviders: { enumerable: true, configurable: true, get: () => (workspaceId: string) => loadSourceControlProviderRegistry({ workspaceId }, { loadContributions: context.agentPluginLifecycle.loadPluginContributions }) },
    loadAuthSchemes: { enumerable: true, configurable: true, get: () => async (ctx: { workspaceId: string }) => (await loadCredentialSchemeRegistry(ctx, { loadContributions: context.agentPluginLifecycle.loadPluginContributions })).rules },
    skillLayout: { enumerable: true, configurable: true, get: () => resolveSkillLayout() },
    siteBinding: { enumerable: true, configurable: true, get: () => describeSiteBinding() },
  };
  for (const key of Object.keys(descriptors)) {
    if (key in input) delete descriptors[key];
  }
  const context = Object.defineProperties(input, descriptors) as T & Pick<RouteDeps, "agentPluginLayout" | "agentPluginLifecycle" | "skillLayout" | "siteBinding" | "loadDeployOps" | "loadSourceControlProviders" | "loadAuthSchemes" | "externalMcpStore" | "notifyRosterChanged">;
  return context;
}

/** A fixture port for failure-injection suites whose host factory is declared before temp setup. */
export const deferredTestAgentPluginLayout: ReturnType<typeof resolveAgentPluginLayout> = {
  get root() { return resolveAgentPluginLayout().root; },
  get workspacesDir() { return resolveAgentPluginLayout().workspacesDir; },
  forWorkspace(workspaceId) { return resolveAgentPluginLayout().forWorkspace(workspaceId); },
};
