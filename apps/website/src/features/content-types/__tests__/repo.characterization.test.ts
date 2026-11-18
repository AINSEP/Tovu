import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import type { ContentTypeRecord } from "../index.js";
import { SqliteContentTypeRepo } from "../repo.sqlite.js";

/**
 * @file S2a T0: the content-type repo's owner rule on the unmoved code, before its query body moves to Jini
 * `@jini-ai/cms/content-types/sql`. Real SQLite kernel (the recorder from the lane-su pins), driven through the
 * `SqliteContentTypeRepo` name that survives the move. Each test names the one-line mutation of `repo.rows.ts` that
 * turns it red; the run's report holds the red output of each.
 */

const WS = "ws-1";

function contentType(key: string, overrides: Partial<ContentTypeRecord> = {}): ContentTypeRecord {
  return { workspaceId: WS, key, label: `Label ${key}`, fields: [], status: "active", version: 1, tombstonedAt: null, ...overrides };
}

function repoOnFreshKernel() {
  const { kernel } = recordingKernel();
  return { kernel, repo: new SqliteContentTypeRepo({ store: kernel }) };
}

test("the widget and widget-area types read back with the declared owner", async () => {
  const { repo } = repoOnFreshKernel();
  await repo.save(contentType("widget", { owner: "widget" }));
  await repo.save(contentType("widget_area", { owner: "widgets" }));
  assert.equal((await repo.findByKey({ workspaceId: WS, key: "widget" }))?.owner, "widget");
  assert.equal((await repo.findByKey({ workspaceId: WS, key: "widget_area" }))?.owner, "widgets");
  assert.deepEqual((await repo.listByWorkspace({ workspaceId: WS })).map((row) => [row.key, row.owner]).sort(), [["widget", "widget"], ["widget_area", "widgets"]]);
});

test("a site type reads back with no owner key at all", async () => {
  const { repo } = repoOnFreshKernel();
  await repo.save(contentType("recipe"));
  const record = await repo.findByKey({ workspaceId: WS, key: "recipe" });
  assert.ok(record);
  assert.equal("owner" in record, false);
});

test("an undeclared owner is refused with the declared list in the message and no row is written", async () => {
  const { repo } = repoOnFreshKernel();
  await assert.rejects(
    repo.save(contentType("recipe", { owner: "x" })),
    { message: "content type 'recipe' declares owner 'x', but only these code-declared owners can be stored: widget=widget, widget_area=widgets" },
  );
  assert.equal(await repo.findByKey({ workspaceId: WS, key: "recipe" }), null);
  assert.deepEqual(await repo.listByWorkspace({ workspaceId: WS }), []);
});

test("a type keyed like an Object.prototype member has no owner and saves", async () => {
  const { repo } = repoOnFreshKernel();
  for (const key of ["constructor", "toString"]) {
    await repo.save(contentType(key));
    const record = await repo.findByKey({ workspaceId: WS, key });
    assert.ok(record, key);
    assert.equal("owner" in record, false, key);
  }
});
