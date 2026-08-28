import assert from "node:assert/strict";
import test from "node:test";

import {
  createPendingConfirmationStore,
  DEFAULT_CONFIRMATION_TTL_MS,
  type ConfirmationBinding,
} from "../pending-confirmations.js";

/**
 * @file Certification of the pending-confirmation token store backing the MCP-UI two-step gate.
 *
 * Every property here is one an attacker (or a confused agent) would probe: replay, expiry,
 * cross-principal reuse, cross-tool reuse, cross-entity reuse, and staleness of the entity version
 * the human actually agreed to.
 */

const BINDING: ConfirmationBinding = {
  toolId: "content_post_delete",
  workspaceId: "ws-1",
  principalId: "principal-a",
  entityType: "post",
  entityId: "post-1",
  entityVersion: 3,
};

function fixedStore(options: { startMs?: number } = {}) {
  let nowMs = options.startMs ?? 1_000_000;
  let counter = 0;
  const store = createPendingConfirmationStore({
    now: () => nowMs,
    randomToken: () => `token-${++counter}`,
    ttlMs: DEFAULT_CONFIRMATION_TTL_MS,
  });
  return { store, advance: (ms: number) => (nowMs += ms), at: () => nowMs };
}

test("a minted token redeems exactly once against its own binding", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "Delete post 'X'" });

  const first = store.redeem({ token, ...BINDING });
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.confirmation.summary, "Delete post 'X'");
  assert.equal(first.ok && first.confirmation.entityId, "post-1");
});

test("a token cannot be replayed — the second redemption fails and nothing is left pending", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  assert.equal(store.redeem({ token, ...BINDING }).ok, true);
  const replay = store.redeem({ token, ...BINDING });
  assert.equal(replay.ok, false);
  assert.equal(!replay.ok && replay.reason, "unknown-or-expired");
  assert.equal(store.size(), 0);
});

test("a token expires after its TTL and is then indistinguishable from one that never existed", () => {
  const { store, advance } = fixedStore();
  const { token, expiresAtMs } = store.mint({ ...BINDING, summary: "s" });
  assert.equal(expiresAtMs, 1_000_000 + DEFAULT_CONFIRMATION_TTL_MS);

  advance(DEFAULT_CONFIRMATION_TTL_MS);
  const expired = store.redeem({ token, ...BINDING });
  const invented = store.redeem({ token: "never-minted", ...BINDING });

  assert.equal(expired.ok, false);
  assert.equal(!expired.ok && expired.reason, "unknown-or-expired");
  assert.equal(!invented.ok && invented.reason, "unknown-or-expired", "an expired token must not be distinguishable from a fabricated one");
});

test("a token minted for one PRINCIPAL cannot be redeemed by another", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  const result = store.redeem({ token, ...BINDING, principalId: "principal-b" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "binding-mismatch");
});

test("a token minted for one TOOL cannot confirm another tool", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  const result = store.redeem({ token, ...BINDING, toolId: "collections_execute_cleanup" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "binding-mismatch");
});

test("a token minted for one ENTITY cannot delete a different one", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  const result = store.redeem({ token, ...BINDING, entityId: "post-2" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "binding-mismatch");
});

test("a token minted for one WORKSPACE cannot cross into another", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  const result = store.redeem({ token, ...BINDING, workspaceId: "ws-2" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "binding-mismatch");
});

test("a token goes stale if the entity changed after the human was shown the dialog", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  // The human agreed to delete version 3; something edited the row to version 4 in between.
  const result = store.redeem({ token, ...BINDING, entityVersion: 4 });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "stale-entity-version");
});

test("a failed redemption still burns the token — a mismatch cannot be used to probe, then retried correctly", () => {
  const { store } = fixedStore();
  const { token } = store.mint({ ...BINDING, summary: "s" });

  const probe = store.redeem({ token, ...BINDING, principalId: "principal-b" });
  assert.equal(probe.ok, false);

  const retry = store.redeem({ token, ...BINDING });
  assert.equal(retry.ok, false, "the token must be gone even though the first attempt was rejected");
  assert.equal(!retry.ok && retry.reason, "unknown-or-expired");
});

test("two concurrent confirmations do not collide, and each redeems only its own", () => {
  const { store } = fixedStore();
  const a = store.mint({ ...BINDING, entityId: "post-a", summary: "a" });
  const b = store.mint({ ...BINDING, entityId: "post-b", summary: "b" });
  assert.notEqual(a.token, b.token);
  assert.equal(store.size(), 2);

  assert.equal(store.redeem({ token: a.token, ...BINDING, entityId: "post-b" }).ok, false, "a's token must not delete b");
  const okB = store.redeem({ token: b.token, ...BINDING, entityId: "post-b" });
  assert.equal(okB.ok, true);
  assert.equal(okB.ok && okB.confirmation.summary, "b");
});

test("expired entries are swept rather than accumulating", () => {
  const { store, advance } = fixedStore();
  store.mint({ ...BINDING, summary: "s" });
  store.mint({ ...BINDING, entityId: "post-2", summary: "s" });
  assert.equal(store.size(), 2);

  advance(DEFAULT_CONFIRMATION_TTL_MS + 1);
  assert.equal(store.size(), 0);
});

test("the default token source is unguessable — 100 real tokens are all distinct and high-entropy", () => {
  const store = createPendingConfirmationStore();
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    const { token } = store.mint({ ...BINDING, entityId: `post-${i}`, summary: "s" });
    assert.equal(seen.has(token), false, "tokens must never repeat");
    assert.ok(token.length >= 40, `a token must carry real entropy, got ${token.length} chars`);
    seen.add(token);
  }
});
