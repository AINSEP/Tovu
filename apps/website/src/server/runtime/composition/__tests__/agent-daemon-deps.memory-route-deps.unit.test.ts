import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createAgentDaemonRouteDeps } from "../agent-daemon-deps.js";

/** The agent daemon's in-memory composition (`TOVU_DB=memory`): its outbox is the enqueue-only
 * view, so the daemon never claims (and silently drops) events the serving process must deliver. */
test("TOVU_DB=memory composes in-memory deps whose outbox enqueues but never hands out a claim", async () => {
  const deps = await createAgentDaemonRouteDeps({ env: { TOVU_DB: "memory" } });
  const event = { id: "daemon-evt-1", name: "entry.updated", occurredAt: "2026-01-01T00:00:00.000Z", workspaceId: deps.workspaceId, payload: {} };
  await deps.outbox.enqueue(event as never);
  assert.deepEqual(await deps.outbox.claimPending({ batchSize: 10, nowIso: "2099-01-01T00:00:00.000Z" }), []);
  await assert.rejects(deps.outbox.markDelivered({ id: "daemon-evt-1" }), {
    message: "enqueue-only outbox: markDelivered('daemon-evt-1') was called, but this process never claims outbox rows",
  });
});
