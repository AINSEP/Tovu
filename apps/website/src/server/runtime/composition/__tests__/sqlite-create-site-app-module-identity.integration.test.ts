// This file's first-party imports are deliberately deps-first (`#src/server/runtime/composition/deps`
// before `#src/server/runtime/composition/app`), the same order every `tovu` CLI command loads the
// graph in — see this test's own file header below for why that order is the point, not incidental.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createSqliteRouteDeps } from "#src/server/runtime/composition/deps";
import { createApp } from "#src/server/runtime/composition/app";

import { InMemoryEventBus } from "#src/contracts/core/events/memory-bus";
import type { DomainEvent, EventBusPort } from "@jini-ai/cms/core";
import { bootSiteDir } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { registerResolvePhase, runPreContentPhase } from "#src/platform/routing/routing";
import type { RedirectRecord, RedirectRevision } from "#src/features/redirects/types";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file Behavioral regression for t91 F4.1-A: a SQLite composition's `createSiteApp()`/`runExportSite`
 * must build the site app from THIS process's own module graph, not a second copy `require()` built
 * under tsx. Before the fix, `deps.ts`'s `createSiteAppLazily`/`runExportSiteLazily` resolved
 * `app.ts`/`platform/export` at call time via `createRequire(import.meta.url)`, which under
 * `node --import tsx` loads a SECOND, CommonJS-compiled copy of that module and its whole graph —
 * empty routing `phaseRegistry`, empty page-head `contributors`, and a second, empty
 * `busesWithSiteEventHandlers` WeakSet (`app.ts`'s module state). The deps-first import order above
 * matters because the CLI (`npm run export`, the desktop dev app's `tovu serve` child) always loads
 * `deps.ts` before `app.ts` — a test written app-first would not reproduce the bug this pins.
 */

/** Redirect fixture helper, local to this file (not imported from `features/redirects/__tests__` —
 *  that module is owned by a different row). `override` defaults to `false` (post_content-only,
 *  matching the production default) and is set `true` by T2 to reach `pre_content`. */
function makeRedirectRecord(workspaceId: string, id: string, fromPattern: string, override: boolean): RedirectRecord {
  return {
    id,
    workspaceId,
    matchType: "exact",
    fromPattern,
    toTarget: "/current",
    statusCode: 301,
    status: "active",
    override,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
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

/** Every boot-readiness promise `cli/commands/serve.ts` settles before it considers the site up. */
async function drainBootReadiness(deps: NewsletterRouteDeps): Promise<void> {
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
async function bootSqliteSite(t: TestContext): Promise<NewsletterRouteDeps> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "app-module-identity-"));
  const dir = path.join(parent, "site");
  initSite({ dir, name: "Module Identity Site" });

  const boot = bootSiteDir({ dir });
  const deps = createSqliteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db,
    workspaceId: boot.workspaceId,
    uploadsDir: path.join(dir, "uploads"),
    themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "Module Identity Site", dirOverridden: true, switcherCompatible: false },
  });

  await drainBootReadiness(deps);
  t.after(async () => {
    await drainBootReadiness(deps);
    boot.db.$client.close();
    fs.rmSync(parent, { recursive: true, force: true });
  });
  return deps;
}

async function seedRedirect(deps: NewsletterRouteDeps, fromPattern: string, options: { override: boolean }): Promise<void> {
  const record = makeRedirectRecord(deps.workspaceId, `redirect-${fromPattern}`, fromPattern, options.override);
  await deps.redirectRepo.save({ record, revision: makeRedirectRevision(record) });
}

/** Counts, per event name, how many handlers ever subscribed — the direct observable for "did
 *  `createApp` attach a second copy of the site's event handlers to this bus." */
class SubscribeCountingBus extends InMemoryEventBus {
  subscriptions = new Map<string, number>();

  override async subscribe<TPayload>(
    eventName: string,
    handler: (event: DomainEvent<TPayload>) => Promise<void>
  ): Promise<() => Promise<void>> {
    this.subscriptions.set(eventName, (this.subscriptions.get(eventName) ?? 0) + 1);
    return super.subscribe(eventName, handler);
  }
}

test("a SQLite composition's createSiteApp() serves the site's own redirect rule", async (t) => {
  const deps = await bootSqliteSite(t);
  await seedRedirect(deps, "/retired-page", { override: true });

  // Control: the rule resolves through THIS process's own routing registry (the one `deps.ts`
  // registered the redirect handler onto), so a failure below cannot be blamed on the fixture.
  assert.deepEqual(
    await runPreContentPhase("/retired-page", { workspaceId: deps.workspaceId }),
    { kind: "redirect", location: "/current", statusCode: 301 },
    "control: the rule resolves through this process's routing registry"
  );

  const baseUrl = await startTestServer(deps.createSiteApp(), t);
  const response = await fetch(`${baseUrl}/retired-page`, { redirect: "manual" });
  assert.equal(response.status, 301, "the SQLite composition's own createSiteApp() must see the same redirect the control just proved exists");
  assert.equal(response.headers.get("location"), "/current");
});

test("createSiteApp() sees a phase handler registered through this process's ESM routing.ts (one instance)", async (t) => {
  const deps = await bootSqliteSite(t);
  const dispose = registerResolvePhase("pre_content", async (p) =>
    p === "/one-instance-probe" ? { kind: "redirect", location: "/one-instance-target", statusCode: 302 } : null
  );
  t.after(dispose);

  const baseUrl = await startTestServer(deps.createSiteApp(), t);
  const response = await fetch(`${baseUrl}/one-instance-probe`, { redirect: "manual" });
  assert.equal(response.status, 302, "createSiteApp() must consult the SAME phaseRegistry this process's registerResolvePhase wrote into");
  assert.equal(response.headers.get("location"), "/one-instance-target");
});

test("createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers", async (t) => {
  const deps = await bootSqliteSite(t);
  const bus = new SubscribeCountingBus();
  (deps as { bus: EventBusPort }).bus = bus;

  createApp(deps);
  const servedOnce = Object.fromEntries(bus.subscriptions);
  assert.equal(servedOnce["form.submission.received"], 2, "sanity: forms notify and webhook fan-out each subscribe once");

  deps.createSiteApp();
  deps.createSiteApp();

  assert.deepEqual(
    Object.fromEntries(bus.subscriptions),
    servedOnce,
    "createSiteApp() must reuse this process's own busesWithSiteEventHandlers guard, not a second copy's empty WeakSet"
  );
});
