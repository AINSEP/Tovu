import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { SiteDirInvalidError, ValidationError } from "#src/platform/site-dir/index";
import { initSite } from "#src/platform/site-dir/init-site";
import { openSiteStore, PG_SOCKET_ENV } from "#src/server/runtime/composition/open-site-store";
import { PortInUseError } from "../../errors.js";
import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";
import { createServingApp } from "#src/server/runtime/composition/serving-app";
import { runExportCommand } from "../../commands/export.js";
import { runServeCommand, type RunServeCommandOptional } from "../../commands/serve.js";
import { claimSiteRunning } from "#src/platform/site-dir/site-running";

// `registerPluginSdkResolver` refuses a second call per process, and every case here runs a command
// in this one process: the resolver itself is `*-plugin-sdk-resolver.integration.test.ts`'s subject.
const workerStops: { name: string; stopped: boolean }[] = [];
const commandEffects: RunServeCommandOptional = {
  registerPluginSdkResolver: () => {},
  createServingApp: (...args) => {
    const serving = createServingApp(...args);
    const outbox = { name: "outboxDrainer", stopped: false };
    const trash = { name: "trashSweeper", stopped: false };
    const formPull = { name: "formPullTrigger", stopped: false };
    const webhooks = { name: "webhookDeliveryWorker", stopped: false };
    workerStops.push(outbox, trash, formPull, webhooks);
    return { ...serving,
      outboxDrainer: { ...serving.outboxDrainer, stop: async () => {
        await serving.outboxDrainer.stop();
        outbox.stopped = true;
      } },
      trashSweeper: { ...serving.trashSweeper, stop: async (...stopArgs: Parameters<typeof serving.trashSweeper.stop>) => {
        await serving.trashSweeper.stop(...stopArgs);
        trash.stopped = true;
      } },
      formPullTrigger: { stop: async () => {
        await serving.formPullTrigger.stop();
        formPull.stopped = true;
      } },
      webhookDeliveryWorker: { ...serving.webhookDeliveryWorker, stop: async () => {
        await serving.webhookDeliveryWorker.stop();
        webhooks.stopped = true;
      } },
    };
  },
};

/**
 * @file `tovu serve` and `tovu export` on a PGlite site close what `bootSiteDir` opened when a later
 * step fails: a bad `--host`, a composition failure, `EADDRINUSE` (serve), a composition failure
 * (export). Proven by the next owner opening the data dir: a store left open keeps its owner lock,
 * and the next open would refuse with `PgliteOwnerLockedError`.
 *
 * In-process, never a spawned `tovu serve`: every case fails before the listener is bound, so no
 * agent daemon is ever started. The composition failure is real: the deny-store table is dropped,
 * so `publishTrustRevocationStoreFor`'s probe rejects after the store opened.
 */

let parent: string;
let socketDir: string;
const savedEnv = { socket: process.env[PG_SOCKET_ENV], siteDir: process.env.TOVU_SITE_DIR };

before(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "serve-export-teardown-"));
  socketDir = fs.mkdtempSync("/tmp/set-");
  process.env[PG_SOCKET_ENV] = path.join(socketDir, ".s.PGSQL.5432");
});

