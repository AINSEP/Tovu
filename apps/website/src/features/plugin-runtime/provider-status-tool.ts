import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { toolMetadata } from "../../contracts/core/tool-metadata/plugin-runtime.js";

/**
 * @file `provider_status` (2026-10-25): a read-only, vendor-neutral answer to "is my analytics /
 * error tracking / tracing provider set up?" for every provider plugin (a plugin whose manifest
 * declares provider settings). Presence only: configured or not, which required fields are missing,
 * where it is saved, whether the plugin is on, its quarantine reason if the host quarantined it.
 * Never a setting value: hosts and endpoints can carry private tenant URLs, and secrets never leave
 * the server. Agent plugins (content/agent-plugins/<vendor>/) name the vendor; this tool names none.
 */

export const PROVIDER_STATUS_TOOL_ID = "provider_status";

/** One provider plugin's status row; the composition root fills it from discovery, activation and the settings store. */
export interface ProviderStatusRow {
  readonly pluginId: string;
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly missing: readonly string[];
  readonly store: "project" | "site";
  readonly appliesAt: "next-start";
  readonly unreadable?: true;
  readonly quarantine?: string;
}

export interface ProviderStatusPorts {
  /** Every discovered plugin that declares provider settings; presence only. */
  readonly list: (required: Record<string, never>) => Promise<readonly ProviderStatusRow[]>;
  readonly authorize: (ctx: ToolExecutionContext) => Promise<void>;
}

export const providerStatusAgentToolCatalog: AgentToolDefinition[] = [{
  name: PROVIDER_STATUS_TOOL_ID,
  description: "Read-only status of provider plugins (product analytics, error tracking, observability/tracing): for each, pluginId, enabled, configured (every required setting has a value), missing (labels of required settings without one), store (project = shared by every site of this project, or site), appliesAt (next-start: a saved change takes effect when the site next starts), unreadable (saved but cannot be opened on this machine; enter it again) and quarantine (the host's reason, when it switched the plugin off). Never returns a setting value or secret. Pass pluginId for one plugin. To set one up, open its agent plugin's key card with credential_save {kind:\"plugin-provider\",target:<card target>}. Requires admin.plugins.read.",
  sideEffects: "none",
  authorization: { permission: "admin.plugins.read" },
  inputSchema: { type: "object", additionalProperties: false, properties: { pluginId: { type: "string", minLength: 1, description: "Optional provider plugin id, e.g. from plugins_list." } } },
}];

export const providerStatusDerivedRisk: DerivedRiskByToolId = new Map([[PROVIDER_STATUS_TOOL_ID, "none"]]);

/** Optional pluginId filter; an unknown id is refused so the model never reads "not configured" for a typo. */
function selectRows({ rows, pluginId }: { rows: readonly ProviderStatusRow[]; pluginId: unknown }): { providers: readonly ProviderStatusRow[] } {
  if (pluginId === undefined) return { providers: rows };
  const row = rows.find((candidate) => candidate.pluginId === pluginId);
  if (!row) throw new ToolInputError({ message: `No installed provider plugin '${String(pluginId)}'. Call provider_status without pluginId, or plugins_list.` });
  return { providers: [row] };
}

/** @complexity O(p) provider plugins; one settings read each in the port. */
export function buildProviderStatusRegistrations({ ports }: { ports: ProviderStatusPorts }, _optional = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "provider-status",
    catalogModule: "features/plugin-runtime/provider-status-tool.ts", catalog: indexCatalogById({ catalog: providerStatusAgentToolCatalog }), derivedRisk: providerStatusDerivedRisk,
    handlers: { [PROVIDER_STATUS_TOOL_ID]: async (ctx) => {
      const input = ctx.input === undefined ? {} : requireInputRecord({ input: ctx.input });
      if (Object.keys(input).some((key) => key !== "pluginId")) throw new ToolInputError({ message: "provider_status takes only an optional pluginId." });
      await ports.authorize(ctx);
      return selectRows({ rows: await ports.list({}), pluginId: input.pluginId });
    } },
  });
}
