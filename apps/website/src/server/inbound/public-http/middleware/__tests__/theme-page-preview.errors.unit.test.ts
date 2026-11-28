import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, RequestHandler, Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { registerThemePagePreview } from "../theme-page-preview.js";
import { assertReporterDiagnostics, recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";

test("templated preview failure references its redacted server incident", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const { reporter, records, reports } = recordingComposedReporter();
  let handler: RequestHandler | undefined;
  const app = { get: (route: string, ...handlers: RequestHandler[]) => {
    if (route === "/theme-explore/:themeId/template/:templateId") handler = handlers.at(-1);
  } } as unknown as Express;
  const deps = { workspaceId: "ws", authorize: async () => { throw new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"); } } as unknown as RouteDeps;
  registerThemePagePreview({ app, deps });
  assert.ok(handler, "the preview handler is registered");
  let status = 0; let body = ""; let type = "";
  const res = { locals: { principal: { id: "owner" }, failureReporter: reporter }, status(code: number) { status = code; return res; },
    type(value: string) { type = value; return res; }, send(value: string) { body = value; return res; } };
  await handler({ params: {} } as Request, res as unknown as Response, () => {});
  assert.equal(status, 500);
  assert.equal(type, "text/plain");
  assert.match(body, /The preview could not be rendered/);
  const match = /report error (ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4})/.exec(body); assert.ok(match, "the preview includes an error reference");
  assert.doesNotMatch(body, /boom|SECRETSECRETSECRETSECRET/);
  // The composed reporter is the incident's one sink (host record + tracker report).
  assertReporterDiagnostics({ records, operation: "theme-preview:render", diagnostics: [/boom[\s\S]*theme-page-preview\.errors\.unit\.test\.ts/] });
  const detail = (records[0]![1] as { meta: { errorId: string; diagnostic: string } }).meta;
  assert.equal(detail.errorId, match[1]);
  assert.doesNotMatch(detail.diagnostic, /SECRETSECRETSECRETSECRET/);
  assert.equal(reports.length, 1, "one tracker report");
  assert.ok(!JSON.stringify(logs).includes(detail.errorId), "no legacy console sink line for this incident");
});
