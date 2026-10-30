import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { API_CONNECTION_BINDING_COOKIE, browserBindingCookie, clearedBrowserBindingCookie, createSignInHandoffs, hostedSignInLink, readBrowserBinding } from "../browser-binding.js";
import { isHostedSignInLinkPath } from "../../../contracts/core/hosted-sign-in-links.js";

const binding = "b".repeat(43);
const draft = { actorId: "admin-1", authorizationUrl: "https://auth.acme.test/authorize", browserBinding: binding, expiresAt: "2030-01-01T00:10:00.000Z" };

test("F1: handoffs expire, consume before actor checks, and refuse replays", () => {
  let now = Date.parse("2030-01-01T00:00:00.000Z");
  const handoffs = createSignInHandoffs({ clock: { nowMs: () => now }, randomBytesFn: ({ byteLength }) => randomBytes(byteLength) });
  const id = handoffs.issue(draft);
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(handoffs.take({ handoffId: id, actorId: "other" }), null);
  assert.equal(handoffs.take({ handoffId: id, actorId: draft.actorId }), null);
  const valid = handoffs.issue(draft);
  assert.deepEqual(handoffs.take({ handoffId: valid, actorId: draft.actorId }), draft);
  assert.equal(handoffs.take({ handoffId: valid, actorId: draft.actorId }), null);
  const expired = handoffs.issue(draft);
  now += 600_000;
  assert.equal(handoffs.take({ handoffId: expired, actorId: draft.actorId }), null);
});

test("F1: handoffs use Jini's bounded cache and evict the oldest at capacity", () => {
  const handoffs = createSignInHandoffs({ clock: { nowMs: () => Date.parse("2030-01-01T00:00:00.000Z") }, randomBytesFn: ({ byteLength }) => randomBytes(byteLength) });
  const first = handoffs.issue(draft);
  for (let i = 0; i < 256; i += 1) handoffs.issue(draft);
  assert.equal(handoffs.take({ handoffId: first, actorId: draft.actorId }), null);
});

test("F1: callback cookie is host-only, HttpOnly, Secure, Lax, and callback scoped on set and clear", () => {
  assert.equal(browserBindingCookie({ browserBinding: binding }), `${API_CONNECTION_BINDING_COOKIE}=${binding}; Max-Age=600; Path=/api/agent-plugins/connections/oauth/callback; HttpOnly; Secure; SameSite=Lax`);
  assert.equal(clearedBrowserBindingCookie(), `${API_CONNECTION_BINDING_COOKIE}=; Max-Age=0; Path=/api/agent-plugins/connections/oauth/callback; HttpOnly; Secure; SameSite=Lax`);
  assert.throws(() => browserBindingCookie({ browserBinding: "bad; value" }), TypeError);
});

test("F1: missing, malformed and duplicate cookies fail closed; unrelated cookies cannot replace proof", () => {
  for (const cookieHeader of [undefined, "", `other=${binding}`, `${API_CONNECTION_BINDING_COOKIE}=`, `${API_CONNECTION_BINDING_COOKIE}=${binding}!`, `${API_CONNECTION_BINDING_COOKIE}=${binding}; ${API_CONNECTION_BINDING_COOKIE}=${binding}`]) {
    assert.equal(readBrowserBinding({ cookieHeader }), "");
  }
  assert.equal(readBrowserBinding({ cookieHeader: `other=unrelated; ${API_CONNECTION_BINDING_COOKIE}=${binding}; third=value` }), binding);
});

test("F1: host links expose only an opaque handoff; path recognition rejects trailing and foreign paths", () => {
  const link = new URL(hostedSignInLink({ callbackUrl: "https://site.acme.test/api/agent-plugins/connections/oauth/callback", workspaceId: "ws-1", handoffId: "h".repeat(43) }));
  assert.equal(link.origin, "https://site.acme.test");
  assert.equal(link.search, "");
  assert.equal(isHostedSignInLinkPath({ pathname: link.pathname }), true);
  assert.equal(isHostedSignInLinkPath({ pathname: link.pathname + "/more" }), false);
  assert.equal(isHostedSignInLinkPath({ pathname: "/authorize" }), false);
});
