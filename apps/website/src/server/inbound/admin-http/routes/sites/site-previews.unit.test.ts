import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerSitePreviewRoutes, servingAddressOf, sitePreviewTargets, type PreviewableLocalSite } from "./site-previews.js";
import { extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { SitePreviewService } from "#src/features/sites/index";

const ROUTE = "/api/admin/v1/workspaces/:workspaceId/system/sites/:name/preview";

function local(state: Partial<PreviewableLocalSite> & { name: string }): PreviewableLocalSite {
  return { status: "running", pid: 10, adminUrl: "https://localhost:3101/admin/", ...state };
}

test("targets are the served site at its own socket address plus every running local site's public root", () => {
  const targets = sitePreviewTargets({ servingName: "owner", localSites: [
    local({ name: "alpha" }),
    local({ name: "beta", status: "starting" }),
    local({ name: "gamma", status: "stopped", pid: null, adminUrl: null }),
    local({ name: "delta", pid: 12, adminUrl: "http://localhost:3104/admin/" }),
    local({ name: "owner" }),
  ] }, { serving: { scheme: "https", port: 3000, pid: 7 } });
  assert.deepEqual(targets, [
    { name: "owner", url: "https://localhost:3000/", lifecycle: "serving:7" },
    { name: "alpha", url: "https://localhost:3101/", lifecycle: "pid:10" },
    { name: "delta", url: "http://localhost:3104/", lifecycle: "pid:12" },
  ]);
  assert.deepEqual(sitePreviewTargets({ servingName: "owner", localSites: [] }), []);
});

test("servingAddressOf reads the socket, never a forwarded header, and is undefined without one", () => {
  assert.deepEqual(servingAddressOf({ req: { socket: { localPort: 3000, encrypted: true } } as never }, { pid: 7 }), { scheme: "https", port: 3000, pid: 7 });
  assert.deepEqual(servingAddressOf({ req: { socket: { localPort: 3000 } } as never }, { pid: 7 }), { scheme: "http", port: 3000, pid: 7 });
  assert.equal(servingAddressOf({ req: {} as never }), undefined);
});

function imageResponse() {
  const capture: { status?: number; headers?: Record<string, string>; body?: unknown; json?: unknown } = {};
  const res = {
    locals: { principal: { id: "operator" } } as Record<string, unknown>,
    status(code: number) { capture.status = code; return res; },
    set(headers: Record<string, string>) { capture.headers = headers; return res; },
    send(body: unknown) { capture.body = body; return res; },
    json(body: unknown) { capture.json = body; return res; },
  };
  return { res, capture };
}

function route({ allowed = true, sitePreviews }: { allowed?: boolean; sitePreviews?: SitePreviewService } = {}) {
  const app = express();
  const reads: string[] = [];
  const service: SitePreviewService = sitePreviews ?? {
    versions: () => ({}),
    read: ({ name }) => { reads.push(name); return name === "alpha" ? Buffer.from("jpeg") : null; },
    idle: async () => {},
  };
  registerSitePreviewRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), sitePreviews: service } });
  const handler = extractRouteHandler(app, "get", ROUTE);
  return {
    reads,
    async get(name: string, workspaceId = "ws") {
      const { res, capture } = imageResponse();
      await handler({ params: { workspaceId, name } }, res as never);
      return capture;
    },
  };
}

test("serves the stored capture as an immutable private JPEG", async () => {
  const r = route();
  const response = await r.get("alpha");
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
  assert.equal(String(response.body), "jpeg");
});

test("404 without a capture; workspace and authorization are checked before any read", async () => {
  const r = route();
  assert.deepEqual(await r.get("beta"), { status: 404, json: { code: "SITE_PREVIEW_NOT_FOUND", error: "no preview" } });
  assert.equal((await r.get("alpha", "other")).status, 404);
  const denied = route({ allowed: false });
  assert.equal((await denied.get("alpha")).status, 403);
  assert.deepEqual(denied.reads, []);
  assert.deepEqual(r.reads, ["beta"]);
});

test("a read that throws is a 500 without the error text", async () => {
  const r = route({ sitePreviews: { versions: () => ({}), read: () => { throw new Error("/secret/path EACCES"); }, idle: async () => {} } });
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await r.get("alpha"), { status: 500, json: { error: "internal error", code: "INTERNAL_ERROR" } });
  } finally {
    console.error = original;
  }
});
