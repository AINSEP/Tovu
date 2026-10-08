import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { freshPostgresDatabase, psql } from "#src/platform/db/__tests__/postgres-database";
import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import { STORAGE_SECRET_FILENAME } from "#src/server/runtime/composition/storage-secret";
import { runInitCommand } from "../../commands/init.js";

/**
 * @file `tovu init --storage postgres` on the local Postgres server (temp databases, dropped WITH
 * (FORCE)). Needs `pg_ctl -D /usr/local/var/postgresql@14 start`; fails, never skips, when it is down.
 *
 * Outcome Matrix:
 *   Given --storage-env NAME (set)          -> meta names the variable, no sealed file, database at head + template seed
 *   Given a connection string (sealed)      -> 0600 sealed file without the plaintext, meta secretRef "site",
 *                                              the site's key made in (temp) HOME, the store reopens from the meta alone
 *   Given a database already holding a site -> VALIDATION, env or sealed; no site folder, no sealed secret, no key file
 */

const ENV_DB = "tovu_r1f2_init_env";
const SEALED_DB = "tovu_r1f2_init_sealed";
const TAKEN_DB = "tovu_r1f2_init_taken";
const URL_ENV = "TOVU_R1F2_INIT_URL";

let parent: string;
let home: string;
const saved = { HOME: process.env.HOME, TOVU_SITE_KEY: process.env.TOVU_SITE_KEY };

before(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "r1f2-init-pg-"));
  // The sealed case makes the new site's key file; keep it out of the real ~/.tovu.
  home = fs.mkdtempSync(path.join(os.tmpdir(), "r1f2-home-"));
  process.env.HOME = home;
  process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex");
});

after(() => {
  delete process.env[URL_ENV];
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const db of [ENV_DB, SEALED_DB, TAKEN_DB]) psql({ database: "postgres", sql: `DROP DATABASE IF EXISTS ${db} WITH (FORCE);` });
  fs.rmSync(parent, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

function readMeta(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
}

async function templateRows(dir: string, storage: Parameters<typeof openSiteStore>[0]["storage"]) {
  const store = await openSiteStore({ storage, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
  try {
    const workspaces = (await store.content.run((db) => db.selectFrom("workspaces").select("slug").execute())).map((w) => w.slug);
    const posts = (await store.content.run((db) => db.selectFrom("posts").select("slug").execute())).map((p) => p.slug);
    const chats = await store.chat.run((db) => db.selectFrom("ai_chats").select("id").execute());
    return { workspaces, posts, chats };
  } finally {
    await store.close();
  }
}

test("--storage-env: the site names the variable, keeps no secret, and its database is at head with the template", async () => {
  process.env[URL_ENV] = freshPostgresDatabase(ENV_DB);
  const dir = path.join(parent, "env-site");
  await runInitCommand({ dir, storage: "postgres", storageEnv: URL_ENV });

  assert.deepEqual(readMeta(dir).storage, { kind: "postgres", secretRef: { env: URL_ENV } });
  assert.equal(fs.existsSync(path.join(dir, STORAGE_SECRET_FILENAME)), false);
  for (const name of ["content.db", "chat.db"]) assert.equal(fs.existsSync(path.join(dir, name)), false, `no ${name}`);
  const rows = await templateRows(dir, { kind: "postgres", secretRef: { env: URL_ENV } });
  assert.deepEqual(rows.workspaces, ["local-tovu"]);
  assert.ok(rows.posts.includes("welcome"), JSON.stringify(rows.posts));
  assert.deepEqual(rows.chats, []);
});

test("sealed: the connection string is sealed in the site folder (0600, no plaintext) and the site reopens from its meta", async () => {
  const connectionString = freshPostgresDatabase(SEALED_DB);
  const dir = path.join(parent, "sealed-site");
  await runInitCommand({ dir, storage: "postgres", readConnectionString: async () => `${connectionString}\n` });

  const meta = readMeta(dir);
  assert.deepEqual(meta.storage, { kind: "postgres", secretRef: "site" });
  const secretPath = path.join(dir, STORAGE_SECRET_FILENAME);
  assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(secretPath, "utf8").includes(SEALED_DB), false, "no plaintext connection string");
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isFile()) assert.equal(fs.readFileSync(full, "utf8").includes(connectionString), false, `${file} carries no plaintext`);
  }
  const siteKeyFiles = fs.readdirSync(path.join(home, ".tovu"), { recursive: true }).map(String);
  assert.ok(siteKeyFiles.some((f) => f.includes(String(meta.siteKeyId))), `the site's key file is made: ${JSON.stringify(siteKeyFiles)}`);

  const rows = await templateRows(dir, { kind: "postgres", secretRef: "site" });
  assert.deepEqual(rows.workspaces, ["local-tovu"]);
  assert.ok(rows.posts.includes("about"), JSON.stringify(rows.posts));
});

test("a database that already holds a Tovu site is refused, before any folder, secret or key is made", async () => {
  const connectionString = freshPostgresDatabase(TAKEN_DB);
  process.env[URL_ENV] = connectionString;
  await runInitCommand({ dir: path.join(parent, "first-site"), storage: "postgres", storageEnv: URL_ENV });
  const keyFiles = () => (fs.existsSync(path.join(home, ".tovu")) ? fs.readdirSync(path.join(home, ".tovu"), { recursive: true }).map(String).sort() : []);
  const keysBefore = keyFiles();

  const envDir = path.join(parent, "second-env-site");
  await assert.rejects(runInitCommand({ dir: envDir, storage: "postgres", storageEnv: URL_ENV }), (err: Error) => {
    assert.equal(err.name, "ValidationError");
    assert.match(err.message, /already holds data \(.*public\.workspaces/);
    assert.match(err.message, /empty database/);
    assert.equal(err.message.includes(connectionString), false, "the connection string is never echoed");
    return true;
  });
  assert.equal(fs.existsSync(envDir), false, "no site folder is created");

  const sealedDir = path.join(parent, "second-sealed-site");
  await assert.rejects(runInitCommand({ dir: sealedDir, storage: "postgres", readConnectionString: async () => connectionString }), { name: "ValidationError" });
  assert.equal(fs.existsSync(sealedDir), false, "no site folder or sealed secret is created");
  assert.deepEqual(keyFiles(), keysBefore, "no site key is made");
});
