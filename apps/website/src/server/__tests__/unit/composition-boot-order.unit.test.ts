import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
 *  - `deps.ts` `createSiteRouteDeps`: store open → `composeSiteRouteDeps` → on failure, release the store.
 *  - `deps.ts` `composeSiteRouteDeps` prelude (R1b/R1d): store open → `await` workspace → `await`
 *    deny-store probe → `await` orphaned-chat check, all before the body starts its first
 *    fire-and-forget boot promise (`preparePostSearchIndex`), so no boot promise interleaves with a
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
  const index = readCode("index.ts");
  // why: 50579f4f (complexity <=10) moved main()'s pre-listener steps into prepareSiteBoot(), which
  // main() awaits first; the guard → key order is pinned there and prepare → compose in main().
  const prepare = functionBody(index, "async function prepareSiteBoot(");
  const guard = indexOfAnchor(prepare, "await guardContentDbSchemaOrExit(defaultContentDbPath())");
  const siteKey = indexOfAnchor(prepare, "await ensureSiteKeyForBoot(");
  const main = functionBody(index, "async function main(");
  const prepared = indexOfAnchor(main, "await prepareSiteBoot({ useMemory }, {})");
  const compose = indexOfAnchor(main, "await createSiteRouteDeps(defaultContentDbPath(),");
  assert.ok(guard < siteKey, "the schema guard must run before the site-key step");
  assert.ok(prepared < compose, "the site key must be resolved before createSiteRouteDeps reads it");
});

