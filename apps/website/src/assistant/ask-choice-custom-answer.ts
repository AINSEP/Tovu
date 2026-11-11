import { SURFACE_TYPED_ANSWER_PARAM } from "@jini-ai/daemon/surface-exchanges";
import type { SurfaceField } from "@jini-ai/ui/mcp-ui/surfaces";
import type { AskChoiceExchangeStore, AskChoiceQuestion } from "@jini-ai/mcp/tools/ask-choice";

/**
 * @file The "Something else" choice on `assistant_ask_choice`'s card: one extra option plus a text
 * box, so the administrator can give an answer the model did not list. Matches the chat
 * QuestionForm's own "Something else" / "Type your own answer" (on unless the model opts out).
 *
 * The typed words always reach the model as `freeText`, never as a fake option value: a picked
 * single-select "Something else" becomes Jini's typed answer (the same path as a reply typed in
 * the chat box), and a ticked multi-select one is stripped from `selections` and its words are
 * added next to the real picks.
 *
 * Bridges the installed `@jini-ai/ui` 0.7.0, which has no show/hide field condition: the text box is
 * revealed by a small CSS rule (`:has()`) added to the card's own stylesheet. Without the rule the box
 * simply stays visible, which still works.
 */

/** The extra option's submitted value. Never shown to the model; stripped before Jini classifies. */
export const CUSTOM_CHOICE_VALUE = "__somethingElse";
/** The text box's param name in the form's callback. */
export const CUSTOM_ANSWER_PARAM = "customAnswer";

const CUSTOM_CHOICE_LABEL = "Something else";
const CUSTOM_ANSWER_PLACEHOLDER = "Type your own answer";

/** Model note when the administrator ticked options and also wrote their own answer. */
export const CUSTOM_ANSWER_WITH_PICKS_NOTE =
  "The administrator ticked 'selections' and also wrote 'freeText' in their own words under 'Something else'. " +
  "Treat 'freeText' as what they said, not as one of your options. Say what you understood before acting on it, " +
  "and ask again if it is ambiguous.";

const FIELD_ID = `mcpui-field-${CUSTOM_ANSWER_PARAM}`;
// Hide the box until "Something else" is checked; tuck it under that option, its label kept for
// screen readers only. Selector values are fixed constants, never model text.
const REVEAL_CSS = `
#mcpui-form:not(:has(input[value="${CUSTOM_CHOICE_VALUE}"]:checked)) .mcpui-field:has(> #${FIELD_ID}) { display: none; }
.mcpui-field:has(> #${FIELD_ID}) { margin: -6px 0 0 21px; }
.mcpui-field:has(> #${FIELD_ID}) > .mcpui-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }`;

/** Adds "Something else" to each choice field and one text box after them.
 * Returns the fields unchanged when a model option already uses the reserved value.
 * @complexity O(n) in offered options; pure.
 */
export function addCustomAnswerFields({ fields }: { fields: readonly SurfaceField[] }, _options = {}): SurfaceField[] {
  const choiceFields = fields.filter(field => field.kind === "enum" || field.kind === "multi-enum");
  const taken = choiceFields.some(field => field.options.some(option => option.value === CUSTOM_CHOICE_VALUE));
  if (choiceFields.length === 0 || taken) return [...fields];
  const custom = { value: CUSTOM_CHOICE_VALUE, label: CUSTOM_CHOICE_LABEL };
  const withOption = fields.map(field =>
    field.kind === "enum" || field.kind === "multi-enum" ? { ...field, options: [...field.options, custom] } : field);
  // Required only for the radio: the installed renderer cannot read a checkbox group's state.
  const single = fields.some(field => field.kind === "enum" && field.name === "choice");
  const textBox: SurfaceField = {
    kind: "string",
    name: CUSTOM_ANSWER_PARAM,
    label: "Your own answer",
    placeholder: CUSTOM_ANSWER_PLACEHOLDER,
    required: false,
    ...(single ? { requiredWhen: { field: "choice", in: [CUSTOM_CHOICE_VALUE] } } : {}),
  };
  return [...withOption, textBox];
}

/** Adds the reveal rule to a rendered card's stylesheet; any other shape is returned unchanged.
 * @complexity O(h) in the HTML length; pure.
 */
