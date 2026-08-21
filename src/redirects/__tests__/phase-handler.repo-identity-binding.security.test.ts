import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../server/app.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { resetRoutingRegistrationsForTests, runPostContentPhase } from "../../routing/routing.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import type { RedirectRecord, RedirectRevision } from "../types.js";

/**
 * @file Security characterization test — NOT a bug fix, NOT written to move a coverage number.
 * Exists so nobody deletes it later as "redundant": it documents a real, non-obvious binding
 * asymmetry in `createRouteDeps()`'s composition root that a future refactor could silently break.
 *
 * `registerRedirectsPhaseHandlers` (`redirects/phase-handler.ts`) is called ONCE, at
 * `createRouteDeps()` construction time, with a `RedirectPhaseHandlerResolver` built from a fresh
 * object literal (`{ repo: redirectRepo, matcher, originRegistry, hits }`) — NOT from the
 * `RouteDeps` object itself. The resolver's `this.deps.repo` is therefore bound by OBJECT IDENTITY
 * at construction time. `RouteDeps.redirectRepo` is a plain, later-mutable field on the returned
 * object, but reassigning it does nothing to the resolver already registered into `routing`'s
 * module-level phase registry — the resolver never re-reads `RouteDeps.redirectRepo`.
 *
 * This is the OPPOSITE of `RouteDeps.postRepo`: every route handler (e.g.
 * `routes/content/posts/get-by-slug.ts`'s `deps.postRepo`) reads that field live, off the SAME
 * `RouteDeps` object, on every request — which is exactly why `FailingSlugPostRepo`-style test
 * substitution (swap `deps.postRepo` after construction, see `export/__tests__/site-exporter.
 * test.ts`) works for posts but would silently no-op for redirects. Nothing currently asserts this
 * asymmetry; a future "make redirectRepo hot-swappable like postRepo" refactor could change it by
 * accident (or a caller could assume swapping `RouteDeps.redirectRepo` at runtime — e.g. a
 * workspace-switch or hot-reload path — takes effect, when today it silently does not) without any
 * test catching the behavior change either way.
 */

const OLD_PATTERN = "/old-path";
const NEW_TARGET = "/new-path";

function makeRedirectRecord(workspaceId: string): RedirectRecord {
  return {
    id: "redirect-1",
    workspaceId,
    matchType: "exact",
    fromPattern: OLD_PATTERN,
    toTarget: NEW_TARGET,
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
  };
}

function makeRedirectRevision(record: RedirectRecord): RedirectRevision {
  return {
    redirectId: record.id,
    workspaceId: record.workspaceId,
    seq: 1,
    state: record,
    tombstoned: false,
    actorId: "system",
    recordedAt: record.createdAt,
  };
}

test("security characterization: swapping RouteDeps.redirectRepo after createRouteDeps() does NOT change which repo the redirect resolver consults at request time — it is bound by object identity at construction, unlike postRepo", async () => {
  resetRoutingRegistrationsForTests();
  try {
    const deps: RouteDeps = createRouteDeps();

    // Seed a real redirect directly into the repo createRouteDeps() actually wired the resolver to
    // (same `.save()` seam `redirects-auth.test.ts` already uses).
    const record = makeRedirectRecord(deps.workspaceId);
    await deps.redirectRepo.save({ record, revision: makeRedirectRevision(record) });

    // Baseline: the real pipeline resolves the redirect via the ORIGINAL repo.
    const before = await runPostContentPhase(OLD_PATTERN, { workspaceId: deps.workspaceId });
    assert.deepEqual(before, { kind: "redirect", location: NEW_TARGET, statusCode: 301 });

    // Attempt the substitution that DOES work for `postRepo` (FailingSlugPostRepo-style): replace
    // the repo instance the composition root exposes with a fresh, deliberately empty one.
    const replacementRepo = new InMemoryRedirectRepo();
    deps.redirectRepo = replacementRepo;

    // If the resolver re-read RouteDeps.redirectRepo per request (like postRepo does), this would
    // now resolve to `{ matched: false }` against the empty replacement. It does not: the
    // resolver's own construction-time-captured reference wins, so the SAME redirect still fires.
    const after = await runPostContentPhase(OLD_PATTERN, { workspaceId: deps.workspaceId });
    assert.deepEqual(
      after,
      { kind: "redirect", location: NEW_TARGET, statusCode: 301 },
      "the resolver must keep consulting the repo it was constructed with, not RouteDeps.redirectRepo's current value"
    );

    // The replacement repo was never consulted at all — confirms this isn't a coincidental match.
    assert.equal(
      await replacementRepo.lookupExact({ workspaceId: deps.workspaceId, path: OLD_PATTERN, includeOverrideOnly: false }),
      null
    );
  } finally {
    resetRoutingRegistrationsForTests();
  }
});
