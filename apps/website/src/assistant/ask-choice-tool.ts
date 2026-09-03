import { buildFormSurface, type SurfaceField, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  buildDomainRegistrations,
  withSchemaOnRejection,
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
  type SurfaceExchange,
  type SurfaceMessage,
} from "../contracts/core/tool-surface-exchanges.js";

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
 * The held-open exchange mechanism (ADR-055 Decision 1: one call, not two) is identical — `askOnce`,
 * the emit-then-park order, the no-emit-seam fallback, and the abort-closes-the-exchange behavior.
 * None of that plumbing is domain-specific, so it is reused verbatim rather than reimplemented; only
 * the FIELD CONTENT is model-supplied here instead of hardcoded.
 *
 * ## It writes nothing, deliberately
 *
 * Same posture as `demo-choices-tool.ts`: every branch is pure, there is no state a double submit
 * could corrupt, and no confirmation token, because there is nothing to confirm — this tool COLLECTS
 * a decision, it does not act on one. The action the administrator decided about is a separate,
 * ordinary tool call the model makes afterward, informed by what this tool returned.
 */

/** The tool id, shared by the catalog, the handler, and the surface's own callback target. */
export const ASK_CHOICE_TOOL_ID = "assistant_ask_choice";

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
      "both. Call this whenever a decision, confirmation, or choice between options is needed from " +
      "the administrator, especially before any action that writes, overwrites, or changes what the " +
      "live site serves. Do not describe the options in prose and wait for a reply instead: the " +
      "administrator has no reliable way to notice a question was asked that way. Supply the title " +
      "and every option yourself — nothing here is pre-filled.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
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

/** Raised when the model's call is missing content a different call would fix — the shape
 *  rejection {@link withSchemaOnRejection} decorates with this tool's own published schema, the
 *  same convention `forms/tool-registrations.ts`'s `FormFieldValidationError` uses. */
class AskChoiceInputError extends Error {}

function isAskChoiceShapeRejection(error: unknown): boolean {
  return error instanceof AskChoiceInputError;
}

interface SelectSpec {
  readonly label: string;
  readonly hint?: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
}

/** Narrows one option-array entry to `{ value, label }`, or throws. Split out of
 *  {@link readSelectSpec} purely to keep it under the shop complexity ceiling — and to make this
 *  one option's narrowing directly invocable by a test, independent of the array it came from. */
function readSelectOption(entry: unknown, fieldName: "singleSelect" | "multiSelect"): { value: string; label: string } {
  const option = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
  const value = typeof option["value"] === "string" ? option["value"] : undefined;
  const optionLabel = typeof option["label"] === "string" ? option["label"] : undefined;
  if (!value || !optionLabel) {
    throw new AskChoiceInputError(`assistant_ask_choice: every '${fieldName}' option requires a string 'value' and 'label'.`);
  }
  return { value, label: optionLabel };
}

/** Narrows the raw `singleSelect`/`multiSelect` value to a plain object, or `undefined` when the
 *  model omitted the field entirely. Split out of {@link readSelectSpec} purely to keep it under
 *  the shop complexity ceiling; behavior (including the exact rejection message) is unchanged. */
function readSelectSpecShape(raw: unknown, fieldName: "singleSelect" | "multiSelect"): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) {
    throw new AskChoiceInputError(`assistant_ask_choice: '${fieldName}' must be an object.`);
  }
  return raw as Record<string, unknown>;
}

/** Narrows `label` + `options` out of an already-shape-checked select spec, requiring a non-empty
 *  label and at least one option. Split out of {@link readSelectSpec} purely to keep it under the
 *  shop complexity ceiling; behavior (including the exact rejection message) is unchanged. */
function readSelectLabelAndOptions(
  spec: Record<string, unknown>,
  fieldName: "singleSelect" | "multiSelect",
): { label: string; rawOptions: unknown[] } {
  const label = typeof spec["label"] === "string" ? spec["label"] : undefined;
  const rawOptions = Array.isArray(spec["options"]) ? (spec["options"] as unknown[]) : undefined;
  if (!label || !rawOptions || rawOptions.length === 0) {
    throw new AskChoiceInputError(`assistant_ask_choice: '${fieldName}' requires a non-empty 'label' and at least one option.`);
  }
  return { label, rawOptions };
}

/** Reads one of the two optional select groups out of the raw input, or returns undefined if the
 *  model omitted it entirely. Split out purely to keep `parseAskChoiceInput` under the shop
 *  complexity ceiling; behavior is unchanged. */
function readSelectSpec(raw: unknown, fieldName: "singleSelect" | "multiSelect"): SelectSpec | undefined {
  const spec = readSelectSpecShape(raw, fieldName);
  if (spec === undefined) return undefined;
  const { label, rawOptions } = readSelectLabelAndOptions(spec, fieldName);
  const options = rawOptions.map((entry) => readSelectOption(entry, fieldName));
  const hint = typeof spec["hint"] === "string" ? spec["hint"] : undefined;
  return { label, ...(hint === undefined ? {} : { hint }), options };
}

