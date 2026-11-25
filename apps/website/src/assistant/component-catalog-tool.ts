import { toolMetadata } from '@jini-ai/chat/core/assistant-tool-metadata';
import { buildDomainRegistrations, optionalNumber, requireInputRecord, requireString, type AgentToolDefinition, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";

import { describeComponentTool, searchComponentsTool } from "@jini-ai/mcp";

import type { AdminChartProviderSnapshot } from "@jini-ai/core/contracts/headless/chart-providers";

import { buildComponentCatalogQuery, chartCatalogManifests } from "./component-catalog-query.js";

/**
 * @file Wires `search_components`/`describe_component` into Tovu's OWN `ToolRegistry` — the same
 * registry `search_tools`/`describe_tool`/`execute_delegated_tool` already reach for every other
 * tool — so the assistant's system prompt (`agent-daemon-server.ts`'s `assistantPromptAugmenter`,
 * "search_components/describe_component for the exact chart/component id, the same way you would
 * look up any other tool here") is actually true rather than aspirational.
 *
 * ## The gap this closes
 *
 * `component-catalog-query.ts`'s `buildComponentCatalogQuery()` already backs `@jini-ai/mcp`'s own
 * top-level `search_components`/`describe_component` tools (via `componentCatalogRoutes` in
 * `agent-daemon-server.ts`) — real, callable MCP tools, but ONLY for the spawned-CLI path, which
 * gets the full native MCP tool list. The BYOK path (`byok-tool-surface.ts`) publishes exactly 3
 * meta-tools (`search_tools`/`describe_tool`/`execute_delegated_tool`) and reaches every other tool
 * ONLY by resolving an id through `execute_delegated_tool` against this same `ToolRegistry`. Before
 * this file, `search_components`/`describe_component` were registered nowhere in that registry, so a
 * BYOK turn had no path to them at all — not as a published meta-tool, and not as an id
 * `execute_delegated_tool` could resolve.
 *
 * Production evidence this fixes (`agent_tool_attempts` where `phase='unknown-tool'`): the model
 * calling `search_components` directly (an id `execute_delegated_tool` could not resolve, since it
 * was never wired here) and, separately, guessing `assistant_search_components`/
 * `assistant_describe_component` — a Tovu-catalog-style name pattern borrowed from
 * `assistant_render_ui`, consistent with a model that has correctly learned "look this up the same
 * way as any other tool" but had no real registry entry to find under either name.
 *
 * Registering these here does not replace or shadow the native MCP tools the spawned-CLI path
 * already has — a CLI-spawned model can still call the top-level `search_components` tool directly.
 * This is purely additive: the exact same ids become ALSO resolvable via
 * `search_tools`/`describe_tool`/`execute_delegated_tool`, which is the only mechanism the BYOK path
 * has, and a second, redundant-but-harmless discovery route for the CLI path (a model that forgets
 * the literal name can still find it by searching what it needs, same as every other tool here).
 *
 * The catalog is built per handler invocation, not per registration build: chart entries come from
 * the host's live chart-provider snapshot, so disabling a provider or changing the site default must
 * show on the next request without rebuilding registrations. The server builds those entries from
 * headless manifests (`chartCatalogManifests`) because it cannot import a React chart package.
 */

export const SEARCH_COMPONENTS_TOOL_ID = "search_components";
export const DESCRIBE_COMPONENT_TOOL_ID = "describe_component";

/** Mirrors `@jini-ai/http-kit`'s `component-catalog.ts` (`MAX_SEARCH_LIMIT`/`DEFAULT_SEARCH_LIMIT`)
 *  and `byok-tool-surface.ts`'s identical re-declaration of `search_tools`' own bounds — same
 *  reasoning as that file's comment: the values are the contract this schema states to the model, so
 *  restating them here (rather than importing a private const) keeps the enforced bound and the
 *  documented one from silently drifting apart. */
const SEARCH_LIMIT_MAX = 25;
const SEARCH_LIMIT_DEFAULT = 10;

/** The model-facing descriptions and schema shapes deliberately match `@jini-ai/mcp`'s
 *  `component-catalog-tools.ts` word for word: a model that has learned either surface's contract
 *  must not have to relearn a second dialect for the other, the same parity `byok-tool-surface.ts`'s
 *  own `META_TOOL_DESCRIPTORS` keeps with `@jini-ai/mcp`'s tool-catalog defs. The description texts
 *  are therefore read from those defs rather than restated; only this registry's extra `clamp`
 *  repair declaration and the limit bounds above are local. */
function mcpPropertyDescription({ tool, key }: { tool: typeof searchComponentsTool; key: string }, _optional = {}): string {
  const property = (tool.inputSchema.properties as Record<string, { description: string } | undefined>)[key];
  // A missing def is a drift between this registry and @jini-ai/mcp; fail at load, not with a blank description.
  if (!property) throw new Error(`@jini-ai/mcp ${tool.name} has no "${key}" input property to describe.`);
  return property.description;
}

export const componentCatalogAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: SEARCH_COMPONENTS_TOOL_ID,
    description: searchComponentsTool.description,
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: mcpPropertyDescription({ tool: searchComponentsTool, key: "query" }),
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: SEARCH_LIMIT_MAX, clamp: true,
          description: `Max hits to return (1-${SEARCH_LIMIT_MAX}). Optional, defaults to ${SEARCH_LIMIT_DEFAULT}.`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: DESCRIBE_COMPONENT_TOOL_ID,
    description: describeComponentTool.description,
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: mcpPropertyDescription({ tool: describeComponentTool, key: "id" }) },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

