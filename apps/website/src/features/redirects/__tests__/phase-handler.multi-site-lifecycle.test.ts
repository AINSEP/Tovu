import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { bootSiteDir } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { runPostContentPhase, runPreContentPhase } from "#src/platform/routing/routing";
import { createSqliteRouteDeps } from "#src/server/runtime/composition/deps";
import type { RouteDeps } from "#src/server/routes/types";

import type { RedirectRecord, RedirectRevision } from "../types.js";

/**
 * @file The multi-site lifecycle contract for `registerRedirectsPhaseHandlers` — a phase handler
 * must not outlive the site whose DATABASE it captured.
 *
 * The defect this pins (2026-09-16): `routing`'s `phaseRegistry` was append-only, and
 * `registerRedirectsPhaseHandlers` registers a `RedirectPhaseHandlerResolver` bound BY OBJECT
 * IDENTITY to one composition's `SqliteRedirectRepo` (`phase-handler.repo-identity-binding.test.ts`
 * documents that binding). Every `createSqliteRouteDeps()` in a process therefore left another
 * site's closure on the live request path forever. Once the first site's database closed, the next
 * request through ANY phase-running route threw `TypeError: The database connection is not open`
 * out of `SqliteRedirectRepo.allActive` and 500ed — while `/products`, which runs no phase, kept
 * serving, which is exactly why it read as a render bug rather than a lifecycle bug.
 *
 * Real sites and real SQLite, composed through the same `bootSiteDir` + `createSqliteRouteDeps`
 * path `cli/commands/serve.ts` uses, because the bug lives in the wiring rather than in any one
 * unit. The assertions call `runPreContentPhase`/`runPostContentPhase` directly: those are the
 * exact two calls `routes/site/pages.ts`'s `tryRedirectPhase` makes per request, so this is the
 * request path minus the cost of two full app boots and a theme render.
 */

/**
 * Each site seeds its OWN rule path. Not cosmetic: `initSite` stamps every fresh site with the
 * same seeded workspace id, so `RouteResolveContext.workspaceId` cannot tell the two sites apart
 * and a shared pattern would let the second site's handler satisfy an assertion aimed at the
 * first's. Distinct patterns make "the first site's rule is unreachable" a real assertion.
 */
const FIRST_SITE_PATH = "/retired-by-the-first-site";
const SECOND_SITE_PATH = "/retired-by-the-second-site";
const NEW_PATH = "/current";

function makeRedirectRecord(workspaceId: string, id: string, fromPattern: string): RedirectRecord {
  return {
    id,
    workspaceId,
    matchType: "exact",
    fromPattern,
    toTarget: NEW_PATH,
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
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

interface BootedSite {
  deps: RouteDeps;
  /** Closes this site's database handle — what `tovu serve`'s shutdown and a test's own teardown do. */
  close: () => void;
}

/** Every boot-readiness promise `cli/commands/serve.ts` settles before it considers the site up. */
async function drainBootReadiness(deps: RouteDeps): Promise<void> {
  await Promise.all([
    deps.identityReady,
    deps.settingsReady,
    deps.seoReady,
    deps.commentsReady,
    deps.commentsSettingsReady,
    deps.executionSettingsReady,
    deps.settingsUiTabsReady,
    deps.analyticsSettingsReady,
    deps.siteTitleReady,
  ]).catch(() => undefined);
}

/** A fresh site directory + the same SQLite composition root `tovu serve <dir>` builds for it. */
async function bootSite(t: TestContext, name: string): Promise<BootedSite> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "redirects-multi-site-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const dir = path.join(parent, "site");
  initSite({ dir, name });

  const boot = bootSiteDir({ dir });
  const deps = createSqliteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db,
    workspaceId: boot.workspaceId,
    uploadsDir: path.join(dir, "uploads"),
    themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name, dirOverridden: true, switcherCompatible: false },
  });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    boot.db.$client.close();
  };
  // Settle the boot chain BEFORE anything closes the handle those promises are still writing
  // through, then close on the way out whether or not the test closed it itself.
  await drainBootReadiness(deps);
  t.after(async () => {
    await drainBootReadiness(deps);
    close();
  });
  return { deps, close };
}

/**
 * Run `body` and report every phase-handler failure `runPhase` swallowed while it ran.
 *
 * Load-bearing, not a convenience. `runPhase` ISOLATES a throwing handler (see
 * `routing.phase-lifecycle.test.ts`), so a stale handler over a closed database no longer changes
 * any outcome this file could otherwise assert on — an outcome-only test stays green with the
 * lifecycle fix reverted, which is a test that tolerates the bug it exists to catch. The swallowed
 * failure is the ONLY remaining observable that the stale handler ran at all, so it is what the
 * lifecycle assertions read. Its console line is also the operator's only signal in production.
 */