interface ParsedAskChoiceInput {
  readonly title: string;
  readonly description?: string;
  readonly submitLabel?: string;
  readonly singleSelect?: SelectSpec;
  readonly multiSelect?: SelectSpec;
}

/** Reads and requires the model's `title` — the one field with no fallback, since a malformed
 *  value means the call cannot proceed at all. Split out of {@link parseAskChoiceInput} purely to
 *  keep it under the shop complexity ceiling; behavior (including the exact rejection message) is
 *  unchanged. */
function readAskChoiceTitle(input: Record<string, unknown>): string {
  const title = typeof input["title"] === "string" ? input["title"] : undefined;
  if (!title) throw new AskChoiceInputError("assistant_ask_choice: 'title' is required.");
  return title;
}

/** Reads both select groups and requires at least one — the pair-level defaulting decision. Split
 *  out of {@link parseAskChoiceInput} purely to keep it under the shop complexity ceiling;
 *  behavior (including the exact rejection message) is unchanged. */
function readAskChoiceSelects(input: Record<string, unknown>): { singleSelect?: SelectSpec; multiSelect?: SelectSpec } {
  const singleSelect = readSelectSpec(input["singleSelect"], "singleSelect");
  const multiSelect = readSelectSpec(input["multiSelect"], "multiSelect");
  if (!singleSelect && !multiSelect) {
    throw new AskChoiceInputError("assistant_ask_choice: at least one of 'singleSelect' or 'multiSelect' is required.");
  }
  return { ...(singleSelect === undefined ? {} : { singleSelect }), ...(multiSelect === undefined ? {} : { multiSelect }) };
}

/** Reads the two plain optional string fields. Split out of {@link parseAskChoiceInput} purely to
 *  keep it under the shop complexity ceiling; behavior is unchanged. */
function readAskChoiceOptionalStrings(input: Record<string, unknown>): { description?: string; submitLabel?: string } {
  const description = typeof input["description"] === "string" ? input["description"] : undefined;
  const submitLabel = typeof input["submitLabel"] === "string" ? input["submitLabel"] : undefined;
  return { ...(description === undefined ? {} : { description }), ...(submitLabel === undefined ? {} : { submitLabel }) };
}

/** Validates the model's call shape before any surface is built — a domain boundary parser in the
 *  same style `content-types` uses, so a rejection here never reaches a `try` around a live call. */
function parseAskChoiceInput(input: Record<string, unknown>): ParsedAskChoiceInput {
  const title = readAskChoiceTitle(input);
  const optionalStrings = readAskChoiceOptionalStrings(input);
  const selects = readAskChoiceSelects(input);
  return { title, ...optionalStrings, ...selects };
}

/** Builds the field list `buildFormSurface` renders, from the model's parsed input. */
function buildAskChoiceFields(parsed: ParsedAskChoiceInput): SurfaceField[] {
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

/**
 * True when `input` is the administrator's form submission arriving as a fresh call (the no-emit-
 * seam fallback), rather than the model's original request.
 *
 * `title` is the discriminator, not `choice`/`selections` directly: a genuine first call always
 * names its own question, and neither field the form posts back is ever named `title`. Checking for
 * `choice`/`selections` on top rules out an unrelated empty call reaching this branch by accident.
 * Mirrors `demo-choices-tool.ts`'s own note on why `plan` (not `extras`) is its discriminator: an
 * empty checklist is a real answer, not a missing one, so presence — not truthiness — is what counts
 * for `selections`.
 */
function isFallbackAskChoiceAnswer(input: Record<string, unknown>): boolean {
  if (typeof input["title"] === "string") return false;
  return typeof input["choice"] === "string" || Array.isArray(input["selections"]);
}

/** Shapes the administrator's selections into the tool's return value. Shared by both the parked
 *  path and the legacy second-call fallback so the agent sees an identical result either way. */
function describeAskChoiceAnswer(params: Record<string, unknown>): Record<string, unknown> {
  const choice = typeof params["choice"] === "string" ? params["choice"] : undefined;
  const selections = Array.isArray(params["selections"]) ? (params["selections"] as string[]) : undefined;
  return {
    submitted: true,
    ...(choice === undefined ? {} : { choice }),
    ...(selections === undefined ? {} : { selections }),
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  };
}

/** The two {@link SurfaceMessage} statuses that mean "the administrator never answered" — mirrors
 *  `demo-choices-tool.ts#describeUnansweredForm`. */
function describeUnansweredAskChoice(status: Exclude<SurfaceMessage["status"], "received">): Record<string, unknown> {
  return {
    submitted: false,
    reason: status,
    note:
      status === "expired"
        ? "The administrator did not respond before the form expired. Do not assume any answer."
        : "The form was dismissed because the run ended. Do not assume any answer.",
  };
}

/** Builds the ask-choice MCP-UI form resource. Split out purely to keep the handler under the
 *  complexity ceiling; mirrors `demo-choices-tool.ts#buildDemoChoicesFormSurface`'s structure. */
function buildAskChoiceFormSurface(input: {
  principalId: string;
  exchange: SurfaceExchange | undefined;
  parsed: ParsedAskChoiceInput;
}): ReturnType<typeof buildFormSurface> {
  const { principalId, exchange, parsed } = input;
  return buildFormSurface({
    uri: `ui://tovu/ask-choice/${principalId}/${Date.now()}` as UIResourceUri,
    title: parsed.title,
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    submitLabel: parsed.submitLabel ?? "Submit",
    toolName: ASK_CHOICE_TOOL_ID,
    ...(exchange ? { baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id } } : {}),
    fields: buildAskChoiceFields(parsed),
    // Cancel posts back rather than just closing the dialog, exactly like `demo-choices-tool.ts` —
    // a silent close would strand the agent's blocked call until the TTL expires.
    cancel: exchange
      ? {
          label: "Cancel",
          toolName: ASK_CHOICE_TOOL_ID,
          params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true },
        }
      : { label: "Cancel" },
    app: { appName: "tovu-ask-choice", appVersion: "1" },
    preferredFrameSize: ["100%", "420px"],
  });
}

