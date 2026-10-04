import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test, type TestContext } from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { createApp } from "#src/server/runtime/composition/app";

import { exportSite } from "#src/features/site-export/index";
import { freshPostgresDatabase, psql } from "#src/platform/db/__tests__/postgres-database";
import { CHAT_MIGRATIONS, CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { SITE_META_FILENAME } from "#src/platform/site-dir/site-storage";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { STORAGE_SECRET_FILENAME, writeSealedConnectionString } from "../storage-secret.js";

/**
 * @file R1f part 1: a site whose `.site-meta.json` says `storage: postgres` boots the REAL
 * composition (`createSiteRouteDeps` → `createApp`) on a real Postgres database, and every route
 * family plus every engine-bound service (`pgOnlyServices`) works there — a SQLite-only service left
 * in the body would fail only at request time, so each one is exercised here, not just constructed.
 *
 * One temp database per file (dropped in `after`). The first boot reads the connection string from
 * `secretRef: { env }`; the second boots the same database through the sealed secret
 * (`secretRef: "site"`, `.storage-secret.json` sealed with a test site key) and must migrate nothing.
 */

const DATABASE = "tovu_r1f_create_site_route_deps";
const URL_ENV = "TOVU_R1F_TEST_POSTGRES_URL";
const SITE_NAME = "Postgres Composition Site";

let parent: string;
let siteDir: string;
let connectionString: string;
const savedSiteKey = process.env.TOVU_SITE_KEY;

before(() => {
  connectionString = freshPostgresDatabase(DATABASE);
  process.env[URL_ENV] = connectionString;
  // The sealed-secret boot opens `.storage-secret.json` with the site key; with no `siteKeyId` in
  // the meta file, `TOVU_SITE_KEY` is the first key source (`site-key-sources.ts`).
  process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex");
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "r1f-pg-site-"));
  siteDir = path.join(parent, "site");
  fs.mkdirSync(siteDir);
  fs.mkdirSync(path.join(siteDir, "uploads"));
  fs.mkdirSync(path.join(siteDir, "themes"));
});

after(() => {
  delete process.env[URL_ENV];
  if (savedSiteKey === undefined) delete process.env.TOVU_SITE_KEY;
  else process.env.TOVU_SITE_KEY = savedSiteKey;
  psql("postgres", `DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE);`);
  fs.rmSync(parent, { recursive: true, force: true });
});

function writeStorage(storage: unknown): void {
  fs.writeFileSync(path.join(siteDir, SITE_META_FILENAME), JSON.stringify({ storage }, null, 2));
}

