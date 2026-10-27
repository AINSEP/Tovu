// This file's composition imports are deliberately deps-first (`#src/server/runtime/composition/deps`
// before `#src/server/runtime/composition/app`), the same order every `tovu` CLI command loads the
// graph in — see this test's own file header below for why that order is the point, not incidental.
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { createApp } from "#src/server/runtime/composition/app";

import { InMemoryEventBus } from "#src/contracts/core/events/memory-bus";
import type { DomainEvent, EventBusPort } from "@jini-ai/cms/core";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { removeFrozenPackageTree } from "#src/features/agent-plugins/lifecycle";
import { registerResolvePhase, runPreContentPhase } from "#src/platform/routing/adapter";
import type { RedirectRecord, RedirectRevision } from "@jini-ai/cms/redirects";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import type { OutboundEmail } from "#src/platform/mail/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createSubscription } from "#src/features/webhooks/subscriptions";

/**
 * @file Behavioral regression for t91 F4.1-A: a SQLite composition's `createSiteApp()`/`runExportSite`
 * must build the site app from THIS process's own module graph, not a second copy `require()` built
 * under tsx. Before the fix, `deps.ts`'s `createSiteAppLazily`/`runExportSiteLazily` resolved
 * `app.ts`/`features/site-export` at call time via `createRequire(import.meta.url)`, which under
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
async function bootSqliteSite(t: TestContext): Promise<{ deps: NewsletterRouteDeps; close: () => Promise<void> }> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "app-module-identity-"));
  const dir = path.join(parent, "site");
  await initSite({ dir, name: "Module Identity Site" });

  const boot = await bootSiteDir({ dir });
  let composed: { close(): Promise<void> } | undefined;
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db,
    workspaceId: boot.workspaceId,
    onStoreOpened: (store) => { composed = store; },
    uploadsDir: path.join(dir, "uploads"),
    themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "Module Identity Site", dirOverridden: true, switcherCompatible: false },
  });

  await drainBootReadiness(deps);
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= closeSiteDirBoot(boot, composed);
  t.after(async () => {
    try { await close(); }
    finally { await removeFrozenPackageTree({ root: parent }); }
  });
  return { deps, close };
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
    { eventName, handler }: { eventName: string; handler: (event: DomainEvent<TPayload>) => Promise<void> }
  ): Promise<() => Promise<void>> {
    this.subscriptions.set(eventName, (this.subscriptions.get(eventName) ?? 0) + 1);
    return super.subscribe<TPayload>({ eventName, handler });
  }
}

test("a SQLite composition's createSiteApp() serves the site's own redirect rule", async (t) => {
  const { deps } = await bootSqliteSite(t);
  await seedRedirect(deps, "/retired-page", { override: true });

  // Control: the rule resolves through THIS process's own routing registry (the one `deps.ts`
  // registered the redirect handler onto), so a failure below cannot be blamed on the fixture.
  assert.deepEqual(
    await runPreContentPhase({ path: "/retired-page", ctx: { workspaceId: deps.workspaceId } }),
    { kind: "redirect", location: "/current", statusCode: 301 },
    "control: the rule resolves through this process's routing registry"
  );

  const baseUrl = await startTestServer(deps.createSiteApp(), t);
  const response = await fetch(`${baseUrl}/retired-page`, { redirect: "manual" });
  assert.equal(response.status, 301, "the SQLite composition's own createSiteApp() must see the same redirect the control just proved exists");
  assert.equal(response.headers.get("location"), "/current");
});

test("createSiteApp() sees a phase handler registered through this process's ESM routing.ts (one instance)", async (t) => {
  const { deps } = await bootSqliteSite(t);
  const dispose = registerResolvePhase({ phase: "pre_content", resolver: async (p) =>
    p === "/one-instance-probe" ? { kind: "redirect", location: "/one-instance-target", statusCode: 302 } : null });
  t.after(dispose);

  const baseUrl = await startTestServer(deps.createSiteApp(), t);
  const response = await fetch(`${baseUrl}/one-instance-probe`, { redirect: "manual" });
  assert.equal(response.status, 302, "createSiteApp() must consult the SAME phaseRegistry this process's registerResolvePhase wrote into");
  assert.equal(response.headers.get("location"), "/one-instance-target");
});

test("createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers", async (t) => {
  const { deps } = await bootSqliteSite(t);
  const bus = new SubscribeCountingBus();
  (deps as { bus: EventBusPort }).bus = bus;

  createApp(deps);
  const servedOnce = Object.fromEntries(bus.subscriptions);
  // Three distinct subscribers, each once: forms' consent-gated form_submitted analytics (cbf441365),
  // forms' notify mail, and integrations' webhook fan-out.
  assert.equal(servedOnce["form.submission.received"], 3, "sanity: forms analytics, forms notify and webhook fan-out each subscribe once");

  deps.createSiteApp();
  deps.createSiteApp();

  assert.deepEqual(
    Object.fromEntries(bus.subscriptions),
    servedOnce,
    "createSiteApp() must reuse this process's own busesWithSiteEventHandlers guard, not a second copy's empty WeakSet"
  );

  const sentTo: string[] = [];
  t.mock.method(deps.mailer, "send", async (message: OutboundEmail) => {
    sentTo.push(message.to.email);
    return { ok: true, providerMessageId: "module-identity-mail" };
  });
  const now = deps.clock.nowIso();
  await deps.formDefinitionRepo.create({ id: "module-identity-form", workspaceId: deps.workspaceId,
    name: "Module Identity Contact", slug: "module-identity-contact", fields: [],
    notify: { enabled: true, recipients: ["module-owner@example.test"] }, status: "active", createdAt: now, updatedAt: now, version: 1 });
  await deps.formSubmissionRepo.create({ id: "module-identity-submission", workspaceId: deps.workspaceId,
    formDefinitionId: "module-identity-form", data: { message: "One composed delivery" }, sourceIp: "127.0.0.1", submittedAt: now });
  const owner = await deps.ownerPrincipalId;
  const { subscription } = await createSubscription({
    deps: { repo: deps.webhookSubscriptionRepo, clock: deps.clock, idGenerator: deps.idGen,
      isAllowedTarget: async (url) => url === "https://module-owner.example.test/hook" },
    input: { workspaceId: deps.workspaceId, ownerPrincipalId: owner, createdByPrincipalId: owner,
      label: "Module identity hook", targetUrl: "https://module-owner.example.test/hook", topics: ["form.submission.received"] },
  });
  await bus.publish({ id: "module-identity-event", name: "form.submission.received", workspaceId: deps.workspaceId,
    occurredAt: now, payload: { workspaceId: deps.workspaceId, formDefinitionId: "module-identity-form", submissionId: "module-identity-submission" } });
  assert.deepEqual(sentTo, ["module-owner@example.test"]);
  const deliveries = await deps.webhookDeliveryRepo.listBySubscription({ workspaceId: deps.workspaceId, subscriptionId: subscription.id, limit: 10 });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].eventId, "module-identity-event");
  assert.equal(deliveries[0].status, "pending");
});

test("createSiteApp() exposes its BYOK boot pass on siteAppBootWork until it settles, so tovu export can await it", async (t) => {
  const { deps } = await bootSqliteSite(t);
  assert.equal(deps.siteAppBootWork?.size, 0);
  deps.createSiteApp();
  const pending = [...(deps.siteAppBootWork ?? [])];
  assert.equal(pending.length, 1, "the BYOK tool-registration pass createApp started");
  await Promise.allSettled(pending);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deps.siteAppBootWork?.size, 0, "a settled pass leaves the set");
});

for (const entry of ["createSiteApp", "createApp"] as const) {
  test(`${entry}: closing the site drains plugin initialization and BYOK before closing SQLite`, async (t) => {
    const { deps, close } = await bootSqliteSite(t);
    await deps.pluginRuntimeReady;
    const getActivation = deps.pluginActivationRepo.getActivation.bind(deps.pluginActivationRepo);
    let releaseByok!: () => void;
    let enteredByok!: () => void;
    let releasePlugins!: () => void;
    const byokGate = new Promise<void>((resolve) => { releaseByok = resolve; });
    const byokEntered = new Promise<void>((resolve) => { enteredByok = resolve; });
    const pluginGate = new Promise<void>((resolve) => { releasePlugins = resolve; });
    let byokReadFinished = false;
    let pluginReadFinished = false;
    // Hold the real SQL read at the injected repo boundary, after discovery has reached it.
    deps.pluginActivationRepo.getActivation = async (input) => {
      enteredByok();
      await byokGate;
      const activation = await getActivation(input);
      byokReadFinished = true;
      return activation;
    };
    // Model an initializer paused before its last SQL read, through the production readiness port.
    deps.pluginRuntimeReady = pluginGate.then(async () => {
      await getActivation({ workspaceId: deps.workspaceId, pluginId: "charts-recharts" });
      pluginReadFinished = true;
    });

    let closed = false;
    let closing: Promise<void> | undefined;
    try {
      if (entry === "createSiteApp") deps.createSiteApp();
      else createApp(deps);
      await byokEntered;
      assert.equal(deps.siteAppBootWork?.size, 1);
      closing = close().then(() => { closed = true; });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(closed, false, "close must wait for plugin initialization");
      assert.equal(pluginReadFinished, false);

      releasePlugins();
      await deps.pluginRuntimeReady;
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(pluginReadFinished, true, "the initializer's final SQL read used the open database");
      assert.equal(closed, false, "close must also wait for the app's independent BYOK pass");
      assert.equal(byokReadFinished, false);
    } finally {
      releasePlugins();
      releaseByok();
      await closing;
    }
    assert.equal(byokReadFinished, true, "BYOK's final SQL read used the open database");
    assert.equal(closed, true);
    assert.equal(deps.siteAppBootWork?.size, 0);
    await assert.rejects(getActivation({ workspaceId: deps.workspaceId, pluginId: "charts-recharts" }), {
      message: "The database connection is not open",
    });
  });
}
