import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { warmSiteServerForAgent } from "../warm-site-agent.js";

test("each missing part of the dev warm channel disables the agent capability", () => {
  const configured = {
    TOVU_DEV_WARM_SITES: "1",
    TOVU_DEV_WARM_CONTROL_TOKEN: "fixture-control",
    TOVU_DEV_WARM_HOST_URL: "http://127.0.0.1:3180",
    TOVU_DISABLE_DEV_TLS: "1",
  };
  for (const env of [
    { ...configured, TOVU_DEV_WARM_SITES: "true" },
    { ...configured, TOVU_DEV_WARM_CONTROL_TOKEN: "" },
    { ...configured, TOVU_DEV_WARM_HOST_URL: "" },
  ]) {
    assert.equal(warmSiteServerForAgent({}, { env }), undefined);
  }
});

test("the agent sends an authenticated local start request and maps the host's success and refusal replies", async t => {
  const app = express();
  const requested: unknown[] = [];
  app.post("/internal/dev-warm-site", express.json(), (req, res) => {
    if (req.get("x-tovu-warm-control") !== "fixture-control") {
      res.status(403).json({ code: "BAD_FIXTURE_TOKEN" });
      return;
    }
    requested.push(req.body);
    switch (req.body?.name) {
      case "ready": res.json({ url: "http://localhost:3142/admin/" }); break;
      case "busy": res.status(409).json({ code: "SITE_LIMIT", url: "http://localhost:3143/admin/" }); break;
      case "malformed": res.json({ url: 3144, code: 7 }); break;
      default: res.status(400).json({ code: "BAD_FIXTURE_REQUEST" });
    }
  });
  const warm = warmSiteServerForAgent({}, { env: {
    TOVU_DEV_WARM_SITES: "1", TOVU_DISABLE_DEV_TLS: "1",
    TOVU_DEV_WARM_CONTROL_TOKEN: "fixture-control", TOVU_DEV_WARM_HOST_URL: await startTestServer(app, t),
  } });
  assert.ok(warm, "all required channel settings are present");
  assert.equal(await warm({ name: "ready" }), "http://localhost:3142/admin/");
  await assert.rejects(warm({ name: "busy" }), { name: "LocalSiteError", code: "SITE_LIMIT", message: "SITE_LIMIT" });
  await assert.rejects(warm({ name: "malformed" }), { name: "LocalSiteError", code: "SITE_START_FAILED", message: "SITE_START_FAILED" });
  assert.deepEqual(requested, [{ name: "ready" }, { name: "busy" }, { name: "malformed" }]);
});
