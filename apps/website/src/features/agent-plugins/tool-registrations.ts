/**
 * @file Agent Plugin tool wiring for this product. The skill tool, its per-call gate, plugin search,
 * plugin memory tools and the note tool live in `@jini-ai/agent-plugins/lifecycle/host-tools`, and
 * that file carries their design notes. This file keeps the old names and signatures, binds the
 * host-tools ports to this product (`host-tool-ports.ts`), adds this product's guidance overlays
 * (`host-plugin-guidance.ts`), and wires the static connect domain.
 */
import {
  agentPluginSearchDerivedRisk, agentPluginSearchToolCatalog, agentPluginToolDerivedRisk as hostAgentPluginToolDerivedRisk,
  buildAgentPluginSearchRegistrations as buildHostAgentPluginSearchRegistrations, buildAgentPluginToolRegistrations as buildHostAgentPluginToolRegistrations,
  createAgentPluginToolGate as createHostAgentPluginToolGate, loadAgentPluginSearchCandidates as loadHostAgentPluginSearchCandidates,
  loadInstalledAgentPluginToolSources as loadHostAgentPluginToolSources, registerInstalledAgentPluginTools as registerHostAgentPluginTools,
  type AgentPluginToolGate, type AgentPluginToolSource, type IdentifiedAgentPluginSearchCandidate,
} from "@jini-ai/agent-plugins/lifecycle/host-tools";
import { toolMetadata } from '../../contracts/core/tool-metadata/agent-plugins.js';
import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";
import { WRITE_PLUGIN_NOTE, pluginNoteCatalog, pluginNoteRisk, pluginNoteHandler } from "./write-note-tool.js";
import type { OperatorLocaleDeps } from "../../contracts/headless/index.js";
import { deliverHostPluginGuidance, isHostPluginFileRequest, type HostPluginOverlayOptional } from "./host-plugin-guidance.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import {
  AGENT_PLUGIN_CONNECT_TOOL_ID,
  agentPluginConnectAgentToolCatalog,
  agentPluginConnectDerivedRisk,
  runAgentPluginConnect,
} from "./connect-tool.js";
import {
  saveAgentPluginToken,
  type AgentPluginAccessTokenToolDeps,
} from "./access-token-tool.js";
import type { AgentPluginLayout } from "./layout.js";
import type { ToolContributor } from "@jini-ai/core";
import { AGENT_PLUGIN_HOST_TOOL_MESSAGES, AGENT_PLUGIN_HOST_TOOL_PERMISSIONS, agentPluginHostToolPorts } from "./host-tool-ports.js";

export type { AgentPluginSkillDetail, AgentPluginToolSource, AgentPluginToolIdentity, AgentPluginToolGate, IdentifiedAgentPluginSearchCandidate } from "@jini-ai/agent-plugins/lifecycle/host-tools";
export { agentPluginSearchDerivedRisk } from "@jini-ai/agent-plugins/lifecycle/host-tools";

/** Loads every installed, active Agent Plugin of one workspace as one tool-ready source. */
export async function loadInstalledAgentPluginToolSources(ctx: {
  readonly workspaceId: string;
  readonly agentPluginLayout: AgentPluginLayout;
}, _optional = {}): Promise<readonly AgentPluginToolSource[]> {
  return loadHostAgentPluginToolSources({ workspaceId: ctx.workspaceId, ports: agentPluginHostToolPorts(ctx) });
}

/** Every plugin tool is a pure read of already-installed content. */
export function agentPluginToolDerivedRisk(sources: readonly AgentPluginToolSource[]): DerivedRiskByToolId {
  return hostAgentPluginToolDerivedRisk({ sources });
}

/** The per-call revocation gate: activation first, then installation, fresh on every call. */
export function createAgentPluginToolGate(ctx: { readonly workspaceId: string; readonly agentPluginLayout: AgentPluginLayout }, _optional = {}): AgentPluginToolGate {
  return createHostAgentPluginToolGate({ workspaceId: ctx.workspaceId, ports: agentPluginHostToolPorts(ctx) });
}

/** Plugin sources as gated `ToolRegistration`s, with this product's metadata and permission names. */
export function buildAgentPluginToolRegistrations(
  { sources, gate, withExtensionApprovalPolicy }: { sources: readonly AgentPluginToolSource[]; gate: AgentPluginToolGate; withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy },
  _optional: Record<string, never> = {},
): ToolRegistration[] {
  return buildHostAgentPluginToolRegistrations({ sources, gate, withExtensionApprovalPolicy,
    ports: { permissions: AGENT_PLUGIN_HOST_TOOL_PERMISSIONS, metadata: toolMetadata } });
}

/**
 * Registers every installed plugin of one workspace on `registry`, with the real gate. Each guidance
 * answer carries this product's overlay for that plugin (`host-plugin-guidance.ts`): its `GUIDANCE.md`
 * after any maturity notice, and its `host/` files. `optional.overlaysDir` defaults to the shipped
 * overlays.
 */
