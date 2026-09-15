import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner, registerContentType } from "#src/features/content-types/index";
import { InMemoryEntryRepo, createEntry } from "#src/features/entries/index";
import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import { PRE_AUTHORIZED } from "../../authorize-helper.js";
import { insertWidgetEmbed, removeWidgetEmbed, reorderWidgetEmbeds, type EmbedServiceDeps } from "../../embed-service.js";
import { WidgetInstanceNotFoundError } from "../../errors.js";
import { createWidgetInstance, type WidgetWriteServiceDeps } from "../../write-service.js";
import { buildWidgetAreaFieldsJson, emptyWidgetAreaDoc, ensureWidgetContentTypesRegistered } from "../../entry-payload.js";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_AREA_FIELD_NAMESPACE } from "../../types.js";

/**
 * @file RED regression suite for the bug captured in
 * `ADS-memory/.local-artifacts/handoffs/2026-09-15-widgets-insert-embed-bug-EVIDENCE.md`: the
 * embed-mutation arms (`insertWidgetEmbed`/`removeWidgetEmbed`/`reorderWidgetEmbeds`) only ever
 * looked in the `entries` table for a host, so a real post/page (a DIFFERENT table,
 * `features/post`) always 404'd with a misleading "host entry was not found", even though
 * `content_read.content_post` finds the exact same id fine.
 *
 * Per `2026-09-15-widgets-insert-embed-PLAN.md` §4's RED-first instruction, this file must fail
 * against current HEAD without importing the not-yet-created `WidgetEmbedHostNotFoundError` /
 * `WidgetEmbedHostUnsupportedError` classes — an ESM link error on a not-yet-exported name would
 * kill the WHOLE file's tests at once, rather than failing each assertion on its own. Every
 * not-yet-existing error is therefore asserted by `err.name`/`err.message` string comparison only.
 */

const WORKSPACE_ID = "ws-1";
const OTHER_WORKSPACE_ID = "ws-other";
const ACTOR = { principalId: "user-1", kind: "user" };
const NOW = "2026-09-15T00:00:00.000Z";

function makeSharedRepos() {
  return {
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    postRepo: new InMemoryPostRepo(),
    changeSets: new InMemoryChangeSetRepo(),
  };
}

let idCounter = 0;

function makeDeps(repos: ReturnType<typeof makeSharedRepos>, overrides: Partial<EmbedServiceDeps> = {}): EmbedServiceDeps {
  return {
    entryRepo: repos.entryRepo,
    contentTypeRepo: repos.contentTypeRepo,
    entryRefsRepo: repos.entryRefsRepo,
    postRepo: repos.postRepo,
    changeSets: repos.changeSets,
    clock: { nowIso: () => NOW },
    ids: { newId: () => `id-${++idCounter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
    ...overrides,
  } as EmbedServiceDeps;
}

function widgetWriteDeps(repos: ReturnType<typeof makeSharedRepos>): WidgetWriteServiceDeps {
  return {
    entryRepo: repos.entryRepo,
    contentTypeRepo: repos.contentTypeRepo,
    entryRefsRepo: repos.entryRefsRepo,
    clock: { nowIso: () => NOW },
    ids: { newId: () => `id-${++idCounter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
  };
}

async function makeWidgetInstance(repos: ReturnType<typeof makeSharedRepos>): Promise<string> {
  const { instance } = await createWidgetInstance({
    deps: widgetWriteDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Sidebar note", config: { body: "hi" } },
  });
  return instance.id;
}

/** Seeds a post row directly, mirroring `tool-registrations.optimistic-concurrency.test.ts:72-85`'s
 *  own `postRepo.save({...} as never)` pattern rather than going through `createPost` (which this
 *  suite must NOT depend on being wired to the embed path — that dependency is exactly the bug). */
async function seedPost(repos: ReturnType<typeof makeSharedRepos>, overrides: Partial<PostRecord> = {}): Promise<PostRecord> {
  const post = {
    id: `post-${++idCounter}`,
    workspaceId: WORKSPACE_ID,
    title: "Host Post",
    slug: `host-post-${idCounter}`,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 1,
    ...overrides,
  } as PostRecord;
  await repos.postRepo.save(post as never);
  return post;
}

function embedsIn(bodyJson: unknown): Array<{ placementId: string; widgetEntryId: string }> {
  const content = (bodyJson as { content: unknown[] }).content;
  return content
    .filter((n) => (n as { type?: string }).type === "widgetEmbed")
    .map((n) => (n as { attrs: { placementId: string; widgetEntryId: string } }).attrs);
}

async function makeWidgetAreaHost(repos: ReturnType<typeof makeSharedRepos>): Promise<string> {
  await ensureWidgetContentTypesRegistered({
    deps: { contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => NOW }, ids: { newId: () => `ct-${++idCounter}` }, outbox: { enqueue: async () => undefined } },
    workspaceId: WORKSPACE_ID,
  });
  const areaCreated = await createEntry({
    deps: { entryRepo: repos.entryRepo, contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => NOW }, ids: { newId: () => `area-${++idCounter}` }, authorize: PRE_AUTHORIZED, outbox: { enqueue: async () => undefined } },
    input: {
      actorId: ACTOR.principalId,
      workspaceId: WORKSPACE_ID,
      type: WIDGET_AREA_CONTENT_TYPE,
      slug: `widget-area-${idCounter}`,
      title: "Footer area",
      fieldsJson: buildWidgetAreaFieldsJson({ regionKey: `footer-${idCounter}`, doc: emptyWidgetAreaDoc() }),
      owner: WIDGET_AREA_FIELD_NAMESPACE,
    },
  });
  if (!areaCreated.ok) throw areaCreated.error;
  return areaCreated.value.entry.id;
}

