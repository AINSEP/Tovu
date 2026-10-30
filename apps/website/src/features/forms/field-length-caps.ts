/**
 * @file Public form length caps (owner 2026-10-25: spam/abuse protection).
 *
 * Every visitor-typed text answer gets a ceiling even when its author set none: one line of text
 * (name, email, phone, url) stops at {@link FORM_TEXT_MAX_CHARS}; a message (textarea) and a hidden
 * value stop at {@link FORM_LONG_TEXT_MAX_CHARS}. A field's own `maxLength` overrides either default.
 * Choice fields need no cap: their answer must already equal one of the authored option values.
 *
 * Characters are Unicode code points, so an emoji counts once. Jini's validator measures UTF-16
 * units (`value.length`), so {@link capSubmissionFieldLengths} widens each cap by the answer's own
 * surrogate pairs: Jini's `too_long` then fires exactly when the code points exceed the cap, and the
 * refusal keeps the same shape and per-field message as every other validation failure.
 */
import type { FormDefinitionRecord } from "@jini-ai/cms/forms";

import { fieldMaxChars } from "./render-entry.js";
export { FORM_TEXT_MAX_CHARS, FORM_LONG_TEXT_MAX_CHARS, fieldMaxChars } from "./render-entry.js";

/** UTF-16 units beyond the code points: one per astral character (most emoji). @complexity O(n). */
function surrogatePairs(value: string): number {
  let pairs = 0;
  for (const char of value) if (char.length === 2) pairs += 1;
  return pairs;
}

/** Submission view: each text field's code-point cap, expressed in the UTF-16 units Jini counts.
 * @complexity O(total answer length). */
export function capSubmissionFieldLengths(
  { definition, body }: { definition: FormDefinitionRecord; body: Record<string, unknown> },
  _optional = {},
): FormDefinitionRecord {
  const fields = definition.fields.map((field) => {
    const max = fieldMaxChars({ field });
    if (max === undefined) return field;
    const value = Object.hasOwn(body, field.id) ? body[field.id] : undefined;
    return { ...field, maxLength: max + (typeof value === "string" ? surrogatePairs(value) : 0) };
  });
  return { ...definition, fields };
}
