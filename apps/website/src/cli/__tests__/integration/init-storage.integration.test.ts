import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { OWNER_LOCK_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { ValidationError } from "#src/platform/site-dir/errors";
import { openSiteStore, PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME } from "#src/server/runtime/composition/open-site-store";
import { sitesAgentToolCatalog } from "#src/features/sites/agent-tools";
import { parseInitStorage, runInitCommand } from "../../commands/init.js";

/**
 * @file `tovu init --storage` (R1f "hidden creation"): the only way a site is created on PGlite or
 * Postgres. Real Postgres cases: `init-storage.postgres.test.ts`.
 *
 * Outcome Matrix:
 *   Given no --storage                                -> sqlite (unchanged)
 *   Given an unknown kind / --storage-env off postgres -> ValidationError
 *   Given --storage pglite                             -> <site>/pglite/ at head with the template seeded,
 *                                                        no content.db/chat.db, meta says pglite, lock released
 *   Given --storage postgres + an unset --storage-env  -> ValidationError, nothing created
 *   Given --storage postgres, empty connection string  -> ValidationError, nothing created
 *   The sites MCP tools                                -> no `storage` input anywhere
 */

let parent: string;
let socketDir: string;
const savedSocketEnv = process.env[PG_SOCKET_ENV];

before(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "r1f2-init-storage-"));
  socketDir = fs.mkdtempSync("/tmp/r1f2i-");
  process.env[PG_SOCKET_ENV] = path.join(socketDir, ".s.PGSQL.5432");
});

after(() => {
  if (savedSocketEnv === undefined) delete process.env[PG_SOCKET_ENV];
  else process.env[PG_SOCKET_ENV] = savedSocketEnv;
  fs.rmSync(parent, { recursive: true, force: true });
  fs.rmSync(socketDir, { recursive: true, force: true });
});

function readMeta(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
}

test("parseInitStorage: default sqlite, the three kinds, postgres sealed or env-named, bad input refused", () => {
  assert.deepEqual(parseInitStorage(undefined, undefined), { kind: "sqlite" });
  assert.deepEqual(parseInitStorage("pglite", undefined), { kind: "pglite" });
  assert.deepEqual(parseInitStorage("postgres", undefined), { kind: "postgres", secretRef: "site" });
  assert.deepEqual(parseInitStorage("postgres", "DATABASE_URL"), { kind: "postgres", secretRef: { env: "DATABASE_URL" } });
  assert.throws(() => parseInitStorage("mysql", undefined), (err: unknown) => err instanceof ValidationError && /sqlite, pglite, postgres/.test(err.message));
  assert.throws(() => parseInitStorage("pglite", "DATABASE_URL"), (err: unknown) => err instanceof ValidationError && /postgres only/.test(err.message));
  assert.throws(() => parseInitStorage("postgres", "not a name"), (err: unknown) => err instanceof ValidationError && /environment variable name/.test(err.message));
});

test("init without --storage still writes a SQLite site", async () => {
  const dir = path.join(parent, "sqlite-site");
  await runInitCommand({ dir });
  assert.deepEqual(readMeta(dir).storage, { kind: "sqlite" });
  assert.ok(fs.existsSync(path.join(dir, "content.db")));
  assert.equal(fs.existsSync(path.join(dir, PGLITE_DATA_DIR_NAME)), false);
});

test("init --storage pglite: the data dir is at head with the template seeded, no SQLite files, lock released", async () => {
  const dir = path.join(parent, "pglite-site");
  await runInitCommand({ dir, name: "PGlite Site", storage: "pglite" });

  assert.deepEqual(readMeta(dir).storage, { kind: "pglite" });
  assert.ok(fs.existsSync(path.join(dir, PGLITE_DATA_DIR_NAME, "PG_VERSION")), "the PGlite data dir is created");
  assert.equal(fs.existsSync(path.join(dir, PGLITE_DATA_DIR_NAME, OWNER_LOCK_FILE)), false, "init closed the store: no owner lock left");
  for (const name of ["content.db", "chat.db"]) assert.equal(fs.existsSync(path.join(dir, name)), false, `no ${name}`);

  const store = await openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
  try {
    const workspaces = await store.content.run((db) => db.selectFrom("workspaces").select("slug").execute());
    assert.deepEqual(workspaces.map((w) => w.slug), ["local-tovu"], "the starter template's workspace, once");
    const slugs = (await store.content.run((db) => db.selectFrom("posts").select("slug").execute())).map((p) => p.slug);
    assert.deepEqual(slugs, [], "a new PGlite site stays blank after its first boot");
    const chatTables = await store.chat.run((db) => db.selectFrom("ai_chats").select("id").execute());
    assert.deepEqual(chatTables, [], "the ai_chat history is at head (its tables exist), empty");
  } finally {
    await store.close();
  }
});

test("init --storage postgres --storage-env naming an unset variable is refused before anything is created", async () => {
  const dir = path.join(parent, "pg-env-unset");
  delete process.env.TOVU_R1F2_UNSET_URL;
  await assert.rejects(
    runInitCommand({ dir, storage: "postgres", storageEnv: "TOVU_R1F2_UNSET_URL" }),
    (err: unknown) => err instanceof ValidationError && err.message.includes("TOVU_R1F2_UNSET_URL")
  );
  assert.equal(fs.existsSync(dir), false);
});

test("init --storage postgres with an empty connection string is refused before anything is created", async () => {
  const dir = path.join(parent, "pg-empty");
  await assert.rejects(
    runInitCommand({ dir, storage: "postgres", readConnectionString: async () => "   " }),
    (err: unknown) => err instanceof ValidationError && /needs its connection string/.test(err.message)
  );
  assert.equal(fs.existsSync(dir), false);
});

test("hidden creation: no sites MCP tool takes a storage input", () => {
  assert.ok(sitesAgentToolCatalog.length > 0);
  for (const tool of sitesAgentToolCatalog) {
    assert.equal(JSON.stringify(tool.inputSchema ?? {}).includes("storage"), false, `${tool.name} exposes no storage choice`);
  }
});
