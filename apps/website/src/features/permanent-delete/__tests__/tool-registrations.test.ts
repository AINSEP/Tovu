import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { buildPermanentDeleteRegistrations, contributePermanentDeleteTools, permanentDeleteDerivedRisk, type PermanentDeleteToolDeps } from "../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/** Owner n01: exercise the real human exchange, including forged model inputs and revocation. */
const CASES = [
  ["trash_empty", {}, "content.read"],
  ["trash_purge_item", { trashItemId: "row-1" }, "content.read"],
  ["media_purge_asset", { mediaId: "m-1" }, "media.delete.force"],
  ["comments_purge_comment", { commentId: "c-1" }, "comments.delete.force"],
  ["identity_user_delete", { principalId: "u-1" }, "user.manage"],
  ["external_mcp_delete", { serverId: "s-1" }, "admin.integrations.manage"],
  ["custom_credential_delete", { credentialId: "k-1" }, "custom-credentials.write"],
  ["deployment_delete_provider_credential", { credentialId: "k-1" }, "system.publish"],
  ["source_control_delete_credential", { credentialId: "k-1" }, "source-control.credentials.write"],
] as const;

function harness(id: string, input: unknown, permission: string) {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writes: string[] = [];
  const permissions: string[] = [];
  let allowed = true;
  let exists = true;
  const deps: PermanentDeleteToolDeps = {
    workspaceId: "ws-1",
    authorize: async spec => { permissions.push(spec.permission); return { allowed, reason: "test-policy" }; },
    prepare: async () => {
      if (!exists) throw new ToolInputError({ message: `${id}: item was not found. List the resource and check its id.` });
      return {
        details: [{ label: "Item", value: "Named item (id-1)" }],
        execute: async () => { writes.push(id); return { removed: true, id: "id-1" }; },
      };
    },
  };
  const registration = buildPermanentDeleteRegistrations(deps, { surfaceExchanges: store, assertChatDeleteAllowed: async () => {} }).find(r => r.descriptor.id === id)!;
  const controller = new AbortController();
  const ctx: ToolExecutionContext = { executionId: "e-1", principal: { id: "owner" }, run: { id: "r-1" }, input, signal: controller.signal };
  // Mutable here so each case can install its own emitter; `ToolExecutionOptions` itself is readonly.
  const options: { emitSurface?: SurfaceEmitter } = {};
  return { deps, options, store, writes, permissions, permission, registration, ctx, controller, setAllowed: (v: boolean) => { allowed = v; }, setExists: (v: boolean) => { exists = v; } };
}

