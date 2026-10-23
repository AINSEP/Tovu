import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createTrashService, type TrashAdapter } from "@jini-ai/cms/trash";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { postRepoFor } from "#src/features/post/repo";
import { SqlPagesHtmlDocumentStore } from "#src/features/pages/html-document-store";
import { createEmailTemplate, getEmailTemplate, listEmailTemplates, EmailTemplateNotFoundError, type EmailTemplateDeps } from "#src/features/email-templates/operations";
import { buildTrashRegistry } from "../registry.js";
import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { moveToTrash } from "../move-to-trash.js";
import { filterVisibleTrashItems, mayActOnEntityType } from "../permissions.js";

/** Chrome Email T3: real Pages storage and the registered Trash lifecycle, including restore. */
const WS = "ws-email-trash";
const AT = "2026-10-22T12:00:00.000Z";
const ACTOR = { principalId: "admin-1", pluginId: null };

/** Build the production registry/adapter wiring over a migrated, disposable SQLite database. */
function harness(_required = {}, _options = {}) {
  const db = openContentDb(":memory:");
  db.$client.prepare("INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(WS, WS, WS, AT);
  const kernel = contentKernel(db);
  const clock = createFakeClock({ startIso: AT });
  const postRepo = postRepoFor(kernel);
  let sequence = 0;
  const deps: EmailTemplateDeps = {
    workspaceId: WS, clock, postRepo, idGen: { newId: () => `template-${++sequence}` },
    pagesHtmlStore: (scope, options = {}) => new SqlPagesHtmlDocumentStore(scope, { ...options, kernel, clock, revisions: postRepo }),
  };
  const registry = buildTrashRegistry();
  const trashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>([...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb })]));
  const transaction = createContentDbTransactionRunner(kernel);
  const trash = createTrashService({
    repo: new SqliteTrashRepo(kernel), adapters, idGen: { newId: () => `trash-${++sequence}` },
    transaction: ({ work }) => transaction(work), entityPolicy: ({ entityType }) => adapters.has(entityType),
  });
  const granted = new Set(["pages.edit_html"]);
  const authorize = async ({ permission }: { permission: string }) => ({ allowed: granted.has(permission), reason: "test grant" });
  const routeDeps = { registry, trash, db: trashDb, authorize, clock };
  const move = ({ id, workspaceId = WS }: { id: string; workspaceId?: string }, _optional = {}) => moveToTrash({ workspaceId, entityType: "email-template", entityId: id, actor: ACTOR }, routeDeps);
  return { db, deps, routeDeps, trash, granted, move };
}

test("template moves out of Email, appears in Trash, and restores its HTML, title and revision history", async (t) => {
  const h = harness();
  t.after(() => h.db.$client.close());
  const template = await createEmailTemplate({ deps: h.deps, input: { name: "Welcome", html: "<title>Hello</title><p>Keep this HTML</p>" }, actorId: ACTOR.principalId });
  const revisions = await h.deps.postRepo.listRevisions({ workspaceId: WS, postId: template.id });
  assert.deepEqual(await h.move({ id: template.id }), { ok: true, version: template.version + 1 });
  assert.deepEqual((await listEmailTemplates({ deps: h.deps })).templates, []);
  await assert.rejects(getEmailTemplate({ deps: h.deps, id: template.id }), EmailTemplateNotFoundError);
  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]!.entityType, "email-template");
  assert.equal(page.items[0]!.displayTitle, template.name);
  assert.equal((await filterVisibleTrashItems(h.routeDeps, { principalId: ACTOR.principalId, items: page.items })).length, 1);
  h.granted.clear();
  assert.deepEqual(await filterVisibleTrashItems(h.routeDeps, { principalId: ACTOR.principalId, items: page.items }), []);
  assert.equal((await mayActOnEntityType(h.routeDeps, { principalId: ACTOR.principalId, entityType: "email-template" })).allowed, false);
  h.granted.add("pages.edit_html");
  assert.equal(await h.trash.restore({ workspaceId: WS, entityType: "email-template", entityId: template.id, at: AT }), "restored");
  const restored = await getEmailTemplate({ deps: h.deps, id: template.id });
  assert.equal(restored.html, template.html);
  assert.equal(restored.name, template.name);
  assert.equal(restored.version, template.version + 2);
  assert.deepEqual(await h.deps.postRepo.listRevisions({ workspaceId: WS, postId: template.id }), revisions);
  assert.equal((await listEmailTemplates({ deps: h.deps })).templates.length, 1);
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 50 })).items.length, 0);
});

test("template trash refuses denied actors, other workspaces and ordinary pages sharing posts storage", async (t) => {
  const h = harness();
  t.after(() => h.db.$client.close());
  const template = await createEmailTemplate({ deps: h.deps, input: { name: "A" }, actorId: ACTOR.principalId });
  h.granted.clear();
  assert.deepEqual(await h.move({ id: template.id }), { ok: false, reason: "forbidden", permission: "pages.edit_html" });
  h.granted.add("pages.edit_html");
  assert.deepEqual(await h.move({ id: template.id, workspaceId: "other-workspace" }), { ok: false, reason: "not-found" });
  h.db.$client.prepare("UPDATE posts SET kind = 'page' WHERE id = ?").run(template.id);
  assert.deepEqual(await h.move({ id: template.id }), { ok: false, reason: "not-found" });
  assert.equal((await h.deps.postRepo.findById({ workspaceId: WS, id: template.id }))!.deletedAt, null);
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 50 })).items.length, 0);
});

test("template purge uses the registered cascades for Pages revisions and search projection", async (t) => {
  const h = harness();
  t.after(() => h.db.$client.close());
  const template = await createEmailTemplate({ deps: h.deps, input: { name: "A" }, actorId: ACTOR.principalId });
  await h.move({ id: template.id });
  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  const result = await h.trash.purgeSelected({ workspaceId: WS, ids: [page.items[0]!.id], actor: ACTOR, authorizeItem: async () => true });
  assert.equal(result.purged, 1);
  assert.equal(await h.deps.postRepo.findById({ workspaceId: WS, id: template.id }), null);
  assert.deepEqual(await h.deps.postRepo.listRevisions({ workspaceId: WS, postId: template.id }), []);
  const projection = h.db.$client.prepare("SELECT COUNT(*) AS n FROM post_search_document WHERE post_id = ?").get(template.id) as { n: number };
  assert.equal(projection.n, 0);
});
