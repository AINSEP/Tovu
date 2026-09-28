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
 *  - `deps.ts` `createSiteRouteDeps` prelude (R1b): open → `await` workspace → `await` deny-store
 *    probe → chat.db open → `await` orphaned-chat check, all before the body starts its first fire-and-forget boot
 *    promise (`backfillPostSearchIndex`), so no boot promise interleaves with a prelude await.
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

test("createSiteRouteDeps prelude: open, then the awaited workspace, deny store and orphan check, all before the first fire-and-forget boot promise", () => {
  const body = functionBody(readCode("server/runtime/composition/deps.ts"), "export async function createSiteRouteDeps(");
  const open = indexOfAnchor(body, "resolveOrOpenContentDb(dbPath, overrides)");
  const kernel = indexOfAnchor(body, "const kernel = contentKernel(db)");
  const workspace = indexOfAnchor(body, "await resolveWorkspaceIdOverride(kernel, overrides)");
  const denyStore = indexOfAnchor(body, "await publishTrustRevocationStoreFor(kernel)");
  const chatOpen = indexOfAnchor(body, "const chatDb = openChatDb(chatDbPath)");
  const orphanCheck = indexOfAnchor(body, "await warnOnOrphanedChatRows(");
  const firstBootPromise = indexOfAnchor(body, "backfillPostSearchIndex(db)");
  assert.ok(open < kernel && kernel < workspace, "the workspace is read on the kernel of the opened database");
  assert.ok(workspace < denyStore, "the deny store is probed after the workspace resolves");
  assert.ok(denyStore < chatOpen, "chat.db opens after the deny store probe");
  assert.ok(chatOpen < orphanCheck, "the orphaned-chat check runs after chat.db is opened");
  assert.ok(orphanCheck < firstBootPromise, "every prelude await must finish before the body starts a boot promise");
  // Top-level (two-space indented) awaits only: nested async closures in the body may await freely.
  const topLevelAwaits = body.slice(firstBootPromise).match(/^  (const [^=]+= )?await\b/gm) ?? [];
  assert.equal(topLevelAwaits.length, 0, "the body after the prelude must not await at its top level");
});
