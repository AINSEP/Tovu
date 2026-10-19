import assert from "node:assert/strict";
import test from "node:test";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { requireWidgetsPermissionOrRespond, toAdminWidgetAreaResponse, toAdminWidgetResponse } from "../../widgets.js";

test("widget permission preserves the authenticated principal and passes the exact scope", async () => {
  const { res, capture } = createCapturingResponse();
  const principal = { id: "editor-1", workspaceId: "ws-1", kind: "user" as const, status: "active" as const, displayName: "Editor", createdAt: "2026-10-19T00:00:00Z" };
  res.locals.principal = principal;
  const requests: unknown[] = [];
  const result = await requireWidgetsPermissionOrRespond(async (input) => {
    requests.push(input);
    return { allowed: true, reason: "grant" };
  }, "ws-1", "widgets.read", res);
  assert.strictEqual(result, principal);
  assert.deepEqual(requests, [{ principalId: "editor-1", permission: "widgets.read", workspaceId: "ws-1", entityType: "widget" }]);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
});

test("widget permission denial returns null and the actionable 403 envelope", async () => {
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "editor-1" };
  const result = await requireWidgetsPermissionOrRespond(async () => ({ allowed: false, reason: "no_grant" }), "ws-1", "widgets.read", res);
  assert.equal(result, null);
  assert.deepEqual(capture, { statusCode: 403, jsonBody: {
    error: "principal 'editor-1' is not authorized for 'widgets.read' (no_grant)", code: "FORBIDDEN",
    details: { permission: "widgets.read", reason: "no_grant" },
  } });
});

test("widget and area DTOs retain the supplied entries under their distinct envelope keys", () => {
  const widget = { id: "widget-1", version: 3 } as Parameters<typeof toAdminWidgetResponse>[0];
  const area = { id: "area-2", version: 7 } as Parameters<typeof toAdminWidgetAreaResponse>[0];
  assert.deepEqual(toAdminWidgetResponse(widget), { widget });
  assert.strictEqual(toAdminWidgetResponse(widget).widget, widget);
  assert.deepEqual(toAdminWidgetAreaResponse(area), { area });
  assert.strictEqual(toAdminWidgetAreaResponse(area).area, area);
});
