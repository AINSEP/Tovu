import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";
import { getWidgetInstance, listWidgetInstances, type WidgetReadServiceDeps } from "../../read-service.js";
import { WidgetForbiddenError, WidgetInstanceNotFoundError } from "../../errors.js";
import { createWidgetInstance, trashWidgetInstance, type WidgetTrashDeps, type WidgetWriteServiceDeps } from "../../write-service.js";

/**
 * @file C-005-adjacent widget-instance READ accessors (SPEC-043 REQ-04). External /audit-work
 * finding (2026-07-21, ADR-047): confirmed no read/list accessor existed in this package at all
 * before this file.
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };

function makeRepos() {
  const trash = memoryWidgetTrash();
  return { entryRepo: trash.entryRepo, contentTypeRepo: new InMemoryContentTypeRepo(), entryRefsRepo: new InMemoryEntryRefsRepo(), trash };
}

let counter = 0;
function writeDeps(repos: ReturnType<typeof makeRepos>, authorize?: WidgetWriteServiceDeps["authorize"]): WidgetTrashDeps {
  return {
    entryRepo: repos.entryRepo,
    contentTypeRepo: repos.contentTypeRepo,
    entryRefsRepo: repos.entryRefsRepo,
    remove: repos.trash.remove,
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++counter}` },
    authorize: authorize ?? (async () => ({ allowed: true, reason: "test: always allow" })),
    outbox: { enqueue: async () => undefined },
  };
}

function readDeps(repos: ReturnType<typeof makeRepos>, authorize?: WidgetReadServiceDeps["authorize"]): WidgetReadServiceDeps {
  return { entryRepo: repos.entryRepo, authorize: authorize ?? (async () => ({ allowed: true, reason: "test: always allow" })) };
}

test("REQ-04: getWidgetInstance returns a widgets.read-holding principal's requested instance, current state, and a stable (currently empty) revisions shape", async () => {
  const repos = makeRepos();
  const { instance: created } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });

  const { instance, revisions } = await getWidgetInstance({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });

  assert.equal(instance.id, created.id);
  assert.equal(instance.title, "Footer note");
  assert.deepEqual(revisions, []);
});

// REQ-04 (changed 2026-09-21, generic Trash): a deleted widget is in the Trash, not a readable
// "trash" status — reads treat it as missing until it is restored from the Trash.
test("REQ-04: a widget in the Trash reads as not found, and reads again once restored", async () => {
  const repos = makeRepos();
  const { instance: created } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });
  await trashWidgetInstance({ deps: writeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id } });

  await assert.rejects(
    getWidgetInstance({ deps: readDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id } }),
    { name: "WidgetInstanceNotFoundError", message: `widget instance '${created.id}' was not found` }
  );

  await repos.trash.restore({ workspaceId: WORKSPACE_ID, id: created.id });
  const { instance } = await getWidgetInstance({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });
  assert.equal(instance.status, "active");
});

test("getWidgetInstance 404s for an unknown id, not a crash", async () => {
  const repos = makeRepos();
  await assert.rejects(
    () => getWidgetInstance({ deps: readDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: "nope" } }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );
});

// URL-uses-slug (2026-09-22): the admin widget editor's URL now carries the widget's slug
// (`WidgetsLibrary.tsx`'s row link, `use-widget-instance-editor.hooks.ts`'s create-navigate), so
// this route param may itself BE that slug rather than the widget's real id — same slug-first/
// id-second resolution as posts' `getAdminPostByIdOrSlug` and forms' `resolveFormDefinitionByIdOrSlug`.
test("REQ-04: getWidgetInstance resolves by slug, and still resolves an old bookmark's raw id", async () => {
  const repos = makeRepos();
  const { instance: created } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });

  const bySlug = await getWidgetInstance({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.slug },
  });
  assert.equal(bySlug.instance.id, created.id);

  const byId = await getWidgetInstance({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });
  assert.equal(byId.instance.id, created.id);
});

test("REQ-04: a trashed widget's slug 404s too, not just its id — the slug lookup doesn't leak trashed rows", async () => {
  const repos = makeRepos();
  const { instance: created } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });
  await trashWidgetInstance({ deps: writeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id } });

  await assert.rejects(
    getWidgetInstance({ deps: readDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.slug } }),
    { name: "WidgetInstanceNotFoundError" }
  );
});

test("REQ-40/41: a principal lacking widgets.read is rejected — INV-07 applies to reads too, not only mutations", async () => {
  const repos = makeRepos();
  const { instance: created } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });

  const denyAll = async () => ({ allowed: false, reason: "no_grant" });
  await assert.rejects(
    () => getWidgetInstance({ deps: readDeps(repos, denyAll), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id } }),
    (err: unknown) => err instanceof WidgetForbiddenError
  );
  await assert.rejects(
    () => listWidgetInstances({ deps: readDeps(repos, denyAll), input: { workspaceId: WORKSPACE_ID, actor: ACTOR } }),
    (err: unknown) => err instanceof WidgetForbiddenError
  );
});

test("REQ-04: listWidgetInstances defaults to active-only and narrows by widgetType; a widget in the Trash is left out even with includeInactive", async () => {
  const repos = makeRepos();
  const { instance: text1 } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Text A", config: { body: "a" } },
  });
  await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "social-links", title: "Socials", config: { links: [] } },
  });
  await trashWidgetInstance({ deps: writeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: text1.id } });

  const activeOnly = await listWidgetInstances({ deps: readDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR } });
  assert.equal(activeOnly.instances.length, 1);
  assert.equal(activeOnly.instances[0].widgetType, "social-links");

  const narrowed = await listWidgetInstances({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "social-links" },
  });
  assert.equal(narrowed.instances.length, 1);

  const includingTrashed = await listWidgetInstances({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, includeInactive: true },
  });
  assert.equal(includingTrashed.instances.length, 1, "the Trash lists it; the widgets library does not");
});

test("dossier C5 follow-up: a malformed widget-instance record is skipped, counted before filters, and identified for the caller", async () => {
  const repos = makeRepos();
  await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Good widget", config: { body: "hi" } },
  });

  // Reproduces the two real `workspace-local` rows found during the C5 investigation
  // (`__entries-create-probe__`/`__fix-verify-entries__`): created via the generic entries route
  // directly, so `fields_json` is `{ ext: { site: {...} } }` instead of the widgets domain's own
  // `{ ext: { widget: { payload: ... } } }` shape. `parseWidgetInstancePayload` throws on this.
  await repos.entryRepo.save({
    id: "malformed-1",
    workspaceId: WORKSPACE_ID,
    type: "widget",
    slug: "malformed-probe",
    status: "draft",
    title: "malformed-probe",
    bodyJson: null,
    fieldsJson: { ext: { site: { payload: "probe" } } },
    publishedAt: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    version: 1,
  });

  const result = await listWidgetInstances({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text" },
  });

  assert.equal(result.instances.length, 1, "the one well-formed widget must still be returned");
  assert.equal(result.instances[0].title, "Good widget");
  assert.equal(result.skippedCount, 1, "the malformed row must be counted, not silently disappear with no trace");
  assert.deepEqual(result.skippedIds, ["malformed-1"], "the caller must receive the malformed record's id even though its unparseable payload makes its type and status unknowable");
});
