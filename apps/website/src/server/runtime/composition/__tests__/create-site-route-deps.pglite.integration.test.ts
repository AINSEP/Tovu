import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { sql } from "kysely";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { createApp } from "#src/server/runtime/composition/app";

import { PgliteOwnerLockedError } from "#src/platform/db/kernel/drivers/pglite-owner";
import { bootSiteDir, closeSiteDirBoot, type BootSiteDirResult } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { SITE_META_FILENAME } from "#src/platform/site-dir/site-storage";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { openSiteStore, PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME, type SiteStore } from "../open-site-store.js";

/**
 * @file R1f part 2: a site whose `.site-meta.json` says `storage: pglite` boots the real composition.
 * The API process is the OWNER: it opens `<site>/pglite/` and serves it on a private socket; its own
 * queries go through that socket. The agent daemon is a CLIENT in another process: it never opens
 * the data dir, it connects to the owner's socket and sees the API's writes.
 *
 * Booted the `tovu serve <dir>` way: `bootSiteDir` opens the store (owner), `createSiteRouteDeps`
 * runs on it (`overrides.store`), `closeSiteDirBoot` stops serving. The socket lives in a short temp
 * dir named by `TOVU_PG_SOCKET` (what the daemon supervisor passes).
 */

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_NAME = "PGlite Composition Site";

let parent: string;
let siteDir: string;
let socketDir: string;
let socketPath: string;
const savedSocketEnv = process.env[PG_SOCKET_ENV];

before(async () => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "r1f-pglite-site-"));
  siteDir = path.join(parent, "site");
  await initSite({ dir: siteDir, name: SITE_NAME });
  const metaPath = path.join(siteDir, SITE_META_FILENAME);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(metaPath, JSON.stringify({ ...meta, storage: { kind: "pglite" } }, null, 2));
  for (const name of ["content.db", "content.db-wal", "content.db-shm", "chat.db"]) fs.rmSync(path.join(siteDir, name), { force: true });
  socketDir = fs.mkdtempSync("/tmp/r1f-");
  socketPath = path.join(socketDir, ".s.PGSQL.5432");
  process.env[PG_SOCKET_ENV] = socketPath;
});

after(() => {
  if (savedSocketEnv === undefined) delete process.env[PG_SOCKET_ENV];
  else process.env[PG_SOCKET_ENV] = savedSocketEnv;
  fs.rmSync(parent, { recursive: true, force: true });
  fs.rmSync(socketDir, { recursive: true, force: true });
});

async function drainBootReadiness(deps: NewsletterRouteDeps): Promise<void> {
  await Promise.all([
    deps.identityReady,
    deps.settingsReady,
    deps.seoReady,
    deps.commentsReady,
    deps.commentsSettingsReady,
    deps.executionSettingsReady,
    deps.settingsUiTabsReady,
    deps.analyticsSettingsReady,
    deps.siteTitleReady,
  ]);
}

/** The API process (store owner), booted as `tovu serve <dir>` does. */
async function bootOwner(t: TestContext): Promise<{ deps: NewsletterRouteDeps; boot: BootSiteDirResult }> {
  const boot = await bootSiteDir({ dir: siteDir });
  const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    store: boot.store,
    workspaceId: boot.workspaceId,
    uploadsDir: path.join(siteDir, "uploads"),
    themesDir: path.join(siteDir, "themes"),
    siteBinding: { dir: siteDir, name: SITE_NAME, dirOverridden: true, switcherCompatible: false },
  });
  t.after(async () => {
    await drainBootReadiness(deps).catch(() => undefined);
    await closeSiteDirBoot(boot).catch(() => undefined); // idempotent: the test may have stopped it already
  });
  await drainBootReadiness(deps);
  return { deps, boot };
}

/**
 * A client store in ANOTHER process (the agent daemon's position): prints the post titles and AI
 * chat ids it reads through the owner's socket. `execFile` (async) keeps this process's event loop
 * — which runs the owner's socket server — free while the child talks to it.
 */
async function readAsClientProcess(): Promise<{ titles: string[]; chats: string[]; dataDirOpened: boolean }> {
  const script = path.join(parent, "client-probe.mts");
  fs.writeFileSync(
    script,
    `import { openSiteStore } from ${JSON.stringify(path.join(HERE, "..", "open-site-store.ts"))};
const siteDir = ${JSON.stringify(siteDir)};
const store = await openSiteStore({ storage: { kind: "pglite" }, dbPath: siteDir + "/content.db", chatDbPath: siteDir + "/chat.db", role: "client" }, { pgliteClientWaitMs: 5000 });
const titles = (await store.content.run((db) => db.selectFrom("posts").select("title").execute())).map((r) => r.title);
const chats = (await store.chat.run((db) => db.selectFrom("ai_chats").select("id").execute())).map((r) => r.id);
await store.close();
console.log(JSON.stringify({ titles, chats, dataDirOpened: false }));
`
  );
  const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", script], {
    env: { ...process.env, [PG_SOCKET_ENV]: socketPath },
    cwd: path.resolve(HERE, "../../../../../../.."),
    timeout: 90_000,
  });
  return JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
}

