/**
 * @file Behavioural tests for the plain rules `App.hooks.ts` keeps out of the components —
 * `siteSlug` and `computeCanCreate` — run against the real functions, not against their source text.
 *
 * **How this file runs.** `apps/desktop`'s own suite is `node --test "src/**\/*.test.cjs"`, which
 * has no runner for TypeScript at all; that is why every renderer test before this one was a
 * source-text assertion (see `rescan-wiring.test.ts`'s own header). This file is executed by the
 * second half of the package's `test` script, `node --import tsx --test "src/**\/*.test.ts"`.
 *
 * `tsx` is this package's OWN devDependency, declared at the same `^4.19.3` the repo root declares.
 * It briefly was not: the script worked only because Node resolves a bare specifier by walking up to
 * the root's `node_modules` — an undeclared dependency on the parent tree, in a package whose own
 * header calls itself self-contained. Declared here, `require.resolve` answers
 * `apps/desktop/node_modules/tsx` and the package stands on its own.
 *
 * Co-located `*.test.ts` beside the unit it covers, matching this package's existing `*.test.cjs`
 * convention rather than the repo-wide `__tests__/unit/` layout.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { computeCanCreate, siteSlug } from "./App.hooks.js";

/** The form's real gate: `useCreateWebsiteForm` computes `slug` from the typed name and hands it
 *  straight to `computeCanCreate`, so an empty slug is a permanently disabled "Create website". */
function canCreateSqliteSiteNamed(name: string): boolean {
  return computeCanCreate({ slug: siteSlug(name), database: "sqlite", supabaseReady: false, customReady: false });
}

test("siteSlug keeps its existing behaviour for plain ASCII names", () => {
  assert.equal(siteSlug("Hello World"), "hello-world");
  assert.equal(siteSlug("Corner Bakery!!"), "corner-bakery");
  assert.equal(siteSlug("  Trimmed  "), "trimmed");
});

test("siteSlug still yields nothing for a name with no letters or digits in it", () => {
  // The empty result is what `computeCanCreate` reads as "no name typed yet", so this must keep
  // meaning exactly that — the fix below must not turn punctuation into a usable name.
  assert.equal(siteSlug("   "), "");
  assert.equal(siteSlug("!!!"), "");
  assert.equal(siteSlug("— …"), "");
});

test("a non-Latin website name is not erased, so its site can actually be created", () => {
  // The defect: `[^a-z0-9]+` deletes every character of a name written in a non-Latin script, the
  // slug comes back empty, and `computeCanCreate` then refuses to enable "Create website" — there
  // is no name the operator can type in Japanese, Hindi or Greek that this form will accept.
  for (const name of ["日本語サイト", "हिन्दी", "Ελλάδα", "Кофейня", "مقهى"]) {
    assert.notEqual(siteSlug(name), "", `${name}: an ASCII-only slug erases this name entirely`);
    assert.equal(canCreateSqliteSiteNamed(name), true, `${name}: "Create website" must be reachable`);
  }
});

test("a Latin name carrying diacritics is not mangled into nonsense", () => {
  // Shown to the operator verbatim as "Workspace folder: caf-m-nster" before the fix — the accented
  // letters were replaced by separators rather than kept.
  assert.equal(siteSlug("Café Münster"), "café-münster");
  assert.equal(siteSlug("Łódź Studio"), "łódź-studio");
});

test("combining marks stay attached to the letter they belong to", () => {
  // Devanagari writes its vowels as combining marks (`\p{M}`), not letters. Keeping only `\p{L}`
  // would split हिन्दी into three separator-joined fragments instead of one word.
  assert.equal(siteSlug("हिन्दी"), "हिन्दी");
});
