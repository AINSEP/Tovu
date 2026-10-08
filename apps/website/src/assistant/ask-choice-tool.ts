import { toolMetadata } from '../contracts/core/tool-metadata/assistant.js';
import { randomUUID } from "node:crypto";

import { buildFormSurface, type SurfaceField, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import { ToolInputError, buildDomainRegistrations, decorateWithSchema, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { ASK_CHOICE_INPUT_SCHEMA, createAskChoiceTool, createAskChoiceAnswerTicketStore, type AskChoiceForm, type AskChoiceQuestion, type AskChoiceExchangeStore, type AskChoiceMessages, type AskChoicePresentation } from "@jini-ai/mcp/tools/ask-choice";

import { buildUIToolResult, type UIResource } from "./mcp-ui.js";
import { askOnce, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";

/**
 * @file A production tool that lets the assistant ask the administrator a real question — a single
 * choice, a multi-select, or both — through an interactive MCP-UI form, and block until they
 * answer.
 *
 * ## Why this exists
 *
 * A question embedded in prose is easy for an administrator to miss. The daemon's system overlay
 * names this tool as the way to request an observable decision, confirmation, or choice.
 *
 * ## Why this is a NEW tool rather than widening `assistant_demo_choices`
 *
 * `assistant_demo_choices` (`demo-choices-tool.ts`) always renders the same fixed "Basic/Pro/Team"
 * sample — its catalog entry deliberately marks `plan`/`extras` as "Set by the rendered form, never
 * by the model", because its whole point is a form whose content never varies, so a Playwright
 * check and its own round-trip tests can pin an exact shape. It cannot ask about anything real: the
 * model has no way to supply its own title or options. Widening its schema to accept model-supplied
 * content would break that fixed-shape contract for every existing consumer. This tool is new and
 * additive; `assistant_demo_choices` is untouched and keeps its role as the fixed-content proof that
 * the round trip itself works.
 *
 * Generic parsing, answer validation and ticket lifecycle are owned by
 * `@jini-ai/mcp/tools/ask-choice`; this adapter supplies Tovu policy and presentation.
 *
 * ## It writes nothing, deliberately
 *
 * Same posture as `demo-choices-tool.ts`: there are no domain writes a double submit could corrupt,
 * and no confirmation token, because there is nothing to confirm — this tool COLLECTS
 * a decision, it does not act on one. The action the administrator decided about is a separate,
 * ordinary tool call the model makes afterward, informed by what this tool returned.
 *
 * ## The fallback answer IS something to confirm, even though this tool writes nothing
 *
 * The paragraph above is true for the held-open path (`awaitAskChoiceSubmission`): the model is
 * blocked inside its own call for as long as the form is outstanding, so it never gets a turn to
 * call this tool again before the real answer arrives. The no-`emitSurface` fallback breaks that
 * premise — that call RETURNS immediately with "nothing has been answered yet," and the model is
 * free to call `assistant_ask_choice` again right away with whatever `choice`/`selections` it
 * likes. An answer-shaped second call alone is not evidence the administrator answered a form.
 *
 * So the fallback path mints its own single-use, principal-bound, TTL-limited ticket
 * (`ASK_CHOICE_ANSWER_TICKET_PARAM`) the moment it renders a form with no exchange to open — the
 * second-call guard the model cannot mint for itself. The ticket rides home in the form's
 * `baseParams`, which `@jini-ai/ui`'s `buildFormSurface`
 * renders into the surface's HTML and merges into whatever the form posts back — never into this
 * call's own `modelText`, so the model never reads it from its own result (the daemon's
 * `splitToolResultSurfaces` withholds the UI resource from model context regardless). A "second
 * call" is now only accepted when it carries a ticket that matches an outstanding, unconsumed one
 * minted for the same principal; anything else — no ticket, an unknown one, an expired one, a
 * replayed one — is refused with a `ToolInputError`, not reported as `submitted: true`.
 */

/** The tool id, shared by the catalog, the handler, and the surface's own callback target. */
export const ASK_CHOICE_TOOL_ID = "assistant_ask_choice";

/**
 * Carries the fallback path's answer ticket in the rendered form's callback params.
 *
 * Deliberately NOT {@link SURFACE_EXCHANGE_ID_PARAM}: that name is `mcp-ui-tool-calls-route.ts`'s
 * OWN shape discriminator — a callback carrying it is routed to a Shape-1 exchange delivery
 * (`surfaceExchanges.deliver`), which would look for a live `SurfaceExchange` that was never
 * opened (the fallback exists precisely because there was no `emitSurface` to open one with) and
 * reject with 409 before this handler's second call ever ran. This ticket needs the OTHER shape —
 * an ordinary second tool call (ADR-053 Decision 3) — so it rides under a name that route does not
 * recognize.
 */
export const ASK_CHOICE_ANSWER_TICKET_PARAM = "__askChoiceAnswerTicket";

/** How long a fallback-path ticket may sit unredeemed. Mirrors `@jini-ai/daemon/surface-exchanges`'s own
 *  `DEFAULT_SURFACE_IDLE_TTL_MS` — long enough for a human to read a dialog and decide, short
 *  enough that a ticket from an abandoned form cannot be redeemed later out of scrollback. */
const ASK_CHOICE_TICKET_TTL_MS = 5 * 60 * 1000;

/** Returned to the model in place of `submitted: true` when a "second call" cannot be matched to
 *  an outstanding ticket. Deliberately says WHAT to do, not just what went wrong — the failure
 *  mode this guards is the model fabricating an answer, so the correction is "ask again for real
 *  and wait," not a retryable shape fix. */
const ASK_CHOICE_FORGED_ANSWER_MESSAGE =
  "assistant_ask_choice: this answer does not match a form that is currently outstanding for this " +
  "administrator — there is no such ticket, it already expired, or it was already used. The " +
  "administrator's answer can only arrive by them submitting a real rendered form; never set " +
  "'choice' or 'selections' yourself. If a decision is still needed, call assistant_ask_choice " +
  "again with the question and wait for the real response.";

/** Mirrors each domain's own local catalog interface — see `demo-choices-tool.ts`'s identical field. */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** One option in either select field — the smallest unit the model supplies. */
const OPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["value", "label"],
  properties: {
    value: { type: "string", description: "The value returned when this option is chosen." },
    label: { type: "string", description: "The human-readable text shown for this option." },
  },
} as const;

export const askChoiceAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: ASK_CHOICE_TOOL_ID,
    description:
      "Asks the administrator a real question through an interactive form in the chat pane, and " +
      "blocks until they answer — a single choice (radio buttons), a multi-select (checkboxes), or " +
      "both. Call this for missing information or a choice needed to complete the request. " +
      "Do not use it to reconfirm ordinary writes, overwrites, publishing, commits or reversible trash. " +
      "Only permanent deletes, sends to real people, and changes to the assistant's own privacy, " +
      "instructions or permission level need confirmation; their tools provide the confirmation card. " +
      "Do not add a second confirmation question before those cards. " +
      "Do not describe the options in prose and wait for a reply instead: the " +
      "administrator has no reliable way to notice a question was asked that way. Supply the title " +
      "and every option yourself — nothing here is pre-filled.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      ...ASK_CHOICE_INPUT_SCHEMA,
      type: "object",
      additionalProperties: false,
      required: ["title"],
      anyOf: [{ required: ["singleSelect"] }, { required: ["multiSelect"] }],
      properties: {
        title: { type: "string", description: "The form's heading — the decision or question being asked." },
        description: { type: "string", description: "Optional context shown under the title." },
        submitLabel: { type: "string", description: "Optional label for the submit button. Defaults to \"Submit\"." },
        singleSelect: {
          type: "object",
          additionalProperties: false,
          required: ["label", "options"],
          properties: {
            label: { type: "string", description: "Label shown above the pick-one control." },
            options: { type: "array", minItems: 1, items: OPTION_SCHEMA },
          },
          description: "A radio-button pick-one field. Omit if this question has no single choice.",
        },
        multiSelect: {
          type: "object",
          additionalProperties: false,
          required: ["label", "options"],
          properties: {
            label: { type: "string", description: "Label shown above the checklist." },
            hint: { type: "string", description: "Optional help text under the label." },
            options: { type: "array", minItems: 1, items: OPTION_SCHEMA },
          },
          description: "A checkbox pick-any-number field. Omit if this question has no multi-select.",
        },
        choice: { type: "string", description: "Set by the rendered form on submission. Never set this directly." },
        selections: {
          type: "array",
          items: { type: "string" },
          description: "Set by the rendered form on submission. Never set this directly.",
        },
      },
    },
  },
];