test("owner boot: PGlite data dir in the site folder, no SQLite store, routes read and write, chat lands in ai_chat", async (t) => {
  const { deps, boot } = await bootOwner(t);
  assert.equal(boot.storage.kind, "pglite");
  assert.equal(deps.contentKernel, boot.store?.content, "the composition runs on the booted store");
  assert.ok(fs.existsSync(path.join(siteDir, PGLITE_DATA_DIR_NAME)), "the data dir is <site>/pglite");
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), false, "no content.db");
  assert.equal(fs.existsSync(path.join(siteDir, "chat.db")), false, "no chat.db");
  assert.ok(fs.existsSync(socketPath), "the owner serves the socket TOVU_PG_SOCKET names");

  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const ws = `/api/admin/v1/workspaces/${deps.workspaceId}`;
  const created = await fetch(`${baseUrl}${ws}/posts`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Written by the owner", status: "draft" }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const listed = (await (await fetch(`${baseUrl}${ws}/posts`, { headers: { cookie } })).json()) as { posts: Array<{ post: { title: string } }> };
  assert.ok(listed.posts.some((p) => p.post.title === "Written by the owner"));

  const chat = await fetch(`${baseUrl}/api/assistant/chats`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ firstMessage: "hello from pglite" }),
  });
  assert.equal(chat.status, 201, await chat.clone().text());
  const { conversation } = (await chat.json()) as { conversation: { id: string } };
  const kernel = deps.contentKernel;
  assert.ok(kernel);
  const inAiChat = await kernel.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ai_chat.ai_chats WHERE id = ${conversation.id}`);
  assert.equal(inAiChat[0]?.n, 1, "the conversation is in ai_chat");
  const inPublic = await kernel.query<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ai_chat%'`
  );
  assert.equal(inPublic[0]?.n, 0, "no chat table in public");

  // The agent daemon's position: another process, a client of the owner's socket.
  const seen = await readAsClientProcess();
  assert.ok(seen.titles.includes("Written by the owner"), `the client process sees the owner's write: ${JSON.stringify(seen.titles)}`);
  assert.ok(seen.chats.includes(conversation.id), "the client process sees the owner's chat");

  // A second owner for the same data dir is refused while this one serves.
  await assert.rejects(
    openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(siteDir, "content.db"), chatDbPath: path.join(siteDir, "chat.db"), role: "owner" }),
    PgliteOwnerLockedError
  );

  // Stopping the owner stops serving and releases the data dir.
  await drainBootReadiness(deps);
  await closeSiteDirBoot(boot);
  assert.equal(fs.existsSync(socketPath), false, "the stopped owner no longer serves");
  const store = await openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(siteDir, "content.db"), chatDbPath: path.join(siteDir, "chat.db"), role: "owner" });
  assert.ok(fs.existsSync(socketPath), "a new owner serves again");
  await store.close();
  assert.equal(fs.existsSync(socketPath), false, "closing the store stops serving");
});

test("a daemon composition started before the owner serves waits for the socket, then connects and sees the owner's rows", async () => {
  const dbPath = path.join(siteDir, "content.db");
  // The agent daemon's composition (`createAgentDaemonRouteDeps` → role "client"), socket from TOVU_PG_SOCKET.
  let clientStore: SiteStore | undefined;
  const clientDeps = createSiteRouteDeps(dbPath, { storeRole: "client", onStoreOpened: (store) => (clientStore = store) });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(clientStore, undefined, "the client is still waiting: nobody serves the socket yet");

  const owner = await openSiteStore({ storage: { kind: "pglite" }, dbPath, chatDbPath: path.join(siteDir, "chat.db"), role: "owner" });
  try {
    await owner.content.run((db) =>
      db.updateTable("posts").set({ title: "Renamed while the daemon waited" }).where("title", "=", "Written by the owner").execute()
    );
    const deps = await clientDeps;
    try {
      assert.ok(clientStore, "the daemon's store opened once the owner served");
      assert.equal(clientStore.pgliteSocketPath, socketPath, "the client used the socket TOVU_PG_SOCKET names");
      const titles = (await clientStore.content.run((db) => db.selectFrom("posts").select("title").execute())).map((r) => r.title);
      assert.ok(titles.includes("Renamed while the daemon waited"), JSON.stringify(titles));
    } finally {
      await drainBootReadiness(deps).catch(() => undefined);
      await clientStore?.close();
    }
  } finally {
    await owner.close();
  }
});