for (const [id, input, permission] of CASES) {
  test(`${id}: happy path holds the call until the named human confirms; authorizes again`, async () => {
    const h = harness(id, input, permission);
    let emitted = false;
    h.options.emitSurface = async emission => {
      emitted = true;
      assert.deepEqual(h.writes, [], "the effect must wait for the click");
      assert.equal(emission.channel, "mcp-ui");
      const html = JSON.stringify(emission.payload);
      assert.match(html, /Named item/);
      const exchangeId = h.store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!;
      assert.deepEqual(h.store.deliver({ exchangeId, principalId: "other-user", params: { decision: "confirm" } }, { toolId: id }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(h.store.deliver({ exchangeId, principalId: "owner", params: { decision: "confirm" } }, { toolId: "other-tool" }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(h.store.deliver({ exchangeId, principalId: "owner", params: { decision: "confirm", credentialId: "different-id" } }, { toolId: id }), { ok: true });
    };
    assert.deepEqual(await h.registration.handler(h.ctx, h.options), { removed: true, id: "id-1" });
    assert.equal(emitted, true);
    assert.deepEqual(h.writes, [id]);
    assert.deepEqual(h.permissions, [permission, permission]);
    assert.equal(h.registration.descriptor.readOnly, false);
    assert.equal(permanentDeleteDerivedRisk.get(id), "mutates-durable-state");
  });

  test(`${id}: no confirmation channel fails closed`, async () => {
    const h = harness(id, input, permission);
    await assert.rejects(h.registration.handler(h.ctx, h.options), { message: `PERMANENT_DELETE_NO_CONFIRMATION_CHANNEL: ${id}: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.` });
    assert.deepEqual(h.writes, []);
  });

  for (const params of [{ decision: "cancel" }, { __typedAnswer: "yes please delete it" }, { confirmed: true }]) {
    test(`${id}: ${JSON.stringify(params)} is not a confirm click`, async () => {
      const h = harness(id, input, permission);
      h.options.emitSurface = async () => {
        const exchangeId = h.store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!;
        h.store.deliver({ exchangeId, principalId: "owner", params }, { toolId: id });
      };
      assert.deepEqual(await h.registration.handler(h.ctx, h.options), { removed: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
      assert.deepEqual(h.writes, []);
    });
  }

  for (const field of ["confirmed", "decision", "__exchangeId", "confirmationToken"]) {
    test(`${id}: rejects model-supplied ${field}`, async () => {
      const h = harness(id, { ...input, [field]: "confirm" }, permission);
      await assert.rejects(h.registration.handler(h.ctx, h.options), { message: `'${field}' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can.` });
      assert.deepEqual(h.writes, []);
      assert.deepEqual(h.permissions, []);
    });
  }

  test(`${id}: permission denied before the card`, async () => {
    const h = harness(id, input, permission);
    h.setAllowed(false);
    h.options.emitSurface = async () => { assert.fail("must not emit a card"); };
    await assert.rejects(h.registration.handler(h.ctx, h.options), { message: `principal 'owner' is not authorized for '${permission}' (test-policy)` });
    assert.deepEqual(h.writes, []);
  });

  test(`${id}: permission revoked during confirmation`, async () => {
    const h = harness(id, input, permission);
    h.options.emitSurface = async () => {
      h.setAllowed(false);
      h.store.deliver({ exchangeId: h.store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!, principalId: "owner", params: { decision: "confirm" } }, { toolId: id });
    };
    await assert.rejects(h.registration.handler(h.ctx, h.options), { message: `principal 'owner' is not authorized for '${permission}' (test-policy)` });
    assert.deepEqual(h.writes, []);
  });

  test(`${id}: not found before the card`, async () => {
    const h = harness(id, input, permission);
    h.setExists(false);
    h.options.emitSurface = async () => { assert.fail("must not emit a card"); };
    await assert.rejects(h.registration.handler(h.ctx, h.options), { message: `${id}: item was not found. List the resource and check its id.` });
    assert.deepEqual(h.writes, []);
  });

  test(`${id}: cancelled run abandons confirmation without an effect`, async () => {
    const h = harness(id, input, permission);
    h.options.emitSurface = async () => { h.controller.abort(); };
    assert.deepEqual(await h.registration.handler(h.ctx, h.options), { removed: false, cancelled: false, reason: "abandoned", note: "The confirmation dialog was closed because the run ended. Nothing was changed." });
    assert.deepEqual(h.writes, []);
  });
}

test("expired human confirmation returns an explicit refusal without a delete", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 5, maxLifetimeMs: 20 });
  let deletes = 0;
  const registration = buildPermanentDeleteRegistrations({
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
    prepare: async () => ({ details: [{ label: "Item", value: "Named item" }], execute: async () => { deletes++; return { removed: true }; } }),
  }, { surfaceExchanges: store, assertChatDeleteAllowed: async () => {} }).find(r => r.descriptor.id === "trash_empty")!;
  const keepAlive = setTimeout(() => {}, 50); // The production exchange timers deliberately unref().
  try {
  assert.deepEqual(await registration.handler({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal }, { emitSurface: async () => {} }), {
    removed: false, cancelled: false, reason: "expired", note: "The user did not answer the confirmation dialog before it expired. Nothing was changed. Do not retry this action or reopen its confirmation automatically. Tell the user it expired and nothing changed, then wait for a new explicit request.",
  });
  assert.equal(deletes, 0);
  } finally { clearTimeout(keepAlive); }
});

test("a whitespace-only delete id is refused before authorization or preparation", async () => {
  const h = harness("media_purge_asset", { mediaId: " \t " }, "media.delete.force");
  h.deps.prepare = async () => { assert.fail("an empty id must never be prepared"); };
  await assert.rejects(h.registration.handler(h.ctx, h.options), {
    name: "ToolInputError", message: "media_purge_asset: 'mediaId' must be a non-empty id.",
  });
  assert.deepEqual(h.permissions, []);
  assert.deepEqual(h.writes, []);
});

test("a run aborted during final reauthorization does not execute a confirmed delete", async () => {
  const h = harness("media_purge_asset", { mediaId: "m-1" }, "media.delete.force");
  let checks = 0;
  h.deps.authorize = async () => {
    checks++;
    if (checks === 2) h.controller.abort();
    return { allowed: true, reason: "matched" };
  };
  h.options.emitSurface = async () => {
    h.store.deliver({ exchangeId: h.store.findTypedAnswerTarget({ principalId: "owner", toolId: "media_purge_asset" })!, principalId: "owner", params: { decision: "confirm" } }, { toolId: "media_purge_asset" });
  };
  assert.deepEqual(await h.registration.handler(h.ctx, h.options), {
    removed: false, cancelled: false, reason: "abandoned",
    note: "The confirmation dialog was closed because the run ended. Nothing was changed.",
  });
  assert.equal(checks, 2);
  assert.deepEqual(h.writes, []);
});

test("a prepared delete's specific warning is shown before its effect", async () => {
  const h = harness("trash_empty", {}, "content.read");
  h.deps.prepare = async () => ({
    details: [{ label: "Snapshot", value: "Two saved items" }],
    warning: "Both saved items will be lost.",
    execute: async () => { h.writes.push("trash_empty"); return { removed: true }; },
  });
  let card = "";
  h.options.emitSurface = async emission => {
    card = JSON.stringify(emission.payload);
    h.store.deliver({ exchangeId: h.store.findTypedAnswerTarget({ principalId: "owner", toolId: "trash_empty" })!, principalId: "owner", params: { decision: "confirm" } }, { toolId: "trash_empty" });
  };
  assert.deepEqual(await h.registration.handler(h.ctx, h.options), { removed: true });
  assert.match(card, /Both saved items will be lost\./);
  assert.deepEqual(h.writes, ["trash_empty"]);
});

test("the contributor binds its host dependencies and confirmation surface to executable tools", async () => {
  const h = harness("trash_empty", {}, "content.read");
  const host = {} as Parameters<Parameters<typeof contributePermanentDeleteTools>[0]["buildDeps"]>[0];
  const contributor = contributePermanentDeleteTools({ buildDeps: routeDeps => {
    assert.equal(routeDeps, host);
    return h.deps;
  } });
  const surfaces = { surfaceExchanges: h.store, assertChatDeleteAllowed: async () => {} };
  const registrations = contributor.build(host, surfaces);
  const registration = registrations.find(entry => entry.descriptor.id === "trash_empty");
  assert.ok(registration);
  h.options.emitSurface = async () => {
    h.store.deliver({ exchangeId: h.store.findTypedAnswerTarget({ principalId: "owner", toolId: "trash_empty" })!, principalId: "owner", params: { decision: "confirm" } }, { toolId: "trash_empty" });
  };
  assert.equal(contributor.domain, "permanent-delete");
  assert.deepEqual(await registration.handler(h.ctx, h.options), { removed: true, id: "id-1" });
  assert.deepEqual(h.writes, ["trash_empty"]);
});

for (const [id, input, permission] of CASES) {
  test(`${id}: raw handler without a site policy port refuses even a human-confirmed request`, async () => {
    const h = harness(id, input, permission);
    const tools = buildPermanentDeleteRegistrations({ workspaceId: "ws-1", authorize: async () => ({ allowed: true, reason: "matched" }), prepare: async () => ({ details: [], execute: async () => { h.writes.push(id); return {}; } }) }, { surfaceExchanges: h.store });
    await assert.rejects(tools.find(tool => tool.descriptor.id === id)!.handler(h.ctx, { emitSurface: async () => assert.fail("OFF must never emit a card") }), (error: Error) => error.message.includes("permanent deletes from chat are disabled"));
    assert.deepEqual(h.writes, []);
  });
  test(`${id}: a setting revoked during the human wait refuses before the effect`, async () => {
    const h = harness(id, input, permission);
    let enabled = true, reads = 0;
    const tools = buildPermanentDeleteRegistrations({ workspaceId: "ws-1", authorize: async () => ({ allowed: true, reason: "matched" }), prepare: async () => ({ details: [{ label: "Item", value: "Named item" }], execute: async () => { h.writes.push(id); return { removed: true }; } }) }, {
      surfaceExchanges: h.store, assertChatDeleteAllowed: async () => { reads++; if (!enabled) throw new ToolInputError({ message: "grant revoked; nothing was deleted" }); },
    });
    await assert.rejects(tools.find(tool => tool.descriptor.id === id)!.handler(h.ctx, { emitSurface: async () => {
      enabled = false;
      h.store.deliver({ exchangeId: h.store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!, principalId: "owner", params: { decision: "confirm" } }, { toolId: id });
    } }), { message: "grant revoked; nothing was deleted" });
    assert.equal(reads, 2); assert.deepEqual(h.writes, []);
  });
}

for (const [id, singleInput, permission] of CASES.filter(([id]) => id !== 'trash_empty')) {
  test(`${id}: one card names and confirms the whole batch`, async () => {
    const key = Object.keys(singleInput)[0]!;
    const h = harness(id, { items: [{ [key]: 'first' }, { [key]: 'second' }] }, permission);
    const removed: string[] = [];
    h.deps.prepare = async (_toolId, targetId) => ({
      details: [{ label: 'Item', value: `review ${targetId}` }],
      execute: async () => { removed.push(targetId!); return { removed: true, id: targetId }; },
    });
    let cards = 0;
    h.options.emitSurface = async emission => {
      cards++;
      assert.deepEqual(removed, []);
      assert.match(JSON.stringify(emission.payload), /review first/);
      assert.match(JSON.stringify(emission.payload), /review second/);
      const exchangeId = h.store.findTypedAnswerTarget({ principalId: 'owner', toolId: id })!;
      h.store.deliver({ exchangeId, principalId: 'owner', params: { decision: 'confirm', [key]: 'forged' } }, { toolId: id });
    };
    assert.deepEqual(await h.registration.handler(h.ctx, h.options), {
      batch: true, total: 2, results: [{ removed: true, id: 'first' }, { removed: true, id: 'second' }],
    });
    assert.equal(cards, 1);
    assert.deepEqual(removed, ['first', 'second']);
  });

  test(`${id}: a malformed later batch item cannot delete earlier items`, async () => {
    const h = harness(id, { items: [singleInput, { confirmed: true }] }, permission);
    h.options.emitSurface = async () => { assert.fail('invalid batch must not emit a card'); };
    await assert.rejects(h.registration.handler(h.ctx, h.options), /not an input of this tool/);
    assert.deepEqual(h.writes, []);
  });
}
