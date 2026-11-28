import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { DEFAULT_TOOL_EXEC_TOKEN_ENV_VAR } from "@jini-ai/daemon/http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { requireToolExecutionCallerExpress } from "../tool-execution-caller-express.js";

/**
 * @file The Express gate with no `tokenEnvVar` named: the secret is read from the daemon's default
 * variable. Real loopback listener, so the peer check sees the connection's own address.
 */

async function gatedApp(t: import("node:test").TestContext, env: Record<string, string | undefined>): Promise<string> {
  const app = express();
  app.get("/internal/probe", requireToolExecutionCallerExpress({ env }), (_req, res) => { res.json({ reached: true }); });
  return startTestServer(app, t);
}

async function probe(baseUrl: string, authorization?: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/internal/probe`, authorization === undefined ? {} : { headers: { authorization } });
  return { status: res.status, body: await res.json() };
}

test("with no token variable named, the gate reads the daemon's default variable", async (t) => {
  assert.equal(DEFAULT_TOOL_EXEC_TOKEN_ENV_VAR, "JINI_TOOL_EXEC_TOKEN");
  const baseUrl = await gatedApp(t, { JINI_TOOL_EXEC_TOKEN: "tok-a", OTHER_TOKEN: "tok-b" });
  assert.deepEqual(await probe(baseUrl, "Bearer tok-a"), { status: 200, body: { reached: true } });
  const wrong = await probe(baseUrl, "Bearer tok-b");
  assert.equal(wrong.status, 401);
  assert.match(JSON.stringify(wrong.body), /Bearer <JINI_TOOL_EXEC_TOKEN> required/);
});

test("with no token variable named and the default variable unset, the gate refuses as not configured", async (t) => {
  const baseUrl = await gatedApp(t, { OTHER_TOKEN: "tok-b" });
  const answer = await probe(baseUrl, "Bearer tok-b");
  assert.notEqual(answer.status, 200);
  assert.match(JSON.stringify(answer.body), /JINI_TOOL_EXEC_TOKEN is not set/);
});
