import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { type RawBuilder, sql } from "kysely";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { createApp } from "#src/server/runtime/composition/app";

import { defaultPgliteSocketDir, PGLITE_SOCKET_FILE, PgliteOwnerLockedError } from "#src/platform/db/kernel/drivers/pglite-owner";
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
 * runs on it (`overrides.store`), `closeSiteDirBoot` stops serving. The owner serves the socket derived
 * from its data dir; clients read it from `TOVU_PG_SOCKET` (what the daemon supervisor passes).
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
  socketDir = defaultPgliteSocketDir(path.join(siteDir, PGLITE_DATA_DIR_NAME));
  socketPath = path.join(socketDir, PGLITE_SOCKET_FILE);
  process.env[PG_SOCKET_ENV] = socketPath;
  // `tovu init --storage pglite`: the data dir at head with the starter template, store closed.
  await initSite({ dir: siteDir, name: SITE_NAME, storage: { kind: "pglite" } });
  const meta = JSON.parse(fs.readFileSync(path.join(siteDir, SITE_META_FILENAME), "utf8")) as Record<string, unknown>;
  assert.deepEqual(meta.storage, { kind: "pglite" });
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

interface DaemonView {
  titles: string[];
  pages: string[];
  media: string[];
  taxonomies: string[];
  chats: string[];
  transport: string;
}

/**
 * The agent daemon's composition in ANOTHER process — `createAgentDaemonRouteDeps` (role client),
 * bound to the API's workspace, socket from `TOVU_PG_SOCKET` as the daemon supervisor passes it —
 * printing what it reads through the owner's socket. `execFile` (async) keeps this process's event
 * loop, which runs the owner's socket server, free while the child talks to it.
 */
async function readAsDaemonProcess(workspaceId: string): Promise<DaemonView> {
  const script = path.join(parent, "daemon-probe.mts");
  fs.writeFileSync(
    script,
    `import { createAgentDaemonRouteDeps } from ${JSON.stringify(path.join(HERE, "..", "agent-daemon-deps.ts"))};
const deps = await createAgentDaemonRouteDeps({ env: process.env }, { dbPath: ${JSON.stringify(path.join(siteDir, "content.db"))} });
await Promise.all([deps.identityReady, deps.settingsReady, deps.seoReady, deps.commentsReady, deps.commentsSettingsReady,
  deps.executionSettingsReady, deps.settingsUiTabsReady, deps.analyticsSettingsReady, deps.siteTitleReady]);
const k = deps.contentKernel;
const col = async (build, name) => (await k.run((db) => build(db).execute())).map((r) => r[name]);
const view = {
  titles: await col((db) => db.selectFrom("posts").select("title").where("kind", "=", "post"), "title"),
  pages: await col((db) => db.selectFrom("posts").select("title").where("kind", "=", "page"), "title"),
  media: await col((db) => db.selectFrom("media").select("id"), "id"),
  taxonomies: await col((db) => db.selectFrom("taxonomies").select("name"), "name"),
  chats: await col((db) => db.withSchema("ai_chat").selectFrom("ai_chats").select("id"), "id"),
  transport: k.transport,
};
console.log(JSON.stringify(view));
process.exit(0);
`
  );
  const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", script], {
    env: { ...process.env, [PG_SOCKET_ENV]: socketPath, TOVU_WORKSPACE: workspaceId },
    cwd: path.resolve(HERE, "../../../../../../.."),
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as DaemonView;
}

