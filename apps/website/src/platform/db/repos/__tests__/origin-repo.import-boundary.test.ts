import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

/**
 * @file Boundary regression guard for `origin-repo.ts`'s import (the one query body; the file was
 * `sqlite/origin-repo.sqlite.ts` when this guard was written) of `createVerifiedOrigin`.
 *
 * `origin/index.ts` is the `origin` module's public door — every real VALUE consumer of
 * `createVerifiedOrigin` elsewhere in this codebase (`server/deps.ts`, `server/app.ts`) imports it
 * through that barrel (as `"../features/origin/index.js"` — this project's `nodenext` module
 * resolution requires the explicit `.js` extension on every relative specifier), not by reaching
 * into the internal `origin/types.ts` file it happens to be defined in. The SQLite adapter
 * previously did the latter — a "wrong door" import that bypasses the module's declared public
 * surface (the same class of violation `development/scripts/check-architecture.ts`'s "API
 * surface" metric tracks repo-wide).
 *
 * A runtime/behavioral test cannot express this defect: `createVerifiedOrigin` is the exact same
 * function reference whichever path it's imported through (the barrel only re-exports it), so
 * every observable output is byte-identical either way — nothing here to assert on at runtime.
 * The import declaration itself is the only place the violation is visible, so this is a static
 * source-text assertion instead, following the same real-call-site-verification pattern as
 * `mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts`.
 */

const ORIGIN_REPO_SOURCE = fs.readFileSync(
  path.join(import.meta.dirname, "..", "origin-repo.ts"),
  "utf8"
);

/** Every value import of the original exported binding, including aliases. */
function findImportSpecifiersFor(source: string, binding: string): string[] {
  const parsed = ts.createSourceFile("origin-repo.ts", source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    if (clause.namedBindings.elements.some((element) => !element.isTypeOnly && (element.propertyName ?? element.name).text === binding)) {
      found.push(statement.moduleSpecifier.text);
    }
  }
  return found;
}

function privateOriginValueImports(source: string): string[] {
  const parsed = ts.createSourceFile("origin-repo.ts", source, ts.ScriptTarget.Latest, true);
  return parsed.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const specifier = statement.moduleSpecifier.text;
    if (!/^(?:#src\/features\/origin|(?:\.\.\/)+features\/origin)\/(?!index(?:\.js)?$)/.test(specifier)) return [];
    const clause = statement.importClause;
    if (clause?.isTypeOnly) return [];
    const bindings = clause?.namedBindings;
    const hasValue = !clause || !!clause.name || !bindings || ts.isNamespaceImport(bindings) || bindings.elements.some(element => !element.isTypeOnly);
    return hasValue ? [specifier] : [];
  });
}

test("the import scanner sees aliased private values even after a public import", () => {
  const fixture = `import { createVerifiedOrigin } from '#src/features/origin';
    import { createVerifiedOrigin as internalOrigin } from '#src/features/origin/types';
    import type { createVerifiedOrigin as OriginType } from '#src/features/origin/types';
    import { type createVerifiedOrigin as OtherType } from '#src/features/origin/types';`;
  assert.deepEqual(findImportSpecifiersFor(fixture, "createVerifiedOrigin"), ["#src/features/origin", "#src/features/origin/types"]);
  assert.deepEqual(privateOriginValueImports(fixture), ["#src/features/origin/types"]);
  assert.deepEqual(privateOriginValueImports("import * as privateOrigin from '#src/features/origin/types';"), ["#src/features/origin/types"]);
});

// Phase 19 retires Tovu's ABI wrappers: the canonical package entry is now the public door.
// The private-value scanner above remains pinned so an internal-path import cannot hide behind it.
test("origin-repo.ts imports the createVerifiedOrigin VALUE through Jini's canonical verified-origin entry", () => {
  const specifiers = findImportSpecifiersFor(ORIGIN_REPO_SOURCE, "createVerifiedOrigin");
  assert.ok(specifiers.length > 0, "expected to find an import of createVerifiedOrigin in origin-repo.ts");
  assert.deepEqual(privateOriginValueImports(ORIGIN_REPO_SOURCE), [], "every origin value import must use the public door");
  for (const specifier of specifiers) {
    assert.notEqual(
      specifier,
      "../../../features/origin/types",
      "createVerifiedOrigin must not be imported directly from the internal origin/types.ts module -- import it through origin's public door instead"
    );
    assert.equal(
      specifier!,
      "@jini-ai/http-kit/verified-origin",
      `createVerifiedOrigin must be imported through Jini's canonical verified-origin entry, got "${specifier}"`
    );
  }
});