test("REQ-44 post-host fix: insertWidgetEmbed against a kind:'post' doc host succeeds — one change set (entityType 'post'), refs extracted", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos);
  const widgetId = await makeWidgetInstance(repos);

  const { entry, placementId } = await insertWidgetEmbed({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: post.version, widgetEntryId: widgetId },
  });

  assert.equal(entry.id, post.id);
  assert.equal(entry.version, 2);

  const stored = await repos.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  const embeds = embedsIn(stored!.bodyJson);
  assert.equal(embeds[embeds.length - 1].placementId, placementId);
  assert.equal(embeds[embeds.length - 1].widgetEntryId, widgetId);

  const changeSets = await repos.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.equal(changeSets.length, 1);
  const withItems = await repos.changeSets.findById({ workspaceId: WORKSPACE_ID, id: changeSets[0].id });
  assert.equal(withItems?.items[0]?.entityType, "post");

  const refs = await repos.entryRefsRepo.findByTarget({ workspaceId: WORKSPACE_ID, targetKind: "entry", targetId: widgetId });
  assert.ok(refs.some((r) => r.sourceEntryId === post.id));
});

test("REQ-44 post-host fix: insertWidgetEmbed against a kind:'page' doc host succeeds the same way", async () => {
  const repos = makeSharedRepos();
  const page = await seedPost(repos, { kind: "page" });
  const widgetId = await makeWidgetInstance(repos);

  const { entry } = await insertWidgetEmbed({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: page.id, baseVersion: page.version, widgetEntryId: widgetId },
  });

  assert.equal(entry.id, page.id);
  assert.equal(entry.version, 2);
});

test("REQ-44 post-host fix: removeWidgetEmbed and reorderWidgetEmbeds against a post host succeed, version bumps, body updated", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos);
  const w1 = await makeWidgetInstance(repos);
  const w2 = await makeWidgetInstance(repos);

  const after1 = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: post.version, widgetEntryId: w1 } });
  const after2 = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: after1.entry.version, widgetEntryId: w2 } });
  assert.equal(after2.entry.version, 3);

  const reordered = await reorderWidgetEmbeds({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: after2.entry.version, orderedWidgetEntryIds: [w2, w1] },
  });
  assert.equal(reordered.entry.version, 4);
  assert.deepEqual(embedsIn(reordered.entry.bodyJson).map((e) => e.widgetEntryId), [w2, w1]);

  const removed = await removeWidgetEmbed({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: reordered.entry.version, placementId: after1.placementId },
  });
  assert.equal(removed.entry.version, 5);
  assert.equal(embedsIn(removed.entry.bodyJson).length, 1);
});

test("unknown host is a typed WidgetEmbedHostNotFoundError, for insert, remove and reorder alike", async () => {
  const repos = makeSharedRepos();
  const expectedMessage = `host entry 'nope' was not found in workspace '${WORKSPACE_ID}' (it must be the id of an existing, non-trashed post, page, or content entry)`;

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: "nope", baseVersion: 1, widgetEntryId: "whatever" } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostNotFoundError");
      assert.equal(err.message, expectedMessage);
      return true;
    }
  );

  await assert.rejects(
    () => removeWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: "nope", baseVersion: 1, placementId: "whatever" } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostNotFoundError");
      assert.equal(err.message, expectedMessage);
      return true;
    }
  );

  await assert.rejects(
    () => reorderWidgetEmbeds({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: "nope", baseVersion: 1, orderedWidgetEntryIds: [] } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostNotFoundError");
      assert.equal(err.message, expectedMessage);
      return true;
    }
  );
});

