import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { createServingApp } from "../../runtime/composition/serving-app.js";
import { seededPosts, seededWorkspace } from "../../runtime/configuration/seed.js";
import type { TrashSweepReport } from "#src/features/trash/index";

/**
 * @file Wiring proof that the Trash auto-purge backstop actually RUNS in a serving app
 * (2026-09-20), against the real composed deps rather than a hand-built sweep.
 *
 * The defect class this exists for is the dominant one in this codebase: a correct primitive with
 * an unwired call site. `features/trash/__tests__/sweeper.test.ts` proves what a sweep decides;
 * nothing there would notice if `createServingApp` never started one, or started one over a
 * `sweepTrash` that some other composition root had left as a no-op. So this boots the app the two
 * site-serving paths boot, trashes a real post at a date long past its retention window, and waits
 * for the loop to claim it — through `routeDeps.sweepTrash`, the repo it was pre-bound to, and no
 * test double in between.
 *
 * Why it asserts a CLAIM and not a purge: `app.ts`'s hermetic adapters deliberately have no
 * `hardDelete` (`InMemoryPostRepo` has no row removal), so their `purge` stands down with
 * `version-changed` rather than claiming a removal it did not perform. Standing down is the
 * behaviour under test everywhere else; here the question is only whether anything is sweeping at
 * all, and a claim answers it.
 */

/** Trashed far enough in the past that `purge_after` (trash time + 60 days) is long expired. */
const LONG_EXPIRED = "2020-01-01T00:00:00.000Z";

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

test("a post trashed past its retention window is claimed by the serving app's background sweeper", async (t) => {
  const deps = createRouteDeps();
  const post = seededPosts[0];
  assert.ok(post, "fixture: the hermetic root must seed at least one post to trash");

  const trashed = await deps.removePost({
    workspaceId: seededWorkspace.id,
    id: post.id,
    display: { title: post.title },
    at: LONG_EXPIRED,
    expectedVersion: null,
    actor: { principalId: "principal-1" },
  });
  assert.equal(trashed.ok, true, "fixture: the post must actually reach the Trash index");

  // Observe the REAL sweep rather than replace it: the spy delegates, so what is asserted below is
  // the outcome of the composed `sweepTrash`, not of the spy.
  const realSweep = deps.sweepTrash;
  const passes: TrashSweepReport[] = [];
  deps.sweepTrash = async (required) => {
    const report = await realSweep(required);
    passes.push(report);
    return report;
  };

  const { trashSweeper } = createServingApp(deps, { trashSweepIntervalMs: 20 });
  t.after(() => trashSweeper.stop());

  await waitFor(() => passes.some((pass) => pass.claimed > 0), 2_000);
  const claimedPass = passes.find((pass) => pass.claimed > 0);
  assert.ok(
    claimedPass,
    "an expired trashed_items row was never claimed: createServingApp is not starting the sweeper, or it is running over a sweepTrash bound to nothing"
  );
  assert.deepEqual(
    claimedPass.results.map((result) => result.outcome),
    ["version-changed"],
    "the hermetic post adapter has no hardDelete, so the sweep must stand down rather than report a purge"
  );
});