export async function registerInstalledAgentPluginTools(
  registry: { register: (registration: ToolRegistration) => void },
  ctx: { readonly workspaceId: string; readonly agentPluginLayout: AgentPluginLayout; readonly withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy },
  optional: HostPluginOverlayOptional = {},
): Promise<void> {
  await registerHostAgentPluginTools({ registry, workspaceId: ctx.workspaceId, ports: agentPluginHostToolPorts(ctx),
    withExtensionApprovalPolicy: ctx.withExtensionApprovalPolicy }, { hostGuidance: {
    isFileRequest: ({ file }) => isHostPluginFileRequest(file),
    deliver: (required, notice) => deliverHostPluginGuidance(required, { ...optional, ...notice }),
  } });
}

/** The narrow slice of the route-deps bag `search_agent_plugin_local` reads. Declared structurally,
 *  so `assistant/tool-registrations.ts` can fold this into `AssistantToolRegistryDeps`. */
export interface AgentPluginSearchToolDeps {
  readonly workspaceId: string;
  readonly agentPluginLayout: AgentPluginLayout;
}

/** `search_agent_plugin_local`'s one-entry catalog, for the contracts test and the static seam. */
export const agentPluginSearchAgentToolCatalog: AgentToolDefinition[] = agentPluginSearchToolCatalog({ permission: AGENT_PLUGIN_HOST_TOOL_PERMISSIONS.use }, { messages: AGENT_PLUGIN_HOST_TOOL_MESSAGES });

/** Every installed plugin of one workspace, enabled or not, as a search candidate. Also read by the
 *  admin installed-plugin listing. */
export async function loadAgentPluginSearchCandidates(ctx: { readonly workspaceId: string; readonly agentPluginLayout: AgentPluginLayout }, _optional = {}): Promise<readonly IdentifiedAgentPluginSearchCandidate[]> {
  return loadHostAgentPluginSearchCandidates({ workspaceId: ctx.workspaceId, ports: agentPluginHostToolPorts(ctx) });
}

/** The `search_agent_plugin_local` registration; its handler reads the installed plugins per call. */
export function buildAgentPluginSearchRegistrations(routeDeps: AgentPluginSearchToolDeps): ToolRegistration[] {
  return buildHostAgentPluginSearchRegistrations({ workspaceId: routeDeps.workspaceId, ports: agentPluginHostToolPorts(routeDeps) });
}

/**
 * Contributes `search_agent_plugin_local` to the assistant's STATIC tool catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, the ordinary seam every
 * other domain's `contribute<Domain>Tools()` uses.
 */
export function contributeAgentPluginSearchTools(): ToolContributor<AgentPluginSearchToolDeps, unknown> {
  return { domain: "agent-plugin-search", build: buildAgentPluginSearchRegistrations, risk: agentPluginSearchDerivedRisk };
}


/**
 * Builds the `agent_plugin_connect` registration (`connect-tool.ts`, S-G1 of the 2026-09-27
 * Supabase-agent-plugin v2 plan) — pure catalog/schema construction plus one handler closure that
 * hands straight off to `runAgentPluginConnect`, matching `buildAgentPluginSearchRegistrations`'s
 * shape immediately above. Kept in this file rather than in `connect-tool.ts` itself so every
 * static tool this domain contributes is wired from the one place, the same split that file already
 * uses for `search_agent_plugin_local`.
 */
export function buildAgentPluginConnectRegistrations(routeDeps: AgentPluginAccessTokenToolDeps & OperatorLocaleDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [WRITE_PLUGIN_NOTE]: pluginNoteHandler({ deps: routeDeps, surfaces }, { layout: routeDeps.agentPluginLayout }),
    // Both handlers forward `optional`: it carries `emitSurface`, the only channel their card can use.
    [AGENT_PLUGIN_CONNECT_TOOL_ID]: async (ctx, optional) => {
      const input = requireInputRecord({ input: ctx.input });
      const pluginId = requireString({ input: input, key: "pluginId" });
      return runAgentPluginConnect({ routeDeps, surfaces, ctx, pluginId }, {
        ...optional,
        // Retained sign-ins use the common fixed access card; the OAuth callback retains its own defaults.
        saveToken: ({ ctx, pluginId }, execution = {}) => saveAgentPluginToken({
          routeDeps, surfaces, ctx: { ...ctx, input: { pluginId } },
        }, execution),
      });
    },
    // Token cards reuse credential_save's save lifecycle through the injected adapter above.
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "agent-plugin-connect",
    catalogModule: "features/agent-plugins/connect-tool.ts",
    catalog: indexCatalogById({ catalog: agentPluginConnectDomainCatalog }),
    handlers,
    derivedRisk: agentPluginConnectDomainRisk,
  });
}

/** The connect domain wires sign-in and notes; token persistence remains owned by credential_save. */
export const agentPluginConnectDomainCatalog = [...agentPluginConnectAgentToolCatalog, ...pluginNoteCatalog];
const agentPluginConnectDomainRisk: DerivedRiskByToolId = new Map([...agentPluginConnectDerivedRisk, ...pluginNoteRisk]);

/** Contributes plugin sign-in and notes to the assistant's static
 *  tool catalog — called once by `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`. */
export function contributeAgentPluginConnectTools(): ToolContributor<AgentPluginAccessTokenToolDeps & OperatorLocaleDeps, AssistantSurfaceDeps> {
  return { domain: "agent-plugin-connect", build: buildAgentPluginConnectRegistrations, risk: agentPluginConnectDomainRisk };
}
