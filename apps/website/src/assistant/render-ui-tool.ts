import { toolMetadata } from '../contracts/core/tool-metadata/assistant.js';
import { renderA2uiSurface } from "@jini-ai/agentic/render-surface";

import { buildDomainRegistrations, type AgentToolDefinition, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolExecutionOptions, type ToolHandler, type ToolRegistration } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";

/**
 * @file A general-purpose "draw whatever you want" tool. Unlike `demo-a2ui-tool.ts` (a scripted,
 * fixed two-button round trip proving the transport works), this tool takes an arbitrary A2UI
 * component tree straight from the model and renders it, one shot, no scripted follow-up. The
 * model is expected to call `search_components`/`describe_component` first to learn what
 * component ids exist and what props each one needs (basic types like `Column`/`Text`, or
 * registry-sourced ones like `shadcn.button`/`recharts.pie-chart`), then hand this tool a
 * `components` array in that same shape. Every component the catalog knows is usable — nothing
 * has to be pre-wired into this tool by hand.
 *
 * ## Always enabled
 *
 * Registration policy: see demo-choices-tool.ts.
 */

export const RENDER_UI_TOOL_ID = "assistant_render_ui";

export const renderUiAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: RENDER_UI_TOOL_ID,
    description:
      // A screen with a canvas shows the surface there; the per-message screen block tells
      // the model which location to describe to the operator.
      "Renders an arbitrary A2UI surface in the admin UI: inline in the chat, or on the open screen's canvas " +
      "when it has one (the Current admin screen block's 'Where drawings appear' line says which). Built from real components (basic layout/text " +
      "primitives like Column/Row/Text/Card, plus every registry component search_components can find, e.g. " +
      "shadcn.button, shadcn.checkbox-field, recharts.pie-chart, recharts.bar-chart, recharts.line-chart). " +
      "Call search_components/describe_component first to learn exact component ids and their required props. " +
      "components is a flat array: {id, component, ...props}, one entry per node, referencing children by id " +
      "(e.g. a Column's `children` is an array of ids). Exactly one entry must have id 'root'. Writes nothing, " +
      "renders once, does not wait for any human interaction.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["components"],
      properties: {
        components: {
          type: "array",
          minItems: 1,
          items: { type: "object", additionalProperties: true, required: ["id", "component"] },
        },
      },
    },
  },
];

export const renderUiDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([[RENDER_UI_TOOL_ID, "none"]]);

const CATALOG_BY_ID = new Map(renderUiAgentToolCatalog.map((entry) => [entry.name, entry]));

type EmitSurface = NonNullable<ToolExecutionOptions["emitSurface"]>;

async function renderUiTool(
  required: { ctx: ToolExecutionContext; surfaces: AssistantSurfaceDeps; emitSurface: EmitSurface | undefined },
  { rejectionGraceMs }: { rejectionGraceMs?: number } = {},
): Promise<unknown> {
  const { ctx, surfaces, emitSurface } = required;
  if (!emitSurface) {
    return { rendered: false, reason: "no-surface-channel", note: "No live surface channel on this execution." };
  }
  const components = (ctx.input as { components?: unknown[] }).components ?? [];

  const outcome = await renderA2uiSurface({ exchanges: surfaces.surfaceExchanges, emitSurface, toolId: RENDER_UI_TOOL_ID, principalId: ctx.principal.id, components }, rejectionGraceMs == null ? {} : { rejectionGraceMs });
  if (outcome.rendered) {
    return {
      rendered: true,
      note:
        "The surface is now visible to the administrator: on this screen's canvas or in the chat, as the Current admin screen " +
        "block's 'Where drawings appear' line says (in the chat when there is no such line). Briefly describe what it shows and say where it is.",
    };
  }
  if (outcome.reason === "schema-rejected") return { rendered: false, reason: "schema-rejected", detail: outcome.detail };
  return {
    rendered: false,
    reason: "rejected-by-renderer",
    detail: outcome.detail,
    note: "The browser refused to render this — it was NOT drawn and is not visible anywhere. Fix the reported prop and try again; do not tell the user it rendered.",
  };
}

export function buildRenderUiRegistrations(
  { _routeDeps, surfaces }: { _routeDeps: unknown; surfaces: AssistantSurfaceDeps },
  /** Test-only seam: production callers never pass this, so Jini's default grace always
   * applies for real; a test that needs to prove the grace period itself elapses (rather than
   * exercising the fast, message-arrives-immediately path) can shrink it instead of taking a real
   * multi-second wait per run. */
  options: { rejectionGraceMs?: number } = {},
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [RENDER_UI_TOOL_ID]: (ctx, { emitSurface } = {}) => renderUiTool({ ctx, surfaces, emitSurface }, options),
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "render-ui",
    catalogModule: "assistant/render-ui-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: renderUiDerivedRisk,
  });
}
