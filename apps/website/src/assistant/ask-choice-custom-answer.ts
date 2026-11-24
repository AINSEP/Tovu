import { CUSTOM_ANSWER_PARAM, CUSTOM_CHOICE_VALUE, type CustomAnswerCopy } from "@jini-ai/mcp/tools/ask-choice";

/**
 * @file Tovu's half of the "Something else" choice on `assistant_ask_choice`'s card: the admin
 * copy, and the reveal rule for the installed renderer. The option/text-box mechanics and answer
 * splitting live in `@jini-ai/mcp/tools/ask-choice` (`custom-answer.ts`). Matches the chat
 * QuestionForm's own "Something else" / "Type your own answer" (on unless the model opts out).
 *
 * Bridges the installed `@jini-ai/ui` 0.7.0, which has no show/hide field condition: the text box is
 * revealed by a small CSS rule (`:has()`) added to the card's own stylesheet. Without the rule the box
 * simply stays visible, which still works.
 */

/** Injected into `addCustomAnswerFields({ copy })` and `mergeCustomAnswer({ note })`. */
export const ASK_CHOICE_CUSTOM_ANSWER_COPY: CustomAnswerCopy = {
  choiceLabel: "Something else",
  answerLabel: "Your own answer",
  answerPlaceholder: "Type your own answer",
  withPicksNote:
    "The administrator ticked 'selections' and also wrote 'freeText' in their own words under 'Something else'. " +
    "Treat 'freeText' as what they said, not as one of your options. Say what you understood before acting on it, " +
    "and ask again if it is ambiguous.",
};

const FIELD_ID = `mcpui-field-${CUSTOM_ANSWER_PARAM}`;
// Hide the box until "Something else" is checked; tuck it under that option, its label kept for
// screen readers only. Selector values are fixed constants, never model text.
const REVEAL_CSS = `
#mcpui-form:not(:has(input[value="${CUSTOM_CHOICE_VALUE}"]:checked)) .mcpui-field:has(> #${FIELD_ID}) { display: none; }
.mcpui-field:has(> #${FIELD_ID}) { margin: -6px 0 0 21px; }
.mcpui-field:has(> #${FIELD_ID}) > .mcpui-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }`;

/** Adds the reveal rule to a rendered card's stylesheet; any other shape is returned unchanged.
 * @complexity O(h) in the HTML length; pure.
 */
export function withCustomAnswerReveal<T>({ ui }: { ui: T }, _options = {}): T {
  const resource = (ui as { resource?: { text?: unknown } }).resource;
  if (typeof resource?.text !== "string" || !resource.text.includes("</style>")) return ui;
  return { ...ui, resource: { ...resource, text: resource.text.replace("</style>", () => `${REVEAL_CSS}\n</style>`) } };
}
