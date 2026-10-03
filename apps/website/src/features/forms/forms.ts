// Validation and its rationale now live in Jini/packages/cms/forms/src/forms.ts.
// Retain the original renderer guard until its out-of-scope import is migrated by r15.
/**
 * Attribute-NAME allowlist (deny by default). An attribute value is inert once escaped
 * (`escapeHtml` handles `"`), but an attribute NAME is structurally dangerous — `onclick` is not
 * escapable — so this is the only gate for names, not a fast-reject in front of a real sanitizer.
 * `aria-*`/`data-*` are open namespaces; everything else is a fixed, closed list. In particular this
 * rejects anything matching `^on`, plus `style`/`formaction`/`href`/`src`/`srcdoc` (script/markup
 * injection surfaces) and `id`/`name`/`type` (the renderer already sets all three on the same
 * element — `id` for the `<label for>` association, `name` for the submitted field key
 * `validateSubmissionPayload` keys off of, `type` for the field's own declared vocabulary — so an
 * attribute-authored override of any of them would either break that wiring or silently duplicate
 * it, never usefully change it).
 */
export const ATTRIBUTE_NAME_PATTERN =
  /^(aria-[a-z0-9-]+|data-[a-z0-9-]+|placeholder|autocomplete|inputmode|pattern|title|min|max|step|minlength|spellcheck|readonly)$/;
