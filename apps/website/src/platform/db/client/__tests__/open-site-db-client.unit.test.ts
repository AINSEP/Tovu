import "../../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import ts from "typescript";

import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import type { StorageKernel } from "../../kernel/port.js";
import {
  type ImportSiteDbDriver,
  openSiteDbClient,
  type ResolvePostgresConnectionString,
  type SiteDbDrivers,
} from "../open-site-db-client.js";

/**
 * @file The agent daemon's leaf DB client (memory plan §2.7, lane W1-L): it opens an
 * already-migrated store and never reaches the migration, seed, repair, plugin-recovery or PGlite
 * owner code server boot owns.
 */

const SRC_ROOT = path.resolve(import.meta.dirname, "../../../..");
const CLIENT_FILE = path.resolve(import.meta.dirname, "../open-site-db-client.ts");

/** Server-boot-only modules the daemon must never load through this client. */
const FORBIDDEN: ReadonlyArray<{ label: string; test: (rel: string) => boolean }> = [
  { label: "platform/db/migrations/**", test: (rel) => rel.startsWith("platform/db/migrations/") },
  { label: "prepare-content-store", test: (rel) => rel.includes("prepare-content-store") },
  { label: "boot-data-repairs", test: (rel) => rel.includes("boot-data-repairs") },
  { label: "configuration/seed", test: (rel) => rel.includes("configuration/seed") },
  { label: "features/plugins/migration-recovery", test: (rel) => rel.startsWith("features/plugins/migration-recovery") },
  { label: "pglite-owner", test: (rel) => rel.includes("pglite-owner") },
];

/** Value import specifiers of one file: static imports/re-exports that are not type-only, plus `import("…")` when asked. */
function valueSpecifiers(file: string, optional: { dynamic: boolean }): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !isTypeOnlyImport(node)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (optional.dynamic && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg)) specifiers.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return !clause.name && bindings !== undefined && ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly);
}

/** A relative or `#src/` specifier as a source file; packages and builtins end the walk. */
function resolveLocal(from: string, specifier: string): string | undefined {
  let base: string;
  if (specifier.startsWith("#src/")) base = path.join(SRC_ROOT, specifier.slice("#src/".length));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return undefined;
  const stem = base.replace(/\.[cm]?js$/, "");
  return [`${stem}.ts`, path.join(stem, "index.ts")].find((candidate) => fs.existsSync(candidate));
}

/**
 * Every local file `entry` loads: its static graph plus, for `entry` itself only, its `import()`s (the
 * driver loaders) and their static graphs. A deeper `import()` is a path the client never takes.
 */