test("index.ts main(): a refusing schema guard stops a disk boot before site-key preparation or store opening", async () => {
  // Execute the actual main function with its boot ports isolated. Stop at the guard so no
  // server, process handler, environment mutation or database can be opened by this test.
  const index = readCode("index.ts");
  // why: 50579f4f moved the guard and site key into prepareSiteBoot(), which main() awaits first;
  // both functions run here so the refusal is still observed through the real main().
  const main = `${functionBody(index, "async function prepareSiteBoot(")}\n}\n${functionBody(index, "async function main(")}`;
  const compiled = ts.transpileModule(main, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: string[] = [];
  const refusal = new Error("schema too new");
  const opened = new Error("store opened past a refusing guard");
  const boot = runInNewContext(`${compiled}\nmain()`, {
    useMemory: false,
    pinDefaultSiteRoot: () => "/isolated",
    reportSitesSyncWarning: () => {},
    claimSiteRunning: () => ({ release: () => {} }),
    devTls: { active: false },
    installServerLogCapture: () => {},
    processBuildRelease: () => "test-release",
    telemetryEnvironment: () => "test",
    process: { env: {} },
    serverLogFilePaths: () => ({ server: "/isolated/server.log", daemon: "/isolated/daemon.log" }),
    attachServerLogFile: () => {},
    installUnhandledRejectionGuard: () => {},
    ensureAgentDaemonToken: () => {},
    ensureToolExecToken: () => {},
    registerPluginSdkResolver: () => {},
    runProductionReadinessGateOrExit: async () => {},
    warnIfNoSiteKeyAtBoot: () => {},
    defaultContentDbPath: () => "/isolated/content.db",
    guardContentDbSchemaOrExit: async (dbPath: string) => {
      calls.push("schema");
      assert.equal(dbPath, "/isolated/content.db");
      throw refusal;
    },
    siteDir: () => "/isolated",
    findSiteKeyDependentData: () => {},
    ensureSiteKeyForBoot: async () => { calls.push("site-key"); },
    createSiteRouteDeps: async () => { calls.push("store"); throw opened; },
  });
  await assert.rejects(boot, (error: unknown) => error === refusal);
  assert.deepEqual(calls, ["schema"]);
});

test("createSiteRouteDeps: storage choice, then hydration, then the store open (the recovering site opener), then the chat sweep", () => {
  const deps = readCode("server/runtime/composition/deps.ts");
  const body = functionBody(deps, "export async function createSiteRouteDeps(");
  indexOfAnchor(body, "await openCompositionStore(dbPath, overrides)");

  const prelude = functionBody(deps, "async function openCompositionStore(");
  // why: 20d451f6 (complexity <=10) moved the storage choice into prepareCompositionStorage(),
  // which still resolves it with resolveSiteStorage; `overrides` now defaults to `{}` (no `?.`).
  assert.match(functionBody(deps, "function prepareCompositionStorage("), /const storage = resolveSiteStorage\(/);
  const storage = indexOfAnchor(prelude, "const storage = prepareCompositionStorage({ dbPath, overrides })");
  const hydrate = indexOfAnchor(prelude, "hydrateContentDbIfNeeded(dbPath, storage, overrides)");
  const open = indexOfAnchor(prelude, "await openSiteStore(");
  const sweep = indexOfAnchor(prelude, "startOwnerChatExpirySweep(role, opened.chat, overrides.chatExpirySweep)");
  assert.ok(storage < hydrate, "the storage choice decides whether a SQLite seed is hydrated");
  assert.ok(hydrate < open, "a hydrated seed must be in place before the database is opened");
  assert.ok(open < sweep, "the sweep runs on the chat kernel the store opened");

  const opener = functionBody(readCode("server/runtime/composition/open-site-store.ts"), "export async function openSiteStore(");
  assert.match(opener, /await openSiteContentDb\(\{ dbPath: required\.dbPath \}, sqliteOptions\)/);
});

test("openSiteContentDb: crash recovery runs on the fresh connection before the migrations, and the store is prepared after them", () => {
  const body = functionBody(readCode("server/runtime/composition/open-site-content-db.ts"), "export async function openSiteContentDb(");
  const open = indexOfAnchor(body, "openSqliteContentConnection({ filePath: dbPath }, options)");
  const recover = indexOfAnchor(body, "await recoverIncompleteDataModuleMigrations(");
  const migrate = indexOfAnchor(body, "await migrateSqliteContentFile(db, dbPath)");
  const prepare = indexOfAnchor(body, "await prepareContentStore(");
  assert.ok(open < recover && recover < migrate && migrate < prepare, "open → recover → migrate → prepare");
});

test("createSiteRouteDeps prelude: store open, then the awaited workspace, deny store and orphan check, all before the first fire-and-forget boot promise", () => {
  const deps = readCode("server/runtime/composition/deps.ts");
  const root = functionBody(deps, "export async function createSiteRouteDeps(");
  const openStore = indexOfAnchor(root, "await openCompositionStore(dbPath, overrides)");
  const compose = indexOfAnchor(root, "await composeSiteRouteDeps(dbPath, { store: opened.store, onStoreClose: opened.onClose, beforeStoreClose: opened.beforeClose }, overrides)");
  const release = indexOfAnchor(root, "await opened.release()");
  assert.ok(openStore < compose && compose < release, "the store opens first; a failed composition releases it");
  const body = functionBody(deps, "async function composeSiteRouteDeps(");
  const open = 0;
  const kernel = indexOfAnchor(body, "const kernel = store.content");
  const workspace = indexOfAnchor(body, "await resolveWorkspaceIdOverride(kernel, overrides)");
  const denyStore = indexOfAnchor(body, "await publishTrustRevocationStoreFor(kernel)");
  const orphanCheck = indexOfAnchor(body, "await warnOnOrphanedChatRows(");
  const firstBootPromise = indexOfAnchor(body, "preparePostSearchIndex(");
  assert.ok(open < kernel && kernel < workspace, "the workspace is read on the kernel of the opened store");
  assert.ok(workspace < denyStore, "the deny store is probed after the workspace resolves");
  assert.ok(denyStore < orphanCheck, "the orphaned-chat check runs after the deny store probe (chat.db opened with the store)");
  assert.ok(orphanCheck < firstBootPromise, "every prelude await must finish before the body starts a boot promise");
  // Vault consolidation (9b20083b6) adds one fenced await before credential consumers.
  // The shared kernel lock serializes it with the background settings writers.
  // Top-level (two-space indented) awaits only: nested async closures may await freely.
  const topLevelAwaits = body.slice(firstBootPromise).match(/^  (?:const [^=]+= )?await[^\n]*/gm) ?? [];
  // Later composition steps that must await (each boot promise above carries its own .catch):
  // the project store open (09f93109d7), provider plugin boot (ca96ee648d) and the content
  // analytics bus subscriptions (b46eb6e29a). Any other new top-level await fails here.
  assert.deepEqual(topLevelAwaits, [
    "  await normalizeSiteVaultAtBoot({ kernel, workspaceId, siteDir: siteDirForKeyring, clock }, {",
    "  const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ overrides, runtimeMode, onStoreClose, binding: resolvedSiteBinding,",
    "  const providerPlugins = await providerPluginBoot({ overrides })({",
    "  await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });",
  ], "only the fenced vault normalization and the listed composition steps may await after boot promises start");
  const keyring = indexOfAnchor(body, "const siteAssistantSecretKeyring = new EnvOrFileKeyring(");
  const normalize = indexOfAnchor(body, "await normalizeSiteVaultAtBoot(");
  const credentials = indexOfAnchor(body, "const siteAssistantCredentialRepo = new SqliteSiteAssistantCredentialRepo(");
  assert.ok(keyring < normalize && normalize < credentials, "vault normalization must finish before credential consumers are constructed");
});

test("createSiteRouteDeps body: every repo is built from the kernels; the engine-bound rest comes from storeBoundServicesFor", () => {
  const body = functionBody(readCode("server/runtime/composition/deps.ts"), "async function composeSiteRouteDeps(");
  // `db` used as a value (not a property key `db:`, not a member `x.db`).
  const uses = [...body.matchAll(/(?<![.\w$])db(?![\w$:])/g)].map((match) => body.slice(body.lastIndexOf("\n", match.index) + 1, body.indexOf("\n", match.index)).trim());
  assert.deepEqual(uses, [], "a Postgres/PGlite store has no SQLite `db`: anything reading it breaks there");
  assert.equal([...body.matchAll(/sqliteDb/g)].length, 0, "the SQLite handle reaches only `store-bound-services.ts`");
  assert.match(body, /const storeBound = storeBoundServicesFor\(store, dbPath\);/);
});
