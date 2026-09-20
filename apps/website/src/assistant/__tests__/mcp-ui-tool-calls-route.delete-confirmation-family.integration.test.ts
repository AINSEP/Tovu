import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

import { InMemorySettingsRepo } from "#src/features/settings/index";
import { createCommentHookRegistry } from "#src/features/comments/hooks";
import { InMemoryCommentRepo } from "#src/features/comments/repo.memory";
import { createCommentWriteService } from "#src/features/comments/write-service";
import { buildCommentsRegistrations, type CommentsToolDeps } from "#src/features/comments/tool-registrations";

import { PRE_AUTHORIZED } from "#src/features/widgets/authorize-helper";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryWidgetRegionBindingRepo } from "#src/features/widgets/repo.memory";
import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { createWidgetInstance } from "#src/features/widgets/write-service";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "#src/features/widgets/tool-registrations";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { buildThemesRegistrations, type ThemeToolDeps } from "#src/features/theme/tool-registrations";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
import { redirectMatcher } from "#src/features/redirects/matcher";
import type { RedirectDbHandle } from "#src/features/redirects/ports.internal";
import { InMemoryRedirectRepo } from "#src/features/redirects/repo.memory";
import type { RedirectsWriteDeps } from "#src/features/redirects/redirects";
import { createRedirect } from "#src/features/redirects/redirects";
import { removeVia } from "#src/features/redirects/__tests__/remove-redirect-double";
import { buildRedirectsRegistrations, type RedirectsToolDeps } from "#src/features/redirects/tool-registrations";

import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "#src/features/webhooks/repo.memory";
import { createSubscription } from "#src/features/webhooks/subscriptions";
import { buildWebhooksRegistrations, type IntegrationsToolDeps } from "#src/features/webhooks/tool-registrations";
import { commentTrashDoubles } from "#src/features/comments/__tests__/comment-trash-doubles";

/**
 * @file Route-level allowlist proof for the five sibling tools of `media_trash_asset` in the same
 * 2026-09-08 delete-confirmation build (ADS-memory/reports/2026-09-08-delete-confirmation-build.md):
 * `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone`,
 * `webhooks_delete_subscription`. Modeled directly on
 * `mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`'s own module doc: none of these
 * domains' handler-level confirmation-gate tests (each domain's own
 * `agent-tools.*-confirmation.test.ts` / `tool-registrations.themes-trash-restore.test.ts`) ever
 * calls `surfaceExchanges.deliver()` through the real `MCP_UI_TOOL_CALLS_PATH` route — only
 * `registerMcpUiToolCallsRoute` consults `isMcpUiToolCallAllowed`
 * (`mcp-ui-tool-calls-route.ts:184`), so a tool can register, render a correct dialog, and pass
 * every handler-level test while still 403ing on every real confirm/cancel click, exactly the way
 * `media_trash_asset` shipped for one commit. All five tools below are correctly present in
 * `MCP_UI_REDEEMABLE_TOOL_IDS` today (`mcp-ui-tool-calls.ts`) — there is no live bug — but until
 * this file, nothing would have caught it if one of them regressed out of that set, the same gap
 * that let `media_trash_asset` ship broken.
 *
 * One file, five independent scenarios: each produces its OWN pair of named `test()` cases (confirm
 * + cancel) via the loop at the bottom, so a broken allowlist entry for any one domain fails ONLY
 * that domain's own named test — this deliberately does not collapse the five tool ids into a single
 * alternation-style assertion, which would stay green while tolerating one broken member (the exact
 * failure mode `MCP_UI_REDEEMABLE_TOOL_IDS`'s own header warns about).
 */

const PRINCIPAL = "principal-admin-1";
const NOW = "2026-07-29T00:00:00.000Z";

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe
 *  would (same technique the media-trash-asset integration test uses). */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

interface Scenario {
  /** Also the real tool id — asserted against, and embedded in every generated test's name so a
   *  failure names its own domain rather than an anonymous shared assertion. */
  toolId: string;
  /** Builds a fresh, isolated tool registry + seeded entity for this domain, wired against the ONE
   *  `surfaceExchanges` store the caller also hands to `registerMcpUiToolCallsRoute` — the handler's
   *  `open()` and the route's `deliver()` must resolve the same exchange id against the same store.
   *  Returns the params the trash/tombstone/delete tool call needs, plus shape checks for the
   *  confirmed and cancelled results. */
  setup(surfaceExchanges: SurfaceExchangeStore): Promise<{
    toolExecutor: ReturnType<typeof createToolExecutor>;
    trashParams: Record<string, unknown>;
    assertConfirmed(output: unknown): void;
    assertCancelled(output: unknown): void;
  }>;
}

