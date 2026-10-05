import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { buildPermanentDeleteRegistrations, permanentDeleteDerivedRisk, type PermanentDeleteToolDeps } from "../tool-registrations.js";

/** Owner n01: exercise the real human exchange, including forged model inputs and revocation. */
const CASES = [
  ["trash_empty", {}, "content.read"],
  ["trash_purge_item", { trashItemId: "row-1" }, "content.read"],
  ["media_purge_asset", { mediaId: "m-1" }, "media.delete.force"],
  ["comments_purge_comment", { commentId: "c-1" }, "comments.delete.force"],
  ["identity_user_delete", { principalId: "u-1" }, "*"],
  ["external_mcp_delete", { serverId: "s-1" }, "admin.integrations.manage"],
  ["custom_credential_delete", { credentialId: "k-1" }, "custom-credentials.write"],
  ["deployment_delete_provider_credential", { credentialId: "k-1" }, "system.publish"],
  ["source_control_delete_credential", { credentialId: "k-1" }, "source-control.credentials.write"],
] as const;

function harness(id: string, input: unknown, permission: string) {
  const store = createSurfaceExchangeStore();
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
  const registration = buildPermanentDeleteRegistrations(deps, { surfaceExchanges: store }).find(r => r.descriptor.id === id)!;
  const controller = new AbortController();
  const ctx: ToolExecutionContext = { executionId: "e-1", principal: { id: "owner" }, run: { id: "r-1" }, input, signal: controller.signal };
  // Mutable here so each case can install its own emitter; `ToolExecutionOptions` itself is readonly.
  const options: { emitSurface?: SurfaceEmitter } = {};
  return { options, store, writes, permissions, permission, registration, ctx, controller, setAllowed: (v: boolean) => { allowed = v; }, setExists: (v: boolean) => { exists = v; } };
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
      assert.deepEqual(h.store.deliver({ exchangeId, toolId: id, principalId: "other-user", params: { decision: "confirm" } }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(h.store.deliver({ exchangeId, toolId: "other-tool", principalId: "owner", params: { decision: "confirm" } }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(h.store.deliver({ exchangeId, toolId: id, principalId: "owner", params: { decision: "confirm", credentialId: "different-id" } }), { ok: true });
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
        h.store.deliver({ exchangeId, toolId: id, principalId: "owner", params });
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
      h.store.deliver({ exchangeId: h.store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!, principalId: "owner", toolId: id, params: { decision: "confirm" } });
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
  const store = createSurfaceExchangeStore({ idleTtlMs: 5, maxLifetimeMs: 20 });
  let deletes = 0;
  const registration = buildPermanentDeleteRegistrations({
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
    prepare: async () => ({ details: [{ label: "Item", value: "Named item" }], execute: async () => { deletes++; return { removed: true }; } }),
  }, { surfaceExchanges: store }).find(r => r.descriptor.id === "trash_empty")!;
  const keepAlive = setTimeout(() => {}, 50); // The production exchange timers deliberately unref().
  try {
  assert.deepEqual(await registration.handler({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal }, { emitSurface: async () => {} }), {
    removed: false, cancelled: false, reason: "expired", note: "The user did not answer the confirmation dialog before it expired. Nothing was changed.",
  });
  assert.equal(deletes, 0);
  } finally { clearTimeout(keepAlive); }
});
