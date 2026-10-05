import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { getSlugChangeCapture } from "#src/platform/routing/index";
import { createSiteRouteDeps } from "../deps.js";
import type { SiteStore } from "../open-site-store.js";

/**
 * @file The site composition's other registrations (beside the Redirects phase handlers, see
 * `redirects-phase-disposed-on-store-close.integration.test.ts`) leave with the site when its
 * store closes.
 *
 * `createSiteRouteDeps` binds `routing`'s process-wide `SlugChangeCapture` slot to a capture over
 * this site's `redirectRepo`, and subscribes the redirect-hit fold to this site's bus. Before this
 * fix both returned values were dropped, so the slot kept handing out a capture over a closed
 * database and the hit fold kept recording after its site was gone.
 */

/** Every boot-time write the composition started (its `*Ready` promises), so the store can close after. */
async function bootSettled(deps: object): Promise<void> {
  await Promise.all(Object.entries(deps).filter(([key]) => key.endsWith("Ready")).map(([, value]) => value));
}

/** A composed site over a fresh temp dir, plus the store it opened. */
async function openSite(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-registrations-close-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let store: SiteStore | undefined;
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    onStoreOpened: (opened) => (store = opened),
  });
  await bootSettled(deps);
  assert.ok(store);
  return { deps, store };
}

test("closing the site store unbinds its SlugChangeCapture from the process-wide slot", async (t) => {
  const { store } = await openSite(t);

  // Control: while the site is open the slot holds its capture.
  assert.ok(getSlugChangeCapture(), "an open site binds its slug-change capture");

  await store.close();

  assert.equal(getSlugChangeCapture(), undefined, "a closed site's capture must no longer be bound");
});

test("closing the site store unsubscribes its redirect-hit fold from the bus", async (t) => {
  const { deps, store } = await openSite(t);
  const hit = (redirectId: string) => ({
    id: `evt-${redirectId}`,
    name: "redirect.hit",
    occurredAt: "2026-10-04T00:00:00.000Z",
    workspaceId: deps.workspaceId,
    payload: { workspaceId: deps.workspaceId, redirectId, at: "2026-10-04T00:00:00.000Z" },
  });

  // Control: while the site is open a published hit is folded into its sink.
  await deps.bus.publish(hit("open"));
  assert.equal((await deps.redirectHitSink.getStats({ workspaceId: deps.workspaceId, redirectId: "open" }))?.hitCount, 1);

  await store.close();

  await deps.bus.publish(hit("closed"));
  assert.equal(
    await deps.redirectHitSink.getStats({ workspaceId: deps.workspaceId, redirectId: "closed" }),
    null,
    "a closed site's hit fold must no longer run"
  );
});