export function withCustomAnswerReveal<T>({ ui }: { ui: T }, _options = {}): T {
  const resource = (ui as { resource?: { text?: unknown } }).resource;
  if (typeof resource?.text !== "string" || !resource.text.includes("</style>")) return ui;
  return { ...ui, resource: { ...resource, text: resource.text.replace("</style>", `${REVEAL_CSS}\n</style>`) } };
}

/** What one delivered answer said under "Something else", kept for {@link mergeCustomAnswer}. */
export interface CustomAnswerSplit {
  readonly freeText?: string;
  /** Real multi-select picks to restore when a single-select "Something else" took the typed path. */
  readonly selections?: readonly string[];
}

/** Rewrites one delivered form answer so Jini classifies it, and keeps the typed words aside.
 * Typed words count only when "Something else" was picked; otherwise they are dropped.
 * @complexity O(s + m) in selections and offered options; pure.
 */
export function splitCustomAnswer(
  { params, question }: { params: Record<string, unknown>; question: AskChoiceQuestion | undefined },
  _options = {},
): { params: Record<string, unknown>; split: CustomAnswerSplit } {
  if (!Object.hasOwn(params, CUSTOM_ANSWER_PARAM)) return { params, split: {} };
  const { [CUSTOM_ANSWER_PARAM]: raw, ...rest } = params;
  const text = typeof raw === "string" ? raw.trim() : "";
  const pickedSingle = rest.choice === CUSTOM_CHOICE_VALUE;
  const selections = Array.isArray(rest.selections) ? rest.selections : undefined;
  const pickedMulti = selections?.includes(CUSTOM_CHOICE_VALUE) === true;
  const realSelections = selections?.filter(value => value !== CUSTOM_CHOICE_VALUE);
  const cleaned = realSelections ? { ...rest, selections: realSelections } : rest;
  if (!text || !(pickedSingle || pickedMulti)) return { params: cleaned, split: {} };
  if (!pickedSingle) return { params: cleaned, split: { freeText: text } };
  return typedCustomAnswer({ params: cleaned, text, question });
}

/** A picked single-select "Something else" becomes Jini's typed answer.
 * Jini's typed path skips option checks, so only multi-select picks really offered are restored.
 * @complexity O(s + m) in selections and offered options; pure.
 */
function typedCustomAnswer(
  { params, text, question }: { params: Record<string, unknown>; text: string; question: AskChoiceQuestion | undefined },
  _options = {},
): { params: Record<string, unknown>; split: CustomAnswerSplit } {
  const { choice: _custom, selections, ...typed } = params;
  const offered = new Set(question?.multiSelect?.options.map(option => option.value));
  const keep = Array.isArray(selections) && selections.every(value => typeof value === "string" && offered.has(value))
    ? selections as string[] : undefined;
  return { params: { ...typed, [SURFACE_TYPED_ANSWER_PARAM]: text }, split: { freeText: text, ...(keep ? { selections: keep } : {}) } };
}

/** Folds the kept words into Jini's classified result; only a submitted answer is changed.
 * @complexity O(1); pure.
 */
export function mergeCustomAnswer({ result, split }: { result: unknown; split: CustomAnswerSplit }, _options = {}): unknown {
  const answer = result as Record<string, unknown>;
  if (split.freeText === undefined || answer?.submitted !== true) return result;
  if (answer.freeText !== undefined) return split.selections ? { ...answer, selections: split.selections } : result;
  return { ...answer, freeText: split.freeText, note: CUSTOM_ANSWER_WITH_PICKS_NOTE };
}

/** One tool call's "Something else" state: the shown question and what the answer said. */
export interface CustomAnswerCall {
  question?: AskChoiceQuestion;
  split: CustomAnswerSplit;
}

/** Wraps an exchange store so each delivered answer is split before Jini classifies it.
 * @complexity O(1) wiring; per answer see {@link splitCustomAnswer}.
 */
export function customAnswerExchanges(
  { exchanges, call }: { exchanges: AskChoiceExchangeStore; call: CustomAnswerCall },
  _options = {},
): AskChoiceExchangeStore {
  return {
    open: (args) => {
      const exchange = exchanges.open(args);
      return {
        id: exchange.id,
        send: (sendArgs) => exchange.send(sendArgs),
        close: (closeArgs) => exchange.close(closeArgs),
        receive: async (receiveArgs) => {
          const message = await exchange.receive(receiveArgs);
          if (message.status !== "received") return message;
          const { params, split } = splitCustomAnswer({ params: message.params, question: call.question });
          call.split = split;
          return { status: "received", params };
        },
      };
    },
  };
}