test("a TRASHED post host is rejected as not-found, same name/message pattern as an unknown host, and left unchanged", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos, { deletedAt: NOW });

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: post.version, widgetEntryId: "whatever" } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostNotFoundError");
      assert.equal(
        err.message,
        `host entry '${post.id}' was not found in workspace '${WORKSPACE_ID}' (it must be the id of an existing, non-trashed post, page, or content entry)`
      );
      return true;
    }
  );

  const after = await repos.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(after?.version, post.version);
});

test("a post that exists only in a DIFFERENT workspace is rejected as not-found, never cross-workspace visible", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos, { workspaceId: OTHER_WORKSPACE_ID });

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: post.version, widgetEntryId: "whatever" } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostNotFoundError");
      return true;
    }
  );
});

test("an HTML-format page host is rejected as unsupported (no rich-text body to embed into), row untouched", async () => {
  const repos = makeSharedRepos();
  const page = await seedPost(repos, { kind: "page", bodyFormat: "html", bodyHtml: "<main></main>" });

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: page.id, baseVersion: page.version, widgetEntryId: "whatever" } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostUnsupportedError");
      assert.equal((err as { reason?: string }).reason, "html-page");
      assert.equal(
        err.message,
        `host '${page.id}' is an HTML-format page, which has no rich-text body for widgetEmbed nodes; embed widgets in it with a data-embed-config marker of type "widget" via pages_write_region or pages_write_html instead`
      );
      return true;
    }
  );

  const after = await repos.postRepo.findById({ workspaceId: WORKSPACE_ID, id: page.id });
  assert.equal(after?.version, page.version);
});

test("a widget_area entry can never be an embed HOST (D4) — rejected as unsupported, not silently written into", async () => {
  const repos = makeSharedRepos();
  const areaId = await makeWidgetAreaHost(repos);

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: areaId, baseVersion: 1, widgetEntryId: "whatever" } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetEmbedHostUnsupportedError");
      assert.equal((err as { reason?: string }).reason, "widget-area");
      return true;
    }
  );
});

test("a stale baseVersion against a post host is a typed WidgetVersionConflictError naming the current version; nothing written", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos, { version: 2 });
  const widgetId = await makeWidgetInstance(repos);

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: 1, widgetEntryId: widgetId } }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetVersionConflictError");
      assert.equal((err as { currentVersion?: number }).currentVersion, 2);
      assert.equal(err.message, `post '${post.id}' was modified by another save (expected version 1, current version 2)`);
      return true;
    }
  );

  const after = await repos.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(after?.version, 2);
  assert.deepEqual(after?.bodyJson, post.bodyJson);
  const changeSets = await repos.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.equal(changeSets.length, 0);
  const refs = await repos.entryRefsRepo.findByTarget({ workspaceId: WORKSPACE_ID, targetKind: "entry", targetId: widgetId });
  assert.equal(refs.length, 0);
});

test("authorize() denying ONLY content.write on a post host is a typed WidgetForbiddenError; nothing written", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos);
  const widgetId = await makeWidgetInstance(repos);

  const denyingAuthorize: EmbedServiceDeps["authorize"] = async ({ permission }) => {
    if (permission === "content.write") return { allowed: false, reason: "test: denied" };
    return { allowed: true, reason: "test: always allow" };
  };

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos, { authorize: denyingAuthorize }),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: post.version, widgetEntryId: widgetId },
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "WidgetForbiddenError");
      assert.equal(err.message, `principal 'user-1' lacks permission 'content.write' (test: denied)`);
      return true;
    }
  );

  const after = await repos.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(after?.version, post.version);
});

test("an unknown widgetEntryId against a valid post host still rejects with the existing WidgetInstanceNotFoundError, post unchanged", async () => {
  const repos = makeSharedRepos();
  const post = await seedPost(repos);

  await assert.rejects(
    () => insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: post.id, baseVersion: post.version, widgetEntryId: "does-not-exist" } }),
    (err: unknown) => {
      assert.ok(err instanceof WidgetInstanceNotFoundError);
      assert.equal(err.message, `embed references widget 'does-not-exist', which does not exist in workspace '${WORKSPACE_ID}' (REQ-16/17)`);
      return true;
    }
  );

  const after = await repos.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(after?.version, post.version);
});