export const componentCatalogDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [SEARCH_COMPONENTS_TOOL_ID, "none"],
  [DESCRIBE_COMPONENT_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(componentCatalogAgentToolCatalog.map((entry) => [entry.name, entry]));

/**
 * Builds the `ToolRegistration`s for `search_components`/`describe_component` over the same
 * `ComponentCatalogQuery` the HTTP routes use — see this file's own doc for why a second, registry
 * based path to the identical ids is worth wiring.
 *
 * `readChartSnapshot` is the host's site-bound chart-provider read. It is awaited once per request
 * and never during construction or across requests, so metadata builds stay I/O-free and a failed
 * read surfaces as the tool's error rather than as shipped chart entries for a disabled provider.
 * `tool-registrations.ts` adapts the shared `ToolContributor.build` signature to this argument object.
 *
 * @complexity O(1) to build; each call awaits one snapshot read and builds O(m + k * p) manifests,
 * then see {@link buildComponentCatalogQuery} for its own per-call search/describe cost.
 * @overallScore 100
 */
export function buildComponentCatalogRegistrations({ readChartSnapshot }: {
  readChartSnapshot: (required: Record<string, never>, optional?: Record<string, never>) => Promise<AdminChartProviderSnapshot>;
}, _optional = {}): ToolRegistration[] {
  const readCatalog = async () => {
    const manifests = chartCatalogManifests({ snapshot: await readChartSnapshot({}) });
    return buildComponentCatalogQuery({ getManifests: () => manifests });
  };

  const handlers: Record<string, ToolHandler> = {
    [SEARCH_COMPONENTS_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const query = requireString({ input, key: "query" });
      const rawLimit = optionalNumber({ input, key: "limit" });
      // Clamped, not rejected — an out-of-range limit is an optimization hint, not part of what the
      // caller is actually asking for, mirroring `byok-tool-surface.ts`'s identical `runSearchTools`
      // treatment of `search_tools`' own `limit` argument.
      const limit = rawLimit === undefined ? SEARCH_LIMIT_DEFAULT : Math.min(Math.max(Math.trunc(rawLimit), 1), SEARCH_LIMIT_MAX);
      return (await readCatalog()).search({ query }, { limit });
    },
    [DESCRIBE_COMPONENT_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const id = requireString({ input, key: "id" });
      const entry = (await readCatalog()).describe({ id });
      if (!entry) throw new Error(`component '${id}' was not found`);
      return entry;
    },
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "component-catalog",
    catalogModule: "assistant/component-catalog-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: componentCatalogDerivedRisk,
  });
}