function reachableFiles(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    for (const specifier of valueSpecifiers(file, { dynamic: file === entry })) {
      const target = resolveLocal(file, specifier);
      if (target !== undefined && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

test("W1-L: the client's import graph (static, plus its driver import()s) reaches no migration, seed, repair, recovery or PGlite-owner module", () => {
  const reached = [...reachableFiles(CLIENT_FILE)].map((file) => path.relative(SRC_ROOT, file).split(path.sep).join("/"));
  // Sanity: the walk follows the lazily imported drivers, so a broken resolver cannot pass vacuously.
  for (const expected of ["platform/db/kernel/drivers/sqlite.ts", "platform/db/kernel/drivers/pglite-socket.ts", "platform/db/kernel/drivers/postgres.ts"]) {
    assert.ok(reached.includes(expected), `walk should reach ${expected}`);
  }
  const offenders = FORBIDDEN.flatMap(({ label, test: matches }) => reached.filter(matches).map((rel) => `${label}: ${rel}`));
  assert.deepEqual(offenders, []);
});

/** The module a node names, type-level included: an import/export declaration, `import()` or `typeof import()`. */
function namedModule(node: ts.Node): string | undefined {
  let literal: ts.Node | undefined;
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier;
  else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) literal = node.arguments[0];
  else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal = node.argument.literal;
  return literal !== undefined && ts.isStringLiteralLike(literal) ? literal.text : undefined;
}

/** Every module specifier in one file, type-only ones included. */
function allSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    const named = namedModule(node);
    if (named !== undefined) specifiers.push(named);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

test("W1-L: platform never depends on server: the client names no server/ module, even in a type, and loads none", () => {
  const isServer = (file: string) => path.relative(SRC_ROOT, file).split(path.sep).join("/").startsWith("server/");
  const named = allSpecifiers(CLIENT_FILE).filter((specifier) => {
    const target = resolveLocal(CLIENT_FILE, specifier);
    return specifier.includes("/server/") || (target !== undefined && isServer(target));
  });
  assert.deepEqual(named, []);
  assert.deepEqual([...reachableFiles(CLIENT_FILE)].filter(isServer), []);
});

function scratchSite(t: TestContext): { siteDir: string; dbPath: string; chatDbPath: string } {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "w1l-db-client-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return { siteDir, dbPath: path.join(siteDir, "content.db"), chatDbPath: path.join(siteDir, "chat.db") };
}

/** The real loader, recording which kinds were asked for. */
function spyingLoader(real?: ImportSiteDbDriver): { kinds: string[]; importDriver: ImportSiteDbDriver } {
  const kinds: string[] = [];
  const importDriver: ImportSiteDbDriver = async (required) => {
    kinds.push(required.kind);
    if (real) return real(required);
    throw new Error(`no driver for ${required.kind} in this test`);
  };
  return { kinds, importDriver };
}

const realSqliteLoader: ImportSiteDbDriver = async (required) => {
  assert.equal(required.kind, "sqlite");
  return (await import("../../kernel/drivers/sqlite.js")) as never;
};

/** Non-Postgres kinds never read a connection string. */
const unusedResolver: ResolvePostgresConnectionString = async () => assert.fail("only a Postgres site resolves a connection string");

test("W1-L: sqlite opens an already-migrated site and reads a settings row and the chat tables, loading only the sqlite driver", async (t) => {
  const site = scratchSite(t);
  const owner = await openSiteStore({ storage: { kind: "sqlite" }, dbPath: site.dbPath, chatDbPath: site.chatDbPath, role: "owner" });
  await owner.content.run((db) => db.insertInto("setting_values_global").values({
    setting_id: "w1l.probe", value_json: "\"on\"", state: "set", def_version: 1, seq: 1,
    updated_by: "test", updated_at: "2026-10-26T00:00:00.000Z", origin_plugin_id: null,
  }).execute());
  await owner.close();

  const { kinds, importDriver } = spyingLoader(realSqliteLoader);
  const client = await openSiteDbClient({ storage: { kind: "sqlite" }, ...site, resolvePostgresConnectionString: unusedResolver }, { env: {}, importDriver });
  t.after(() => client.close());
  const row = await client.content.run((db) => db.selectFrom("setting_values_global").select("value_json")
    .where("setting_id", "=", "w1l.probe").executeTakeFirst());
  assert.deepEqual(row, { value_json: "\"on\"" });
  const chats = await client.chat.run((db) => db.selectFrom("ai_chats").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow());
  assert.equal(Number(chats.n), 0);
  assert.deepEqual(kinds, ["sqlite"]);
});

test("W1-L: sqlite never migrates: an existing empty file stays empty (default driver loader)", async (t) => {
  const site = scratchSite(t);
  fs.writeFileSync(site.dbPath, "");
  fs.writeFileSync(site.chatDbPath, "");
  const client = await openSiteDbClient({ storage: { kind: "sqlite" }, ...site, resolvePostgresConnectionString: unusedResolver }, { env: {} });
  const tables = (k: StorageKernel<unknown>) => k.run((db) => db.introspection.getTables());
  assert.deepEqual(await tables(client.content as StorageKernel<unknown>), []);
  assert.deepEqual(await tables(client.chat as StorageKernel<unknown>), []);
  await client.close();
});

test("W1-L: sqlite refuses a missing file and creates nothing", async (t) => {
  const site = scratchSite(t);
  fs.writeFileSync(site.dbPath, "");
  await assert.rejects(
    openSiteDbClient({ storage: { kind: "sqlite" }, ...site, resolvePostgresConnectionString: unusedResolver }, { env: {}, importDriver: realSqliteLoader }),
    { message: `${site.chatDbPath} does not exist: the site's API process creates and migrates it at boot; start the site, then retry` }
  );
  assert.deepEqual(fs.readdirSync(site.siteDir), ["content.db"]);
});

test("W1-L: TOVU_DB=memory is refused before any driver loads", async () => {
  const { kinds, importDriver } = spyingLoader();
  await assert.rejects(
    openSiteDbClient({ storage: { kind: "sqlite" }, dbPath: "content.db", chatDbPath: "chat.db", resolvePostgresConnectionString: unusedResolver },
      { env: { TOVU_DB: "memory" }, importDriver }),
    { message: "TOVU_DB=memory is unsupported for a site DB client: the in-memory store lives in the server process and cannot be shared" }
  );
  assert.deepEqual(kinds, []);
});

/** A Postgres-dialect kernel stand-in: `run` hands over a db whose `withSchema` records the schema. */
function fakePgKernel(): { kernel: StorageKernel<unknown>; closed: () => number } {
  let closed = 0;
  const db = { schema: undefined, withSchema: (schema: string) => ({ schema }) };
  const kernel = {
    dialect: "postgres",
    run: async (fn: (db: unknown) => unknown) => fn(db),
    close: async () => { closed += 1; },
  } as unknown as StorageKernel<unknown>;
  return { kernel, closed: () => closed };
}

async function schemaOf(kernel: StorageKernel<unknown>): Promise<string | undefined> {
  return kernel.run((db) => (db as unknown as { schema: string | undefined }).schema);
}

test("W1-L: pglite connects to the owner's socket from TOVU_PG_SOCKET, loading only the pglite driver; chat is ai_chat-scoped", async () => {
  const fake = fakePgKernel();
  const sockets: string[] = [];
  const pglite: SiteDbDrivers["pglite"] = {
    openPgliteSocketKernel: ((required: { socketPath: string }) => { sockets.push(required.socketPath); return fake.kernel; }) as never,
  };
  const { kinds, importDriver } = spyingLoader((async () => pglite) as never);
  const client = await openSiteDbClient(
    { storage: { kind: "pglite" }, dbPath: "/site/content.db", chatDbPath: "/site/chat.db", resolvePostgresConnectionString: unusedResolver },
    { env: { TOVU_PG_SOCKET: " /run/tovu/.s.PGSQL.5432 " }, importDriver }
  );
  assert.deepEqual(kinds, ["pglite"]);
  assert.deepEqual(sockets, ["/run/tovu/.s.PGSQL.5432"]);
  assert.equal(await schemaOf(client.content as unknown as StorageKernel<unknown>), undefined);
  assert.equal(await schemaOf(client.chat as unknown as StorageKernel<unknown>), "ai_chat");
  await client.close();
  assert.equal(fake.closed(), 1);
});

test("W1-L: pglite without TOVU_PG_SOCKET is refused and never opens a data dir", async () => {
  const pglite = { openPgliteSocketKernel: () => assert.fail("must not connect") } as unknown as SiteDbDrivers["pglite"];
  await assert.rejects(
    openSiteDbClient({ storage: { kind: "pglite" }, dbPath: "/site/content.db", chatDbPath: "/site/chat.db", resolvePostgresConnectionString: unusedResolver },
      { env: { TOVU_PG_SOCKET: "  " }, importDriver: (async () => pglite) as never }),
    { message: "this site is stored on pglite and TOVU_PG_SOCKET is not set: the daemon supervisor passes the owner's socket" }
  );
});

test("W1-L: postgres resolves the site's connection string through the injected resolver and opens one pool, loading only the postgres driver", async () => {
  const fake = fakePgKernel();
  const env = { DATABASE_URL: "postgres://x" };
  const calls: unknown[] = [];
  const resolvePostgresConnectionString: ResolvePostgresConnectionString = async (...args) => { calls.push(args); return "postgres://resolved"; };
  const postgres = {
    openPostgresKernel: (required: { connectionString: string }) => { calls.push(required); return fake.kernel; },
  } as unknown as SiteDbDrivers["postgres"];
  const { kinds, importDriver } = spyingLoader((async () => postgres) as never);
  const storage = { kind: "postgres", secretRef: { env: "DATABASE_URL" } } as const;
  const client = await openSiteDbClient(
    { storage, dbPath: path.join("/site", "content.db"), chatDbPath: "/site/chat.db", resolvePostgresConnectionString },
    { env, importDriver }
  );
  assert.deepEqual(kinds, ["postgres"]);
  assert.deepEqual(calls, [[storage, { siteDir: "/site" }, { env }], { connectionString: "postgres://resolved" }]);
  assert.equal(await schemaOf(client.chat as unknown as StorageKernel<unknown>), "ai_chat");
  await client.close();
  assert.equal(fake.closed(), 1);
});
