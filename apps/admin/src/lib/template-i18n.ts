/**
 * @file Shared helpers for the OTHER kind of translatable string in this app: parameterized
 * messages that interpolate a runtime value (a username, a count, a plan id) mid-sentence, so they
 * can't be flat `*-i18n.ts` dictionary entries (see `dictionary-translator.ts` for those). Every one
 * of these used to hardcode `if (locale !== "es") return <english>; return <spanish>;` — a second,
 * separate blast-radius problem from the flat-dictionary shape bug: adding a language meant writing
 * a new code branch inside every such function, not just adding a data block. These helpers let
 * that become data too.
 */

/** Replaces `{token}` placeholders in a template string with the given values. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in vars ? String(vars[key]) : match;
  });
}

/**
 * English/Spanish/French/German/Portuguese/Italian-style two-form pluralization (singular vs.
 * everything else, keyed on `count === 1`). Does NOT implement full CLDR plural categories —
 * languages with more than two plural forms (Arabic's six, Russian/Polish's three-plus) will need a
 * different mechanism if/when they need real plural agreement; this only covers the two-form
 * languages this app's target list is mostly made of.
 */
export function pickPlural(count: number, forms: { one: string; other: string }): string {
  return count === 1 ? forms.one : forms.other;
}
