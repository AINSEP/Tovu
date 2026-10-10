/** Cross-family host contract. Plugins ask the host; they never import another plugin family. */
import type { PluginIdentityCandidate, PluginLookupPort } from '@jini-ai/core/plugin-directory';
import type { InstalledAgentPlugin, SetAgentPluginEnabledInput as AgentPluginEnableInput, SetAgentPluginEnabledResult } from '@jini-ai/agent-plugins/lifecycle';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { SettingsRepoPort } from '@jini-ai/core/settings';
import type { AuthorizeFn } from '../core/commands/index.js';
import type { UninstallAgentPluginRequired as JiniUninstallRequired, UninstallAgentPluginOptional, UninstallAgentPluginResult } from '@jini-ai/agent-plugins/lifecycle';

export type { PluginLookupPort, PluginProvider } from '@jini-ai/core/plugin-directory';
/** One workspace's ENTIRE Agent Plugins tree — packages, data, and staging, all rooted under the
 * same `ws/<workspaceId>/` directory, so nothing in it is reachable from another workspace's own
 * layout without walking `..` out of it (see `layout.unit.test.ts`'s disjointness assertion). */
export interface AgentPluginWorkspaceLayout {
  /** `<instance root>/ws/<workspaceId>` */
  readonly root: string;
  /** `<root>/packages/sha256` — immutable, content-addressed WITHIN this workspace only. */
  /** Legacy flat store: migration input only. */
  readonly packages: string;
  pluginRootDir(required: { pluginId: string }, optional?: Record<string, never>): string;
  pluginPackagesDir(required: { pluginId: string }, optional?: Record<string, never>): string;
  pluginMemoryDir(required: { pluginId: string; kind: "learned" | "notes" }, optional?: Record<string, never>): string;
  /** `<root>/staging` — private atomic-extraction directories for this workspace's own installs. */
  readonly staging: string;
  /**
   * This workspace's writable `PLUGIN_DATA` root: `<root>/<pluginId>/data/`.
   *
   * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar — used as a raw
   * path segment, so an unvalidated caller must not be able to smuggle a traversal segment through.
   */
  pluginDataDir(pluginId: string): string;
}

export interface AgentPluginLayout {
  /** `<site>/agent-plugins` (or `TOVU_AGENT_PLUGINS_DIR`) — the whole tree this feature owns. Not,
   * by itself, a usable install/data location for any workspace — see `forWorkspace`. */
  readonly root: string;
  /** `<root>/ws` — the folder holding one `forWorkspace(id).root` per workspace. Exposed so a reader
   * that must visit every workspace (the site backup) enumerates the same folder installs write to. */
  readonly workspacesDir: string;
  /**
   * Resolves the fully workspace-scoped layout for one workspace. This is the ONLY way to reach a
   * `packages`/`staging`/`pluginDataDir` path — there is deliberately no instance-level equivalent
   * of any of them, so a caller cannot accidentally hand `install.ts` a path shared across tenants.
   *
   * @throws {Error} If `workspaceId` is not a bounded, safe path segment.
   */
  forWorkspace(workspaceId: string): AgentPluginWorkspaceLayout;
}

/** The route-deps slice this reads. `settingsRepo` is always present on the composed assistant
 *  deps (`SettingsToolDeps`); optional so the many narrow test fixtures that never render copy keep
 *  working, and they get English. */
export interface OperatorLocaleDeps {
  readonly settingsRepo?: SettingsRepoPort;
}

/** The narrow slice of the route-deps bag this branch's handler reads. Structurally satisfied by
 *  `PluginsToolDeps` (`plugin-runtime/tool-registrations.ts`), which carries both fields among many
 *  others — this interface stays narrow so this module does not have to import that wider type. */
export interface AgentPluginUninstallToolDeps extends OperatorLocaleDeps {
  readonly agentPluginLayout: AgentPluginLayout;
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  /** The lifecycle owner with host-supplied effects, used for the confirmed write. */
  readonly uninstallAgentPlugin?: (
    input: Omit<JiniUninstallRequired, 'layout'> & { readonly layout: AgentPluginLayout },
    options?: UninstallAgentPluginOptional,
  ) => Promise<UninstallAgentPluginResult>;
}

export type SetAgentPluginEnabledInput = AgentPluginEnableInput & { agentPluginLayout: AgentPluginLayout };

/** The lifecycle owner remains responsible for authorization, confirmation and durable writes. */
export interface AgentPluginHostCapability {
  listInstalled(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly InstalledAgentPlugin[]>;
  assertWritable(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
  setEnabled(required: AgentPluginEnableInput, optional?: Record<string, never>): Promise<SetAgentPluginEnabledResult>;
  provisionMcp(required: { pluginId: string; principalId: string }, optional?: Record<string, never>): Promise<void>;
  uninstall(required: { surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext; pluginId: string; executionOptions: ToolExecutionOptions }, optional?: Record<string, never>): Promise<unknown>;
}

export interface PluginHostPort extends PluginLookupPort {
  /** Serializes identity admission and publication across plugin kinds. */
  withInstallIdentity<T>(required: { candidate: PluginIdentityCandidate; run: () => Promise<T> }, optional?: Record<string, never>): Promise<T>;
  /** Lifecycle orchestration is a host capability, separate from installed plugin declarations. */
  getHostCapability(required: { capability: 'agent-plugin-lifecycle' }, optional?: Record<string, never>): AgentPluginHostCapability | undefined;
}
