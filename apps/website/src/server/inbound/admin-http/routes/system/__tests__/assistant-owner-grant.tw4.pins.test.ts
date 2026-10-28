import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective } from "@jini-ai/core/settings";
import { ensureExecutionSettingDefinitions } from "#src/assistant/execution-mode-settings";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE as namespace } from "#src/contracts/headless/assistant-permanent-deletes-policy";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAssistantOwnerGrantRoutes, type AssistantOwnerGrantDeps } from "../assistant-owner-grant.js";

async function fixture({ previous = false, requireAcknowledgment }: { previous?: boolean; requireAcknowledgment?: boolean }, _options = {}) {
  const repo = new InMemorySettingsRepo();
  let counter = 0;
  const clock = { nowMs: () => 0, nowIso: () => "2026-10-20T00:00:00.000Z" };
  const idGen = { newId: () => `grant-${++counter}` };
  await ensureExecutionSettingDefinitions({ settingsRepo: repo, clock, ids: idGen,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: "system" });
  const deps = { workspaceId: "ws", settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    settingsRepo: repo, clock, idGen, getEffective, ownerPrincipalId: Promise.resolve("owner"),
    principalRepo: { findById: async () => null, findActiveById: async () => null, list: async () => [], save: async () => {} },
    authorize: async () => ({ allowed: true, reason: "pin" }),
  } satisfies AssistantOwnerGrantDeps;
  const app = express();
  let parses = 0;
  registerAssistantOwnerGrantRoutes({ app, deps, path: "/grant", namespace, key: "policy", writeReason: "owner only", validationError: "invalid grant",
    read: async () => ({ enabled: previous, allowedToolIds: [] as string[] }),
    parse: body => { parses++; return { enabled: body.enabled as boolean, allowedToolIds: [] as string[] }; },
    value: settings => settings,
  }, { requireAcknowledgment });
  return { parses: () => parses, repo, async put({ body, actor = "owner" }: { body: unknown; actor?: string }, _options = {}) {
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: actor };
    await extractRouteHandler(app, "put", "/grant")({ params: { workspaceId: "ws" }, body }, res);
    return capture;
  } };
}

test("grant rejects non-owner before parsing and malformed enabled bodies before reading/writing", async () => {
  const f = await fixture({});
  assert.equal((await f.put({ body: null, actor: "admin" })).statusCode, 403);
  for (const body of [null, undefined, [], {}, { enabled: "true" }]) {
    assert.deepEqual(await f.put({ body }), { statusCode: 400, jsonBody: { error: "invalid grant", code: "VALIDATION_ERROR" } });
  }
  assert.equal(f.parses(), 0);
});

test("grant acknowledgment is strict and only needed for an enabled transition under the default policy", async () => {
  for (const riskAcknowledged of [undefined, false, "true"]) {
    const f = await fixture({});
    assert.equal((await f.put({ body: { enabled: true, riskAcknowledged } })).statusCode, 400);
    assert.equal(f.parses(), 1);
  }
  const cases = [
    { previous: false, enabled: true, riskAcknowledged: true, receipt: true },
    { previous: true, enabled: true, receipt: false },
    { previous: false, enabled: false, receipt: false },
    { previous: true, enabled: false, receipt: false },
    { previous: false, enabled: true, requireAcknowledgment: false, receipt: false },
  ];
  for (const input of cases) {
    const f = await fixture(input);
    assert.equal((await f.put({ body: input })).statusCode, 200);
    const definitions = await f.repo.listActiveDefinitions({ workspaceId: null });
    const receipt = definitions.find(def => def.namespace === namespace && def.key === "riskAcknowledgment")!;
    const values = (await f.repo.listRevisions({ settingId: receipt.settingId })).filter(row => row.entityKind === "value");
    assert.equal(values.length, input.receipt ? 1 : 0);
    if (input.receipt) assert.deepEqual(values[0]?.afterJson, { riskAcknowledged: true, acknowledgedAt: "2026-10-20T00:00:00.000Z", grant: { enabled: true, allowedToolIds: [] } });
  }
});
