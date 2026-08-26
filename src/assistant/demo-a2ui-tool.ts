import {
  createLabCatalog,
  parseAgentToRendererMessage,
  type ActionMessagePayload,
  type AgentToRendererMessage,
} from "@jini-ai/agentic/a2ui";

import {
  buildDomainRegistrations,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { AssistantSurfaceDeps } from "../core/tool-surface-exchanges.js";

/**
 * @file A development-only agent tool exercising the A2UI (a2ui-project/a2ui v1.0) inbound
 * transport end to end — `createSurface -> action -> updateComponents -> action -> close`, so the
 * whole multi-turn loop can be seen working in a real chat pane rather than only in unit tests
 * against the interpreter or the route in isolation.
 *
 * ## Why this exists, and why it is a second demo tool rather than extending `demo-choices-tool.ts`
 *
 * `assistant_demo_choices` proves the MCP-UI single-call return path (ADR-055 Decision 1's
 * one-shot case, `askOnce`). A2UI needs its own demonstration because its whole point is the
 * multi-turn shape `askOnce` deliberately does not cover — `surface-exchanges.ts`'s own module doc
 * calls out A2UI's `createSurface -> updateComponents -> action -> ...` loop by name as the reason
 * the store buffers inbound messages at all. Before this tool, nothing in Tovu ever drove that loop
 * against a real exchange; only `examples/reference-web`'s `runA2uiDemo` (a different codebase, a
 * hand-rolled polling relay, no `SurfaceExchangeStore`) had ever exercised it.
 *
 * ## Why the catalog matters here
 *
 * `@jini-ai/chat/react`'s `A2uiSurfaceCard` builds its own `createLabCatalog()` internally and
 * refuses any `createSurface.catalogId` that does not match it exactly
 * (`interpreter.ts`'s `handleCreateSurface`). This tool therefore builds the SAME catalog — not a
 * hand-copied id string — so a future change to `createLabCatalog()`'s id cannot silently desync
 * the two sides into "surface refused: unknown catalogId".
 *
 * ## Why there is no "no emit seam" fallback (unlike `demo-choices-tool.ts`)
 *
 * MCP-UI's fallback works because its callback is ITSELF framed as a second tool call — a synthetic
 * or headless executor with no `emitSurface` can still let the form's answer reach the same handler
 * a second time via the legacy two-call redemption shape (`mcp-ui-tool-calls-route.ts`'s Shape 2).
 * A2UI has no equivalent: `a2ui-actions-route.ts` only ever delivers into an open
 * {@link SurfaceExchangeStore} exchange (Shape 1's own reasoning, restated for a channel with no
 * Shape 2 to fall back to at all). Without `ctx.emitSurface` there is no exchange to open and
 * therefore no way for this tool to ever learn what a human did — so the honest behavior is to say
 * so and return, not to fabricate a degraded rendering path that doesn't exist for this channel.
 *
 * ## It writes nothing, deliberately
 *
 * Same posture as `demo-choices-tool.ts`: every branch is pure, there is no state a double-run or a
 * duplicate delivery could corrupt, and `sideEffects: "none"` is therefore an honest classification
 * rather than one someone has to re-audit later.
 */

/** The tool id, shared by the catalog, the handler, and the two action names it round-trips. */
export const DEMO_A2UI_TOOL_ID = "assistant_demo_a2ui";

/**
 * The catalog every surface this tool creates is validated against, built once at module scope —
 * `createLabCatalog()` returns fresh `Map`s per call but its `catalogId` and schemas are pure
 * constants, so there is nothing per-call to gain by rebuilding it on every invocation.
 */
const CATALOG = createLabCatalog();

/** Mirrors each domain's own local catalog interface — see `demo-choices-tool.ts:82`. */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const demoA2uiAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: DEMO_A2UI_TOOL_ID,
    description:
      "Development only. Renders a sample A2UI (agent-to-UI) surface with a button, and round-trips " +
      "the human's clicks back to this call across two turns using A2UI's own createSurface -> " +
      "action -> updateComponents -> action loop. Call it with no arguments. Writes nothing.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
];