async function setupComments(surfaceExchanges: SurfaceExchangeStore): ReturnType<Scenario["setup"]> {
  const workspaceId = "ws-mcp-ui-comments-trash-integration";
  const commentRepo = new InMemoryCommentRepo();
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => NOW };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const commentWriteService = createCommentWriteService({ repo: commentRepo, outbox: { enqueue: async () => {} }, hooks: createCommentHookRegistry(), clock, idGen, ...commentTrashDoubles() });
  const deps = {
    workspaceId,
    clock,
    idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    commentRepo,
    commentWriteService,
    commentsReady: Promise.resolve(),
    commentsSettingsReady: Promise.resolve(),
    settingsRepo,
  } as unknown as CommentsToolDeps;

  await commentRepo.create({
    id: "comment-1",
    workspaceId,
    entryId: "entry-1",
    parentId: null,
    threadRootId: "comment-1",
    depth: 0,
    status: "pending",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.test",
    authorUrl: null,
    authorIpHash: "hash",
    bodyText: "Great post!",
    spamScore: 0.1,
    spamProvider: "heuristic",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  });

  const registry = createToolRegistry();
  for (const registration of buildCommentsRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return {
    toolExecutor,
    trashParams: { commentId: "comment-1", expectedVersion: 1 },
    assertConfirmed: (output) => assert.equal((output as { trashed: boolean }).trashed, true),
    assertCancelled: (output) => {
      const o = output as { trashed: boolean; cancelled: boolean };
      assert.equal(o.trashed, false);
      assert.equal(o.cancelled, true);
    },
  };
}

async function setupWidgets(surfaceExchanges: SurfaceExchangeStore): ReturnType<Scenario["setup"]> {
  const workspaceId = "ws-mcp-ui-widgets-trash-integration";
  let counter = 0;
  const deps = {
    workspaceId,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: { marker: "not needed by this suite" } as unknown as WidgetsToolDeps["postRepo"],
    changeSets: { marker: "not needed by this suite" } as unknown as WidgetsToolDeps["changeSets"],
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize: PRE_AUTHORIZED,
  } as WidgetsToolDeps;

  const { instance } = await createWidgetInstance({
    deps: buildWidgetsDeps(deps),
    input: { workspaceId, actor: { principalId: PRINCIPAL }, widgetType: "text", title: "Announcement Bar", config: { body: "hi" } },
  });

  const registry = createToolRegistry();
  for (const registration of buildWidgetsRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return {
    toolExecutor,
    trashParams: { widgetInstanceId: instance.id },
    assertConfirmed: (output) => assert.equal((output as { trashed: boolean }).trashed, true),
    assertCancelled: (output) => {
      const o = output as { trashed: boolean; cancelled: boolean };
      assert.equal(o.trashed, false);
      assert.equal(o.cancelled, true);
    },
  };
}

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-mcp-ui-theme-trash-integration-"));
  const dir = path.join(root, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 }, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}", "utf8");
  return root;
}

