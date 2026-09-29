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
 *  - `src/index.ts` `main()`: schema guard → site key → `await createSiteRouteDeps(defaultContentDbPath(), …)`, so a
 *    newer-schema `content.db` is refused before anything opens it.
 *  - `deps.ts` `openCompositionStore` (R1d): storage choice → hydrate → `openSiteStore` (content.db via
 *    the recovering `openSiteContentDb`, then chat.db) → the guest-chat expiry sweep on the chat kernel.
 *  - `deps.ts` `createSiteRouteDeps` prelude (R1b/R1d): store open → `await` workspace → `await`
 *    deny-store probe → `await` orphaned-chat check, all before the body starts its first
 *    fire-and-forget boot promise (`backfillPostSearchIndex`), so no boot promise interleaves with a
 *    prelude await.
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
  const compose = indexOfAnchor(main, "await createSiteRouteDeps(defaultContentDbPath(),");
  assert.ok(guard < siteKey, "the schema guard must run before the site-key step");
  assert.ok(siteKey < compose, "the site key must be resolved before createSiteRouteDeps reads it");
});

test("createSiteRouteDeps: storage choice, then hydration, then the store open (the recovering site opener), then the chat sweep", () => {
  const deps = readCode("server/runtime/composition/deps.ts");
  const body = functionBody(deps, "export async function createSiteRouteDeps(");
  indexOfAnchor(body, "await openCompositionStore(dbPath, overrides)");

  const prelude = functionBody(deps, "async function openCompositionStore(");
  const storage = indexOfAnchor(prelude, "const storage = resolveSiteStorage(");
  const hydrate = indexOfAnchor(prelude, "hydrateContentDbIfNeeded(dbPath, storage, overrides)");
  const open = indexOfAnchor(prelude, "await openSiteStore(");
  const sweep = indexOfAnchor(prelude, "startChatExpirySweep(store.chat)");
  assert.ok(storage < hydrate, "the storage choice decides whether a SQLite seed is hydrated");
  assert.ok(hydrate < open, "a hydrated seed must be in place before the database is opened");
  assert.ok(open < sweep, "the sweep runs on the chat kernel the store opened");

  const opener = functionBody(readCode("server/runtime/composition/open-site-store.ts"), "export async function openSiteStore(");
  assert.match(opener, /await openSiteContentDb\(required\.dbPath\)/);
});

test("openSiteContentDb: crash recovery runs on the fresh connection before the migrations, and the store is prepared after them", () => {
  const body = functionBody(readCode("server/runtime/composition/open-site-content-db.ts"), "export async function openSiteContentDb(");
  const open = indexOfAnchor(body, "openSqliteContentConnection(dbPath)");
  const recover = indexOfAnchor(body, "await recoverIncompleteDataModuleMigrations(");
  const migrate = indexOfAnchor(body, "await migrateSqliteContentFile(db, dbPath)");
  const prepare = indexOfAnchor(body, "await prepareContentStore(");
  assert.ok(open < recover && recover < migrate && migrate < prepare, "open → recover → migrate → prepare");
});

test("createSiteRouteDeps prelude: store open, then the awaited workspace, deny store and orphan check, all before the first fire-and-forget boot promise", () => {
  const body = functionBody(readCode("server/runtime/composition/deps.ts"), "export async function createSiteRouteDeps(");
  const open = indexOfAnchor(body, "await openCompositionStore(dbPath, overrides)");
  const kernel = indexOfAnchor(body, "const kernel = store.content");
  const workspace = indexOfAnchor(body, "await resolveWorkspaceIdOverride(kernel, overrides)");
  const denyStore = indexOfAnchor(body, "await publishTrustRevocationStoreFor(kernel)");
  const orphanCheck = indexOfAnchor(body, "await warnOnOrphanedChatRows(");
  const firstBootPromise = indexOfAnchor(body, "backfillPostSearchIndex(");
  assert.ok(open < kernel && kernel < workspace, "the workspace is read on the kernel of the opened store");
  assert.ok(workspace < denyStore, "the deny store is probed after the workspace resolves");
  assert.ok(denyStore < orphanCheck, "the orphaned-chat check runs after the deny store probe (chat.db opened with the store)");
  assert.ok(orphanCheck < firstBootPromise, "every prelude await must finish before the body starts a boot promise");
  // Top-level (two-space indented) awaits only: nested async closures in the body may await freely.
  const topLevelAwaits = body.slice(firstBootPromise).match(/^  (const [^=]+= )?await\b/gm) ?? [];
  assert.equal(topLevelAwaits.length, 0, "the body after the prelude must not await at its top level");
});

test("createSiteRouteDeps body: every repo is built from the kernels; the engine-bound rest comes from storeBoundServicesFor", () => {
  const body = functionBody(readCode("server/runtime/composition/deps.ts"), "export async function createSiteRouteDeps(");
  // `db` used as a value (not a property key `db:`, not a member `x.db`).
  const uses = [...body.matchAll(/(?<![.\w$])db(?![\w$:])/g)].map((match) => body.slice(body.lastIndexOf("\n", match.index) + 1, body.indexOf("\n", match.index)).trim());
  assert.deepEqual(uses, [], "a Postgres/PGlite store has no SQLite `db`: anything reading it breaks there");
  assert.equal([...body.matchAll(/sqliteDb/g)].length, 0, "the SQLite handle reaches only `store-bound-services.ts`");
  assert.match(body, /const storeBound = storeBoundServicesFor\(store, dbPath\);/);
});
