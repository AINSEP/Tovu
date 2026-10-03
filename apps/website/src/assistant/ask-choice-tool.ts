import { randomUUID } from "node:crypto";

import { buildFormSurface, type SurfaceField, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import { ToolInputError, buildDomainRegistrations, decorateWithSchema, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { ASK_CHOICE_INPUT_SCHEMA, createAskChoiceTool, createAskChoiceAnswerTicketStore, type AskChoiceForm, type AskChoiceQuestion, type AskChoiceExchangeStore, type AskChoiceMessages, type AskChoicePresentation } from "@jini-ai/mcp/tools/ask-choice";

import { buildUIToolResult, type UIResource } from "./mcp-ui.js";
import { type AssistantSurfaceDeps } from "../contracts/core/tool-surface-exchanges.js";

/**
 * @file A production tool that lets the assistant ask the administrator a real question — a single
 * choice, a multi-select, or both — through an interactive MCP-UI form, and block until they
 * answer.
 *
 * ## Why this exists
 *
 * Before this tool, the assistant's only way to offer the administrator a decision was prose: "Say
 * the word and I'll do it." An operator watching the chat pane has no reliable way to notice that a
 * question was asked inside a paragraph, so the reply never came and the assistant looked broken.
 * `agent-daemon-server.ts`'s system overlay now instructs the assistant to call this tool BY NAME
 * whenever it needs a decision, a confirmation, or a choice from the administrator — see that
 * file's `baseOverlay` for the exact wording.
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
 * ## What it reuses from `demo-choices-tool.ts`
 *
 * The held-open exchange mechanism (ADR-055 Decision 1: one call, not two) is preserved — send,
 * then receive (the same order as `askOnce`),
 * the emit-then-park order, the no-emit-seam fallback, and the abort-closes-the-exchange behavior.
 * The generic handler and ticket implementation now live in `@jini-ai/mcp/tools/ask-choice`;
 * this adapter supplies Tovu policy and presentation, and retains the incident rationale below.
 * None of that plumbing is domain-specific, so it comes from the package through the host exchange
 * bridge; only
 * the FIELD CONTENT is model-supplied here instead of hardcoded.
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
 * likes. `isFallbackAskChoiceAnswer` used to treat every such call as the administrator's real
 * answer, with no check that a form had ever been shown, let alone answered — a live incident (a
 * paid `media_generate_asset` credential spend that nobody chose) is the best remaining explanation
 * once a pre-checked radio was empirically ruled out.
 *
 * So the fallback path mints its own single-use, principal-bound, TTL-limited ticket
 * (`ASK_CHOICE_ANSWER_TICKET_PARAM`) the moment it renders a form with no exchange to open — the
 * shape the former destructive-confirmation token store used for the identical problem ("a second tool call the
 * model could otherwise make itself"), narrowed to what this tool needs (no entity/version to bind
 * to). The ticket rides home in the form's `baseParams`, which `@jini-ai/ui`'s `buildFormSurface`
 * renders into the surface's HTML and merges into whatever the form posts back — never into this
 * call's own `modelText`, so the model never reads it from its own result (the daemon's
 * `splitToolResultSurfaces` withholds the UI resource from model context regardless). A "second
 * call" is now only accepted when it carries a ticket that matches an outstanding, unconsumed one
 * minted for the same principal; anything else — no ticket, an unknown one, an expired one, a
 * replayed one — is refused with a `ToolInputError`, not reported as `submitted: true`.
 * PendingConfirmationStore (apps/website/src/assistant/pending-confirmations.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
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

/** How long a fallback-path ticket may sit unredeemed. Mirrors `tool-surface-exchanges.ts`'s own
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
 * The retained extraction rationale below describes the pre-extraction units and their historical
 * names. Their replacements are the package's parseQuestion/readSelect/matchesOptions,
 * describeAnswer/waitForAnswer and pending factory. Surfaces must use the same store
 * mounted by registerMcpUiToolCallsRoute or a submitted form reaches nothing.
 *
 * A single-use, principal-bound ticket store guarding the fallback (no-`emitSurface`) path's
 * second call — see this file's own header ("The fallback answer IS something to confirm").
 *
 * In-process and created fresh per {@link buildAskChoiceRegistrations} call, exactly like
 * the former destructive-confirmation token store: `buildAskChoiceRegistrations` runs once per daemon boot, so
 * one instance spans every call the daemon serves, and a ticket that does not survive a daemon
 * restart is one the administrator will simply be shown a fresh form for — the fail-closed
 * direction. Not shared with the real `SurfaceExchangeStore`: that store's `open()` requires a
 * live `SurfaceEmitter` to send through, which is exactly what this branch does not have.
 *
 * @complexity O(1) amortized per operation; expired entries are swept lazily on mint.
 * Single-use — removed before any binding check, so a replayed or probed ticket cannot be
 * told apart from one that never existed (matching the former token store's redemption behavior).
 * Raised when the model's call is missing content a different call would fix — the shape
 *  rejection {@link withSchemaOnRejection} decorates with this tool's own published schema, the
 *  same convention `forms/tool-registrations.ts`'s `FormFieldValidationError` uses.
 * Narrows one option-array entry to `{ value, label }`, or throws. Split out of
 *  {@link readSelectSpec} purely to keep it under the shop complexity ceiling — and to make this
 *  one option's narrowing directly invocable by a test, independent of the array it came from.
 * Narrows the raw `singleSelect`/`multiSelect` value to a plain object, or `undefined` when the
 *  model omitted the field entirely. Split out of {@link readSelectSpec} purely to keep it under
 *  the shop complexity ceiling; behavior (including the exact rejection message) is unchanged.
 * Narrows `label` + `options` out of an already-shape-checked select spec, requiring a non-empty
 *  label and at least one option. Split out of {@link readSelectSpec} purely to keep it under the
 *  shop complexity ceiling; behavior (including the exact rejection message) is unchanged.
 * Reads one of the two optional select groups out of the raw input, or returns undefined if the
 *  model omitted it entirely. Split out purely to keep `parseAskChoiceInput` under the shop
 *  complexity ceiling; behavior is unchanged.
 * A fallback ticket binds the answer to the options in the form that minted it.
 * Reads and requires the model's `title` — the one field with no fallback, since a malformed
 *  value means the call cannot proceed at all. Split out of {@link parseAskChoiceInput} purely to
 *  keep it under the shop complexity ceiling; behavior (including the exact rejection message) is
 *  unchanged.
 * Reads both select groups and requires at least one — the pair-level defaulting decision. Split
 *  out of {@link parseAskChoiceInput} purely to keep it under the shop complexity ceiling;
 *  behavior (including the exact rejection message) is unchanged.
 * Reads the two plain optional string fields. Split out of {@link parseAskChoiceInput} purely to
 *  keep it under the shop complexity ceiling; behavior is unchanged.
 * Validates the model's call shape before any surface is built — a domain boundary parser in the
 *  same style `content-types` uses, so a rejection here never reaches a `try` around a live call.
 * True when `input` is the administrator's form submission arriving as a fresh call (the no-emit-
 * seam fallback), rather than the model's original request.
 *
 * `title` is the discriminator, not `choice`/`selections` directly: a genuine first call always
 * names its own question, and neither field the form posts back is ever named `title`. Checking for
 * `choice`/`selections` on top rules out an unrelated empty call reaching this branch by accident.
 * Mirrors `demo-choices-tool.ts`'s own note on why `plan` (not `extras`) is its discriminator: an
 * empty checklist is a real answer, not a missing one, so presence — not truthiness — is what counts
 * for `selections`.
 * Shapes the administrator's selections into the tool's return value. Shared by both the parked
 *  path and the legacy second-call fallback so the agent sees an identical result either way.
 * Shapes a TYPED answer — free text the administrator wrote into the chat composer instead of
 * clicking the rendered form — into the tool's return value, or `undefined` when the delivery
 * carried no usable one.
 *
 * ## Why this is not just another key in {@link describeAskChoiceAnswer}
 *
 * `choice` and `selections` report the option VALUES the model itself supplied. Prose is not one of
 * them. Reporting `{"choice": "take15-cut-v3 should be the video"}` would tell the model the
 * administrator picked an option that was never offered — a fabricated selection, arriving through
 * an entirely legitimate channel. So typed text comes back under its own field, with both option
 * fields absent, and the note says in as many words that nothing was selected.
 *
 * ## Fail-quiet, not fail-closed, on a malformed value
 *
 * A non-string or blank value returns `undefined` and the caller falls through to the ordinary
 * form-answer branch. If that carries neither a choice nor selections, it reports `submitted: false`
 * so the model is not told an answer arrived. An explicit empty selections array remains a real
 * answer. This avoids either alternative:
 * `String(value)` would hand the model `"[object Object]"` as the human's words, and throwing would
 * turn a malformed client into a failed agent call the administrator cannot recover from without
 * the whole run dying.
 *
 * @param params - The delivered exchange params, straight off `SurfaceExchangeStore.deliver`.
 * @returns The tool result for a typed answer, or `undefined` when there is no usable typed answer.
 * @complexity O(1).
 * The two {@link SurfaceMessage} statuses that mean "the administrator never answered" — mirrors
 *  `demo-choices-tool.ts#describeUnansweredForm`.
 * Builds the ask-choice MCP-UI form resource. Split out purely to keep the handler under the
 *  complexity ceiling; mirrors `demo-choices-tool.ts#buildDemoChoicesFormSurface`'s structure.
 *
 *  @param input.answerTicket - Present only when there is no `exchange` (the no-emit-seam
 *  fallback) — the single-use ticket minted for this render, embedded in `baseParams` the same way
 *  `exchange.id` is, so the form's own submission carries it back automatically. The two are
 *  mutually exclusive: a call either opens a real exchange or mints a ticket, never both.
 * Cancel posts back rather than just closing the dialog, exactly like `demo-choices-tool.ts` —
 * a silent close would strand the agent's blocked call until the TTL expires.
 * Waits for the administrator's answer to a parked ask-choice form and maps it onto the tool's
 * result. Mirrors `demo-choices-tool.ts#awaitDemoChoicesSubmission`; behavior (the abort-triggered
 * close, and the exact "not received" -> "dismissed" -> submitted check order) is the same.
 * Checked before the form-answer branch, not after: a typed answer carries no `choice`/
 * `selections` at all, so falling through would report no answer with the administrator's
 * actual words silently dropped.
 * Builds this tool's registration.
 *
 * @param _routeDeps - Unused; this tool touches no domain dependency. Present because every domain
 * builder shares one signature.
 * @param surfaces - Supplies the exchange store. Must be the same instance
 * `registerMcpUiToolCallsRoute` was mounted with, or a submitted form reaches nothing.
 * @returns A single registration.
 * One store per registration build, matching `buildAskChoiceRegistrations`'s own boot-once
 * lifetime (see `createAskChoiceAnswerTicketStore`'s doc). Guards ONLY the no-emit-seam
 * fallback below — the held-open path never reaches `isFallbackAskChoiceAnswer` at all.
 * ---- Fallback second call: no `emitSurface` was available on the original call, so the form
 * went out the old way and the administrator's answer arrived as a fresh call. See
 * `isFallbackAskChoiceAnswer`'s own doc for why `title` is the discriminator.
 *
 * Matching that shape is necessary but NOT sufficient: it is exactly the shape the model
 * itself could fabricate by calling this tool a second time with an invented `choice`. What
 * makes this branch safe is the ticket check below — fail closed on anything that does not
 * redeem a real, outstanding, unconsumed ticket for THIS principal. ----
 * The exchange is opened BEFORE the surface is built, because the surface has to carry
 * its id. `open` takes the emitter, so this is unreachable without one.
 * No exchange means the fallback below is about to hand this call's answer to whatever
 * arrives as a second call — mint the ticket that second call must carry.
 * ---- Fallback: no emit seam, so this call cannot wait for anybody. Return the surface
 * the old way; the administrator's submission arrives as a second call and lands in the
 * branch at the top of this handler. ----
 * ---- The real path: send it, then wait for the answer. ----
 * @complexity O(1) wiring; rendering/validation scales with the offered options and schema size.
 * PendingConfirmationStore (apps/website/src/assistant/pending-confirmations.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
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
      const exchange = surfaces.surfaceExchanges.open({ toolId, principalId }, (emission) => emit({
        emission: { channel: "mcp-ui", payload: { resource: emission.payload["resource"] } },
      }));
      return {
        id: exchange.id,
        send: ({ emission }) => exchange.send(emission),
        receive: () => exchange.receive(),
        close: () => exchange.close(),
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
  return buildDomainRegistrations({
    domain: "ask-choice",
    catalogModule: "assistant/ask-choice-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: askChoiceDerivedRisk,
  });
}
