import assert from "node:assert/strict";
import test from "node:test";
import express, { type Express } from "express";
import { defineJsonRoute, ok } from "@jini-ai/core/contracts/server";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { defineRawRoute } from "@jini-ai/http-kit";

import { mountAdminJsonRoute } from "../admin-json-route-ports.js";
import { mountAdminRawRoute } from "../admin-raw-route-ports.js";
import { fakeAdminApp, listen } from "./fixtures/port-harness.js";

/**
 * Mount opt-ins that let a hand-written route's wire survive its move onto a spec: the host's body-cap 413,
 * a route-scoped body parser, and `text/plain` refusal and failure writers. Defaults stay byte-identical
 * (the existing `admin-json-route-ports*.test.ts` files pin them); these pin only what each opt-in adds.
 */
type Deps = { workspaceId: string; authorize: (input: unknown) => Promise<{ allowed: boolean; reason: string }> };
const path = "/api/admin/v1/workspaces/:workspaceId/optin";
const deps = (allowed = true): Deps => ({ workspaceId: "local", authorize: async () => ({ allowed, reason: "no_grant" }) });
const plain = (res: { status(code: number): { type(kind: string): { send(body: string): unknown } } }, status: number, text: string) => res.status(status).type("text/plain").send(text);

function rawSpec({ crash = false, method = "get" as "get" | "post" } = {}) {
  return defineRawRoute<Deps, { id: string }>({
    method, path, maxBodyBytes: 64,
    handle: async ({ raw, authorize }) => {
      await authorize?.({ permission: "probe.read" });
      if (crash) throw new Error("secret /var/db/site.sqlite");
      return new Response(JSON.stringify(raw.body ?? null), { headers: { "content-type": "application/json" } });
    },
  });
}

/** Registered handler names of the one route on `path`. */
const handlerNames = (app: Express): string[] => (app as unknown as { _router: { stack: { route?: { path: string; stack: { name: string }[] } }[] } })._router.stack
  .filter((layer) => layer.route?.path === path).at(-1)!.route!.stack.map((entry) => entry.name);

