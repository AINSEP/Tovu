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
 * Splits `template` on each of `tokens`, in order, and returns the `tokens.length + 1` text
 * segments around them — for a placeholder whose value must render as a React node (an inline
 * `<code>` element naming the exact file/theme a destructive action targets) rather than plain
 * text, so {@link interpolate}'s string substitution can't produce it. A call site zips the
 * segments back together with the node values, e.g. for one token:
 * `{segments[0]}<code>{file}</code>{segments[1]}`.
 *
 * A token `indexOf` misses (a locale's copy dropped or mistyped a placeholder) is not thrown on:
 * the rest of the template collapses into that segment and every token after it gets an empty
 * segment, so the sentence still renders — just without that inline node's exact position —
 * instead of crashing the dialog it's in.
 *
 * @complexity O(template.length): each token search scans only the remainder left after the
 *   previous one, so the total work across all tokens is one pass over `template`.
 */
export function splitOnPlaceholders(template: string, tokens: readonly string[]): string[] {
  const segments: string[] = [];
  let rest = template;
  for (const token of tokens) {
    const index = rest.indexOf(token);
    if (index === -1) {
      segments.push(rest);
      rest = "";
    } else {
      segments.push(rest.slice(0, index));
      rest = rest.slice(index + token.length);
    }
  }
  segments.push(rest);
  return segments;
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
