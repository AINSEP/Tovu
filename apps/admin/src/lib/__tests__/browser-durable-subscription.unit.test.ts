import { afterEach, expect, it, vi } from "vitest";
import { browserDurableSubscriptionPorts } from "../durable-run-subscription";

afterEach(() => vi.unstubAllGlobals());

it("encodes the host run URL and never sends the checkpoint ETag on recovery", async () => {
  const fetch = vi.fn(async () => new Response('{"message":{"id":"answer","role":"assistant","content":"saved"}}', { headers: { ETag: '"checkpoint"', "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const ports = browserDurableSubscriptionPorts();
  await ports.read({ runId: "run/1", messageId: "answer" }, { recover: false });
  await ports.read({ runId: "run/1", messageId: "answer" }, {});
  expect(fetch.mock.calls[0]).toEqual(["/api/runs/run%2F1/checkpoint?messageId=answer", { method: "GET", credentials: "same-origin" }]);
  expect(fetch.mock.calls[1]).toEqual(["/api/runs/run%2F1/recover", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: '{"messageId":"answer"}' }]);
});
