import { buildFormSurface, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  buildDomainRegistrations,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import { buildUIToolResult } from "./mcp-ui.js";
import {
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  askOnce,
  type AssistantSurfaceDeps,
} from "../core/tool-surface-exchanges.js";

/**
 * @file A development-only agent tool that renders a grouped-choice MCP-UI form, so the radio and
 * checklist controls can be exercised through the real chat pane rather than only in unit tests.
 *
 * ## Why this exists as a tool rather than a test page
 *
 * `content_post_delete` is currently the ONLY tool in this codebase that emits an MCP-UI surface,
 * and it emits a *confirmation* — the one surface shape that carries a secret and must never be
 * re-rendered casually. So there was no way to see a form surface in the product at all, which made
 * "does a radio group actually work in the chat pane" unanswerable without either building this or
 * pointing the delete dialog at something it is not for.
 *
 * The path it exercises is the real one, end to end and unmodified: the daemon's
 * `splitToolResultSurfaces` withholds the resource from the model, emits it as an `mcp-ui` run
 * event, `assistant-transport.ts` unwraps it, `McpUiSurfaceCard` mounts it, and the human's submit
 * travels back through `/api/admin/v1/mcp-ui/tool-calls`. Nothing about that path is stubbed here.
 *
 * ## Why it is gated, and why the gate is an env var rather than a build flag
 *
 * It is registered only when `TOVU_ENABLE_DEMO_TOOLS` is set. A demo tool on the shipped surface is
 * a tool a model can call in production for no reason, and every wired tool costs context in every
 * prompt. An env var rather than a build-time flag because the check has to be legible to
 * `buildAssistantToolRegistrations`'s own catalog-vs-handler consistency guard, which runs at daemon
 * boot on the real registration list — a stripped build would make the guard pass vacuously.
 *
 * ## It writes nothing, deliberately
 *
 * Every branch is pure. There is no state to corrupt by clicking Submit twice, and no confirmation
 * token, because there is nothing to confirm — the interesting property here is that the controls
 * READ BACK correctly (a radio as one string, a checklist as an array), not that a gate holds.
 * Keeping it side-effect-free is also what makes `sideEffects: "none"` honest rather than a
 * classification someone has to re-audit later.
 *
 * ## One call, not two (ADR-055 Decision 1)
 *
 * This tool used to return the form and end its turn, leaving the human's submission to arrive as a
 * SECOND tool call whose result went to the dialog and stopped there. The agent never received the
 * selections. A form exists to collect input *for the agent*, so that was not a rough edge — the
 * feature did not work.
 *
 * It now makes one call that blocks: emit the surface through `ctx.emitSurface`, park on the answer,
 * and return the human's selections as the call's ordinary result. The emit-then-park order is
 * mandatory and not a style choice — the daemon reads surfaces out of a *completed* result, so a
 * handler that parked first would never show the form it is waiting on.
 *
 * The second-call branch is kept as a fallback for an executor that supplies no `emitSurface` (a
 * synthetic or headless execution). Parking there would hang for the full TTL with nothing on screen
 * to answer it, so the fallback returns the surface the old way instead.
 */

/** The tool id, shared by the catalog, the handler, and the surface's own callback target. */
export const DEMO_CHOICES_TOOL_ID = "assistant_demo_choices";

/** Set to any non-empty value to wire this tool. Absent in normal runs. */
const DEMO_TOOLS_ENV_VAR = "TOVU_ENABLE_DEMO_TOOLS";

/** Whether demo tools are wired in this process. Read at registration time, not per call. */
export function demoToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[DEMO_TOOLS_ENV_VAR];
  return typeof value === "string" && value.length > 0;
}

/** Mirrors each domain's own local catalog interface — see `features/post/agent-tools.ts:120`. */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const demoChoicesAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: DEMO_CHOICES_TOOL_ID,
    description:
      "Development only. Renders a sample MCP-UI form with a radio group and a multi-select checklist, so the grouped-choice controls can be exercised in a real chat pane. Call it with no arguments to show the form; the form itself calls back with the human's selections. Writes nothing.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        plan: { type: "string", description: "Set by the rendered form, never by the model." },
        extras: {
          type: "array",
          items: { type: "string" },
          description: "Set by the rendered form, never by the model. The checklist's selected values.",
        },
      },
    },
  },
];

