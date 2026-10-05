import { describe, expect, it } from "vitest";

import { ADMIN_LOCALES } from "../../../../website/src/contracts/core/admin-locales";
import { COMMON_I18N } from "../i18n-common";

/**
 * @file One untranslated-copy check for EVERY admin dictionary — not one parity test per file.
 *
 * Why the per-file parity tests were not enough: a dictionary lookup that misses falls back to the
 * English key itself (and `posts-i18n.ts` used to backfill every key missing from a locale with that
 * same English key), so a locale left in English looks exactly as "complete" as a translated one.
 * That is how ~60 post-editor strings ("Bold", "Heading 1", "URL slug", "Loading editor…") shipped
 * translated only in Spanish while `posts-i18n.unit.test.ts` stayed green.
 *
 * The rule here: for every non-English admin locale, every key any locale of a dictionary carries
 * must have a value in that locale (or be rescued by `COMMON_I18N`), and that value must differ from
 * the English source — unless it is on {@link SAME_AS_ENGLISH} below, or has nothing to translate.
 * It reads each dictionary's entries as the module exports them; nothing here fills a gap.
 *
 * Dictionaries are found by globbing every `*-i18n` module: an exported locale dictionary, or an
 * exported translator from `createDictionaryTranslator` (its `.dictionary`). A module exposing
 * neither must be named in {@link MODULES_WITHOUT_DICTIONARY}, so a new dictionary cannot slip past.
 */

type Dictionary = Readonly<Record<string, Readonly<Record<string, string>>>>;

const MODULES = import.meta.glob<Record<string, unknown>>(["../../**/*-i18n.ts", "../../**/*-i18n.tsx", "../i18n-common.ts", "!../../**/__tests__/**"], {
  eager: true,
});

/** `*-i18n` modules with no key→copy dictionary: helpers, not copy. */
const MODULES_WITHOUT_DICTIONARY = new Set([
  // Reads a descriptor's own `i18n` map; carries no copy of its own.
  "../descriptor-i18n.ts",
  // Interpolation/plural helpers.
  "../template-i18n.ts",
]);

const NON_ENGLISH_LOCALES = ADMIN_LOCALES.map((option) => option.code).filter((code) => code !== "en");

/**
 * Words kept in English in every admin locale: protocol, file-format and robots-directive names.
 * A value identical to English is accepted when every word in it is one of these.
 */
const UNTRANSLATED_TERMS = new Set<string>(["AI", "Dockerfile", "HTML", "ID", "Nofollow", "Noindex", "sha256", "sitemap.xml", "URL", "URLs"]);

const LATIN_SCRIPT_LOCALES = ["es", "id", "de", "pt-BR", "pl", "hu", "fr", "tr", "it"];

/**
 * Values checked by hand and correct although spelled exactly like the English: English key →
 * locales where that spelling IS the word the language uses. Add a locale here only after checking
 * the word is the real one in that language; a forgotten translation goes in the dictionary instead.
 */
