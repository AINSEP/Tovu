import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request } from "express";
import { ForbiddenError, ValueValidationFailedError } from "@jini-ai/core/settings";
import { registerAdminVisitorToolsRoutes, ADMIN_VISITOR_TOOLS_PATH, type VisitorToolsRouteDeps } from "../visitor-tools.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { visitorManagementFixture } from "#src/features/settings/__tests__/visitor-tools-management.fixture";
import { VisitorToolsRevisionConflictError } from "#src/features/settings/visitor-tools-write";
import { VisitorToolPolicyValidationError } from "#src/contracts/site-assistant/visitor-tools";
import { ws } from "#src/features/settings/__tests__/visitor-tools.fixture";

function requests(deps: VisitorToolsRouteDeps) {
  const app = express();
  registerAdminVisitorToolsRoutes({ app, deps });
  return async (method: "get" | "put", body?: unknown, workspaceId: unknown = ws) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    const handler = extractRouteHandler(app, method, ADMIN_VISITOR_TOOLS_PATH);
    await handler({ params: { workspaceId }, body } as unknown as Request, res);
    return capture;
  };
}

test("HTTP list/configure share the service and exact revisioned read model with chat", async () => {
  const f = await visitorManagementFixture();
  const request = requests({ workspaceId: ws, visitorToolsManagement: f.service });
  assert.deepEqual(await request("get"), { statusCode: 200, jsonBody: { data: await f.list() } });
  const saved = await request("put", { toolId: "plugin_catalog", expectedRevisionSeq: 0, mode: "ask", limits: { perIpPerHour: 45 } });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.jsonBody, { data: await f.list() });
  assert.equal((await f.read())?.tools.plugin_catalog.mode, "ask");
  assert.equal((await f.read())?.tools.plugin_catalog.limits.perIpPerHour, 45);
  assert.deepEqual(await request("put", { toolId: "site", expectedRevisionSeq: 0, mode: "off" }), {
    statusCode: 409, jsonBody: { error: "Visitor tools changed. List them again before retrying.", code: "VISITOR_TOOLS_REVISION_CONFLICT", reload: true },
  });
});

test("HTTP lists corrupt storage with 200 invalid/Off, refuses other edits, and repairs through PUT", async () => {
  const f = await visitorManagementFixture();
  await f.write();
  const definition = (await f.repo.findActiveDefinition({ namespace: "site.assistant", key: "visitor_tools", workspaceId: ws }))!;
  const row = (await f.repo.getWorkspaceValue({ workspaceId: ws, settingId: definition.settingId }))!;
  await f.repo.saveWorkspaceValue({ ...row, valueJson: { corrupt: true } });
  const request = requests({ workspaceId: ws, visitorToolsManagement: f.service });
  const listed = await request("get");
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.jsonBody, { data: await f.list() });
  const view = (listed.jsonBody as { data: Awaited<ReturnType<typeof f.list>> }).data;
  assert.equal(view.policyState, "invalid");
  assert.equal(view.revisionSeq, row.seq);
  assert.ok(view.tools.every(t => t.mode === "off"));
  assert.equal((await request("put", { toolId: "site", expectedRevisionSeq: row.seq, mode: "auto" })).statusCode, 400);
  const repaired = await request("put", { toolId: "site", expectedRevisionSeq: row.seq, mode: "off" });
  assert.equal(repaired.statusCode, 200);
  assert.deepEqual(repaired.jsonBody, { data: await f.list() });
  assert.equal((await f.list()).policyState, undefined);
  assert.ok((await f.list()).tools.every(t => t.mode === "off"));
});

test("foreign/missing workspace is refused before service calls on either route", async () => {
  const f = await visitorManagementFixture();
  const request = requests({ workspaceId: ws, visitorToolsManagement: { ...f.service, list: async () => assert.fail("foreign workspace reached service"), prepare: async () => assert.fail("foreign workspace reached service") } });
  for (const method of ["get", "put"] as const) for (const workspaceId of ["foreign", null]) {
    assert.deepEqual(await request(method, {}, workspaceId), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  }
});

test("permission, malformed/forged input and absent service fail closed with stable error shapes", async () => {
  const f = await visitorManagementFixture();
  const request = requests({ workspaceId: ws, visitorToolsManagement: f.service });
  const before = await f.repo.maxRevisionSeq();
  for (const body of [undefined, null, [], {}, { toolId: "site", expectedRevisionSeq: 0, mode: "off", approved: true }, { toolId: "site", expectedRevisionSeq: 0, limits: { perIpPerHour: 0 } }]) {
    const response = await request("put", body);
    assert.equal(response.statusCode, 400);
    assert.equal((response.jsonBody as { code: string }).code, "VISITOR_TOOLS_VALIDATION_ERROR");
  }
  f.grants.clear();
  for (const method of ["get", "put"] as const) assert.deepEqual(await request(method, { toolId: "site", expectedRevisionSeq: 0, mode: "off" }), {
    statusCode: 403, jsonBody: { error: "visitor-tools.manage is required", code: "FORBIDDEN" },
  });
  assert.deepEqual(await requests({ workspaceId: ws })("get"), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.equal(await f.repo.maxRevisionSeq(), before);
  assert.equal((await f.read())?.tools.plugin_catalog, undefined);
});

test("errors from list, prepare and apply map consistently, including a conflict during final write", async () => {
  const f = await visitorManagementFixture();
  for (const error of [new ForbiddenError("denied"), new ValueValidationFailedError("invalid policy"), new VisitorToolPolicyValidationError("invalid patch"), new VisitorToolsRevisionConflictError("reload"), new Error("/secret/storage/file")]) {
    for (const step of ["list", "prepare", "apply"] as const) {
      const service = { ...f.service, [step]: async () => { throw error; } };
      const response = await requests({ workspaceId: ws, visitorToolsManagement: service })(step === "list" ? "get" : "put", { toolId: "site", expectedRevisionSeq: 0, mode: "off" });
      const expected = error instanceof ForbiddenError ? 403 : error instanceof VisitorToolsRevisionConflictError ? 409 : error instanceof Error && error.message.startsWith("invalid") ? 400 : 500;
      assert.equal(response.statusCode, expected);
      assert.doesNotMatch(JSON.stringify(response.jsonBody), /secret\/storage/);
    }
  }
});
