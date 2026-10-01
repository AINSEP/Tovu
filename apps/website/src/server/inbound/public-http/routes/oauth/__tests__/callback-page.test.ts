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
