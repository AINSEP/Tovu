import type { JsonValue } from "@jini-ai/cms/core";
import { set as setSettingValue, ValueValidationFailedError, type SetValueRequired } from "@jini-ai/cms/settings";

import { normalizeSiteTitle, SITE_TITLE_KEY, SITE_TITLE_MAX_LENGTH, SITE_TITLE_NAMESPACE } from "./site-title.js";

/**
 * @file SPEC-050 REQ-08: this host's settings write chokepoint. The package's `set` checks a string
 * definition by `typeof` only and leaves length rules to the registering feature, so the `set` this
 * directory's barrel exports is the wrapper below. Every host write that names a setting by namespace
 * and key binds it: the admin settings route, and `RouteDeps.set` in both composition roots (which the
 * agent daemon builds its deps from).
 *
 * Deliberately not routed through here: the package's `settings_set_ui_preference` tool calls the
 * package's own `set`, and its allowlist has no `core.site.title`; the system pin in `site-title.ts`
 * writes the fixed legacy literal.
 */

/** REQ-08's rejection text. The settings route surfaces it as `VALUE_VALIDATION_FAILED`. */
const SITE_TITLE_REJECTION = `value for '${SITE_TITLE_NAMESPACE}.${SITE_TITLE_KEY}' must be 1..${SITE_TITLE_MAX_LENGTH} characters after trimming`;

/**
 * REQ-08 for one write: a string `core.site.title` value becomes its trimmed form, or is rejected
 * when that form is empty or longer than {@link SITE_TITLE_MAX_LENGTH}. Any other setting, and a
 * non-string title (the definition schema rejects that itself), passes through unchanged. Pure.
 *
 * @throws {ValueValidationFailedError} For a string title outside 1..200 characters after trimming.
 * @complexity O(n) in the value's length.
 */
export function enforceSiteTitleWriteBounds(input: SetValueRequired["input"]): SetValueRequired["input"] {
  if (input.namespace !== SITE_TITLE_NAMESPACE || input.key !== SITE_TITLE_KEY || typeof input.value !== "string") {
    return input;
  }
  const title = normalizeSiteTitle(input.value);
  if (title === undefined) throw new ValueValidationFailedError(SITE_TITLE_REJECTION);
  return { ...input, value: title };
}

/**
 * The package's `set` with {@link enforceSiteTitleWriteBounds} applied first, so a rejected title
 * never reaches the ledger. Same signature, so it binds wherever the package's `set` did.
 *
 * @complexity O(n) in the value's length, plus the package `set`'s own cost.
 */
export async function set(required: SetValueRequired): Promise<{ value: JsonValue; revisionSeq: number }> {
  return setSettingValue({ ...required, input: enforceSiteTitleWriteBounds(required.input) });
}
