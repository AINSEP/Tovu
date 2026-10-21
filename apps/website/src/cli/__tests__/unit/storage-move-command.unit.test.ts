import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { runStorageMoveCommand } from "../../commands/storage-move.js";
import type { moveSiteStorage } from "#src/server/runtime/composition/move-site-storage";

/**
 * @file `tovu storage move` — unit tier for the command's own decisions (target validation, where the
 * connection string comes from, what is printed), with the PGlite → Postgres mover replaced by a
 * hand-written fake. The real copy is covered by `storage-move.postgres.test.ts` (local Postgres run).
 */

type MoveCall = Parameters<typeof moveSiteStorage>[0];

function fakeMover(calls: MoveCall[]): typeof moveSiteStorage {
  return async (required) => {
    calls.push(required);
    return {
      storage: { kind: "postgres", secretRef: required.secretRef },
      tables: [{ table: "public.pages", rows: 3, created: false }, { table: "public.menus", rows: 2, created: false }],
      keptPgliteDir: path.join(required.siteDir, "data", "pglite"),
    };
  };
}

const dir = path.join(path.sep, "srv", "tovu-storage-move-missing-site");

test("refuses every target except postgres before touching anything", async () => {
  const calls: MoveCall[] = [];
  await assert.rejects(runStorageMoveCommand({ dir, to: "sqlite", moveStorage: fakeMover(calls) }),
    { name: "ValidationError", message: "storage move: --to must be postgres (the only target a PGlite site moves to)" });
  await assert.rejects(runStorageMoveCommand({ dir, moveStorage: fakeMover(calls) }), { name: "ValidationError" });
  assert.equal(calls.length, 0);
});

test("--storage-env must be a variable name and must be set", async () => {
  const calls: MoveCall[] = [];
  await assert.rejects(runStorageMoveCommand({ dir, to: "postgres", storageEnv: "1-bad name", env: {}, moveStorage: fakeMover(calls) }),
    { name: "ValidationError", message: "storage move: --storage-env must be an environment variable name" });
  await assert.rejects(runStorageMoveCommand({ dir, to: "postgres", storageEnv: "TOVU_PG", env: { TOVU_PG: "   " }, moveStorage: fakeMover(calls) }),
    { name: "ValidationError", message: "storage move: the environment variable TOVU_PG is not set" });
  await assert.rejects(runStorageMoveCommand({ dir, to: "postgres", storageEnv: "TOVU_PG", env: {}, moveStorage: fakeMover(calls) }),
    { name: "ValidationError", message: "storage move: the environment variable TOVU_PG is not set" });
  assert.equal(calls.length, 0);
});

test("--storage-env moves with the trimmed env value and keeps the env reference as the secret", async () => {
  const calls: MoveCall[] = [];
  const lines: string[] = [];
  const url = ["postgres://", "owner", "@db.example:5432/site"].join("");
  const result = await runStorageMoveCommand({
    dir, to: "postgres", storageEnv: "TOVU_PG", env: { TOVU_PG: ` ${url}\n` },
    moveStorage: fakeMover(calls), write: (line) => lines.push(line),
    readConnectionString: async () => assert.fail("an env-sourced move must not prompt"),
  });
  assert.deepEqual(calls, [{ siteDir: dir, connectionString: url, secretRef: { env: "TOVU_PG" } }]);
  assert.equal(result.tables.length, 2);
  assert.deepEqual(lines, [
    `moved site at ${dir} to postgres: 2 tables, 5 rows`,
    `the PGlite data dir is kept at ${path.join(dir, "data", "pglite")}; remove it yourself once the site checks out`,
  ]);
});

test("without --storage-env the prompted connection string is trimmed and sealed in the site", async () => {
  const calls: MoveCall[] = [];
  const url = ["postgres://", "owner", "@db.example/site"].join("");
  await runStorageMoveCommand({ dir, to: "postgres", moveStorage: fakeMover(calls), write: () => undefined,
    readConnectionString: async () => `${url}\n` });
  assert.deepEqual(calls, [{ siteDir: dir, connectionString: url, secretRef: "site" }]);
});

test("an empty prompted connection string is refused", async () => {
  const calls: MoveCall[] = [];
  await assert.rejects(runStorageMoveCommand({ dir, to: "postgres", moveStorage: fakeMover(calls), readConnectionString: async () => "  \n" }),
    { name: "ValidationError", message: "storage move: no connection string was given" });
  assert.equal(calls.length, 0);
});

test("by default the summary lines go to stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await runStorageMoveCommand({ dir, to: "postgres", moveStorage: fakeMover([]), readConnectionString: async () => "postgres://h/db" });
  t.mock.restoreAll();
  assert.deepEqual(written, [
    `moved site at ${dir} to postgres: 2 tables, 5 rows\n`,
    `the PGlite data dir is kept at ${path.join(dir, "data", "pglite")}; remove it yourself once the site checks out\n`,
  ]);
});