/**
 * Waits for the administrator's answer to a parked ask-choice form and maps it onto the tool's
 * result. Mirrors `demo-choices-tool.ts#awaitDemoChoicesSubmission`; behavior (the abort-triggered
 * close, and the exact "not received" -> "dismissed" -> submitted check order) is the same.
 */
async function awaitAskChoiceSubmission(input: {
  exchange: SurfaceExchange;
  ui: ReturnType<typeof buildFormSurface>;
  signal: AbortSignal;
}): Promise<Record<string, unknown>> {
  const { exchange, ui, signal } = input;
  const closeOnAbort = () => exchange.close();
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });
    if (answer.status !== "received") return describeUnansweredAskChoice(answer.status);
    if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
      return {
        submitted: false,
        reason: "cancelled",
        note: "The administrator cancelled the form without answering. Do not assume any answer.",
      };
    }
    return describeAskChoiceAnswer(answer.params);
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
  }
}

/**
 * Builds this tool's registration.
 *
 * @param _routeDeps - Unused; this tool touches no domain dependency. Present because every domain
 * builder shares one signature.
 * @param surfaces - Supplies the exchange store. Must be the same instance
 * `registerMcpUiToolCallsRoute` was mounted with, or a submitted form reaches nothing.
 * @returns A single registration.
 */
export function buildAskChoiceRegistrations(
  _routeDeps: unknown,
  surfaces: AssistantSurfaceDeps,
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [ASK_CHOICE_TOOL_ID]: async (ctx: Parameters<ToolHandler>[0]) => {
      const input = (ctx.input ?? {}) as Record<string, unknown>;

      // ---- Fallback second call: no `emitSurface` was available on the original call, so the form
      // went out the old way and the administrator's answer arrived as a fresh call. See
      // `isFallbackAskChoiceAnswer`'s own doc for why `title` is the discriminator. ----
      if (isFallbackAskChoiceAnswer(input)) {
        return describeAskChoiceAnswer(input);
      }

      return withSchemaOnRejection(
        { toolId: ASK_CHOICE_TOOL_ID, catalog: CATALOG_BY_ID, isShapeRejection: isAskChoiceShapeRejection },
        async () => {
          const parsed = parseAskChoiceInput(input);

          // The exchange is opened BEFORE the surface is built, because the surface has to carry
          // its id. `open` takes the emitter, so this is unreachable without one.
          const exchange = ctx.emitSurface
            ? surfaces.surfaceExchanges.open({ toolId: ASK_CHOICE_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface)
            : undefined;

          const ui = buildAskChoiceFormSurface({ principalId: ctx.principal.id, exchange, parsed });

          // ---- Fallback: no emit seam, so this call cannot wait for anybody. Return the surface
          // the old way; the administrator's submission arrives as a second call and lands in the
          // branch at the top of this handler. ----
          if (!exchange) {
            return buildUIToolResult({
              modelText:
                "A question has been shown to the administrator. NOTHING HAS BEEN ANSWERED YET. Their " +
                "answer arrives only if they submit that form, which sends it itself. You cannot fill " +
                "it in yourself: tell them the form is open and wait.",
              ui,
            });
          }

          // ---- The real path: send it, then wait for the answer. ----
          return awaitAskChoiceSubmission({ exchange, ui, signal: ctx.signal });
        },
      );
    },
  };

  return buildDomainRegistrations({
    domain: "ask-choice",
    catalogModule: "assistant/ask-choice-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: askChoiceDerivedRisk,
  });
}
