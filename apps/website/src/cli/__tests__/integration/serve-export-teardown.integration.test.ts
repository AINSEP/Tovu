import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, mock, test } from "node:test";

import { sql } from "kysely";

import { ValidationError } from "#src/platform/site-dir/index";
import { initSite } from "#src/platform/site-dir/init-site";
import { openSiteStore, PG_SOCKET_ENV } from "#src/server/runtime/composition/open-site-store";
import { PortInUseError } from "../../errors.js";
import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";

// `registerPluginSdkResolver` refuses a second call per process, and every case here runs a command
// in this one process: the resolver itself is `*-plugin-sdk-resolver.integration.test.ts`'s subject.
const realResolver = await import("#src/server/runtime/boot/plugin-sdk-resolver");
mock.module(new URL("../../../server/runtime/boot/plugin-sdk-resolver.ts", import.meta.url).href, {
  namedExports: { ...realResolver, registerPluginSdkResolver: () => {} },
});
const realServing = await import("#src/server/runtime/composition/serving-app");
const workerStops: { name: string; stopped: boolean }[] = [];
mock.module(new URL("../../../server/runtime/composition/serving-app.ts", import.meta.url).href, {
  namedExports: {
    ...realServing,
    createServingApp: (...args: Parameters<typeof realServing.createServingApp>) => {
      const serving = realServing.createServingApp(...args);
      for (const name of ["outboxDrainer", "trashSweeper"] as const) {
        const worker = serving[name];
        const stop = worker.stop.bind(worker);
        const witness = { name, stopped: false };
        workerStops.push(witness);
        mock.method(worker, "stop", async () => {
          await stop({});
          witness.stopped = true;
        });
      }
      return serving;
    },
  },
});
const { runExportCommand } = await import("../../commands/export.js");
const { runServeCommand } = await import("../../commands/serve.js");

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
  await assert.rejects(runExportCommand({ dir, out: path.join(parent, "export-out") }), /publish_trust_revocations/);
  await assertOwnerReleased(dir);
});

test("serve: an invalid --host after the boot closes the store", async () => {
  const dir = await pgliteSite();
  await assert.rejects(runServeCommand({ dir, port: String(await freePort()), host: "not-an-ip" }), ValidationError);
  await assertOwnerReleased(dir);
});

test("serve: a composition failure after the boot closes the store", async () => {
  const dir = await pgliteSite({ brokenComposition: true });
  await assert.rejects(runServeCommand({ dir, port: String(await freePort()), host: "127.0.0.1" }), /publish_trust_revocations/);
  await assertOwnerReleased(dir);
});

test("serve: EADDRINUSE stops the started workers and closes the store", async () => {
  workerStops.length = 0;
  const dir = await pgliteSite();
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const { port } = blocker.address() as net.AddressInfo;
  try {
    await assert.rejects(runServeCommand({ dir, port: String(port), host: "127.0.0.1" }), PortInUseError);
    assert.deepEqual(workerStops, [
      { name: "outboxDrainer", stopped: true },
      { name: "trashSweeper", stopped: true },
    ]);
    await assertOwnerReleased(dir);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});
