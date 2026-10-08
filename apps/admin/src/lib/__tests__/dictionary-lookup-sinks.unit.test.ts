import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
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
 * only by the Jini translator. COMMON_I18N may be imported as its commonDictionary binding;
 * feature dictionaries stay local. Every consumer goes through its dictionary's exported translator.
 */

const SRC = path.resolve(__dirname, "../..");

/** Indexed lookups that are allowed, each with its reason. Keep this list short. */
const ALLOWED: Record<string, string> = {
  // Owner-local assembly of the shared fallback dictionary, not a translation-time lookup.
  "lib/i18n-common.ts:DRAFT_RECOVERY_I18N": "common dictionary initialization",
  // `createChatI18nAdapter` feeds `@jini-ai/chat/react`'s own I18nAdapter contract (`t(key, vars)`
  // with `{token}` interpolation), keyed by that package's strings, not by admin copy.
  "components/AssistantDock/assistant-dock-i18n.ts:CHAT_PANE_I18N_DICT": "Jini chat adapter",
};

const DECLARATION = /\bconst\s+([A-Z][A-Z0-9_]*_(?:DICT|I18N|DICTIONARY))\s*:\s*Record<\s*string\s*,\s*Record<\s*string\s*,\s*string\s*>\s*>/g;

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
 * Every consumer reference to a declared dictionary constant, including namespace/alias access,
 * minus {@link ALLOWED}. Pure over its input so the detector itself is testable on a fixture.
 */
