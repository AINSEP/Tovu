/**
 * @file Projects executable Agent Plugin tools (`tovu-agent-tools.json` + `.mjs` modules, admitted
 * by `@jini-ai/agent-plugins/lifecycle/tools`) onto the assistant's ToolRegistry.
 *
 * Reuses, in order: the lifecycle's trusted contribution loader (active plugin, bundled digest,
 * contained module path), Jini's tool projection (schema validation, revocable per-call
 * capabilities, affected-resource disclosure), the plugin tool contract's registration builder
 * (`p_<plugin>__<tool>` ids, enablement + authorization recheck before the handler), a core
 * registration scope (replaced when the plugin set changes), and Tovu's approval owner.
 *
 * Two Tovu-specific adjustments, both explained where they happen: the contract's
 * `requiresConfirmation` flag is replaced by the approval owner's card (this host has no executor
 * confirmation transport, so that flag would park the call forever), and confirming tools carry no
 * executor deadline (the deadline would expire while the human reads the card, as for native tools).
 */
import { createToolRegistrationScope, type ToolExecutionContext, type ToolAuthorizationContext, type ToolRegistration, type ToolRegistry } from '@jini-ai/core';
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { buildPluginContributionToolRegistrations, createPluginContributionRegistry, pluginToolIdFor } from '@jini-ai/plugins/host';
import { createAgentPluginToolProjection, defineAgentPluginToolContribution, type AgentPluginToolEffect, type IssuedTokenMemories, type LoadedAgentPluginTool } from '@jini-ai/agent-plugins/lifecycle/tools';
import { buildAdminSurfaceActionTools } from '@jini-ai/agent-plugins/admin-surfaces';
import { deriveApiConnectionKey } from '@jini-ai/integrations/api-connections';
import { ADMIN_SURFACE_ACTION_PERMISSION, withAdminSurfaceSignIns, type AdminSurfaceSource } from '../admin-surfaces/surfaces.js';
import type { AgentPluginAdminSurfaceHandlers } from '../admin-surfaces/handlers.js';
import type { SurfaceDetail } from '@jini-ai/ui/mcp-ui/surfaces';
import type { HttpClientPort } from '@jini-ai/core/primitives';
import { EXTENSION_TOOL_APPROVAL_POLICY } from '../../../contracts/headless/index.js';
import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";
import type { AuthorizeFn } from '../../../contracts/core/commands/index.js';
import { APPROVAL_FAMILY_BY_EFFECT, createAgentPluginDisclosure } from './approval.js';
import {
  createAgentPluginToolCapabilities, createFrozenConnectionAccounts,
  type AgentPluginArtifactWriter, type AgentPluginConnectionAccess, type FrozenConnectionAccounts, type AgentPluginRateLimiter, type AgentPluginStateReaderFor, type AgentPluginApiOriginsFor,
} from './host-capabilities.js';

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

interface ToolOwner { readonly pluginId: string; readonly effect: AgentPluginToolEffect }

/** Tool id → owning plugin and declared effect, from the contribution registry's current snapshots. @complexity O(t). */
function ownersById(contributions: ReturnType<typeof createPluginContributionRegistry>): Map<string, ToolOwner> {
  const owners = new Map<string, ToolOwner>();
  for (const snapshot of contributions.list({})) {
    for (const tool of snapshot.tools) owners.set(pluginToolIdFor({ pluginId: snapshot.pluginId, name: tool.name }), { pluginId: snapshot.pluginId, effect: tool.effect ?? 'destructive' });
  }
  return owners;
}

/**
 * Loads this workspace's executable Agent Plugin tools and keeps them registered on `registry`.
 * @param required.registry - The core ToolRegistry the assistant executes from (a registration scope needs it).
 * @param required.workspaceId - The workspace whose plugins, activation and connections apply.
 * @param required.host - Loader, connection accessor, guarded HTTP, limiter and optional artifact writer.
 * @param required.isActive - Fresh activation read for one plugin; must deny on any fault.
 * @param required.authorize - The workspace RBAC evaluator; callers need `admin.assistant.use`.
 * @param required.applyApproval - The approval owner, applied to write and destructive tools.
 * @returns Refusal lines, `refresh` to reload the active set, and `dispose` to remove every tool.
 * @complexity O(t) tools plus one contained import per tool module (cached by Node).
 */