test("payloadTooLarge writes the host 413 ahead of the workspace 404 and the handler, for a JSON and a raw mount", async (t) => {
  const app = fakeAdminApp();
  const writer = ({ res, maxBytes }: { res: express.Response; maxBytes: number }) => { res.status(413).json({ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE", maxBytes }); };
  const calls: string[] = [];
  const json = defineJsonRoute<unknown, { ok: true }, Deps, { id: string }>({
    method: "post", path: "/api/admin/v1/workspaces/:workspaceId/optin-json", maxBodyBytes: 64,
    parse: ({ body }) => ok({ value: body }), handle: async () => { calls.push("json"); return ok({ value: { ok: true } }); },
  });
  mountAdminJsonRoute({ app, spec: json, deps: deps() }, { payloadTooLarge: writer });
  mountAdminRawRoute({ app, spec: rawSpec({ method: "post" }), deps: deps() }, { payloadTooLarge: writer });
  const server = await listen({ app });
  t.after(server.close);
  const big = JSON.stringify({ pad: "x".repeat(100) });
  for (const route of ["optin-json", "optin"]) {
    // A foreign workspace id: the cap still answers first, as the hand-written middleware did.
    const refused = await server.call(`/api/admin/v1/workspaces/elsewhere/${route}`, { method: "POST", body: big });
    assert.deepEqual(refused, { status: 413, body: { error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE", maxBytes: 64 } });
  }
  assert.equal((await server.call("/api/admin/v1/workspaces/local/optin-json", { method: "POST", body: JSON.stringify({ a: 1 }) })).status, 200);
  assert.deepEqual(calls, ["json"]);
});

test("without the port a mount keeps the kit's core 413 envelope", async (t) => {
  const app = fakeAdminApp();
  mountAdminRawRoute({ app, spec: rawSpec({ method: "post" }), deps: deps() });
  const server = await listen({ app });
  t.after(server.close);
  const refused = await server.call("/api/admin/v1/workspaces/local/optin", { method: "POST", body: JSON.stringify({ pad: "x".repeat(100) }) });
  assert.equal(refused.status, 413);
  assert.equal((refused.body as { error: { code: string } }).error.code, "PAYLOAD_TOO_LARGE");
});

test("bodyParsers are scoped to the one registration, ahead of the named handler or the asyncRoute wrapper", async (t) => {
  const app = fakeAdminApp();
  const form = express.urlencoded({ extended: false, limit: "15mb" });
  mountAdminRawRoute({ app, spec: rawSpec({ method: "post" }), deps: deps(), handlerName: "handleOptInRequest" }, { bodyParsers: [form] });
  const json = defineJsonRoute<unknown, unknown, Deps, { id: string }>({
    method: "put", path, parse: ({ body }) => ok({ value: body }), handle: async ({ input }) => ok({ value: input ?? null }),
  });
  mountAdminJsonRoute({ app, spec: json, deps: deps() }, { bodyParsers: [form], forwardRejection: true });
  assert.deepEqual(app._router.stack.filter((layer: { route?: { path: string; methods: Record<string, boolean> } }) => layer.route?.path === path)
    .map((layer: { route: { methods: Record<string, boolean>; stack: { name: string }[] } }) => `${Object.keys(layer.route.methods)[0]}:${layer.route.stack.map((entry) => entry.name).join(">")}`),
  ["post:urlencodedParser>handleOptInRequest", "put:urlencodedParser>forwardRejection"]);
  const server = await listen({ app });
  t.after(server.close);
  const post = await fetch(`${server.base}/api/admin/v1/workspaces/local/optin`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1" });
  assert.deepEqual(await post.json(), { a: "1" });
  const put = await fetch(`${server.base}/api/admin/v1/workspaces/local/optin`, { method: "PUT", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1" });
  assert.deepEqual(await put.json(), { a: "1" });
});

test("a mount without bodyParsers registers the handler alone", () => {
  const app = fakeAdminApp();
  mountAdminRawRoute({ app, spec: rawSpec(), deps: deps(), handlerName: "handleOptInRequest" });
  assert.deepEqual(handlerNames(app), ["handleOptInRequest"]);
});

test("refusalWriter and failureWriter answer text/plain for the workspace 404, the 403 and an unexpected failure", async (t) => {
  const seen: string[] = [];
  const options = {
    authorization: "direct" as const,
    forbidden: ({ principalId, permission }: { principalId: string; permission: string }) => ({ status: 403, body: { error: `principal '${principalId}' is not authorized for '${permission}'` } }),
    refusalWriter: ({ res, error }: { res: express.Response; error: RouteRefusalError }) => { plain(res, error.response.status, (error.response.body as { error: string }).error); },
    failureWriter: ({ res, error }: { res: express.Response; error: unknown }) => { seen.push((error as Error).message); plain(res, 500, "preview render failed"); },
  };
  const app = fakeAdminApp();
  mountAdminRawRoute({ app, spec: rawSpec(), deps: deps(false) }, options);
  const crashing = express();
  crashing.use((_req, res, next) => { res.locals.principal = { id: "caller", kind: "user" }; next(); });
  mountAdminRawRoute({ app: crashing, spec: rawSpec({ crash: true }), deps: deps() }, options);
  const denied = await listen({ app });
  const crashed = await listen({ app: crashing });
  t.after(denied.close);
  t.after(crashed.close);
  const read = async (url: string) => { const response = await fetch(url); return [response.status, response.headers.get("content-type"), await response.text()]; };
  assert.deepEqual(await read(`${denied.base}/api/admin/v1/workspaces/elsewhere/optin`), [404, "text/plain; charset=utf-8", "workspace was not found"]);
  assert.deepEqual(await read(`${denied.base}/api/admin/v1/workspaces/local/optin`), [403, "text/plain; charset=utf-8", "principal 'caller' is not authorized for 'probe.read'"]);
  assert.deepEqual(await read(`${crashed.base}/api/admin/v1/workspaces/local/optin`), [500, "text/plain; charset=utf-8", "preview render failed"]);
  // Refusals never reach the failure writer; only the one unexpected failure did.
  assert.deepEqual(seen, ["secret /var/db/site.sqlite"]);
});

test("without the writers the same refusals and failures keep the JSON envelope", async (t) => {
  const app = fakeAdminApp();
  mountAdminRawRoute({ app, spec: rawSpec({ crash: true }), deps: deps() }, { authorization: "direct" });
  const server = await listen({ app });
  t.after(server.close);
  assert.deepEqual(await server.call("/api/admin/v1/workspaces/elsewhere/optin"), { status: 404, body: { error: "workspace was not found" } });
  assert.equal((await server.call("/api/admin/v1/workspaces/local/optin")).status, 500);
});

test("requestDeps hands each request its own bound deps through the admin and public mounts; absent, the mounted deps pass unchanged", async (t) => {
  type Bound = Deps & { who: () => string };
  const mounted: Bound = { ...deps(), who: () => "nobody" };
  const bind = ({ req, deps: base }: { req: express.Request; deps: Bound }): Bound => ({ ...base, who: () => String(req.headers["x-who"] ?? "") });
  const jsonAt = (at: string) => defineJsonRoute<unknown, { who: string }, Bound, { id: string }>({ method: "get", path: at, parse: () => ok({ value: undefined }), handle: async ({ deps: d }) => ok({ value: { who: d.who() } }) });
  const rawAt = (at: string) => defineRawRoute<Bound, { id: string }>({ method: "get", path: at, handle: async ({ deps: d }) => new Response(JSON.stringify({ who: d.who() })) });
  const { mountPublicJsonRoute } = await import("../admin-json-route-ports.js");
  const { mountPublicRawRoute } = await import("../admin-raw-route-ports.js");
  const app = fakeAdminApp();
  const failure = { operation: "probe", visitorError: "x" };
  mountAdminJsonRoute({ app, spec: jsonAt(`${path}-j`), deps: mounted }, { requestDeps: bind });
  mountAdminRawRoute({ app, spec: rawAt(`${path}-r`), deps: mounted }, { requestDeps: bind });
  mountPublicJsonRoute({ app, spec: jsonAt("/pub-j"), deps: mounted, failure }, { requestDeps: bind });
  mountPublicRawRoute({ app, spec: rawAt("/pub-r"), deps: mounted, failure }, { requestDeps: bind });
  mountPublicJsonRoute({ app, spec: jsonAt("/pub-plain"), deps: mounted, failure });
  const server = await listen({ app });
  t.after(server.close);
  const read = async (at: string, who: string) => (await server.call(at, { headers: { "x-who": who } })).body?.who;
  const at = (suffix: string) => path.replace(":workspaceId", "local") + suffix;
  assert.deepEqual(
    [await read(at("-j"), "ada"), await read(at("-j"), "bob"), await read(at("-r"), "ada"), await read("/pub-j", "cy"), await read("/pub-r", "di"), await read("/pub-plain", "ed")],
    ["ada", "bob", "ada", "cy", "di", "nobody"],
  );
});
