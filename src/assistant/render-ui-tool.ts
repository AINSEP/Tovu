import { createLabCatalog, parseAgentToRendererMessage, type AgentToRendererMessage } from "@jini-ai/agentic/a2ui";

import {
  buildDomainRegistrations,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { AssistantSurfaceDeps, SurfaceExchange, SurfaceMessage } from "../core/tool-surface-exchanges";

/**
 * @file A general-purpose "draw whatever you want" tool. Unlike `demo-a2ui-tool.ts` (a scripted,
 * fixed two-button round trip proving the transport works), this tool takes an arbitrary A2UI
 * component tree straight from the model and renders it, one shot, no scripted follow-up. The
 * model is expected to call `search_components`/`describe_component` first to learn what
 * component ids exist and what props each one needs (basic types like `Column`/`Text`, or
 * registry-sourced ones like `shadcn.button`/`recharts.pie-chart`), then hand this tool a
 * `components` array in that same shape. Every component the catalog knows is usable — nothing
 * has to be pre-wired into this tool by hand.
 */

export const RENDER_UI_TOOL_ID = "assistant_render_ui";

interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const renderUiAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: RENDER_UI_TOOL_ID,
    description:
      "Renders an arbitrary A2UI surface inline in the chat, built from real components (basic layout/text " +
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

/**
 * How long to wait, after sending a surface's components, for the browser to report it rejected
 * them before this handler gives up waiting and assumes the render succeeded.
 *
 * There is no success acknowledgment on this channel — only `A2uiSurfaceCard.tsx` relaying a
 * catalog-validation refusal (via the same `onAgentAction` pipe a button click uses) ever sends
 * anything back here. So `exchange.receive()` alone would hang for the full idle TTL on every
 * successful render, since nothing would ever arrive to resolve it. Racing it against a short
 * timer turns "wait forever for a message that isn't coming" into "wait a bit, then assume the
 * silence means it worked" — long enough for a same-origin round trip (interpreter validation is
 * synchronous; the only latency is the POST to `a2ui-actions-route.ts`), short enough not to stall
 * the model on every ordinary, successful draw.
 */
const RENDER_REJECTION_GRACE_MS = 4000;

/** Resolves with the next inbound message, or `null` if none arrives within `graceMs`. The loser
 * of the race is not cancelled — `exchange.close()` (this handler's own `finally`) resolves any
 * still-pending `receive()` with `{status: "abandoned"}` moments later, which nothing here reads. */
function receiveRejectionWithGrace(exchange: SurfaceExchange, graceMs: number): Promise<SurfaceMessage | null> {
  return Promise.race([exchange.receive(), new Promise<null>((resolve) => setTimeout(() => resolve(null), graceMs))]);
}

/** `ack.params.message` is whatever `a2ui-actions-route.ts` delivered — the browser's relayed
 * `RendererToAgentMessage`. Only its `error` shape means "refused"; an `action`/`functionResponse`
 * can never arrive here (this tool renders once and never asks a question a click would answer). */
function rejectionMessageOf(ack: SurfaceMessage | null): string | undefined {
  if (ack?.status !== "received") return undefined;
  const inbound = ack.params["message"];
  if (typeof inbound !== "object" || inbound === null || !("error" in inbound)) return undefined;
  const error = (inbound as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : "The browser rejected this surface.";
}

/** Same env gate as the other dev-only demo surfaces — see `demo-choices-tool.ts`'s `demoToolsEnabled`. */
function renderUiToolsEnabled(): boolean {
  return process.env["TOVU_ENABLE_DEMO_TOOLS"] === "1";
}

export function buildRenderUiRegistrations(
  _routeDeps: unknown,
  surfaces: AssistantSurfaceDeps,
  /** Test-only seam: production callers never pass this, so `RENDER_REJECTION_GRACE_MS` always
   * applies for real; a test that needs to prove the grace period itself elapses (rather than
   * exercising the fast, message-arrives-immediately path) can shrink it instead of taking a real
   * multi-second wait per run. */
  options: { rejectionGraceMs?: number } = {},
): ToolRegistration[] {
  if (!renderUiToolsEnabled()) return [];
  const rejectionGraceMs = options.rejectionGraceMs ?? RENDER_REJECTION_GRACE_MS;

  const handlers: Record<string, ToolHandler> = {
    [RENDER_UI_TOOL_ID]: async (ctx: Parameters<ToolHandler>[0]) => {
      if (!ctx.emitSurface) {
        return { rendered: false, reason: "no-surface-channel", note: "No live surface channel on this execution." };
      }
      const emitSurface = ctx.emitSurface;
      const components = (ctx.input as { components?: unknown[] }).components ?? [];

      const catalog = createLabCatalog();
      const exchange = surfaces.surfaceExchanges.open({ toolId: RENDER_UI_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
      const surfaceId = exchange.id;

      const emitA2ui = async (message: AgentToRendererMessage): Promise<{ ok: true } | { ok: false; reason: string }> => {
        const validated = parseAgentToRendererMessage(message);
        if (!validated.ok) return { ok: false, reason: validated.message };
        await emitSurface({ channel: "a2ui", payload: { message: validated.message } });
        return { ok: true };
      };

      try {
        const created = await emitA2ui({ version: "v1.0", createSurface: { surfaceId, catalogId: catalog.catalogId, dataModel: {} } });
        if (!created.ok) return { rendered: false, reason: "schema-rejected", detail: created.reason };

        const updated = await emitA2ui({ version: "v1.0", updateComponents: { surfaceId, components: components as never } });
        if (!updated.ok) return { rendered: false, reason: "schema-rejected", detail: updated.reason };

        const rejection = rejectionMessageOf(await receiveRejectionWithGrace(exchange, rejectionGraceMs));
        if (rejection) {
          return {
            rendered: false,
            reason: "rejected-by-renderer",
            detail: rejection,
            note: "The browser refused to render this — it was NOT drawn and is not visible anywhere. Fix the reported prop and try again; do not tell the user it rendered.",
          };
        }

        return { rendered: true, note: "The surface is now visible in the chat. Briefly describe what it shows." };
      } finally {
        exchange.close();
      }
    },
  };

  return buildDomainRegistrations({
    domain: "render-ui",
    catalogModule: "assistant/render-ui-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: renderUiDerivedRisk,
  });
}
