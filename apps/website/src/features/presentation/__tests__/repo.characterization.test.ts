import assert from "node:assert/strict";
import { test } from "node:test";

import type { PresentationSettingsRecord } from "@jini-ai/cms/presentation";
import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { SqlitePresentationSettingsRepo } from "../repo.sqlite.js";

/**
 * @file S1c T0: the presentation-settings repo's behaviour on the unmoved code, before its query body moves to Jini
 * `@jini-ai/cms/presentation/sql`. Real SQLite kernel (the recorder from the lane-su pins), driven through the
 * `SqlitePresentationSettingsRepo` name that survives the move. Each test names the one-line mutation of `repo.ts`
 * that turns it red; the run's report holds the red output of each.
 */

const T0 = "2026-09-28T00:00:00.000Z";
const T1 = "2026-09-28T01:00:00.000Z";

function settings(workspaceId: string, activeThemeId: string, updatedAt = T0): PresentationSettingsRecord {
  return { workspaceId, activeThemeId, updatedAt } as PresentationSettingsRecord;
}

function repoOnFreshKernel() {
  return new SqlitePresentationSettingsRepo({ store: recordingKernel().kernel });
}

test("one settings row per workspace round-trips through save and findByWorkspaceId", async () => {
  const repo = repoOnFreshKernel();
  await repo.save(settings("ws-1", "paper"));
  assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-1" }), settings("ws-1", "paper"));
  assert.equal(await repo.findByWorkspaceId({ workspaceId: "ws-none" }), null);
});

test("a second save for the workspace replaces the theme and the timestamp and never adds a row", async () => {
  const repo = repoOnFreshKernel();
  await repo.save(settings("ws-1", "paper"));
  await repo.save(settings("ws-1", "ink", T1));
  assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-1" }), settings("ws-1", "ink", T1));
  assert.deepEqual(await repo.listAll(), [settings("ws-1", "ink", T1)]);
});

test("a workspace's read returns only its own row, whichever row was written first", async () => {
  const repo = repoOnFreshKernel();
  await repo.save(settings("ws-1", "paper"));
  await repo.save(settings("ws-2", "ink", T1));
  assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-2" }), settings("ws-2", "ink", T1));
  assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-1" }), settings("ws-1", "paper"));
  assert.equal(await repo.findByWorkspaceId({ workspaceId: "ws-3" }), null);
});

test("a save for one workspace leaves every other workspace's row unchanged", async () => {
  const repo = repoOnFreshKernel();
  await repo.save(settings("ws-1", "paper"));
  await repo.save(settings("ws-2", "ink"));
  await repo.save(settings("ws-1", "slate", T1));
  assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-2" }), settings("ws-2", "ink"));
  assert.deepEqual((await repo.listAll()).map((row) => row.workspaceId).sort(), ["ws-1", "ws-2"]);
});