async function setupTheme(surfaceExchanges: SurfaceExchangeStore): ReturnType<Scenario["setup"]> {
  const workspaceId = "ws-mcp-ui-theme-trash-integration";
  const themesDir = makeThemesRoot();
  const deps = {
    workspaceId,
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as ThemeToolDeps;

  const registry = createToolRegistry();
  for (const registration of buildThemesRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return {
    toolExecutor,
    trashParams: { themeId: "plain", path: "styles.css" },
    assertConfirmed: (output) => assert.equal((output as { trashed: boolean }).trashed, true),
    assertCancelled: (output) => {
      const o = output as { trashed: boolean; cancelled: boolean };
      assert.equal(o.trashed, false);
      assert.equal(o.cancelled, true);
    },
  };
}

async function setupRedirects(surfaceExchanges: SurfaceExchangeStore): ReturnType<Scenario["setup"]> {
  const workspaceId = "ws-mcp-ui-redirects-tombstone-integration";
  const redirectRepo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo([
    { workspaceId, origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: NOW, source: "workspace-setting" }), redirectAllowlist: [] },
  ]);
  let idTick = 0;
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: removeVia(redirectRepo),
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
  const deps = {
    workspaceId,
    redirectRepo,
    redirectHitSink: { record: async () => undefined, getStats: async () => null, listStats: async () => [] },
    redirectsWriteDeps,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as RedirectsToolDeps;

  const { record } = await createRedirect({
    deps: redirectsWriteDeps,
    input: { workspaceId, matchType: "exact", fromPattern: "/old-page", toTarget: "/new-page", statusCode: 301, actorId: PRINCIPAL },
  });

  const registry = createToolRegistry();
  for (const registration of buildRedirectsRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return {
    toolExecutor,
    trashParams: { id: record.id },
    assertConfirmed: (output) => assert.equal((output as { tombstoned: boolean }).tombstoned, true),
    assertCancelled: (output) => {
      const o = output as { tombstoned: boolean; cancelled: boolean };
      assert.equal(o.tombstoned, false);
      assert.equal(o.cancelled, true);
    },
  };
}

async function setupWebhooks(surfaceExchanges: SurfaceExchangeStore): ReturnType<Scenario["setup"]> {
  const workspaceId = "ws-mcp-ui-webhooks-delete-integration";
  const webhookSubscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();
  const originRegistry = { isAllowedEgressTarget: async () => true };
  let idCounter = 0;
  const clock = { nowIso: () => NOW };
  const idGen = { newId: () => `sub-${++idCounter}` };
  const deps = {
    workspaceId,
    webhookSubscriptionRepo,
    webhookDeliveryRepo,
    originRegistry,
    clock,
    idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as IntegrationsToolDeps;

  const { subscription } = await createSubscription({
    deps: {
      clock,
      repo: webhookSubscriptionRepo,
      idGenerator: idGen,
      isAllowedTarget: (url: string) => originRegistry.isAllowedEgressTarget({ workspaceId }, url),
    },
    input: {
      workspaceId,
      ownerPrincipalId: PRINCIPAL,
      createdByPrincipalId: PRINCIPAL,
      label: "Order events",
      targetUrl: "https://example.test/hooks/orders",
      topics: ["order.created"],
    },
  });

  const registry = createToolRegistry();
  for (const registration of buildWebhooksRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return {
    toolExecutor,
    trashParams: { subscriptionId: subscription.id },
    assertConfirmed: (output) => assert.equal((output as { deleted: boolean }).deleted, true),
    assertCancelled: (output) => {
      const o = output as { deleted: boolean; cancelled: boolean };
      assert.equal(o.deleted, false);
      assert.equal(o.cancelled, true);
    },
  };
}

const SCENARIOS: Scenario[] = [
  { toolId: "comments_trash_comment", setup: setupComments },
  { toolId: "widgets_trash_instance", setup: setupWidgets },
  { toolId: "theme_trash_file", setup: setupTheme },
  { toolId: "redirects_tombstone", setup: setupRedirects },
  { toolId: "webhooks_delete_subscription", setup: setupWebhooks },
];

for (const scenario of SCENARIOS) {
  test(`real round trip: a browser confirmation click for ${scenario.toolId} is accepted by the allowlist`, async (t) => {
    const surfaceExchanges = createSurfaceExchangeStore();
    const { toolExecutor, trashParams, assertConfirmed } = await scenario.setup(surfaceExchanges);

    const emitted: SurfaceEmission[] = [];
    const pending = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, scenario.toolId, trashParams, undefined, async (emission: SurfaceEmission) => {
      emitted.push(emission);
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(emitted.length, 1, `the ${scenario.toolId} dialog must be emitted before the call parks`);
    const exchangeId = exchangeIdFromEmission(emitted[0]!);

    const app = express();
    app.use(express.json());
    registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
    const baseUrl = await startTestServer(app, t);

    const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
      body: JSON.stringify({ toolName: scenario.toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } }),
    });

    const body = (await res.json()) as { delivered: boolean; error?: string; code?: string };
    // The load-bearing assertion: if `scenario.toolId` were missing from `MCP_UI_REDEEMABLE_TOOL_IDS`,
    // this route refuses BEFORE ever touching the exchange (`mcp-ui-tool-calls-route.ts:184`) and
    // this would be `403 TOOL_NOT_ALLOWLISTED`, not 202 — the exact failure `media_trash_asset`
    // produced for one commit against a live browser click.
    assert.equal(res.status, 202, `expected the allowlist to accept ${scenario.toolId}'s delivery: ${JSON.stringify(body)}`);
    assert.equal(body.delivered, true);

    const executed = await pending;
    assert.equal(executed.status, "completed", `the parked ${scenario.toolId} call must resolve completed: ${JSON.stringify(executed)}`);
    assertConfirmed(executed.output);
  });

  test(`SECURITY: a Cancel click for ${scenario.toolId} also reaches the allowlist and reports the cancellation, not a 403`, async (t) => {
    const surfaceExchanges = createSurfaceExchangeStore();
    const { toolExecutor, trashParams, assertCancelled } = await scenario.setup(surfaceExchanges);

    const emitted: SurfaceEmission[] = [];
    const pending = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, scenario.toolId, trashParams, undefined, async (emission: SurfaceEmission) => {
      emitted.push(emission);
    });
    await new Promise((resolve) => setImmediate(resolve));
    const exchangeId = exchangeIdFromEmission(emitted[0]!);

    const app = express();
    app.use(express.json());
    registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
    const baseUrl = await startTestServer(app, t);

    const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
      body: JSON.stringify({ toolName: scenario.toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } }),
    });

    assert.equal(res.status, 202, `Cancel must reach ${scenario.toolId}'s exchange too — the allowlist gates the tool, not the decision`);

    const executed = await pending;
    assertCancelled(executed.output);
  });
}
