import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { renderOAuthCallbackPage } from "../callback-page.js";

for (const ok of [true, false]) {
  for (const openerKind of ["present", "absent", "throws"] as const) {
    test(`callback script ${ok ? "success" : "failure"}: ${openerKind} opener still schedules closing`, () => {
      const html = renderOAuthCallbackPage({ ok, messageType: "tovu:external-mcp-connected", reason: "provider_denied" });
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      assert.ok(script);
      const messages: unknown[] = [];
      let closes = 0;
      const timers: { callback: () => void; delay: number }[] = [];
      const window = {
        opener: openerKind === "absent" ? null : { postMessage(payload: unknown, origin: string) {
          messages.push([JSON.parse(JSON.stringify(payload)), origin]);
          if (openerKind === "throws") throw new Error("opener unavailable");
        } },
        location: { origin: "https://tovu.example" },
        close() { closes += 1; },
      };
      runInNewContext(script, { window, setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); } }, { timeout: 1_000 });
      assert.deepEqual(messages, openerKind === "absent" ? [] : [[ok
        ? { type: "tovu:external-mcp-connected" }
        : { type: "tovu:external-mcp-connected", reason: "provider_denied" }, "https://tovu.example"]]);
      assert.equal(closes, 0);
      assert.equal(timers.length, 1);
      assert.equal(timers[0].delay, ok ? 400 : 2500);
      timers[0].callback();
      assert.equal(closes, 1);
      window.close = () => { throw new Error("closing denied"); };
      assert.doesNotThrow(() => timers[0].callback());
    });
  }
}

// Characterization pin (before the api-connection account-unchanged reason): each existing reason
// keeps its exact copy, and a failure without a reason renders the exchange_failed copy.
const EXISTING_FAILURE_COPY = {
  rate_limited: "Too many attempts too quickly. Wait a moment, then try connecting again from Tovu.",
  no_state: "This page wasn’t reached from a connection Tovu started, so there’s nothing to finish here. Close this window and start again from Tovu.",
  state_expired: "This connection attempt is no longer valid — it may have expired, already been used, or been started from another window. Close this window and try again from Tovu.",
  provider_denied: "The request was declined on the provider’s side. Approve the request on their consent screen, then try again from Tovu.",
  exchange_failed: "Something went wrong finishing the connection. Close this window and try again from Tovu.",
  server_unknown: "This connection could not be found. Close this window and check Settings → External MCP.",
} as const;

for (const [reason, copy] of Object.entries(EXISTING_FAILURE_COPY)) {
  test(`callback page failure copy is unchanged for ${reason}`, () => {
    const html = renderOAuthCallbackPage({ ok: false, messageType: "tovu:external-mcp-connected", reason: reason as keyof typeof EXISTING_FAILURE_COPY });
    assert.ok(html.includes("<title>Couldn’t finish connecting</title>"));
    assert.ok(html.includes(copy), `copy for ${reason}`);
  });
}

test("callback page failure without a reason renders the exchange_failed copy", () => {
  assert.ok(renderOAuthCallbackPage({ ok: false, messageType: "tovu:external-mcp-connected" }).includes(EXISTING_FAILURE_COPY.exchange_failed));
});