export async function registerAgentPluginExecutableTools(
  required: {
    readonly registry: ToolRegistry; readonly workspaceId: string; readonly host: AgentPluginExecutableToolHost;
    readonly isActive: (required: { readonly pluginId: string }) => Promise<boolean>;
    readonly authorize: AuthorizeFn; readonly applyApproval: ApplyAgentPluginApproval;
    readonly withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy;
  },
  _optional: Record<string, never> = {},
): Promise<{ readonly refusals: readonly string[]; refresh(): Promise<{ readonly refusals: readonly string[] }>; dispose(): void }> {
  const { registry, workspaceId, host, withExtensionApprovalPolicy } = required;
  const frozen = host.frozen ?? createFrozenConnectionAccounts();
  const capabilities = createAgentPluginToolCapabilities({ connections: host.connections, http: host.http, limiter: host.limiter, frozen, state: host.state, apiOrigins: host.apiOrigins }, host.artifacts ? { artifacts: host.artifacts } : {});
  const contributions = createPluginContributionRegistry({});
  const projection = createAgentPluginToolProjection({ registry: contributions, toolIdFor: pluginToolIdFor, capabilities, issuedTokens: host.issuedTokens });
  const disclose = createAgentPluginDisclosure({ source: projection, connections: host.connections, frozen });
  const authorize = adaptLegacyAuthorize({ authorize: required.authorize });
  /** One fresh trust/activation load. Each generation's closures retain its own declaration. */
  async function loadTools() {
    const load = await host.loadContributions({ workspaceId, definition: toolContribution }, { orderByPluginId: true });
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
      connectionRefFor: ({ pluginId, connectionId }) => deriveApiConnectionKey({ workspaceId, pluginId, connectionId }),
    }) : [];
    return { loaded: load.items, refusals: load.refusals, additionalTools };
  }
  const initial = await loadTools();
  let adminToolIds = new Set(initial.additionalTools.map(entry => pluginToolIdFor({ pluginId: entry.pluginId, name: entry.tool.name })));
  const { refusals } = projection.sync(initial);

  const ports = {
    contributions, isEnabled: required.isActive,
    resolveAuth: async ({ pluginId, principalId }: { pluginId: string; principalId: string }) => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: required.authorize }), workspaceId, principalId, permission: 'admin.assistant.use' }, { entityType: 'plugin', entityId: pluginId });
      return { access: 'admin' as const, principalId, workspaceId };
    },
    metadata: { approval: EXTENSION_TOOL_APPROVAL_POLICY[APPROVAL_FAMILY_BY_EFFECT.read] },
  };
  const adapt = (registration: ToolRegistration, owner: ToolOwner): ToolRegistration => {
    const toolId = registration.descriptor.id;
    // The contract asks the executor to confirm; Tovu's executor has no transport for that and would
    // park forever, so the approval owner's card below confirms instead (never less friction).
    const { requiresConfirmation: _parked, timeoutMs, ...descriptor } = registration.descriptor;
    const asks = owner.effect !== 'read';
    const gated = adminToolIds.has(toolId) ? { ...registration, policy: { ...registration.policy, authorize: async (ctx: ToolAuthorizationContext) => {
      if (await registration.policy.authorize(ctx) !== 'allow') return 'deny' as const;
      try {
        await requireToolPermission({ authorize, workspaceId, principalId: ctx.principal.id, permission: ADMIN_SURFACE_ACTION_PERMISSION });
        return 'allow' as const;
      } catch { return 'deny' as const; }
    } } } : registration;
    const nonDestructiveEffect = asks ? 'mutates-durable-state' : 'none';
    const sideEffects = owner.effect === 'destructive' ? 'deletes-durable-state' : nonDestructiveEffect;
    const classified = withExtensionApprovalPolicy({ registration: { ...gated, descriptor: { ...descriptor, readOnly: !asks, sideEffects, ...(asks ? {} : { timeoutMs }) } }, family: APPROVAL_FAMILY_BY_EFFECT[owner.effect] });
    // An admin action may be the one that signs a connection in, so its unconnected ones are left unbound.
    const skipUnconnected = adminToolIds.has(toolId);
    return asks ? required.applyApproval({ registration: classified }, { disclose: ({ ctx }) => disclose({ ctx, toolId, pluginId: owner.pluginId, workspaceId }, { skipUnconnected }) }) : classified;
  };
  const scope = createToolRegistrationScope({ registry });
  const refresh = () => {
    const owners = ownersById(contributions);
    scope.replace({ registrations: buildPluginContributionToolRegistrations(ports).map((registration) => {
      const owner = owners.get(registration.descriptor.id);
      // Both come from the same snapshots; refusing beats registering a tool with no approval family.
      if (!owner) throw new Error(`agent plugin tool '${registration.descriptor.id}' has no owning plugin, so its approval could not be classified`);
      return adapt(registration, owner);
    }) });
  };
  refresh();
  const unsubscribe = contributions.subscribe({ onChanged: refresh });
  let disposed = false;
  // One refresh at a time: an older load that finishes late would otherwise re-register the tools of
  // a plugin a newer load already saw disabled.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    refusals,
    refresh() {
      const run = queue.then(async () => {
        const next = await loadTools();
        if (disposed) throw new Error('Plugin tool registration was disposed.');
        adminToolIds = new Set(next.additionalTools.map(entry => pluginToolIdFor({ pluginId: entry.pluginId, name: entry.tool.name })));
        return projection.sync(next);
      });
      queue = run.catch(() => undefined);
      return run;
    },
    dispose() { disposed = true; unsubscribe(); scope.replace({ registrations: [] }); },
  };
}