function findInlineDictionaryLookups(files: ReadonlyArray<{ path: string; source: string }>): string[] {
  const parsed = files.map((f) => ({ ...f, ast: ts.createSourceFile(f.path, f.source, ts.ScriptTarget.Latest, true, f.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) }));
  const names = new Set<string>();
  const owners = new Map<string, Set<string>>();
  for (const f of parsed) {
    const own = new Set<string>();
    function declarations(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.type) {
        // Initializers can contain entire dictionaries; only the binding and type declare one.
        for (const match of `const ${node.name.getText(f.ast)}: ${node.type.getText(f.ast)}`.matchAll(DECLARATION)) own.add(match[1]);
      }
      ts.forEachChild(node, declarations);
    }
    declarations(f.ast);
    // Exported aliases still expose the same raw dictionary to consumers.
    for (const statement of f.ast.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isIdentifier(declaration.initializer) && own.has(declaration.initializer.text)) own.add(declaration.name.text);
      }
    }
    owners.set(f.path.replace(/\.tsx?$/, ""), own);
    for (const name of own) names.add(name);
  }
  const hits = new Set<string>();
  for (const f of parsed) {
    const own = owners.get(f.path.replace(/\.tsx?$/, ""))!;
    const namespaces = new Map<string, Set<string>>();
    for (const statement of f.ast.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.path), statement.moduleSpecifier.text)).replace(/\.tsx?$/, "");
        namespaces.set(bindings.name.text, owners.get(target) ?? new Set());
      }
    }
    function report(name: string, kind: string): void {
      if (!ALLOWED[`${f.path}:${name}`]) hits.add(`${f.path}: ${kind} ${name}`);
    }
    function isConstruction(node: ts.Identifier): boolean {
      if (!own.has(node.text)) return false;
      let statement: ts.Node = node;
      while (statement.parent && statement.parent !== f.ast) statement = statement.parent;
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name) && own.has(parent.name.text)) return true;
      if (ts.isCallExpression(parent) && parent.expression.getText(f.ast) === "mergeDictionaryTranslations" && ts.isExpressionStatement(statement)) return true;
      // Owner-local augmentation is allowed only in module initialization, never in a translator body.
      if (ts.isVariableStatement(statement)) {
        const declaration = statement.declarationList.declarations.find((decl) => node.pos >= decl.pos && node.end <= decl.end);
        if (!declaration?.initializer || ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) return false;
        const access = ts.isPropertyAccessExpression(parent) ? parent.parent : parent;
        if (ts.isCallExpression(access) && /^Object\.(entries|values|keys)$/.test(access.expression.getText(f.ast))) return true;
      }
      if (ts.isForOfStatement(statement) || ts.isExpressionStatement(statement)) {
        if (ts.isCallExpression(parent) && /^Object\.(entries|values)$/.test(parent.expression.getText(f.ast))) return true;
        if (ts.isCallExpression(parent) && parent.expression.getText(f.ast) === "Object.assign" && parent.arguments[0] === node) return true;
        const access = ts.isElementAccessExpression(parent) ? parent.parent : parent;
        if (ts.isCallExpression(access) && access.expression.getText(f.ast) === "Object.assign" && access.arguments[0] === parent) return true;
        if (ts.isCallExpression(parent) && parent.expression.getText(f.ast) === "Reflect.get" && ts.isCallExpression(parent.parent)) {
          return parent.parent.expression.getText(f.ast) === "Object.assign" && parent.parent.arguments[0] === parent;
        }
        if (ts.isCallExpression(parent) && parent.expression.getText(f.ast) === "mergeDictionaryTranslations") return true;
      }
      return false;
    }
    function visit(node: ts.Node): void {
      if (ts.isImportSpecifier(node) && names.has((node.propertyName ?? node.name).text) &&
        (node.propertyName ?? node.name).text !== "COMMON_I18N") {
        report((node.propertyName ?? node.name).text, "imports");
      }
      if (ts.isIdentifier(node) && names.has(node.text)) {
        const parent = node.parent;
        const declaration = ts.isVariableDeclaration(parent) && parent.name === node;
        const syntaxName = ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) ||
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node);
        const call = ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent)
          ? parent.parent.parent : parent;
        const translator = ts.isCallExpression(call) && ts.isIdentifier(call.expression) &&
          call.expression.text === "createDictionaryTranslator" &&
          (call.arguments[0] === node || (ts.isPropertyAssignment(parent) &&
            parent.initializer === node &&
            ((parent.name.getText(f.ast) === "featureDictionary" && call.arguments[0] === parent.parent) ||
             (node.text === "COMMON_I18N" && parent.name.getText(f.ast) === "commonDictionary" && call.arguments[1] === parent.parent))));
        if (!declaration && !syntaxName && !translator && !isConstruction(node)) {
          report(node.text, ts.isElementAccessExpression(parent) && parent.expression === node ? "indexes" : "references");
        }
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && ts.isIdentifier(node.expression)) {
        const name = ts.isPropertyAccessExpression(node) ? node.name.text :
          node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
        if (name && namespaces.get(node.expression.text)?.has(name)) report(name, "references");
      }
      ts.forEachChild(node, visit);
    }
    visit(f.ast);
  }
  return [...hits].sort();
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
        "import { COMMON_I18N } from '../../lib/i18n-common';",
        "export const t = createDictionaryTranslator({ featureDictionary: WIDGETS_DICT }, { commonDictionary: COMMON_I18N });",
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

  it.each([
    "WIDGETS_DICT.es?.[key] ?? key",
    "Object.entries(WIDGETS_DICT)",
    "const d = WIDGETS_DICT; d[locale]?.[key] ?? key",
  ])("flags a consumer bypass: %s", (expression) => {
    const declaration = { path: DICT_FILE.path, source: "export const WIDGETS_DICT: Record<string, Record<string, string>> = {};" };
    expect(findInlineDictionaryLookups([declaration, { path: HOOK_FILE.path, source: expression }]))
      .toEqual([`${HOOK_FILE.path}: references WIDGETS_DICT`]);
  });

  it.each(["m.WIDGETS_DICT", 'm["WIDGETS_DICT"]'])("flags namespace dictionary access: %s", (access) => {
    const declaration = { path: DICT_FILE.path, source: "export const WIDGETS_DICT: Record<string, Record<string, string>> = {};" };
    expect(findInlineDictionaryLookups([declaration, { path: HOOK_FILE.path, source: `import * as m from "../widgets-i18n"; const d = ${access}; d[locale];` }]))
      .toEqual([`${HOOK_FILE.path}: references WIDGETS_DICT`]);
  });

  it("allows dictionary construction in its owner while rejecting consumer enumeration", () => {
    const declaration = { path: DICT_FILE.path, source: [
      "export const WIDGETS_DICT: Record<string, Record<string, string>> = {};",
      "const DETAIL_DICT: Record<string, Record<string, string>> = {};",
      "for (const [locale, detail] of Object.entries(DETAIL_DICT)) { Object.assign(Reflect.get(WIDGETS_DICT, locale), detail); }",
      "export const t = createDictionaryTranslator(WIDGETS_DICT);",
    ].join("\n") };
    expect(findInlineDictionaryLookups([declaration])).toEqual([]);
    expect(findInlineDictionaryLookups([declaration, { path: HOOK_FILE.path, source: "Object.entries(WIDGETS_DICT)" }]))
      .toEqual([`${HOOK_FILE.path}: references WIDGETS_DICT`]);
  });

  it("still flags an owner translator that aliases the raw dictionary", () => {
    const source = "export const WIDGETS_DICT: Record<string, Record<string, string>> = {}; export const t = (locale, key) => { const d = WIDGETS_DICT; return d[locale]?.[key] ?? key; };";
    expect(findInlineDictionaryLookups([{ path: DICT_FILE.path, source }]))
      .toEqual([`${DICT_FILE.path}: references WIDGETS_DICT`]);
  });

  it("permits the common dictionary only as the translator's optional binding", () => {
    const common = { path: "lib/i18n-common.ts", source: "export const COMMON_I18N: Record<string, Record<string, string>> = {};" };
    const consumer = { path: HOOK_FILE.path, source: "import { COMMON_I18N } from '../../../lib/i18n-common'; const t = (key) => COMMON_I18N[locale]?.[key] ?? key;" };
    expect(findInlineDictionaryLookups([common, consumer])).toEqual([
      `${HOOK_FILE.path}: indexes COMMON_I18N`,
    ]);
    const bound = { path: DICT_FILE.path, source: "import { COMMON_I18N } from '../../lib/i18n-common'; const DICT: Record<string, Record<string, string>> = {}; export const t = createDictionaryTranslator({ featureDictionary: DICT }, { commonDictionary: COMMON_I18N });" };
    expect(findInlineDictionaryLookups([common, bound])).toEqual([]);
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
  }, 30_000); // Whole-admin AST scan competes with the other suites in the coordinator's batch.
});