async function send(baseUrl: string, cookie: string, method: string, route: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json<T>(res: Response, status: number): Promise<T> {
  const text = await res.text();
  assert.equal(res.status, status, text);
  return (text === "" ? undefined : JSON.parse(text)) as T;
}

test("owner boot: PGlite data dir in the site folder, no SQLite store, routes read and write, chat lands in ai_chat", async (t) => {
  const { deps, boot } = await bootOwner(t);
  assert.equal(boot.storage.kind, "pglite");
  assert.equal(deps.contentKernel, boot.store?.content, "the composition runs on the booted store");
  assert.ok(fs.existsSync(path.join(siteDir, PGLITE_DATA_DIR_NAME)), "the data dir is <site>/pglite");
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), false, "no content.db");
  assert.equal(fs.existsSync(path.join(siteDir, "chat.db")), false, "no chat.db");
  assert.ok(fs.existsSync(socketPath), "the owner serves the socket derived from its data dir");

  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const ws = `/api/admin/v1/workspaces/${deps.workspaceId}`;
  const kernel = deps.contentKernel;
  assert.ok(kernel);
  assert.equal(kernel.transport, "pglite-socket", "the API's own queries go through the socket");
  const scalar = async (q: RawBuilder<{ n: number }>): Promise<number> => Number((await kernel.query<{ n: number }>(q))[0]?.n);

  // Posts: create → list → delete (to the Trash).
  const { post } = await json<{ post: { id: string } }>(await send(baseUrl, cookie, "POST", `${ws}/posts`, { title: "Written by the owner", status: "draft" }), 201);
  const listed = await json<{ posts: Array<{ post: { id: string; title: string } }> }>(await send(baseUrl, cookie, "GET", `${ws}/posts`), 200);
  assert.ok(listed.posts.some((p) => p.post.title === "Written by the owner"));
  const { post: doomed } = await json<{ post: { id: string } }>(await send(baseUrl, cookie, "POST", `${ws}/posts`, { title: "To the Trash", status: "draft" }), 201);
  assert.equal((await send(baseUrl, cookie, "DELETE", `${ws}/posts/${doomed.id}`)).status, 200, "post delete");
  const trash = await json<{ items: Array<{ entityId: string }> }>(await send(baseUrl, cookie, "GET", `${ws}/trash`), 200);
  assert.ok(trash.items.some((i) => i.entityId === doomed.id), "the deleted post is in the Trash");

  // Pages.
  const { post: page } = await json<{ post: { id: string } }>(await send(baseUrl, cookie, "POST", `${ws}/pages`, { title: "About PGlite" }), 201);
  const pages = await json<{ posts: Array<{ post: { id: string } }> }>(await send(baseUrl, cookie, "GET", `${ws}/pages`), 200);
  assert.ok(pages.posts.some((p) => p.post.id === page.id), "the created page lists");

  // Settings.
  await json(await send(baseUrl, cookie, "GET", `${ws}/settings/effective?namespace=core.presentation`), 200);
  await json(await send(baseUrl, cookie, "GET", `${ws}/settings/definitions?namespace=core.presentation`), 200);

  // Media: upload a 1x1 PNG, then list it.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const { media } = await json<{ media: { id: string } }>(
    await send(baseUrl, cookie, "POST", `${ws}/media`, { filename: "dot.png", contentType: "image/png", dataBase64: png }),
    201
  );
  const mediaList = await json<{ media: Array<{ id: string }> }>(await send(baseUrl, cookie, "GET", `${ws}/media`), 200);
  assert.ok(mediaList.media.some((m) => m.id === media.id), "the uploaded media lists");

  // Taxonomy write → the kernel watermark stamp advances.
  const watermark = sql<{ n: number }>`SELECT value::int AS n FROM database_write_watermark`;
  const before = await scalar(watermark);
  await json(await send(baseUrl, cookie, "POST", "/api/admin/v1/taxonomy", { name: "category", hierarchical: true }), 201);
  assert.equal(await scalar(watermark), before + 1, "the taxonomy write stamped the watermark");
  await json(await send(baseUrl, cookie, "GET", "/api/admin/v1/taxonomy"), 200);

  // Restore points: reported unavailable, minting refused without a crash.
  assert.equal((await deps.dbOps.getCapabilities()).restorePoint.costClass, "unavailable");
  const refused = await send(baseUrl, cookie, "POST", "/api/admin/v1/database/restore-points", { trigger: "manual" });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).code, "RESTORE_POINT_UNAVAILABLE");

  // AI chat: lands in ai_chat.
  const { conversation } = await json<{ conversation: { id: string } }>(
    await send(baseUrl, cookie, "POST", "/api/assistant/chats", { firstMessage: "hello from pglite" }),
    201
  );
  const chats = await json<{ conversations: Array<{ id: string }> }>(await send(baseUrl, cookie, "GET", "/api/assistant/chats"), 200);
  assert.ok(chats.conversations.some((c) => c.id === conversation.id), "the chat lists");
  const inAiChat = await kernel.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ai_chat.ai_chats WHERE id = ${conversation.id}`);
  assert.equal(inAiChat[0]?.n, 1, "the conversation is in ai_chat");
  const inPublic = await kernel.query<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ai_chat%'`
  );
  assert.equal(inPublic[0]?.n, 0, "no chat table in public");

  // The agent daemon: its own composition in another process, a client of the owner's socket.
  const seen = await readAsDaemonProcess(deps.workspaceId);
  assert.equal(seen.transport, "pglite-socket");
  assert.ok(seen.titles.includes("Written by the owner"), `the daemon sees the API's post: ${JSON.stringify(seen.titles)}`);
  assert.ok(seen.pages.includes("About PGlite"), "the daemon sees the API's page");
  assert.ok(seen.media.includes(media.id), "the daemon sees the API's media");
  assert.ok(seen.taxonomies.includes("category"), "the daemon sees the API's taxonomy");
  assert.ok(seen.chats.includes(conversation.id), "the daemon sees the API's chat");
  assert.ok(listed.posts.some((p) => p.post.id === post.id));

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

