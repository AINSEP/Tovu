import { requireToolPermission } from '@jini-ai/core';
import type { ToolExecutionContext, ToolRegistration, ToolRegistry } from '@jini-ai/core';
import type { SurfaceCardDetail as SurfaceDetail } from '@jini-ai/core/contracts/cards';
import type { HttpClientPort } from '@jini-ai/core/primitives';
import { buildPluginContributionToolRegistrations, createPluginContributionRegistry, pluginToolIdFor } from '@jini-ai/plugins/host';
import { defineAgentPluginToolContribution, type IssuedTokenMemories, type LoadedAgentPluginTool } from '@jini-ai/agent-plugins/lifecycle/tools';
import { buildAdminSurfaceActionTools } from '@jini-ai/agent-plugins/admin-surfaces';
import type { AgentPluginExecutableRuntimeHost } from '@jini-ai/agent-plugins/connect';
import { deriveApiConnectionKey } from '@jini-ai/integrations/api-connections';
import { ADMIN_SURFACE_ACTION_PERMISSION, withAdminSurfaceSignIns, type AdminSurfaceSource } from '../admin-surfaces/surfaces.js';
import type { AgentPluginAdminSurfaceHandlers } from '../admin-surfaces/handlers.js';
import { EXTENSION_TOOL_APPROVAL_POLICY } from '../../../contracts/headless/index.js';
import type { ApplyExtensionApprovalPolicy } from '#src/contracts/headless/assistant-tool-approval-policy';
import type { AuthorizeFn } from '../../../contracts/core/commands/index.js';
import { APPROVAL_FAMILY_BY_EFFECT } from './approval.js';
import { agentPluginDisclosureMessages } from './approval-bindings.js';
import type { AgentPluginArtifactWriter, AgentPluginConnectionAccess, FrozenConnectionAccounts, AgentPluginRateLimiter, AgentPluginStateReaderFor, AgentPluginApiOriginsFor } from './host-capabilities.js';

/** The file a plugin ships at its package root to contribute executable tools. */
export const AGENT_PLUGIN_TOOLS_FILENAME = 'tovu-agent-tools.json';
const toolContribution = defineAgentPluginToolContribution({ filename: AGENT_PLUGIN_TOOLS_FILENAME });

/** Host ports the composition root binds once per site (see this folder's README). */
export interface AgentPluginExecutableToolHost {
  /** Same active/trusted source and handler host used by the sandboxed admin screen. */
  readonly adminSurfaces?: { readonly source: Pick<AdminSurfaceSource, 'list'>; readonly host: AgentPluginAdminSurfaceHandlers };
  /** The lifecycle's `loadPluginContributions`, narrowed to this contribution. */
  readonly loadContributions: (
    required: { readonly workspaceId: string; readonly definition: typeof toolContribution },
    optional: { readonly orderByPluginId?: boolean },
  ) => Promise<{ readonly items: readonly LoadedAgentPluginTool[]; readonly refusals: readonly string[] }>;
  readonly connections: AgentPluginConnectionAccess;
  readonly http: HttpClientPort;
  readonly limiter: AgentPluginRateLimiter;
  readonly artifacts?: AgentPluginArtifactWriter;
  /** The plugin settings reader (the store its admin surface writes); tools only read it. */
  readonly state: AgentPluginStateReaderFor;
  /** Each plugin's declared API origins: the only hosts its tools' HTTP may reach. */
  readonly apiOrigins: AgentPluginApiOriginsFor;
  /** The site's ONE token memory, shared with the admin-surface handler host: a plugin's tools and
   *  handlers share module scope, so a token either obtained must be withheld from both. */
  readonly issuedTokens: IssuedTokenMemories;
  /** The accounts confirmations freeze, shared with the admin-surface connections port so an admin
   *  action run as a tool is pinned like a tool call. Omitted, the registrar keeps its own. */
  readonly frozen?: FrozenConnectionAccounts;
}

/** Wraps one registration in the approval owner (`applyToolApprovalPolicy`, injected by the composition root). */
export type ApplyAgentPluginApproval = (
  required: { readonly registration: ToolRegistration },
  optional: { readonly disclose: (required: { readonly ctx: ToolExecutionContext }) => Promise<readonly SurfaceDetail[]> },
) => ToolRegistration;

export interface AgentPluginExecutableRegistrationHostInput {
  readonly registry: ToolRegistry; readonly workspaceId: string; readonly host: AgentPluginExecutableToolHost;
  readonly isActive: (required: { readonly pluginId: string }) => Promise<boolean>;
  readonly authorize: AuthorizeFn; readonly applyApproval: ApplyAgentPluginApproval;
  readonly withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy;
}

/** Wires the original contribution and approval owners without constructing a second registry or map. */
export function bindExecutableToolRegistration(required: AgentPluginExecutableRegistrationHostInput, _optional: Record<string, never> = {}) {
  const host = required.host;
  async function loadActionTools({ workspaceId, authorize, connectionKey }: Parameters<NonNullable<AgentPluginExecutableRuntimeHost['adminSurfaces']>['loadActionTools']>[0]) {
    const admin = host.adminSurfaces;
    const surfaces = admin ? await admin.source.list({ workspaceId }) : [];
    if (admin) await admin.host.refresh();
    const additionalTools = admin ? buildAdminSurfaceActionTools({
      surfaces: surfaces.map(({ plugin, descriptor }) => ({ pluginId: plugin.pluginId, descriptor })),
      handlersFor: (input) => admin.host.handlersFor(input),
      authorize: async ({ context }) => {
        if (context.workspaceId !== workspaceId || !context.principalId) throw new Error('Admin surface caller is unavailable.');
        await requireToolPermission({ authorize, workspaceId, principalId: context.principalId, permission: ADMIN_SURFACE_ACTION_PERMISSION });
        // Re-read the trust gate after the human's confirmation, just as the screen action route does.
        const latest = await admin.source.list({ workspaceId });
        const original = surfaces.find(surface => surface.plugin.pluginId === context.pluginId && surface.descriptor.id === context.surfaceId);
        if (!original || !latest.some(surface => surface.plugin.pluginId === context.pluginId && surface.descriptor.id === context.surfaceId
          && JSON.stringify(surface.descriptor) === JSON.stringify(original.descriptor))) throw new Error('This admin surface is no longer available.');
        await admin.host.refresh();
      },
    }, {
      run: ({ dispatch }) => withAdminSurfaceSignIns({ host: admin.host, run: dispatch }),
      connectionRefFor: ({ pluginId, connectionId }) => connectionKey({ workspaceId, pluginId, connectionId }),
    }) : [];
    return additionalTools;
  }
  const { adminSurfaces, ...capabilities } = host;
  const runtimeHost: AgentPluginExecutableRuntimeHost = { ...capabilities,
    ...(adminSurfaces ? { adminSurfaces: { permission: ADMIN_SURFACE_ACTION_PERMISSION, loadActionTools } } : {}),
  };
  return { ...required, host: runtimeHost,
    contributions: { definition: toolContribution, createRegistry: createPluginContributionRegistry, buildRegistrations: buildPluginContributionToolRegistrations, toolIdFor: pluginToolIdFor },
    connectionKey: deriveApiConnectionKey,
    readApproval: EXTENSION_TOOL_APPROVAL_POLICY[APPROVAL_FAMILY_BY_EFFECT.read],
    disclosureMessages: agentPluginDisclosureMessages,
  };
}
