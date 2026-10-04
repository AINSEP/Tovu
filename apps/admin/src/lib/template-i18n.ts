// Template/fallback/plural rationale: Jini/packages/ui/src/features/i18n/template-i18n.ts.
import { interpolate as interpolatePackage, splitOnPlaceholders as splitPackage, pickPlural as pickPackagePlural } from "@jini-ai/ui/panel-kit";

/** Interpolate Tovu's caller-owned copy with the package template helper.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
 * @file Shared helpers for the OTHER kind of translatable string in this app: parameterized
 * messages that interpolate a runtime value (a username, a count, a plan id) mid-sentence, so they
 * can't be flat `*-i18n.ts` dictionary entries (see `dictionary-translator.ts` for those). Every one
 * of these used to hardcode `if (locale !== "es") return <english>; return <spanish>;` — a second,
 * separate blast-radius problem from the flat-dictionary shape bug: adding a language meant writing
 * a new code branch inside every such function, not just adding a data block. These helpers let
 * that become data too.
 *
 *  Replaces `{token}` placeholders in a template string with the given values.
 *
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
 *
 * English/Spanish/French/German/Portuguese/Italian-style two-form pluralization (singular vs.
 * everything else, keyed on `count === 1`). Does NOT implement full CLDR plural categories —
 * languages with more than two plural forms (Arabic's six, Russian/Polish's three-plus) will need a
 * different mechanism if/when they need real plural agreement; this only covers the two-form
 * languages this app's target list is mostly made of.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return interpolatePackage({ template, vars });
}

/** Preserve placeholder order for callers that insert JSX between translated segments. */
export function splitOnPlaceholders(template: string, tokens: readonly string[]): string[] {
  return splitPackage({ template, tokens });
}

/** Choose between caller-supplied singular and plural templates. */
export function pickPlural(count: number, forms: { one: string; other: string }): string {
  return pickPackagePlural({ count, forms });
}

/** The `locale` entry of a per-locale copy table, or `fallback` (default: the table's `en` entry).
 *
 * Own-property lookup on purpose: the plain `TABLE[locale] ?? TABLE.en` read every per-locale table
 * used resolves a locale of "constructor", "toString" or "__proto__" to an Object.prototype member,
 * which is truthy, so the English fallback never ran and `interpolate` threw on a non-string
 * template (first fixed in authentication-i18n.ts, d56cd5cb2).
 */
export function localeEntry<T>(
  { table, locale }: { table: Readonly<Record<string, T>>; locale: string },
  { fallback = table.en }: { fallback?: T } = {},
): T {
  return Object.hasOwn(table, locale) ? (table[locale] ?? fallback) : fallback;
}