const SAME_AS_ENGLISH: Readonly<Record<string, readonly string[]>> = {
  // Software nouns these languages borrow unchanged.
  Alt: ["es", "id", "de", "pt-BR", "pl", "hu", "fr", "it"],
  Assets: ["de"],
  Crawling: ["de"],
  Dashboard: ["de"],
  Database: ["it"],
  Desktop: ["id", "de", "pt-BR", "it"],
  Email: ["id", "it"],
  File: ["it"],
  Gateways: ["de", "pt-BR"],
  Hook: ["es", "id", "de", "pt-BR", "pl", "hu", "fr", "it"],
  Hooks: ["es", "de", "pt-BR", "fr"],
  Hosting: ["id", "de", "pl", "it"],
  Layout: ["de", "pt-BR", "it"],
  Link: ["de", "pt-BR"],
  "Link {n}": ["de", "pt-BR", "pl", "it"],
  Marketing: ["es", "de", "pt-BR", "pl", "hu", "fr", "it"],
  Marketplace: ["id", "pt-BR", "it"],
  Newsletter: ["de", "pt-BR", "pl", "fr", "it"],
  Onboarding: ["de", "it"],
  Partials: ["de"],
  Password: ["it"],
  Plugin: ["es", "id", "de", "pt-BR", "fr", "it"],
  Plugins: ["es", "de", "pt-BR"],
  Referrer: ["de", "it"],
  Repository: ["de", "it"],
  Scripts: ["es", "pt-BR", "fr"],
  Sitemap: ["de", "pt-BR", "it"],
  "Sitemap · {count} URLs": ["de"],
  Slug: LATIN_SCRIPT_LOCALES,
  Spam: LATIN_SCRIPT_LOCALES,
  spam: ["es", "id", "pt-BR", "pl", "fr", "it"],
  Studio: ["id", "de", "pl", "fr", "it"],
  Tablet: ["id", "de", "pt-BR", "pl", "tr", "it"],
  token: ["es", "id", "pt-BR", "pl", "hu", "it"],
  Webhooks: LATIN_SCRIPT_LOCALES,
  Widget: ["es", "id", "de", "pt-BR", "hu", "fr", "tr", "it"],
  "Widget…": ["es", "id", "de", "pt-BR", "hu", "fr", "it"],
  Widgets: ["es", "de", "pt-BR", "fr"],
  // Shared Latin roots spelled identically.
  "(optional)": ["de"],
  "{minutes} min": ["es", "pt-BR", "pl", "fr", "it"],
  Code: ["de", "fr"],
  Details: ["de"],
  Filter: ["id", "de"],
  Form: ["tr"],
  General: ["es"],
  "Import & Export": ["de"],
  Info: ["id", "de"],
  Item: ["id", "pt-BR"],
  Local: ["es", "pt-BR", "fr"],
  Media: ["id", "pl", "it"],
  Menu: ["id", "pt-BR", "pl", "fr", "it"],
  Menus: ["pt-BR", "fr"],
  Name: ["de"],
  Optional: ["de"],
  Platform: ["id", "hu", "tr"],
  "Region:": ["pl"],
  Roles: ["es"],
  Route: ["de", "fr"],
  site: ["pt-BR", "fr", "tr"],
  Sites: ["pt-BR", "fr"],
  Status: ["id", "de", "pt-BR", "pl"],
  System: ["de", "pl"],
  Text: ["de"],
  Theme: ["de"],
  Themes: ["de"],
  Tool: ["de"],
  Version: ["de", "fr"],
  Videos: ["es", "de"],
  // Indonesian UI uses these English words as-is ("Edit", "Label", "Default", "valid", "metadata").
  Default: ["id"],
  Edit: ["id"],
  "Edit menu": ["id"],
  "Edit metadata": ["id"],
  "Edit widget": ["id"],
  Label: ["id"],
  "SEO & Metadata": ["id"],
  valid: ["id"],
  // French words spelled like the English.
  "(direct)": ["fr"],
  Actions: ["fr"],
  Administration: ["fr"],
  assistant: ["fr"],
  Collection: ["fr"],
  Collections: ["fr"],
  Commerce: ["fr"],
  Description: ["fr"],
  exact: ["fr"],
  Images: ["fr"],
  Mobile: ["fr"],
  Note: ["fr"],
  Notifications: ["fr"],
  Page: ["fr"],
  Pages: ["fr"],
  Parent: ["fr"],
  Placements: ["fr"],
  Production: ["fr"],
  Routes: ["fr"],
  Secrets: ["fr"],
  Source: ["fr"],
  Standard: ["fr"],
  Style: ["fr"],
  Styles: ["fr"],
  Table: ["fr"],
  Taxonomies: ["fr"],
  Type: ["fr"],
};

