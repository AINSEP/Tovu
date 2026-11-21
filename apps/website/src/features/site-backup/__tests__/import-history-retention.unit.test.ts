/**
 * @file Q4 acceptance (r62t-rsy-6 "Q4 · cloud combine sheet"; owner decision: 30 days of visible
 * import history, a 1-year replay record). Cases 1 and 2 of the sheet's five. Written before the
 * indexed store exists: case 2 is expected red until terminal history expires at 30 days while
 * the replay record survives to 365 days from acceptance.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createSiteImportBackend } from "../import-backend.js";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";

const DAY = 86_400_000;
const START = Date.parse("2026-11-21T00:00:00.000Z");
const URL_SOURCE = { url: "https://public.example/site.tovu.zip" };

/** One finished import under `requestId`, accepted at START. */
async function finishedImport(t: test.TestContext, requestId: string) {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const h = await importFixture(t);
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: upload, requestId });
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.state, "ready", "the fixture import finishes");
  return { h, upload, ready };
}

test("Q4 durable replay: after a restart at day 31 the same request returns the stored outcome; a changed source conflicts before any effect", async t => {
  const { h, upload, ready } = await finishedImport(t, "replay-31");
  const startedBefore = h.started.length;
  t.mock.timers.setTime(START + 31 * DAY);
  const restarted = createSiteImportBackend(h.backendPorts);
  const replay = await restarted.importBackup({ principalId: "owner", source: upload, requestId: "replay-31" });
  assert.equal(replay.importId, ready.importId, "a retry of the same request returns the original import");
  assert.equal(replay.state, "ready", "the stored outcome is returned, not a new attempt");
  assert.equal(h.started.length, startedBefore, "a replay never creates or starts a second site");
  await assert.rejects(restarted.importBackup({ principalId: "owner", source: URL_SOURCE, requestId: "replay-31" }),
    { code: "REQUEST_CONFLICT" }, "a changed source under the same request id conflicts before downloading");
  const other = await restarted.list({ principalId: "other" });
  assert.equal(other.some(row => row.importId === ready.importId), false, "another principal never sees this import");
});

test("Q4 expiry: terminal history leaves the list after 30 days, replay still works, replaying does not extend it, and the key is reusable after 365 days", async t => {
  const { h, upload, ready } = await finishedImport(t, "retention");
  t.mock.timers.setTime(START + 29 * DAY);
  await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "retention" });
  t.mock.timers.setTime(START + 30 * DAY + 1);
  const listed = await h.backend.list({ principalId: "owner" });
  assert.equal(listed.some(row => row.importId === ready.importId), false, "terminal detail is gone from history after 30 days, even though it was replayed at day 29");
  const replay = await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "retention" });
  assert.equal(replay.importId, ready.importId, "replay still returns the stored outcome after the history detail expires");
  t.mock.timers.setTime(START + 365 * DAY + 1);
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: URL_SOURCE, requestId: "retention" }),
    (error: { code?: string }) => error.code !== "REQUEST_CONFLICT", "after 365 days the request id no longer fences a different source");
});
