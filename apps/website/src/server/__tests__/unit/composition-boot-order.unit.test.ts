import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Pins the boot-step order around the composition root now that `createSiteRouteDeps` is
 * async (R1a, 2026-09-28). Later slices add real `await`s inside it; an await in the wrong place
 * would let a step run early or late without any behavioural test noticing.
 *
 * Pinned order:
 *  - `src/index.ts` `main()`: schema guard → site key → `await createSiteRouteDeps()`, so a
 *    newer-schema `content.db` is refused before anything opens it.
 *  - `deps.ts` `createSiteRouteDeps`: hydrate → open, and the open carries the crash-recovery hook
 *    (`openContentDb` runs that hook before Drizzle migrations; behaviour proven by
 *    `platform/db/sqlite/__tests__/content-db-recovery.integration.test.ts`).
 *
 * Source assertions, like `serving-app-boot-wiring.unit.test.ts`: `index.ts` boots a real server and
 * cannot be imported by a test.
 */

const SRC_ROOT = path.join(import.meta.dirname, "../../..");

/** Code lines only, so prose in doc comments cannot satisfy an anchor. */
function readCode(relativePath: string): string {
  return readFileSync(path.join(SRC_ROOT, relativePath), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

/** Index of `anchor` in `source`; fails loudly when the anchor is gone rather than passing on -1. */
function indexOfAnchor(source: string, anchor: string): number {
  const index = source.indexOf(anchor);
  assert.notEqual(index, -1, `anchor missing: ${anchor} — update this test if the line's shape changed`);
  return index;
}

/** The body of a top-level `function` declaration: from its signature to the next column-0 `}`. */
function functionBody(source: string, signature: string): string {
  const start = indexOfAnchor(source, signature);
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `no closing brace found for ${signature}`);
  return source.slice(start, end);
}

test("index.ts main(): the content.db schema guard and site key run before the composition root opens the database", () => {
  const main = functionBody(readCode("index.ts"), "async function main(");
  const guard = indexOfAnchor(main, "guardContentDbSchemaOrExit(defaultContentDbPath())");
  const siteKey = indexOfAnchor(main, "await ensureSiteKeyForBoot(");
  const compose = indexOfAnchor(main, "await createSiteRouteDeps()");
  assert.ok(guard < siteKey, "the schema guard must run before the site-key step");
  assert.ok(siteKey < compose, "the site key must be resolved before createSiteRouteDeps reads it");
});

test("createSiteRouteDeps: hydration runs before the open, and the open carries the migration crash-recovery hook", () => {
  const deps = readCode("server/runtime/composition/deps.ts");
  const body = functionBody(deps, "export async function createSiteRouteDeps(");
  const hydrate = indexOfAnchor(body, "hydrateContentDbIfNeeded(dbPath, overrides)");
  const open = indexOfAnchor(body, "resolveOrOpenContentDb(dbPath, overrides)");
  assert.ok(hydrate < open, "a hydrated seed must be in place before the database is opened");

  const opener = functionBody(deps, "function resolveOrOpenContentDb(");
  assert.match(opener, /openContentDb\([\s\S]*recoverIncompleteDataModuleMigrations\s*\)/);
});
