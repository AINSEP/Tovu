import {
  buildDomainRegistrations,
  optionalNumber,
  requireInputRecord,
  requireString,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import { buildComponentCatalogQuery } from "./component-catalog-query.js";

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
 * top-level `search_components`/`describe_component` tools (via `registerComponentCatalogRoutes` in
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
 * `buildComponentCatalogQuery()` is called once per registration build (once per daemon boot / BYOK
 * surface construction, mirroring `buildToolCatalogQuery`'s own call site) rather than per handler
 * invocation: `ALL_MANIFESTS` is static, so there is nothing to refresh between calls — see that
 * function's own module doc.
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

interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** Descriptions and schemas deliberately match `@jini-ai/mcp`'s `component-catalog-tools.ts` word
 *  for word: a model that has learned either surface's contract must not have to relearn a second
 *  dialect for the other, the same parity `byok-tool-surface.ts`'s own `META_TOOL_DESCRIPTORS` keeps
 *  with `@jini-ai/mcp`'s tool-catalog defs. */
export const componentCatalogAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: SEARCH_COMPONENTS_TOOL_ID,
    description:
      "Search the registered interactive-UI component catalog. Returns ranked {id, provider, capabilities, description, score} candidates only — no propsSchema, so this stays cheap to call broadly. Call describe_component on the 1-3 candidates that look right before composing an A2UI or MCP-UI message that names one. Describe what interaction or data shape you need, not a component class name — e.g. \"tabular list of records the user can click into\" rather than \"table\".",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Describe the interaction or data shape you need, in plain language — what the user should see and do, not a component name. Example: "let the user pick one date from a range" rather than "DatePicker". Required.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: SEARCH_LIMIT_MAX,
          description: `Max hits to return (1-${SEARCH_LIMIT_MAX}). Optional, defaults to ${SEARCH_LIMIT_DEFAULT}.`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: DESCRIBE_COMPONENT_TOOL_ID,
    description:
      "Get the full descriptor for one component id found via search_components — provider, capabilities, and propsSchema. Paid for only on the candidates that survive search.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component id returned by search_components. Required." },
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
 * `_routeDeps`/`_surfaces` are unused: the interactive-component catalog is static
 * (`@jini-ai/ui`'s `ALL_MANIFESTS`), so this domain needs neither a workspace-scoped dependency bag
 * nor a live surface channel — both parameters exist only to satisfy `ToolContributor.build`'s
 * shared signature (`tool-registrations.ts`), mirroring `render-ui-tool.ts`'s identical `_routeDeps`
 * placeholder.
 *
 * @complexity O(1) to build (a handful of static manifests); see {@link buildComponentCatalogQuery}
 * for its own per-call search/describe cost.
 * @overallScore 100
 */
export function buildComponentCatalogRegistrations(_routeDeps: unknown, _surfaces: unknown): ToolRegistration[] {
  const componentCatalog = buildComponentCatalogQuery();

  const handlers: Record<string, ToolHandler> = {
    [SEARCH_COMPONENTS_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const query = requireString(input, "query");
      const rawLimit = optionalNumber(input, "limit");
      // Clamped, not rejected — an out-of-range limit is an optimization hint, not part of what the
      // caller is actually asking for, mirroring `byok-tool-surface.ts`'s identical `runSearchTools`
      // treatment of `search_tools`' own `limit` argument.
      const limit = rawLimit === undefined ? SEARCH_LIMIT_DEFAULT : Math.min(Math.max(Math.trunc(rawLimit), 1), SEARCH_LIMIT_MAX);
      return componentCatalog.search(query, limit);
    },
    [DESCRIBE_COMPONENT_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      const entry = componentCatalog.describe(id);
      if (!entry) throw new Error(`component '${id}' was not found`);
      return entry;
    },
  };

  return buildDomainRegistrations({
    domain: "component-catalog",
    catalogModule: "assistant/component-catalog-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: componentCatalogDerivedRisk,
  });
}
