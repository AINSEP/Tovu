import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { isolatedCatalogEnv } from "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

/** Real composition handles and real process signals: the last writes must survive without WALs. */
for (const role of ["owner", "workspace-client"] as const) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    test(`${role}: ${signal} closes content, chat and ops journal before exit`, { timeout: 60_000, skip: process.platform === "win32" }, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sqlite-shutdown-"));
      const contentPath = path.join(dir, "content.db");
      const chatPath = path.join(dir, "chat.db");
      const journalPath = path.join(dir, "ops", "database-journal.db");
      const depsUrl = new URL("../../composition/deps.ts", import.meta.url).href;
      const daemonDepsUrl = new URL("../../composition/agent-daemon-deps.ts", import.meta.url).href;
      const shutdownUrl = new URL("../close-store-on-shutdown.ts", import.meta.url).href;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
        import { createServer } from 'node:http';
        import { sql } from 'kysely';
        import { createSiteRouteDeps } from ${JSON.stringify(depsUrl)};
        import { createAgentDaemonRouteDeps } from ${JSON.stringify(daemonDepsUrl)};
        import { closeStoreOnShutdown, stopServingWithinGrace } from ${JSON.stringify(shutdownUrl)};
        let store;
        let deps = await createSiteRouteDeps(${JSON.stringify(contentPath)}, {
          onStoreOpened: opened => { store = opened; },
        });
        const bootWork = deps => Object.entries(deps).filter(([key]) => key.endsWith('Ready')).map(([, work]) => work);
        await Promise.all(bootWork(deps));
        if (${JSON.stringify(role)} === 'workspace-client') {
          const workspaceId = deps.workspaceId;
          await store.close();
          deps = await createAgentDaemonRouteDeps({ env: { TOVU_WORKSPACE: workspaceId } }, {
            dbPath: ${JSON.stringify(contentPath)}, onStoreOpened: opened => { store = opened; },
          });
          await Promise.all(bootWork(deps));
        }
        const server = createServer((_request, response) => response.end('ready'));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        closeStoreOnShutdown({ store, onShutdown: () => {} }, {
          bootWork: () => bootWork(deps),
          stopServing: () => stopServingWithinGrace({ server, workers: [] }),
        });
        // Keep the latest writes in WAL until the close; no test schema or migrations are added.
        await store.content.query(sql.raw('PRAGMA wal_autocheckpoint = 0'));
        await store.chat.query(sql.raw('PRAGMA wal_autocheckpoint = 0'));
        await store.content.execute(sql.raw("UPDATE posts SET title = 'written just before shutdown'"));
        await store.chat.execute(sql.raw("INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('shutdown-chat', 'shutdown-scope', 'user', 'shutdown-user', 1, 2)"));
        await deps.databaseLedgerRepo.append({ id: 'shutdown-ledger', kind: 'core.migration', outcome: 'ok', createdAt: '2026-10-13T00:00:00.000Z' });
        process.send('ready');
      `], {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, ...isolatedCatalogEnv, TOVU_SITE_DIR: dir, TOVU_DATABASE_JOURNAL_DB: journalPath },
      });
      const exited = once(child, "exit");
      try {
        // Race readiness with exit so a refused boot fails immediately instead of hanging.
        const ready = await Promise.race([once(child, "message", { signal: AbortSignal.timeout(40_000) }), exited]);
        assert.equal(ready[0], "ready");
        for (const file of [contentPath, chatPath, journalPath]) {
          assert.equal(fs.existsSync(`${file}-wal`), true, `${file} has a WAL before shutdown`);
          assert.equal(fs.existsSync(`${file}-shm`), true, `${file} has shared memory before shutdown`);
        }
        child.kill(signal);
        const stopped = await Promise.race([exited, once(child, "exit", { signal: AbortSignal.timeout(8_000) })]);
        assert.deepEqual(stopped, [0, null]);
        for (const file of [contentPath, chatPath, journalPath]) {
          assert.equal(fs.existsSync(`${file}-wal`), false, `${file} WAL removed before exit`);
          assert.equal(fs.existsSync(`${file}-shm`), false, `${file} shared memory removed before exit`);
        }
        // Read copies of only the main files: reopening the originals could hide a leftover WAL.
        const probes = [
          [contentPath, "SELECT title AS value FROM posts LIMIT 1", "written just before shutdown"],
          [chatPath, "SELECT id AS value FROM ai_chats WHERE id = 'shutdown-chat'", "shutdown-chat"],
          [journalPath, "SELECT id AS value FROM database_ledger WHERE id = 'shutdown-ledger'", "shutdown-ledger"],
        ];
        for (const [file, query, expected] of probes) {
          const copy = `${file}.main-only`;
          fs.copyFileSync(file!, copy);
          const db = new Database(copy, { readonly: true, fileMustExist: true });
          try { assert.deepEqual(db.prepare(query!).get(), { value: expected }); }
          finally { db.close(); }
        }
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await exited;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}