async function phaseFailuresDuring(body: () => Promise<void>): Promise<string[]> {
  const failures: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]): void => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("[routing] a ")) failures.push(first);
    else original(...(args as []));
  };
  try {
    await body();
  } finally {
    console.error = original;
  }
  return failures;
}

async function seedRedirect(deps: RouteDeps, id: string, fromPattern: string): Promise<void> {
  const record = makeRedirectRecord(deps.workspaceId, id, fromPattern);
  await deps.redirectRepo.save({ record, revision: makeRedirectRevision(record) });
}

test("a second site's request never runs the first site's phase handler, and the first site's CLOSED database can no longer 500 it", async (t) => {
  const first = await bootSite(t, "First Site");
  await seedRedirect(first.deps, "redirect-first", FIRST_SITE_PATH);

  // Baseline: while it is the live composition, the first site resolves its own rule. Without this
  // the test could pass against a registry that never worked at all.
  assert.deepEqual(
    await runPostContentPhase(FIRST_SITE_PATH, { workspaceId: first.deps.workspaceId }),
    { kind: "redirect", location: NEW_PATH, statusCode: 301 },
    "the first site must resolve its own redirect while it is the live composition"
  );

  const second = await bootSite(t, "Second Site");
  await seedRedirect(second.deps, "redirect-second", SECOND_SITE_PATH);

  // The lifecycle event: the first site is finished and its database handle goes away, exactly as
  // `cli/commands/serve.ts`'s shutdown and every integration test's teardown do it.
  first.close();

  // The regression itself. Before the fix, the first site's orphaned `SqliteRedirectRepo` threw
  // `TypeError: The database connection is not open` out of the phase and `pages.ts` turned that
  // into a 500 on `/` and `/pricing` for a site that had nothing whatsoever to do with it.
  const failures = await phaseFailuresDuring(async () => {
    assert.deepEqual(
      await runPostContentPhase(SECOND_SITE_PATH, { workspaceId: second.deps.workspaceId }),
      { kind: "redirect", location: NEW_PATH, statusCode: 301 },
      "the second site must resolve its OWN rule, through its own open database"
    );

    // `pre_content` is the phase `/` and `/pricing` run first, and the one the 500 actually came
    // out of — exercise it separately rather than trusting that both phases share a fate.
    assert.equal(
      await runPreContentPhase("/anything-with-no-rule", { workspaceId: second.deps.workspaceId }),
      null,
      "pre_content must resolve cleanly for a path with no rule"
    );

    // Absent, not merely inert. The first site's own rule path exists in NO database the live
    // registration can reach (the second site never seeded it), so the only thing that could ever
    // resolve it is the first site's orphaned handler.
    assert.equal(
      await runPostContentPhase(FIRST_SITE_PATH, { workspaceId: first.deps.workspaceId }),
      null,
      "the superseded site's rule must be unreachable"
    );
  });

  // The discriminating assertion. Isolation alone would keep all three outcomes above correct even
  // with the ownership fix reverted — the stale handler would still RUN, still throw against its
  // closed database, and merely be swallowed. Zero swallowed failures is what proves the first
  // site's handler was never on the second site's request path in the first place.
  assert.deepEqual(
    failures,
    [],
    "no phase handler may fail during a request to the second site — a failure means the first site's closed-database handler is still registered"
  );
});

test("the disposer registerRedirectsPhaseHandlers returns revokes the live registration outright", async (t) => {
  const site = await bootSite(t, "Disposable Site");
  await seedRedirect(site.deps, "redirect-disposable", FIRST_SITE_PATH);
  assert.deepEqual(await runPostContentPhase(FIRST_SITE_PATH, { workspaceId: site.deps.workspaceId }), {
    kind: "redirect",
    location: NEW_PATH,
    statusCode: 301,
  });

  // Re-registering the same feature returns a disposer for the slot it now owns. A host that tears
  // a site down WITHOUT immediately composing the next one needs this: supersede-on-registration
  // alone would leave the last site's handler live until something else booted.
  const { RedirectPhaseHandlerResolver, registerRedirectsPhaseHandlers } = await import("../phase-handler.js");
  const dispose = registerRedirectsPhaseHandlers({
    resolver: new RedirectPhaseHandlerResolver({
      repo: site.deps.redirectRepo,
      matcher: site.deps.redirectsWriteDeps.matcher,
      originRegistry: site.deps.originRegistry,
    }),
  });
  assert.deepEqual(
    await runPostContentPhase(FIRST_SITE_PATH, { workspaceId: site.deps.workspaceId }),
    { kind: "redirect", location: NEW_PATH, statusCode: 301 },
    "the re-registration must serve the same rule before it is disposed"
  );

  dispose();
  assert.equal(
    await runPostContentPhase(FIRST_SITE_PATH, { workspaceId: site.deps.workspaceId }),
    null,
    "after dispose() no Redirects handler may remain registered"
  );
});
