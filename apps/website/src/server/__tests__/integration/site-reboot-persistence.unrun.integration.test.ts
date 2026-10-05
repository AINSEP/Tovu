// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createApp } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME, type SiteStore } from "#src/server/runtime/composition/open-site-store";
import { defaultPgliteSocketDir, OWNER_LOCK_FILE, PGLITE_SOCKET_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { loginAsOwner } from "../helpers/http-test-server.js";
import { drainBootReadiness, expectJson, send, SITE_DIALECTS, type SiteDialect } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap 4 (rest) of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the site process
 * lifecycle `tovu serve <dir>` goes through: boot, write over HTTP, shut down, boot the SAME folder
 * again, read it back.
 *
 * `bootSite` (unrun-site-boot.ts) deletes its folder at teardown, so this file runs its own two-boot
 * sequence over one folder, with the same `createSiteRouteDeps` overrides `serve.ts` passes. The
 * PGlite owner leaves a pid lock in its data dir and a Unix socket in its socket dir; a crash leaves
 * both behind. `create-site-route-deps.pglite.integration.test.ts` and the CLI serve teardown tests
 * cover lock release and a second LIVE owner; nothing covers a crashed owner's leftovers being
 * reaped by the next boot, or HTTP-written rows surviving a full re-boot.
 *
 * Two PGlite boots in one test: `bootSite` saves and restores `TOVU_PG_SOCKET` per boot, which leaks
 * when two such boots interleave. This file never calls `bootSite`; it sets the variable ONCE to the
 * one socket path both boots derive from the same data dir, and restores it once at the end.
 */

interface Running {
  baseUrl: string;
  cookie: string;
  ws: string;
  /** Closes the HTTP server, drains boot readiness and closes the store the way `serve.ts` does. */
  stop: () => Promise<void>;
}

async function listen(server: Server): Promise<string> {
  server.listen(0);
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** One `tovu serve <siteDir>` boot, logged in as the seeded owner. */
async function serve(siteDir: string): Promise<Running> {
  const boot = await bootSiteDir({ dir: siteDir });
  let composed: SiteStore | undefined;
  const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    db: boot.db,
    store: boot.store,
    workspaceId: boot.workspaceId,
    onStoreOpened: (store) => (composed = store),
    uploadsDir: path.join(siteDir, "uploads"),
    themesDir: path.join(siteDir, "themes"),
    siteBinding: { dir: siteDir, name: path.basename(siteDir), dirOverridden: true, switcherCompatible: false },
  });
  await drainBootReadiness(deps);
  const server = createServer(createApp(deps));
  const baseUrl = await listen(server);
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await drainBootReadiness(deps).catch(() => undefined);
    await closeSiteDirBoot(boot, composed);
  };
  try {
    return { baseUrl, cookie: await loginAsOwner(baseUrl), ws: `/api/admin/v1/workspaces/${deps.workspaceId}`, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}

/** A fresh site folder of `dialect`, removed (with its socket dir) at teardown. */
async function freshSite(t: TestContext, dialect: SiteDialect): Promise<{ siteDir: string; dataDir: string; socketPath: string }> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `unrun-reboot-${dialect}-`));
  const siteDir = path.join(parent, "site");
  const dataDir = path.join(siteDir, PGLITE_DATA_DIR_NAME);
  const socketDir = defaultPgliteSocketDir(dataDir);
  const savedSocketEnv = process.env[PG_SOCKET_ENV];
  if (dialect === "pglite") process.env[PG_SOCKET_ENV] = path.join(socketDir, PGLITE_SOCKET_FILE);
  t.after(() => {
    if (savedSocketEnv === undefined) delete process.env[PG_SOCKET_ENV];
    else process.env[PG_SOCKET_ENV] = savedSocketEnv;
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  });
  await initSite({ dir: siteDir, name: `Unrun reboot ${dialect}`, storage: { kind: dialect } });
  return { siteDir, dataDir, socketPath: path.join(socketDir, PGLITE_SOCKET_FILE) };
}

interface PostDto {
  id: string;
  title: string;
  slug: string;
  status: string;
  version: number;
}

/** A pid that existed a moment ago and has exited — what a crashed owner leaves in its lock. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", ""]);
  assert.equal(typeof child.pid, "number");
  return child.pid as number;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] site reboot [${dialect}]: a post and an update written over HTTP survive a full shutdown and re-boot of the same folder`, async (t) => {
    const { siteDir } = await freshSite(t, dialect);

    const first = await serve(siteDir);
    t.after(first.stop);
    const created = (await expectJson<{ post: PostDto }>(await send(first, "POST", `${first.ws}/posts`, { title: "Survives", slug: "survives", status: "published" }), 201)).post;
    const updated = (
      await expectJson<{ post: PostDto }>(await send(first, "PUT", `${first.ws}/posts/${created.id}`, { title: "Survives a reboot", slug: "survives", expectedVersion: created.version }), 200)
    ).post;
    await first.stop();

    const second = await serve(siteDir);
    t.after(second.stop);
    assert.equal(second.ws, first.ws, "the same workspace resolves on the second boot");
    const reread = (await expectJson<{ post: PostDto }>(await send(second, "GET", `${second.ws}/posts/${created.id}`), 200)).post;
    assert.deepEqual(
      { id: reread.id, title: reread.title, slug: reread.slug, status: reread.status, version: reread.version },
      { id: created.id, title: "Survives a reboot", slug: "survives", status: "published", version: updated.version }
    );
  });
}

test("[unrun] site reboot [pglite]: a clean shutdown releases the owner lock and socket; a crashed owner's stale pid lock and socket are reaped by the next boot", async (t) => {
  const { siteDir, dataDir, socketPath } = await freshSite(t, "pglite");
  const lockPath = path.join(dataDir, OWNER_LOCK_FILE);

  const first = await serve(siteDir);
  t.after(first.stop);
  assert.equal(fs.readFileSync(lockPath, "utf8"), `${process.pid}\n`, "the running owner holds the lock with this pid");
  assert.equal(fs.statSync(socketPath).isSocket(), true);
  const created = (await expectJson<{ post: PostDto }>(await send(first, "POST", `${first.ws}/posts`, { title: "Before the crash", slug: "before-the-crash" }), 201)).post;
  await first.stop();
  assert.equal(fs.existsSync(lockPath), false, "a clean shutdown removes the pid lock");
  assert.equal(fs.existsSync(socketPath), false, "a clean shutdown removes the socket");

  // What a SIGKILLed owner leaves: its pid in the lock, and a dead socket path (a plain file here).
  const stalePid = deadPid();
  fs.writeFileSync(lockPath, `${stalePid}\n`, { mode: 0o600 });
  fs.writeFileSync(socketPath, "stale", { mode: 0o600 });

  const second = await serve(siteDir);
  t.after(second.stop);
  assert.equal(fs.readFileSync(lockPath, "utf8"), `${process.pid}\n`, "the stale lock was replaced by this owner's");
  assert.equal(fs.statSync(socketPath).isSocket(), true, "the stale file at the socket path was replaced by a live socket");
  assert.deepEqual(
    fs.readdirSync(dataDir).filter((name) => name.startsWith(`${OWNER_LOCK_FILE}.`)),
    [],
    "no aside/temp lock files are left in the data dir"
  );
  const reread = (await expectJson<{ post: PostDto }>(await send(second, "GET", `${second.ws}/posts/${created.id}`), 200)).post;
  assert.equal(reread.title, "Before the crash");
});