/** This wiring layer's own risk classification — see the kit for why it is independent of the catalog. */
export const askChoiceDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> buildFormSurface / a string-and-array echo. No repo, no command gateway, no outbox, no bus.
  [ASK_CHOICE_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(askChoiceAgentToolCatalog.map((entry) => [entry.name, entry]));

/** Builds the field list `buildFormSurface` renders, from the model's parsed input. */
function buildAskChoiceFields(parsed: AskChoiceQuestion): SurfaceField[] {
  const fields: SurfaceField[] = [];
  if (parsed.singleSelect) {
    fields.push({
      kind: "enum",
      name: "choice",
      label: parsed.singleSelect.label,
      presentation: "radio",
      required: true,
      options: parsed.singleSelect.options,
    });
  }
  if (parsed.multiSelect) {
    fields.push({
      kind: "multi-enum",
      name: "selections",
      label: parsed.multiSelect.label,
      ...(parsed.multiSelect.hint === undefined ? {} : { hint: parsed.multiSelect.hint }),
      options: parsed.multiSelect.options,
    });
  }
  return fields;
}

/** Builds the form with Tovu's resource identity, labels, radio/checklist layout and app metadata.
 * Cancel posts back rather than just closing the dialog: a silent close would strand the agent's
 * blocked call until the TTL expires. The package supplies either exchange correlation or the
 * single-use answer ticket in baseParams; these are mutually exclusive.
 */
function buildAskChoiceFormSurface(
  { toolName, principalId, question: parsed, baseParams }: Omit<AskChoiceForm, "cancelParams">,
  { cancelParams }: Pick<AskChoiceForm, "cancelParams"> = {},
): ReturnType<typeof buildFormSurface> {
  const uri: UIResourceUri = `ui://tovu/ask-choice/${principalId}/${Date.now()}`;
  return buildFormSurface({
    uri,
    title: parsed.title,
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    submitLabel: parsed.submitLabel ?? "Submit",
    toolName,
    baseParams,
    fields: buildAskChoiceFields(parsed),
    cancel: cancelParams ? { label: "Cancel", toolName, params: cancelParams } : { label: "Cancel" },
    app: { appName: "tovu-ask-choice", appVersion: "1" },
    preferredFrameSize: ["100%", "420px"],
  });
}

/** Narrows the renderer's unknown package boundary without casting a required presentation port. */
function isAskChoiceUiResource(ui: unknown): ui is UIResource {
  if (typeof ui !== "object" || ui === null || !("type" in ui) || ui.type !== "resource" || !("resource" in ui)) return false;
  const resource = ui.resource;
  return typeof resource === "object" && resource !== null
    && "uri" in resource && typeof resource.uri === "string" && resource.uri.startsWith("ui://")
    && "mimeType" in resource && (resource.mimeType === "text/html" || resource.mimeType === "text/html;profile=mcp-app" || resource.mimeType === "text/html+skybridge")
    && "text" in resource && typeof resource.text === "string";
}

const askChoiceMessages: AskChoiceMessages = {
  forgedAnswer: ASK_CHOICE_FORGED_ANSWER_MESSAGE,
  pending: "A question has been shown to the administrator. NOTHING HAS BEEN ANSWERED YET. Their " +
    "answer arrives only if they submit that form, which sends it itself. You cannot fill " +
    "it in yourself: tell them the form is open and wait.",
  noAnswer: "The administrator did not provide an answer. Do not assume any answer.",
  submitted: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  typed: "The administrator answered in their own words instead of picking one of the options. Treat 'freeText' as " +
    "what they said, not as a selection: none of the options you offered was chosen. Say what you understood " +
    "before acting on it, and ask again if it is ambiguous.",
  expired: "The administrator did not respond before the form expired. Do not assume any answer.",
  abandoned: "The form was dismissed because the run ended. Do not assume any answer.",
  cancelled: "The administrator cancelled the form without answering. Do not assume any answer.",
};

/**
 * Builds this tool's registration, binding Tovu's policy/presentation to the package handler.
 * The generic parser, answer validation and ticket lifecycle live at `@jini-ai/mcp/tools/ask-choice`.
 *
 * The same exchange store must be mounted by `registerMcpUiToolCallsRoute`, or submitted forms
 * reach nothing. One fallback ticket store spans calls for this registration; daemon restart
 * discards pending tickets and requires a fresh form, the fail-closed direction.
 * Ticket consumption precedes binding checks so a probed or replayed ticket is indistinguishable
 * from one that never existed. Tickets bind answers to the displayed options and principal.
 * Typed prose returns as `freeText`, never as a fabricated selection; an explicit empty checklist
 * is a real answer. Cancel must post back so the held-open call is not stranded until expiry.
 *
 * @param _routeDeps - Unused; present because domain builders share one signature.
 * @param surfaces - The exchange store shared with the callback route.
 * @returns A single registration.
 * @complexity O(1) wiring; rendering/validation scales with offered options and schema size.
 */
export function buildAskChoiceRegistrations(
  _routeDeps: unknown,
  surfaces: AssistantSurfaceDeps,
): ToolRegistration[] {
  // Boot-owned and shared across calls, never across registration builds or daemon restarts.
  const pendingQuestions = createAskChoiceAnswerTicketStore({
    now: () => Date.now(),
    newTicketId: () => randomUUID(),
    ttlMs: ASK_CHOICE_TICKET_TTL_MS,
  });
  const surfaceExchanges: AskChoiceExchangeStore = {
    open: ({ toolId, principalId, emit }) => {
      const exchange = surfaces.surfaceExchanges.open({ binding: { toolId, principalId }, emit: (emission) => emit({
        emission: { channel: "mcp-ui", payload: { resource: emission.payload["resource"] } },
      }) });
      // Adapt the one-shot port through Jini's expiry-aware helper. Rendering may outlast the TTL;
      // askOnce returns the terminal answer in that race while transport failures still propagate.
      let answer: Awaited<ReturnType<typeof askOnce>>;
      return {
        id: exchange.id,
        send: async ({ emission }) => { answer = await askOnce({ exchange, emission }); },
        receive: async () => answer,
        close: () => exchange.close({}),
      };
    },
  };
  const presentation: AskChoicePresentation = {
    render: buildAskChoiceFormSurface,
    buildResult: ({ modelText, ui }) => {
      if (!isAskChoiceUiResource(ui)) throw new Error("ask-choice renderer returned an invalid UI resource");
      return { ...buildUIToolResult({ modelText, ui }) };
    },
  };
  const tool = createAskChoiceTool({
    toolId: ASK_CHOICE_TOOL_ID,
    description: askChoiceAgentToolCatalog[0]!.description,
    permission: "admin.assistant.use",
    pendingQuestions,
    surfaceExchanges,
    presentation,
    messages: askChoiceMessages,
    policy: {
      // Core ToolExecutor checks the registration's permission before invoking this handler.
      // Its context intentionally has no authorization escape hatch; retain that single gate.
      authorize: () => undefined,
      inputError: ({ message }) => new ToolInputError({ message }),
      shapeError: ({ message, toolId }) => decorateWithSchema({ message, toolId, catalog: CATALOG_BY_ID }),
    },
  });
  const handlers: Record<string, ToolHandler> = {
    [ASK_CHOICE_TOOL_ID]: (ctx, { emitSurface } = {}) => tool.handler({ ctx: {
      principalId: ctx.principal.id,
      input: ctx.input,
      signal: ctx.signal,
      ...(emitSurface ? { emitSurface: ({ emission }) => emitSurface(emission) } : {}),
    } }),
  };
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "ask-choice",
    catalogModule: "assistant/ask-choice-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: askChoiceDerivedRisk,
  });
}