/** A value with no letters left once `{placeholders}`, URLs and allowed terms are removed has nothing to translate. */
function hasTranslatableText(value: string): boolean {
  const words = value
    .replace(/\{[^}]*\}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[\p{L}][\p{L}\p{M}\p{N}'’.-]*/gu);
  return (words ?? []).some((word) => !UNTRANSLATED_TERMS.has(word.replace(/[.'’-]+$/u, "")));
}

function isDictionary(value: unknown): value is Dictionary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.some(([locale]) => NON_ENGLISH_LOCALES.includes(locale)) &&
    entries.every(
      ([locale, block]) =>
        (locale === "en" || NON_ENGLISH_LOCALES.includes(locale)) &&
        typeof block === "object" &&
        block !== null &&
        !Array.isArray(block) &&
        Object.values(block).every((copy) => typeof copy === "string"),
    )
  );
}

function dictionariesOf(moduleExports: Record<string, unknown>): Map<Dictionary, string> {
  const found = new Map<Dictionary, string>();
  for (const [name, value] of Object.entries(moduleExports)) {
    const candidate = typeof value === "function" ? (value as { dictionary?: unknown }).dictionary : value;
    if (isDictionary(candidate) && !found.has(candidate)) found.set(candidate, name);
  }
  return found;
}

/**
 * Every `locale :: key` in `dictionary` a non-English reader would see in English, plus the
 * {@link SAME_AS_ENGLISH} allowances (`locale :: key`) the dictionary actually relied on.
 */
function scanDictionary(dictionary: Dictionary): { gaps: string[]; allowancesUsed: string[] } {
  const keys = new Set(Object.values(dictionary).flatMap((block) => Object.keys(block)));
  const gaps: string[] = [];
  const allowancesUsed: string[] = [];
  for (const locale of NON_ENGLISH_LOCALES) {
    for (const key of keys) {
      const english = dictionary.en?.[key] ?? key;
      const value = dictionary[locale]?.[key] ?? COMMON_I18N[locale]?.[key];
      if (value !== undefined && value !== english) continue;
      if (!hasTranslatableText(english)) continue;
      if (value !== undefined && SAME_AS_ENGLISH[key]?.includes(locale)) allowancesUsed.push(`${locale} :: ${key}`);
      else gaps.push(`${locale} :: ${JSON.stringify(key)}${value === undefined ? " (missing)" : ""}`);
    }
  }
  return { gaps, allowancesUsed };
}

/** `../../features/x/x-i18n.ts` → `features/x/x-i18n.ts`; `../x.ts` → `lib/x.ts`. */
function displayPath(globKey: string): string {
  return globKey.startsWith("../../") ? globKey.slice("../../".length) : `lib/${globKey.slice("../".length)}`;
}

describe("admin dictionaries: no copy left in English", () => {
  const dictionaries = Object.entries(MODULES).flatMap(([path, moduleExports]) =>
    [...dictionariesOf(moduleExports)].map(([dictionary, name]) => ({
      id: `${displayPath(path)} ${name}`,
      path,
      dictionary,
      ...scanDictionary(dictionary),
    })),
  );

  it("finds a dictionary in every *-i18n module not documented as having none", () => {
    const covered = new Set(dictionaries.map(({ path }) => path));
    const invisible = Object.keys(MODULES).filter((path) => !covered.has(path) && !MODULES_WITHOUT_DICTIONARY.has(path));
    expect(invisible).toEqual([]);
  });

  it("checks COMMON_I18N too", () => {
    expect(dictionaries.some(({ dictionary }) => dictionary === COMMON_I18N)).toBe(true);
  });

  it.each(dictionaries.map(({ id, gaps }) => [id, gaps] as const))("%s has no untranslated copy", (_id, gaps) => {
    expect(gaps).toEqual([]);
  });

  // An allowance no dictionary needs any more is a hole a later regression could hide in.
  it("every SAME_AS_ENGLISH allowance is still needed by some dictionary", () => {
    const used = new Set(dictionaries.flatMap(({ allowancesUsed }) => allowancesUsed));
    const unused = Object.entries(SAME_AS_ENGLISH).flatMap(([key, locales]) =>
      locales.map((locale) => `${locale} :: ${key}`).filter((allowance) => !used.has(allowance)),
    );
    expect(unused).toEqual([]);
  });
});