test("a daemon composition started before the owner serves waits for the socket, then connects and sees the owner's rows", async (t) => {
  const dbPath = path.join(siteDir, "content.db");
  // Own the fixture and stopped-owner state even when this test runs alone.
  const postId = "daemon-startup-post";
  const { deps: seedDeps, boot: seedBoot } = await bootOwner(t);
  assert.ok(seedDeps.contentKernel);
  await seedDeps.contentKernel.query(sql`
    INSERT INTO posts (id, workspace_id, title, slug, body_json, status, updated_at, version)
    VALUES (${postId}, ${seedDeps.workspaceId}, 'Written before daemon startup', 'daemon-startup-post',
            '{"type":"doc","content":[]}', 'draft', '2026-04-06T00:00:00.000Z', 1)
  `);
  await closeSiteDirBoot(seedBoot);
  assert.equal(fs.existsSync(socketPath), false, "this test's seed owner stopped serving before the client starts");

  // The agent daemon's composition (`createAgentDaemonRouteDeps` → role "client"), socket from TOVU_PG_SOCKET.
  const opened: { client?: SiteStore } = {};
  const clientDeps = createSiteRouteDeps(dbPath, { storeRole: "client", onStoreOpened: (store) => (opened.client = store) });
  const openedClient = (): SiteStore | undefined => opened.client;
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(openedClient(), undefined, "the client is still waiting: nobody serves the socket yet");

  const owner = await openSiteStore({ storage: { kind: "pglite" }, dbPath, chatDbPath: path.join(siteDir, "chat.db"), role: "owner" });
  try {
    await owner.content.run((db) =>
      db.updateTable("posts").set({ title: "Renamed while the daemon waited" }).where("id", "=", postId).execute()
    );
    const deps = await clientDeps;
    try {
      const clientStore = openedClient();
      assert.ok(clientStore, "the daemon's store opened once the owner served");
      assert.equal(clientStore.pgliteSocketPath, socketPath, "the client used the socket TOVU_PG_SOCKET names");
      const titles = (await clientStore.content.run((db) => db.selectFrom("posts").select("title").execute())).map((r) => r.title);
      assert.ok(titles.includes("Renamed while the daemon waited"), JSON.stringify(titles));
      const seeded = await clientStore.content.run((db) =>
        db.selectFrom("posts").select(["workspace_id", "title"]).where("id", "=", postId).executeTakeFirstOrThrow()
      );
      assert.deepEqual(seeded, { workspace_id: seedDeps.workspaceId, title: "Renamed while the daemon waited" });
    } finally {
      await drainBootReadiness(deps).catch(() => undefined);
      await openedClient()?.close();
    }
  } finally {
    await owner.close();
  }
});