after(() => {
  for (const [key, value] of [
    [PG_SOCKET_ENV, savedEnv.socket],
    ["TOVU_SITE_DIR", savedEnv.siteDir],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // A boot's fire-and-forget seeding can still be writing into the site dir: retried removal.
  removeFixtureTree(parent);
  fs.rmSync(socketDir, { recursive: true, force: true });
});

let siteCount = 0;

async function pgliteSite(options: { brokenComposition?: boolean } = {}): Promise<string> {
  const dir = path.join(parent, `site-${++siteCount}`);
  await initSite({ dir, name: `Teardown ${siteCount}`, storage: { kind: "pglite" } });
  if (options.brokenComposition === true) {
    const store = await openOwner(dir);
    await store.content.execute(sql`DROP TABLE publish_trust_revocations`);
    await store.close();
  }
  return dir;
}

function openOwner(dir: string) {
  return openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
}

/** The data dir's owner lock is free: a new owner opens it (and closes again). */
async function assertOwnerReleased(dir: string): Promise<void> {
  const next = await openOwner(dir);
  await next.close();
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test("export: a composition failure after the boot closes the store", async () => {
  const dir = await pgliteSite({ brokenComposition: true });
  await assert.rejects(runExportCommand({ dir, out: path.join(parent, "export-out") }, commandEffects), /publish_trust_revocations/);
  await assertOwnerReleased(dir);
});

test("serve: an invalid --host after the boot closes the store", async () => {
  const dir = await pgliteSite();
  await assert.rejects(runServeCommand({ dir, port: String(await freePort()), host: "not-an-ip" }, commandEffects), ValidationError);
  await assertOwnerReleased(dir);
});

test("serve: a composition failure after the boot closes the store", async () => {
  const dir = await pgliteSite({ brokenComposition: true });
  await assert.rejects(runServeCommand({ dir, port: String(await freePort()), host: "127.0.0.1" }, commandEffects), /publish_trust_revocations/);
  await assertOwnerReleased(dir);
});

test("serve: EADDRINUSE stops the started workers and closes the store", async () => {
  workerStops.length = 0;
  const dir = await pgliteSite();
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const { port } = blocker.address() as net.AddressInfo;
  try {
    await assert.rejects(runServeCommand({ dir, port: String(port), host: "127.0.0.1" }, commandEffects), PortInUseError);
    assert.deepEqual(workerStops, [
      { name: "outboxDrainer", stopped: true },
      { name: "trashSweeper", stopped: true },
      { name: "formPullTrigger", stopped: true },
      // e246de16: the webhook delivery loop started by `createServingApp` is stopped like the rest.
      { name: "webhookDeliveryWorker", stopped: true },
    ]);
    await assertOwnerReleased(dir);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

/** Sets (or, for `undefined`, deletes) env vars for one test and restores them afterwards. */
function withEnv(t: { after(fn: () => void): void }, vars: Record<string, string | undefined>): void {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("serve: an invalid --port (non-integer or outside 1..65535) after the boot is VALIDATION and closes the store", async () => {
  const dir = await pgliteSite();
  for (const [port, message] of [
    ["abc", '--port must be an integer between 1 and 65535 (got "abc")'],
    ["0", "--port must be between 1 and 65535 (got 0)"],
    ["65536", "--port must be between 1 and 65535 (got 65536)"],
  ] as const) {
    await assert.rejects(runServeCommand({ dir, port, host: "127.0.0.1" }, commandEffects), (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, message);
      return true;
    });
    await assertOwnerReleased(dir);
  }
});

test("serve: with no --port, a present-but-invalid config.json port is VALIDATION, never a fall-through to PORT", async (t) => {
  withEnv(t, { PORT: "4321" });
  const dir = await pgliteSite();
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(configPath, "utf8")), port: 0 }));
  await assert.rejects(runServeCommand({ dir, host: "127.0.0.1" }, commandEffects), (error: unknown) => {
    assert.ok(error instanceof ValidationError);
    assert.equal(error.message, "--port must be between 1 and 65535 (got 0)");
    return true;
  });
  await assertOwnerReleased(dir);
});

test("serve: with no --port and no config.json port, a present-but-invalid PORT env is VALIDATION", async (t) => {
  withEnv(t, { PORT: " 80a " });
  const dir = await pgliteSite();
  await assert.rejects(runServeCommand({ dir, host: "127.0.0.1" }, commandEffects), (error: unknown) => {
    assert.ok(error instanceof ValidationError);
    assert.equal(error.message, '--port must be an integer between 1 and 65535 (got " 80a ")');
    return true;
  });
  await assertOwnerReleased(dir);
});

test("serve: a dir argument logs that TOVU_CONTENT_DB and TOVU_DB are ignored (BR-04/EC-08)", async (t) => {
  withEnv(t, { TOVU_CONTENT_DB: path.join(parent, "ignored-content.db"), TOVU_DB: path.join(parent, "ignored.db") });
  const dir = await pgliteSite();
  const stderr: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  t.mock.method(process.stderr, "write", (chunk: string | Uint8Array, ...rest: unknown[]) => {
    stderr.push(String(chunk));
    return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
  });
  // A bad port ends the run right after the boot, so no listener is ever bound.
  await assert.rejects(runServeCommand({ dir, port: "abc", host: "127.0.0.1" }, commandEffects), ValidationError);
  assert.ok(stderr.includes("tovu: warning: TOVU_CONTENT_DB is ignored when a dir argument is given\n"));
  assert.ok(stderr.includes("tovu: warning: TOVU_DB is ignored when a dir argument is given\n"));
  await assertOwnerReleased(dir);
});

test("serve: a dir bootSiteDir refuses releases the running-site claim before the error propagates", async () => {
  const dir = path.join(parent, `not-a-site-${++siteCount}`);
  fs.mkdirSync(dir, { recursive: true });
  await assert.rejects(runServeCommand({ dir, port: String(await freePort()), host: "127.0.0.1" }, commandEffects), SiteDirInvalidError);
  // A claim still held would refuse here with "Running in Web (...)".
  const lease = claimSiteRunning({ dir, app: "Web" });
  lease.release();
});
