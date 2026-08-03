import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/repo.memory";
import { InMemoryEntryRepo } from "#src/features/entries/repo.memory";
import { getWidgetInstance, listWidgetInstances, type WidgetReadServiceDeps } from "../../read-service";
import { WidgetForbiddenError, WidgetInstanceNotFoundError } from "../../errors";
import { createWidgetInstance, trashWidgetInstance, type WidgetWriteServiceDeps } from "../../write-service";

/**
 * @file C-005-adjacent widget-instance READ accessors (SPEC-043 REQ-04). External /audit-work
 * finding (2026-07-21, ADR-047): confirmed no read/list accessor existed in this package at all
 * before this file.
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };

function makeRepos() {
  return { entryRepo: new InMemoryEntryRepo(), contentTypeRepo: new InMemoryContentTypeRepo(), entryRefsRepo: new InMemoryEntryRefsRepo() };
}

let counter = 0;
function writeDeps(repos: ReturnType<typeof makeRepos>, authorize?: WidgetWriteServiceDeps["authorize"]): WidgetWriteServiceDeps {
  return {
    ...repos,
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

test("REQ-04: getWidgetInstance still returns a trashed instance (readable, just not in the default list) — not a 404", async () => {
  const repos = makeRepos();
  const { instance: created } = await createWidgetInstance({
    deps: writeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });
  await trashWidgetInstance({ deps: writeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id } });

  const { instance } = await getWidgetInstance({
    deps: readDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });
  assert.equal(instance.status, "trash");
});

test("getWidgetInstance 404s for an unknown id, not a crash", async () => {
  const repos = makeRepos();
  await assert.rejects(
    () => getWidgetInstance({ deps: readDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: "nope" } }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
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

test("REQ-04: listWidgetInstances defaults to active-only, narrows by widgetType when supplied, includes inactive on request", async () => {
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
  assert.equal(includingTrashed.instances.length, 2);
});

test("dossier C5 follow-up: a malformed widget-instance row (wrong owner namespace, e.g. written by bypassing the widgets domain layer) is skipped, not a crash, and skippedCount reports it instead of staying silent", async () => {
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
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, includeInactive: true },
  });

  assert.equal(result.instances.length, 1, "the one well-formed widget must still be returned");
  assert.equal(result.instances[0].title, "Good widget");
  assert.equal(result.skippedCount, 1, "the malformed row must be counted, not silently disappear with no trace");
});
