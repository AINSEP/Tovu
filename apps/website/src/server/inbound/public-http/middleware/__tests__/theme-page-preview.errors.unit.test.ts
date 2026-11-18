import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, RequestHandler, Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { registerThemePagePreview } from "../theme-page-preview.js";

test("templated preview failure references its redacted server incident", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  let handler: RequestHandler | undefined;
  const app = { get: (route: string, ...handlers: RequestHandler[]) => {
    if (route === "/theme-explore/:themeId/template/:templateId") handler = handlers.at(-1);
  } } as unknown as Express;
  const deps = { workspaceId: "ws", authorize: async () => { throw new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"); } } as unknown as RouteDeps;
  registerThemePagePreview({ app, deps });
  assert.ok(handler, "the preview handler is registered");
  let status = 0; let body = ""; let type = "";
  const res = { locals: { principal: { id: "owner" } }, status(code: number) { status = code; return res; },
    type(value: string) { type = value; return res; }, send(value: string) { body = value; return res; } };
  await handler({ params: {} } as Request, res as unknown as Response, () => {});
  assert.equal(status, 500);
  assert.equal(type, "text/plain");
  assert.match(body, /The preview could not be rendered/);
  const match = /report error ([0-9a-f-]{36})/.exec(body); assert.ok(match, "the preview includes an error reference");
  assert.doesNotMatch(body, /boom|SECRETSECRETSECRETSECRET/);
  const entry = logs.find(args => args[0] === "[theme-preview:render]"); assert.ok(entry, "the incident is logged");
  const detail = entry[1] as { errorId: string; diagnostic: string };
  assert.equal(detail.errorId, match[1]);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /theme-page-preview\.errors\.unit\.test\.ts/);
  assert.doesNotMatch(detail.diagnostic, /SECRETSECRETSECRETSECRET/);
});