export const demoA2uiDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> an A2UI surface / a string echo of what the human clicked. No repo, no command gateway, no
  // outbox, no bus.
  [DEMO_A2UI_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(demoA2uiAgentToolCatalog.map((entry) => [entry.name, entry]));

/** Action names this tool's two turns use, namespaced by tool id so a browser-side console log or a
 * future second A2UI demo tool's own action names cannot be confused with these. */
const CONTINUE_ACTION = `${DEMO_A2UI_TOOL_ID}.continue`;
const FINISH_ACTION = `${DEMO_A2UI_TOOL_ID}.finish`;

/** One turn's outcome, shaped for the tool's final return value. */
interface RoundTripStep {
  name: string;
  context: Record<string, unknown>;
}

/**
 * Reads the `ActionMessagePayload` out of a delivered exchange message, or `undefined` if this
 * particular message was not an `action` (a `functionResponse`/`error` reaching this tool would be
 * a client bug — this tool's own surface has no `functionCall` action and raises no `error` of its
 * own — so refusing to guess, rather than throwing, is the same "degrade sanely" posture the browser
 * side already takes for shapes it does not expect).
 *
 * @complexity O(1).
 * @overallScore 100
 */
function readActionPayload(params: Record<string, unknown>): ActionMessagePayload | undefined {
  const message = params["message"];
  if (typeof message !== "object" || message === null || !("action" in message)) return undefined;
  // `a2ui-actions-route.ts` only ever delivers a message that already passed
  // `parseRendererToAgentMessage` — this is a re-read of already-validated data, not a second
  // validation pass.
  return (message as { action: ActionMessagePayload }).action;
}

/**
 * Builds the result for a turn that never produced an action — expired, or the exchange was
 * abandoned (a cancelled run, or a human who navigated away). Mirrors
 * `demo-choices-tool.ts#describeSelections`'s sibling `answer.status !== "received"` branch:
 * ADR-055 Decision 6 treats "no answer" as a result the model can read, not an exception.
 */
function noAnswerResult(reason: "expired" | "abandoned"): Record<string, unknown> {
  return {
    completed: false,
    reason,
    note:
      reason === "expired"
        ? "The user did not respond to the A2UI surface before it expired. Do not assume any action was taken."
        : "The A2UI surface was abandoned because the run ended. Do not assume any action was taken.",
  };
}

/**
 * Builds this tool's registration. Unconditional since 2026-08-26 — see `demo-choices-tool.ts`'s
 * header for the decision that removed the `TOVU_ENABLE_DEMO_TOOLS` gate from all four in-chat UI
 * tools.
 *
 * @param _routeDeps - Unused; this tool touches no domain dependency. Present because every domain
 * builder shares one signature.
 * @param surfaces - Supplies the exchange store. Must be the same instance
 * `registerA2uiActionsRoute` was mounted with, or a clicked action reaches nothing.
 * @returns A single registration.
 * @complexity O(1) at build time; the handler itself is O(1) per turn plus the two round trips it
 * awaits.
 * @overallScore 100
 */
export function buildDemoA2uiRegistrations(
  _routeDeps: unknown,
  surfaces: AssistantSurfaceDeps,
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [DEMO_A2UI_TOOL_ID]: async (ctx: Parameters<ToolHandler>[0]) => {
      // Unlike `demo-choices-tool.ts`, there is no degraded second path for a missing emit seam —
      // see this module's doc for why A2UI has no equivalent of MCP-UI's legacy two-call shape.
      if (!ctx.emitSurface) {
        return {
          completed: false,
          reason: "no-surface-channel",
          note: "This execution has no live surface channel, so the A2UI demo cannot render or wait for an answer.",
        };
      }
      const emitSurface = ctx.emitSurface;

      // The exchange is opened BEFORE any message is sent, exactly like `demo-choices-tool.ts` —
      // opening requires the emitter, so waiting on an unsent message is unrepresentable.
      const exchange = surfaces.surfaceExchanges.open(
        { toolId: DEMO_A2UI_TOOL_ID, principalId: ctx.principal.id },
        emitSurface,
      );
      // A2UI correlates by its own `surfaceId`, not by a route-specific callback param the way
      // MCP-UI's `__exchangeId` does — so the exchange id IS the surface id, directly, with nothing
      // to smuggle it through. `a2ui-actions-route.ts` cross-checks exactly this equality.
      const surfaceId = exchange.id;

      /** Validates every outgoing message against its own schema before it goes out over the wire —
       * same dogfooding `examples/reference-web/src/daemon.ts`'s `runA2uiDemo` does, so a typo in one
       * of the literal messages below fails loudly here instead of reaching the renderer as a
       * message it then has to reject. */
      const emitA2ui = async (message: AgentToRendererMessage): Promise<void> => {
        const validated = parseAgentToRendererMessage(message);
        if (!validated.ok) {
          throw new Error(`${DEMO_A2UI_TOOL_ID}: refusing to emit a message that fails its own schema: ${validated.message}`);
        }
        await emitSurface({ channel: "a2ui", payload: { message: validated.message } });
      };

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        await emitA2ui({
          version: "v1.0",
          createSurface: {
            surfaceId,
            catalogId: CATALOG.catalogId,
            dataModel: { status: "Click Continue to send an action to the agent." },
          },
        });
        await emitA2ui({
          version: "v1.0",
          updateComponents: {
            surfaceId,
            components: [
              { id: "root", component: "Column", children: ["title", "status", "actionButton"] },
              { id: "title", component: "Text", text: "A2UI demo", variant: "body" },
              { id: "status", component: "Text", text: { path: "/status" } },
              {
                id: "actionButton",
                component: "Button",
                child: "actionLabel",
                variant: "primary",
                action: { event: { name: CONTINUE_ACTION, context: { step: "first" } } },
              },
              { id: "actionLabel", component: "Text", text: "Continue" },
            ],
          },
        });

        const first = await exchange.receive();
        if (first.status !== "received") return noAnswerResult(first.status);
        const firstAction = readActionPayload(first.params);
        const firstStep: RoundTripStep = firstAction
          ? { name: firstAction.name, context: firstAction.context }
          : { name: "unknown", context: {} };

        // The second turn REFLECTS the first action, per this tool's whole reason for existing:
        // `status`'s text and the button's own action name both change in response to what the human
        // just did, proving the round trip carries real information rather than a scripted replay.
        await emitA2ui({
          version: "v1.0",
          updateComponents: {
            surfaceId,
            components: [
              {
                id: "status",
                component: "Text",
                text:
                  `You triggered "${firstStep.name}" at ${firstAction?.timestamp ?? "an unknown time"}. ` +
                  "Click Finish to send your answer to the agent.",
                variant: "body",
              },
              {
                id: "actionButton",
                component: "Button",
                child: "actionLabel",
                variant: "primary",
                action: { event: { name: FINISH_ACTION, context: { step: "second" } } },
              },
              { id: "actionLabel", component: "Text", text: "Finish" },
            ],
          },
        });

        const second = await exchange.receive();
        if (second.status !== "received") return noAnswerResult(second.status);
        const secondAction = readActionPayload(second.params);
        const secondStep: RoundTripStep = secondAction
          ? { name: secondAction.name, context: secondAction.context }
          : { name: "unknown", context: {} };

        return { completed: true, firstAction: firstStep, secondAction: secondStep };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
        // Idempotent — a normal completion has already driven the exchange to its natural end via
        // two received actions, so this is a no-op there and the real cleanup only on an early
        // return (no-answer) or an abort.
        exchange.close();
      }
    },
  };

  return buildDomainRegistrations({
    domain: "demo-a2ui",
    catalogModule: "assistant/demo-a2ui-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: demoA2uiDerivedRisk,
  });
}
