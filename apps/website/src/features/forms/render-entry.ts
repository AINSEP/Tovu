/** Public text caps for rendering; submission validation remains in field-length-caps. */
import type { FieldDescriptor } from "@jini-ai/cms/forms";

export const FORM_TEXT_MAX_CHARS = 100;
export const FORM_LONG_TEXT_MAX_CHARS = 2000;

const SHORT_TEXT_TYPES = new Set(["text", "email", "phone", "url"]);
const LONG_TEXT_TYPES = new Set(["textarea", "hidden"]);

/** The most characters a visitor may submit for `field`; undefined for non-text fields. */
export function fieldMaxChars({ field }: { field: Pick<FieldDescriptor, "type" | "maxLength"> }, _optional = {}): number | undefined {
  if (SHORT_TEXT_TYPES.has(field.type)) return field.maxLength ?? FORM_TEXT_MAX_CHARS;
  if (LONG_TEXT_TYPES.has(field.type)) return field.maxLength ?? FORM_LONG_TEXT_MAX_CHARS;
  return undefined;
}

