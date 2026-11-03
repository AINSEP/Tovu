import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySiteTitlePreservationStore } from "#src/features/settings/site-title";
import { createRouteDeps } from "../app.js";

test("a failed background title pin is observed immediately and still rejects for consumers", async t => {
  const failure = new Error("title pin unavailable");
  t.mock.method(InMemorySiteTitlePreservationStore.prototype, "listPendingWorkspaceIds", async () => { throw failure; });
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  t.after(() => { process.off("unhandledRejection", onUnhandled); });
  const deps = createRouteDeps();
  await deps.siteConsentReady;
  // Leave the detached pin unconsumed through a full turn, as a fresh app does before requests.
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, [], "title failure must not become a process-level unhandled rejection");
  await assert.rejects(deps.siteTitleReady!, error => error === failure);
});
