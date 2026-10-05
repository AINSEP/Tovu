import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runPostContentPhase, runPreContentPhase } from "#src/platform/routing/index";
import { createSiteRouteDeps } from "../deps.js";
import type { SiteStore } from "../open-site-store.js";

/**
 * @file The site composition's Redirects phase handlers leave the process-wide resolve phases when
 * that composition's store closes.
 *
 * `createSiteRouteDeps` registers Redirects into `routing`'s module-level phase registry with a
 * resolver bound to the site's own redirect repo. Before this fix the disposer it got back was
 * dropped, so once the store closed the resolver stayed on every request's path, querying a closed
 * database on each `pre_content`/`post_content` run (swallowed by its `onError: "skip"` policy, so
 * the observable symptom is the routing layer's per-request "resolver failed" log line).
 *
 * The routing layer's own skip log is the signal: it fires exactly when a registered handler threw.
 */

/** Every boot-time write the composition started (its `*Ready` promises), so the store can close after. */
async function bootSettled(deps: object): Promise<void> {
  await Promise.all(Object.entries(deps).filter(([key]) => key.endsWith("Ready")).map(([, value]) => value));
}

test("closing the site store removes its redirect resolver from both resolve phases", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-redirects-phase-close-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let store: SiteStore | undefined;
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    onStoreOpened: (opened) => (store = opened),
  });
  await bootSettled(deps);
  const ctx = { workspaceId: deps.workspaceId };
  const errorLog = t.mock.method(console, "error", () => {});

  // Control: while the site is open its resolver runs cleanly and declines (no rules exist).
  assert.equal(await runPreContentPhase("/no-such-rule", ctx), null);
  assert.equal(await runPostContentPhase("/no-such-rule", ctx), null);
  assert.equal(errorLog.mock.callCount(), 0, "an open site's resolver must not fail");

  await store?.close();

  assert.equal(await runPreContentPhase("/no-such-rule", ctx), null);
  assert.equal(await runPostContentPhase("/no-such-rule", ctx), null);
  const resolverFailures = errorLog.mock.calls
    .map((call) => String(call.arguments[0]))
    .filter((line) => line.startsWith("[routing]"));
  assert.deepEqual(resolverFailures, [], "a closed site's redirect resolver must no longer run");
});
