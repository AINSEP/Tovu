import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Guards the S-I18N sweep's one lesson: swapping a feature's exported `t` onto
 * `createDictionaryTranslator` does nothing for a hook, rules file, or component that still builds
 * its own `DICT[locale]?.[key] ?? key` closure inline. That shape skips `COMMON_I18N`, so shared
 * words (Save, Cancel, Delete, …) render English in every locale whose feature block does not carry
 * them. The sweep found and rewired these sites by hand (75844acca, bf8d677b7, 46fcca2ba,
 * 94c2c97f4, ff93d7635, ae735f901, 5abddceb1, 71355af86, 888bcfd57, 0abe40ff7, 6c46608c2);
 * nothing stopped the next one.
 *
 * The rule, checked over every non-test source file under `src/`: a locale dictionary constant
 * (`const X_DICT: Record<string, Record<string, string>>`, or `_I18N`/`_DICTIONARY`) may be indexed
 * only by `lib/dictionary-translator.ts`, and may not be imported by any other non-test file. Every
 * consumer goes through the translator the dictionary's own file exports.
 */

const SRC = path.resolve(__dirname, "../..");

/** Indexed lookups that are allowed, each with its reason. Keep this list short. */
const ALLOWED: Record<string, string> = {
  // The one shared implementation of the fallback chain.
  "lib/dictionary-translator.ts:COMMON_I18N": "the translator itself",
  // `createChatI18nAdapter` feeds `@jini-ai/chat/react`'s own I18nAdapter contract (`t(key, vars)`
  // with `{token}` interpolation), keyed by that package's strings, not by admin copy.
  "components/AssistantDock/assistant-dock-i18n.ts:CHAT_PANE_I18N_DICT": "Jini chat adapter",
};

const DECLARATION = /\bconst\s+([A-Z][A-Z0-9_]*_(?:DICT|I18N|DICTIONARY))\s*:\s*Record<\s*string\s*,\s*Record<\s*string\s*,\s*string\s*>\s*>/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every place in `files` that indexes a declared dictionary constant (`NAME[`) or imports one,
 * minus {@link ALLOWED}. Pure over its input so the detector itself is testable on a fixture.
 */
function findInlineDictionaryLookups(files: ReadonlyArray<{ path: string; source: string }>): string[] {
  const stripped = files.map((f) => ({ path: f.path, code: stripComments(f.source) }));
  const names = new Set<string>();
  for (const f of stripped) for (const m of f.code.matchAll(DECLARATION)) names.add(m[1]);
  const hits: string[] = [];
  for (const f of stripped) {
    for (const name of names) {
      if (ALLOWED[`${f.path}:${name}`]) continue;
      if (new RegExp(`\\b${name}\\s*\\[`).test(f.code)) hits.push(`${f.path}: indexes ${name}`);
      if (new RegExp(`import\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(f.code)) {
        hits.push(`${f.path}: imports ${name}`);
      }
    }
  }
  return hits.sort();
}

describe("findInlineDictionaryLookups: the detector", () => {
  // The exact pre-sweep shapes from 75844acca^ (widgets): the dict file's own no-fallback `t`, and
  // a hook importing the raw dictionary to build its own closure.
  const DICT_FILE = {
    path: "features/widgets/widgets-i18n.ts",
    source: [
      "export const WIDGETS_DICT: Record<string, Record<string, string>> = { es: {} };",
      "export function t(locale: string, key: string): string {",
      "  return WIDGETS_DICT[locale]?.[key] ?? key;",
      "}",
    ].join("\n"),
  };
  const HOOK_FILE = {
    path: "features/widgets/hooks/use-widgets-library.hooks.ts",
    source: [
      'import { WIDGETS_DICT, t as translate } from "../widgets-i18n";',
      "const t = (key: string): string => WIDGETS_DICT[locale]?.[key] ?? key;",
    ].join("\n"),
  };

  it("flags a dictionary file's own inline lookup and a hook that imports and indexes the raw dict", () => {
    expect(findInlineDictionaryLookups([DICT_FILE, HOOK_FILE])).toEqual([
      "features/widgets/hooks/use-widgets-library.hooks.ts: imports WIDGETS_DICT",
      "features/widgets/hooks/use-widgets-library.hooks.ts: indexes WIDGETS_DICT",
      "features/widgets/widgets-i18n.ts: indexes WIDGETS_DICT",
    ]);
  });

  it("passes the post-sweep shape: the dict only feeds createDictionaryTranslator", () => {
    const fixed = {
      path: DICT_FILE.path,
      source: [
        "export const WIDGETS_DICT: Record<string, Record<string, string>> = { es: {} };",
        "export const t = createDictionaryTranslator(WIDGETS_DICT);",
      ].join("\n"),
    };
    const hook = { path: HOOK_FILE.path, source: 'import { t as translate } from "../widgets-i18n";\nconst t = (key: string) => translate(locale, key);' };
    expect(findInlineDictionaryLookups([fixed, hook])).toEqual([]);
  });

  it("ignores the shape when it only appears in a comment", () => {
    const commented = {
      path: DICT_FILE.path,
      source: "export const WIDGETS_DICT: Record<string, Record<string, string>> = {};\n/** was `WIDGETS_DICT[locale]?.[key] ?? key` */\n// WIDGETS_DICT[locale]",
    };
    expect(findInlineDictionaryLookups([commented])).toEqual([]);
  });
});

describe("apps/admin/src: no inline dictionary lookup bypasses COMMON_I18N", () => {
  it("every locale dictionary is consumed only through its own translator", () => {
    const files = sourceFiles(SRC).map((full) => ({
      path: path.relative(SRC, full).split(path.sep).join("/"),
      source: readFileSync(full, "utf8"),
    }));
    // Sanity: the scan actually sees the dictionaries, so an empty result below means something.
    const declared = files.filter((f) => /_DICT\s*:\s*Record</.test(f.source)).length;
    expect(declared).toBeGreaterThan(30);
    expect(findInlineDictionaryLookups(files)).toEqual([]);
  });
});
