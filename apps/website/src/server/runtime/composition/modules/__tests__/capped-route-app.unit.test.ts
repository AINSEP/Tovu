import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { cappedApp } from "../capped-route-app.js";

test("a capped PATCH runs the handler only for accepted content, and does not cap unrelated routes", async (t) => {
  const app = express();
  app.use(express.json());
  const writes: unknown[] = [];
  const limited = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: 20 }) });
  limited.patch("/content", (req, res) => { writes.push(req.body); res.status(202).json({ accepted: req.body.title }); });
  app.patch("/uncapped", (_req, res) => { res.status(204).end(); });
  const base = await startTestServer(app, t);
  const send = (path: string, title: string) => fetch(base + path, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }),
  });
  const tooLarge = await send("/content", "This content exceeds the route cap");
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" });
  assert.deepEqual(writes, []);
  const accepted = await send("/content", "Brief");
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { accepted: "Brief" });
  assert.deepEqual(writes, [{ title: "Brief" }]);
  assert.equal((await send("/uncapped", "This content exceeds the route cap")).status, 204);
});