/** One scalar out of the test database. */
function query(sql: string): string {
  const result = psql(DATABASE, sql);
  assert.ok(result.ok, `psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** Every boot-readiness promise `cli/commands/serve.ts` settles before it considers the site up. */
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

/** Boots the composition over the site folder and closes its pool when the test ends. */
async function bootPostgresSite(t: TestContext): Promise<NewsletterRouteDeps> {
  const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    uploadsDir: path.join(siteDir, "uploads"),
    themesDir: path.join(siteDir, "themes"),
    siteBinding: { dir: siteDir, name: SITE_NAME, dirOverridden: true, switcherCompatible: false },
  });
  t.after(async () => {
    await drainBootReadiness(deps).catch(() => undefined);
    await deps.contentKernel?.close();
  });
  await drainBootReadiness(deps);
  return deps;
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

test("Postgres composition boot sequence preserves data across env, sealed-secret and wrong-key boots", async (t) => {
let firstBootLedger = "";

await t.test("first boot (secretRef env): the composition migrates the database and every route family works on it", async (t) => {
  writeStorage({ kind: "postgres", secretRef: { env: URL_ENV } });
  const deps = await bootPostgresSite(t);

  // Nothing SQLite was created for the store: no content.db / chat.db beside the meta file.
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), false, "a postgres site must not create content.db");
  assert.equal(fs.existsSync(path.join(siteDir, "chat.db")), false, "a postgres site must not create chat.db");
  assert.equal(query("SELECT string_agg(id, ',' ORDER BY id) FROM public.tovu_migrations"), CONTENT_MIGRATIONS.map((step) => step.id).join(","), "content history ran to head");
  assert.equal(query("SELECT string_agg(id, ',' ORDER BY id) FROM ai_chat.tovu_chat_migrations"), CHAT_MIGRATIONS.map((step) => step.id).join(","), "chat history ran to head in ai_chat");
  firstBootLedger = query("SELECT string_agg(id || '@' || applied_at, ',' ORDER BY id) FROM public.tovu_migrations") +
    "|" + query("SELECT string_agg(id || '@' || applied_at, ',' ORDER BY id) FROM ai_chat.tovu_chat_migrations");

  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const ws = `/api/admin/v1/workspaces/${deps.workspaceId}`;

  // Posts: create → list → delete (moves it to the Trash) → trash list.
  const { post } = await json<{ post: { id: string } }>(await send(baseUrl, cookie, "POST", `${ws}/posts`, { title: "Hello Postgres", status: "draft" }), 201);
  const posts = await json<{ posts: Array<{ post: { id: string } }> }>(await send(baseUrl, cookie, "GET", `${ws}/posts`), 200);
  assert.ok(posts.posts.some((p) => p.post.id === post.id), "the created post lists");
  assert.ok([200, 204].includes((await send(baseUrl, cookie, "DELETE", `${ws}/posts/${post.id}`)).status), "post delete");
  const trash = await json<{ items: Array<{ entityId: string }> }>(await send(baseUrl, cookie, "GET", `${ws}/trash`), 200);
  assert.ok(trash.items.some((i) => i.entityId === post.id), "the deleted post is in the Trash");
  assert.equal(query(`SELECT count(*) FROM public.trashed_items WHERE entity_id = '${post.id}'`), "1");

  // Pages.
  const { post: page } = await json<{ post: { id: string } }>(await send(baseUrl, cookie, "POST", `${ws}/pages`, { title: "About Postgres" }), 201);
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

  // Taxonomy write → the async kernel watermark stamp (pgOnlyServices) advances the watermark.
  const before = Number(query("SELECT value FROM public.database_write_watermark"));
  await json(await send(baseUrl, cookie, "POST", "/api/admin/v1/taxonomy", { name: "category", hierarchical: true }), 201);
  assert.equal(Number(query("SELECT value FROM public.database_write_watermark")), before + 1, "the taxonomy write stamped the watermark");
  await json(await send(baseUrl, cookie, "GET", "/api/admin/v1/taxonomy"), 200);

  // AI chat: the conversation lands in ai_chat, never in public.
  const chat = await json<{ conversation: { id: string } }>(
    await send(baseUrl, cookie, "POST", "/api/assistant/chats", { firstMessage: "hello from postgres" }),
    201
  );
  const chats = await json<{ conversations: Array<{ id: string }> }>(await send(baseUrl, cookie, "GET", "/api/assistant/chats"), 200);
  assert.ok(chats.conversations.some((c) => c.id === chat.conversation.id), "the chat lists");
  assert.equal(query(`SELECT count(*) FROM ai_chat.ai_chats WHERE id = '${chat.conversation.id}'`), "1");
  assert.equal(query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ai_chat%'"), "0");

  // db-ops: restore points are reported unavailable; minting one is refused without a crash.
  const caps = await deps.dbOps.getCapabilities();
  assert.equal(caps.restorePoint.costClass, "unavailable", "postgres restore points are reported unavailable");
  await json(await send(baseUrl, cookie, "GET", "/api/admin/v1/database/restore-points"), 200);
  const mint = await send(baseUrl, cookie, "POST", "/api/admin/v1/database/restore-points", { trigger: "manual" });
  assert.notEqual(mint.status, 201, "no restore point can be minted on postgres");
  assert.ok(mint.status < 500, `a refused restore point is a client answer, not a crash: ${mint.status} ${await mint.text()}`);

  // Database transfer destination: sealed and saved in this database, read back.
  const description = { host: "db.example.test", port: "5432", database: "copy", user: "copier" };
  const destinations = deps.databaseTransferDestinationStore;
  assert.ok(destinations, "the real composition wires a transfer destination store");
  await destinations.save(deps.workspaceId, {
    connectionString: "postgresql://copier:pw@db.example.test:5432/copy",
    description,
    savedAt: "2026-09-28T00:00:00.000Z",
  });
  const saved = await destinations.get(deps.workspaceId);
  assert.deepEqual(saved?.description, description);
  assert.equal(saved?.connectionString, "postgresql://copier:pw@db.example.test:5432/copy");
  assert.equal(query("SELECT count(*) FROM public.database_transfer_destinations"), "1");

  // Tool-attempt audit sink: appends into agent_tool_attempts.
  await deps.toolAttemptAuditSink.append({
    attemptId: "attempt-r1f-pg-1",
    executionId: null,
    workspaceId: deps.workspaceId,
    runId: "run-r1f-pg-1",
    toolId: "workspace_get",
    principalId: "principal-r1f-pg",
    phase: "completed",
    at: "2026-09-28T00:00:00.000Z",
    detail: null,
  });
  assert.equal(query("SELECT count(*) FROM public.agent_tool_attempts WHERE attempt_id = 'attempt-r1f-pg-1'"), "1");
});

await t.test("second boot (sealed .storage-secret.json): same database, no migration re-runs, data still there", async (t) => {
  assert.ok(firstBootLedger !== "", "runs after the first boot");
  await writeSealedConnectionString({ siteDir, connectionString });
  const secretPath = path.join(siteDir, STORAGE_SECRET_FILENAME);
  assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600, "the sealed secret is owner-only");
  assert.equal(fs.readFileSync(secretPath, "utf8").includes(DATABASE), false, "the file holds no plaintext connection string");
  writeStorage({ kind: "postgres", secretRef: "site" });
  // The env var is gone: this boot can only have come through the sealed file.
  delete process.env[URL_ENV];

  const deps = await bootPostgresSite(t);
  const ledger =
    query("SELECT string_agg(id || '@' || applied_at, ',' ORDER BY id) FROM public.tovu_migrations") +
    "|" + query("SELECT string_agg(id || '@' || applied_at, ',' ORDER BY id) FROM ai_chat.tovu_chat_migrations");
  assert.equal(ledger, firstBootLedger, "the second boot applied nothing");

  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const pages = await json<{ posts: Array<{ post: { title: string } }> }>(
    await send(baseUrl, cookie, "GET", `/api/admin/v1/workspaces/${deps.workspaceId}/pages`),
    200
  );
  assert.ok(pages.posts.some((p) => p.post.title === "About Postgres"), "the first boot's page is still there");

  // The sealed secret never leaves the folder: not served, not in a static export (`tovu export`,
  // static publish and source-control commits all run this exporter).
  const ciphertext = (JSON.parse(fs.readFileSync(secretPath, "utf8")) as { sealed: { ciphertext: string } }).sealed.ciphertext;
  const served = await fetch(`${baseUrl}/${STORAGE_SECRET_FILENAME}`);
  assert.equal((await served.text()).includes(ciphertext), false, "the live site never serves the secret");
  const outputDir = path.join(parent, "export-out");
  const report = await exportSite({ routeDeps: deps, outputDir });
  assert.ok(report.routes.succeeded.length > 0, "the postgres site exported its routes");
  for (const rel of fs.readdirSync(outputDir, { recursive: true }) as string[]) {
    const full = path.join(outputDir, rel);
    if (!fs.statSync(full).isFile()) continue;
    assert.notEqual(path.basename(rel), STORAGE_SECRET_FILENAME, `${rel}: the export holds no secret file`);
    assert.equal(fs.readFileSync(full).includes(ciphertext), false, `${rel}: no exported file carries the sealed secret`);
  }
});

await t.test("a sealed secret that does not open with the site key refuses to boot, naming the file, never the value", async () => {
  writeStorage({ kind: "postgres", secretRef: "site" });
  const key = process.env.TOVU_SITE_KEY;
  process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex");
  try {
    await assert.rejects(
      createSiteRouteDeps(path.join(siteDir, "content.db"), {
        uploadsDir: path.join(siteDir, "uploads"),
        themesDir: path.join(siteDir, "themes"),
        siteBinding: { dir: siteDir, name: SITE_NAME, dirOverridden: true, switcherCompatible: false },
      }),
      (err: Error) => {
        assert.equal(err.name, "StorageSecretError");
        assert.ok(err.message.includes(STORAGE_SECRET_FILENAME), err.message);
        assert.equal(err.message.includes(DATABASE), false, "the error never carries the connection string");
        return true;
      }
    );
  } finally {
    process.env.TOVU_SITE_KEY = key;
  }
});
});