/** This wiring layer's own risk classification — see the kit for why it is independent of the catalog. */
export const demoChoicesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> buildFormSurface / a string echo. No repo, no command gateway, no outbox, no bus.
  [DEMO_CHOICES_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(demoChoicesAgentToolCatalog.map((entry) => [entry.name, entry]));

/**
 * Shapes the human's selections into the tool's return value.
 *
 * Shared by both the parked path and the legacy second-call fallback so the agent sees an identical
 * result either way — the return path is what changed, not the answer.
 */
function describeSelections(params: Record<string, unknown>): Record<string, unknown> {
  const plan = typeof params["plan"] === "string" ? params["plan"] : undefined;
  const extras = Array.isArray(params["extras"]) ? (params["extras"] as string[]) : [];
  return {
    submitted: true,
    plan,
    extras,
    // Read back in the Playwright check: proves the array survived the DOM -> params ->
    // JSON-RPC -> HTTP round trip as an array, not as a comma-joined string.
    extrasCount: extras.length,
    // Matches the note on the two branches below: without an explicit instruction the model tends
    // to reply with a bare acknowledgement ("Done.") instead of confirming what was actually picked.
    note: "Tell the user what they picked (the plan and any extras) in plain language.",
  };
}

/**
 * Builds the demo registration, or none at all when the env gate is unset.
 *
 * @param _routeDeps - Unused; this tool touches no domain dependency. Present because every domain
 * builder shares one signature.
 * @param surfaces - Supplies the exchange store. Must be the same instance
 * `registerMcpUiToolCallsRoute` was mounted with, or a submitted form reaches nothing.
 * @returns A single registration, or an empty list — an empty slice is legal and is what keeps this
 * tool off the surface in a normal run.
 */
export function buildDemoChoicesRegistrations(
  _routeDeps: unknown,
  surfaces: AssistantSurfaceDeps,
): ToolRegistration[] {
  if (!demoToolsEnabled()) return [];

  const handlers: Record<string, ToolHandler> = {
    [DEMO_CHOICES_TOOL_ID]: async (ctx: Parameters<ToolHandler>[0]) => {
      const input = (ctx.input ?? {}) as Record<string, unknown>;

      // ---- Fallback second call: no `emitSurface` was available, so the form went out the old
      // way and the human's answers arrived as a fresh call. `plan` is the discriminator rather
      // than `extras`, because an empty checklist is a real answer ("none of them") and would be
      // indistinguishable from "not submitted yet" if it decided this branch.
      if (typeof input["plan"] === "string") {
        return describeSelections(input);
      }

      // The exchange is opened BEFORE the surface is built, because the surface has to carry its id.
      // `open` takes the emitter, so this is unreachable without one — the deadlock of waiting on a
      // message that was never sent is not expressible here.
      const exchange = ctx.emitSurface
        ? surfaces.surfaceExchanges.open({ toolId: DEMO_CHOICES_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface)
        : undefined;

      const ui = buildFormSurface({
        uri: `ui://tovu/demo-choices/${ctx.principal.id}` as UIResourceUri,
        title: "Which choice(s) do you want?",
        description: "A development sample exercising both grouped-choice controls.",
        submitLabel: "Submit choices",
        toolName: DEMO_CHOICES_TOOL_ID,
        // The correlation handle that makes the submission reach THIS call rather than start a new
        // one. Not a secret — see `surface-exchanges.ts` for why that distinction is the point
        // rather than an oversight.
        ...(exchange ? { baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id } } : {}),
        fields: [
          {
            kind: "enum",
            name: "plan",
            label: "Pick one",
            presentation: "radio",
            required: true,
            options: [
              { value: "basic", label: "Basic" },
              { value: "pro", label: "Pro" },
              { value: "team", label: "Team" },
            ],
          },
          {
            kind: "multi-enum",
            name: "extras",
            label: "Which choice(s) do you want?",
            hint: "Pick any number, including none.",
            options: [
              { value: "analytics", label: "Analytics" },
              { value: "backups", label: "Backups" },
              { value: "support", label: "Priority support" },
            ],
          },
        ],
        // Cancel posts back rather than just closing the dialog. With the call parked, a silent
        // close would strand the agent for the full TTL staring at a form the human has already
        // walked away from. `baseParams` is not merged into the cancel action's params by the
        // surface builder, so the park id is repeated here deliberately.
        cancel: exchange
          ? {
              label: "Cancel",
              toolName: DEMO_CHOICES_TOOL_ID,
              params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true },
            }
          : { label: "Cancel" },
        app: { appName: "tovu-demo-choices", appVersion: "1" },
        preferredFrameSize: ["100%", "420px"],
      });

      // ---- Fallback: no emit seam, so this call cannot wait for anybody. Return the surface the
      // old way; the human's submission arrives as a second call and lands in the branch at the
      // top of this handler. ----
      if (!exchange) {
        return buildUIToolResult({
          modelText:
            "A sample choice form has been shown to the user. NOTHING HAS BEEN SUBMITTED. The user's " +
            "selections arrive only if they submit that form, which sends them itself. You cannot " +
            "fill it in yourself: tell the user the form is open and wait.",
          ui,
        });
      }

      // ---- The real path: send it, then wait for the answer. ----
      // One send and one receive, so `askOnce` says exactly that. A tool needing a follow-up turn
      // (a validation error, an A2UI `updateComponents`) stops calling this and drives `send`/
      // `receive` in a loop — same exchange, same store, same route, no transport change.
      //
      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
      // handler open until the deadline.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

        // ADR-055 Decision 6: the no-answer path is a result, not an exception. The model is still
        // alive to read this and say something sensible, which is the entire point of blocking.
        if (answer.status !== "received") {
          return {
            submitted: false,
            reason: answer.status,
            note:
              answer.status === "expired"
                ? "The user did not respond to the form before it expired. Do not assume any selection."
                : "The form was dismissed because the run ended. Do not assume any selection.",
          };
        }
        if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
          return {
            submitted: false,
            reason: "cancelled",
            note: "The user cancelled the form without choosing. Do not assume any selection.",
          };
        }
        return describeSelections(answer.params);
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  return buildDomainRegistrations({
    domain: "demo-choices",
    catalogModule: "assistant/demo-choices-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: demoChoicesDerivedRisk,
  });
}
