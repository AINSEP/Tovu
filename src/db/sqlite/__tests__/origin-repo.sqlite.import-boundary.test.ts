import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Boundary regression guard for `origin-repo.sqlite.ts`'s import of `createVerifiedOrigin`.
 *
 * `origin/index.ts` is the `origin` module's public door — every real VALUE consumer of
 * `createVerifiedOrigin` elsewhere in this codebase (`server/deps.ts`, `server/app.ts`) imports it
 * through that barrel, not by reaching into the internal `origin/types.ts` file it happens to be
 * defined in. `origin-repo.sqlite.ts` previously did the latter — a "wrong door" import that
 * bypasses the module's declared public surface (the same class of violation
 * `development/scripts/check-architecture.ts`'s "API surface" metric tracks repo-wide).
 *
 * A runtime/behavioral test cannot express this defect: `createVerifiedOrigin` is the exact same
 * function reference whichever path it's imported through (the barrel only re-exports it), so
 * every observable output is byte-identical either way — nothing here to assert on at runtime.
 * The import declaration itself is the only place the violation is visible, so this is a static
 * source-text assertion instead, following the same real-call-site-verification pattern as
 * `mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts`.
 */

const ORIGIN_REPO_SOURCE = fs.readFileSync(
  path.join(import.meta.dirname, "..", "origin-repo.sqlite.ts"),
  "utf8"
);

/** Finds the module specifier of the `import { ... } from "...";` block that names `binding`
 * among its imported symbols. `[^}]*` deliberately spans newlines (unlike `.`, a negated
 * character class is unaffected by the lack of a `dotAll` flag) so this matches the real
 * multi-line named-import block this file actually uses. */
function findImportSpecifierFor(source: string, binding: string): string | undefined {
  const importBlockPattern = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];/g;
  for (const match of source.matchAll(importBlockPattern)) {
    const [, namedBindings, specifier] = match;
    if (new RegExp(`\\b${binding}\\b`).test(namedBindings)) return specifier;
  }
  return undefined;
}

test("origin-repo.sqlite.ts imports the createVerifiedOrigin VALUE through origin's public door (index.ts), not the internal types.ts module directly", () => {
  const specifier = findImportSpecifierFor(ORIGIN_REPO_SOURCE, "createVerifiedOrigin");
  assert.ok(specifier, "expected to find an import of createVerifiedOrigin in origin-repo.sqlite.ts");
  assert.notEqual(
    specifier,
    "../../origin/types",
    "createVerifiedOrigin must not be imported directly from the internal origin/types.ts module -- import it through origin's public door instead"
  );
  assert.match(
    specifier!,
    /^\.\.\/\.\.\/origin(\/index)?$/,
    `createVerifiedOrigin must be imported through origin's public door (\"../../origin\" or \"../../origin/index\"), got \"${specifier}\"`
  );
});
