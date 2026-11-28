import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { sql } from "kysely";
import { buildWidgetInstanceFieldsJson, createWidgetInstance, parseWidgetInstancePayload } from "@jini-ai/cms/widgets";
import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { bootSite, isolateSiteEnvironment, removeSiteDir, type FixtureSite } from "../../__tests__/form-delivery-vertical-slice.fixture.js";

/**
 * @file The follow-up hooks `composeTrashFollowUpHooks` (`site-deps/trash-follow-up-hooks.ts`) binds
 * to the assembled SQLite composition, driven through its own `deps.trash`: a widget the old delete
 * ladder left as `trash` is adopted into the Trash on the next boot, and restoring it runs the
 * widget `afterUnhide` hook, which puts its payload back to `active`; a form submission whose
 * attachment row is already gone purges cleanly (the removal skips a missing asset).
 * Sibling coverage: `composition/__tests__/form-file-cleanup.integration.test.ts` (private/public attachment purge).
 */

const AT = "2030-01-01T00:00:00.000Z";
let site: FixtureSite;
let dir: string;
let home: string;
let restoreEnv: () => void;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-trash-follow-ups-"));
  home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-trash-follow-ups-home-"));
  restoreEnv = isolateSiteEnvironment({ home });
  site = await bootSite({ dir });
});

after(async () => {
  await site?.close();
  restoreEnv();
  await removeSiteDir({ dir });
  fs.rmSync(home, { recursive: true, force: true });
});

async function trashItemId(required: { entityType: string; entityId: string }): Promise<string> {
  const page = await site.deps.trash.list({ workspaceId: site.deps.workspaceId, now: AT, limit: 50 }, { entityTypes: [required.entityType] });
  const item = page.items.find(row => row.entityId === required.entityId);
  assert.ok(item, `${required.entityType} ${required.entityId} is in Trash`);
  return item.id;
}

test("an adopted legacy-trash widget comes back from Trash with its payload status set to active", async () => {
  const workspaceId = site.deps.workspaceId;
  const { instance } = await createWidgetInstance({ deps: buildWidgetsDeps(site.deps),
    input: { workspaceId, actor: { principalId: await site.deps.ownerPrincipalId, kind: "user" }, widgetType: "text", title: "Old note", config: { body: "old body" } } });
  const legacy = JSON.stringify(buildWidgetInstanceFieldsJson({ payload: { widgetType: "text", config: { body: "old body" }, status: "trash" } }));
  await site.kernel.run(db => sql`UPDATE entries SET fields_json = ${legacy} WHERE id = ${instance.id}`.execute(db));
  // The next boot's one-time adoption moves the legacy widget into the Trash (prior marker "active").
  await site.close();
  site = await bootSite({ dir });
  const readStatus = async () => {
    const [row] = (await site.kernel.run(db => sql<{ fields_json: string }>`SELECT fields_json FROM entries WHERE id = ${instance.id}`.execute(db))).rows;
    assert.ok(row);
    return parseWidgetInstancePayload({ fieldsJson: JSON.parse(row.fields_json) }).status;
  };
  assert.equal(await readStatus(), "trash", "adoption leaves the payload untouched");
  assert.equal(await site.deps.trash.restore({ workspaceId, entityType: "widget", entityId: instance.id, at: AT }), "restored");
  assert.equal(await readStatus(), "active");
});

test("a form submission whose attachment row is already gone is purged: the removal skips the missing asset", async () => {
  const { deps } = site;
  const workspaceId = deps.workspaceId;
  await deps.formDefinitionRepo.create({ id: "gone-form", workspaceId, name: "Files", slug: "gone-files", status: "active", version: 1,
    createdAt: AT, updatedAt: AT, fields: [], notify: { enabled: false, recipients: [] } });
  await deps.formSubmissionRepo.create({ workspaceId, id: "gone-submission", formDefinitionId: "gone-form",
    data: { photo: { mediaId: "no-such-media", filename: "photo.png", contentType: "image/png", byteSize: 8 } }, sourceIp: null, submittedAt: AT });
  const hidden = await deps.trash.trash({ workspaceId, entityType: "form_submission", entityId: "gone-submission", actor: { principalId: "owner" }, display: { title: "Files" }, at: AT, expectedVersion: null });
  assert.equal(hidden.ok, true);
  const rows = async () => Number((await site.kernel.run(db => sql<{ n: number }>`SELECT count(*) AS n FROM form_submissions WHERE id = 'gone-submission'`.execute(db))).rows[0]!.n);
  assert.equal(await rows(), 1, "the trashed submission row is still there before purge");
  const report = await deps.trash.purgeSelected({ workspaceId, ids: [await trashItemId({ entityType: "form_submission", entityId: "gone-submission" })], actor: { principalId: "owner" }, authorizeItem: async () => true });
  assert.deepEqual(report.results.map(row => row.outcome), ["purged"]);
  assert.equal(await rows(), 0);
});
