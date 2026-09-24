import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";

import type { SitesToolDeps } from "../deps.js";
import { buildSitesRegistrations } from "../tool-registrations.js";

/**
 * @file `sites_duplicate_site` asks the human first (2026-09-24 tool-design audit, F3): the copy
 * carries the whole site database, saved credentials included, into a new site. The dialog names
 * the source and the new folder, and nothing is copied until the confirm click.
 */

const PRINCIPAL_ID = "principal-under-test";
const TOOL_ID = "sites_duplicate_site";
const INPUT = { sourceName: "source-site", targetName: "new-client", displayName: "New Client" };

function makeDeps(calls: unknown[]): SitesToolDeps {
  return {
    workspaceId: "ws-sites-confirm",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    isSiteSwitcherEnabled: () => true,
    listSites: () => [
      { name: "source-site", dir: "/tmp/fake-cwd/sites/source-site", displayName: "Source Site", createdAt: "2026-09-05T00:00:00.000Z", active: false },
    ],
    duplicateSite: (required) => {
      calls.push(required);
      return { siteId: "new-site-id", dir: required.targetDir };
    },
    cwd: "/tmp/fake-cwd",
  };
}

function duplicateTool(deps: SitesToolDeps, surfaceExchanges: SurfaceExchangeStore): ToolRegistration {
  const found = buildSitesRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === TOOL_ID);
  assert.ok(found);
  return found;
}

function call(registration: ToolRegistration, emitSurface?: SurfaceEmitter) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input: INPUT,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function raiseDialog(registration: ToolRegistration) {
  const emitted: unknown[] = [];
  const pending = call(registration, async (s) => void emitted.push(s));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  return { pending, html, exchangeId: match[1]! };
}

test("the dialog names the source and the new folder, warns about credentials, and nothing is copied while open", async () => {
  const calls: unknown[] = [];
  const store = createSurfaceExchangeStore();
  const { html, exchangeId, pending } = await raiseDialog(duplicateTool(makeDeps(calls), store));

  assert.match(html, /Copy this whole site into a new one\?/);
  assert.match(html, /Source Site \(source-site\)/);
  assert.match(html, /sites\/new-client/);
  assert.match(html, /saved connections and access tokens/);
  assert.equal(calls.length, 0);

  store.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("confirm: the site is copied and the same call reports it", async () => {
  const calls: unknown[] = [];
  const store = createSurfaceExchangeStore();
  const { exchangeId, pending } = await raiseDialog(duplicateTool(makeDeps(calls), store));

  store.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  assert.deepEqual(await pending, {
    duplicated: true,
    name: "new-client",
    dir: "/tmp/fake-cwd/sites/new-client",
    siteId: "new-site-id",
    sourceName: "source-site",
  });
  assert.equal(calls.length, 1);
});

test("cancel: nothing is copied and the model is told the user cancelled", async () => {
  const calls: unknown[] = [];
  const store = createSurfaceExchangeStore();
  const { exchangeId, pending } = await raiseDialog(duplicateTool(makeDeps(calls), store));

  store.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  assert.deepEqual(await pending, { duplicated: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.equal(calls.length, 0);
});

test("with no emitSurface the copy is refused and nothing is copied", async () => {
  const calls: unknown[] = [];
  await assert.rejects(() => call(duplicateTool(makeDeps(calls), createSurfaceExchangeStore())), {
    name: "ToolInputError",
    message:
      "SITES_NO_CONFIRMATION_CHANNEL: sites_duplicate_site: this execution context has no interactive " +
      "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
  });
  assert.equal(calls.length, 0);
});
