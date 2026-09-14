import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { createServingApp } from "../../runtime/composition/serving-app.js";

/**
 * @file Regression proof that an event from a route which never drains the outbox still reaches its
 * subscriber (2026-09-14).
 *
 * Taxonomy create enqueues `taxonomy.created` through `@jini-ai/cms/taxonomy`'s write service and,
 * like comments, menus, widgets, redirects, form definitions, plugin enable and change-set revert,
 * never calls `processOutbox`. Before the background drainer that event sat `pending` until some
 * unrelated post/page/entry route drained. The request goes through the real admin route that
 * `createApp` mounts, inside `createServingApp`, the function both site-serving boot paths call
 * (pinned by `server/__tests__/unit/serving-app-boot-wiring.unit.test.ts`). The subscriber is a test
 * spy: no product code subscribes to taxonomy events yet, and the property under test is delivery.
 */

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

test("taxonomy create, a route that never drains inline, reaches its bus subscriber through the serving app's background drainer", async (t) => {
  const deps = createRouteDeps();
  const received: string[] = [];
  await deps.bus.subscribe("taxonomy.created", async (event) => {
    received.push(event.name);
  });

  const { app, outboxDrainer } = createServingApp(deps, { outboxDrainIntervalMs: 20 });
  t.after(() => outboxDrainer.stop());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  assert.equal(res.status, 201);

  const delivered = await waitFor(() => received.length > 0, 2_000);
  assert.ok(delivered, "taxonomy.created was enqueued but never delivered: nothing drained the outbox after a route that does not drain inline");
  assert.deepEqual(received, ["taxonomy.created"]);
});
