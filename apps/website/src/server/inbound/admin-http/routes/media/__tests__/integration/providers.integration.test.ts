import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `GET`/`PUT .../media/providers` — real composed app
 * (`createApp`/`createRouteDeps`), real login, matching this repo's established integration-test
 * pattern (see `src/server/routes/admin/integrations/__tests__/integration/
 * create-delete-pause.integration.test.ts` for the identical technique applied to a sibling module).
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers`;

function testDeps(overrides: Partial<RouteDeps> = {}): ReturnType<typeof createRouteDeps> {
  return { ...createRouteDeps(), ...overrides };
}

/** GET's strong ETag: the last-read basis a whole-set PUT must carry back in `If-Match`. */
async function readEtag(baseUrl: string, cookie: string): Promise<string> {
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const etag = res.headers.get("etag") ?? "";
  assert.match(etag, /^"[\x21\x23-\x7e]{1,200}"$/);
  return etag;
}

/** Both routes share `String(req.params.workspaceId ?? "")` -- a required `:workspaceId` route
 *  segment, so Express's own router can never dispatch to either handler with it `undefined`; a
 *  real HTTP request literally cannot trigger the `??` side, on the REAL composed app either. Same
 *  technique as `providers.test.ts`'s (unit-tier) identical helper -- see its comment. */
interface ExpressHandlerLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (req: unknown, res: unknown) => unknown }[];
  };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

function extractHandler(
  app: ReturnType<typeof createApp>,
  method: "get" | "put",
  path: string
): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`${method.toUpperCase()} '${path}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

function fakeRes(): { res: unknown; getStatus: () => number | undefined; getBody: () => unknown } {
  let statusCode: number | undefined;
  let body: unknown;
  const res = {
    locals: { principal: { id: "forced-input-test-principal" } },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return { res, getStatus: () => statusCode, getBody: () => body };
}

test("get-providers: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/media/providers`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("get-providers: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
});

test("get-providers: owner sees an empty map before anything is configured (200)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {});
});

test("put-providers: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/media/providers`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": await readEtag(baseUrl, cookie) },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 404);
});

test("put-providers: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 403);
});

test("put-providers: unknown provider id 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": await readEtag(baseUrl, cookie) },
    body: JSON.stringify({ "totally-unknown": { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 400);
});

test("put-providers: valid save round-trips through GET (never leaking key material) and can be cleared", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const saved = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": await readEtag(baseUrl, cookie) },
    body: JSON.stringify({ openai: { apiKey: "sk-integration-secret" } }),
  });
  assert.equal(saved.status, 200);
  const savedBody = (await saved.json()) as { openai?: { apiKey?: string } };
  assert.equal(savedBody.openai?.apiKey, undefined);

  const fetched = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  const fetchedBody = (await fetched.json()) as { openai?: unknown };
  assert.ok(fetchedBody.openai, "the saved provider must be visible on a subsequent GET");

  const cleared = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": await readEtag(baseUrl, cookie) },
    body: JSON.stringify({}),
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), {});
});

test("put-providers: a request with no JSON content-type (req.body left undefined by express.json()) is treated as an empty map", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  // Same real-caller path as the unit-tier test of the same name — no `content-type` header means
  // `express.json()` never sets `req.body`, exercising the route's `(req.body ?? {})` fallback.
  const res = await fetch(`${baseUrl}${PATH}`, { method: "PUT", headers: { cookie, "if-match": await readEtag(baseUrl, cookie) } });
  const json = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.deepEqual(json, {});
});

test("get-providers: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    mediaProviderCredentialRepo: {
      ...base.mediaProviderCredentialRepo,
      listByWorkspaceId: async () => {
        throw new Error("boom");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  assert.equal(res.status, 500);
});

test("put-providers: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    // Prototype-chained, not spread: the PUT's If-Match basis is read through the repo's real list method.
    mediaProviderCredentialRepo: Object.assign(Object.create(base.mediaProviderCredentialRepo) as typeof base.mediaProviderCredentialRepo, {
      replaceWorkspace: async () => {
        throw new Error("boom");
      },
    }),
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": await readEtag(baseUrl, cookie) },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 500);
});

test("put-providers: an unconfigured secret store 503s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    siteAssistantSecretKeyring: {
      ...base.siteAssistantSecretKeyring,
      activeKey: async () => {
        throw new Error("no site key configured");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": await readEtag(baseUrl, cookie) },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code?: string }).code, "SECRET_STORE_UNCONFIGURED");
});

test("get-providers: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app -- still 404s as a mismatch", async () => {
  const app = createApp(testDeps());
  const handler = extractHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/media/providers");
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("put-providers: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app -- still 404s as a mismatch", async () => {
  const app = createApp(testDeps());
  const handler = extractHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/media/providers");
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: {}, body: { openai: { apiKey: "sk-1" } } }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

// ---- One-row PATCH/DELETE and the guarded legacy PUT (sheet P8-T8.T, B135/B136) ----

const ROW = (providerId: string) => `${PATH}/${encodeURIComponent(providerId)}`;
const PLUGIN_ID = "acme-media";
const OPENAI_KEY = "sk-openai-window-a-0001";
const GROK_KEY = "xai-grok-window-b-0002";
const PLUGIN_KEY = "acme-plugin-secret-0003";

type MarkerMap = Record<string, { apiKeyConfigured?: boolean; baseUrl?: string; model?: string }>;

async function patchRow(baseUrl: string, cookie: string, providerId: string, fields: unknown) {
  const res = await fetch(`${baseUrl}${ROW(providerId)}`, {
    method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(fields),
  });
  return { status: res.status, etag: res.headers.get("etag"), text: await res.text() };
}

async function deleteRow(baseUrl: string, cookie: string, providerId: string) {
  const res = await fetch(`${baseUrl}${ROW(providerId)}`, { method: "DELETE", headers: { cookie } });
  return { status: res.status, text: await res.text() };
}

async function readMap(baseUrl: string, cookie: string): Promise<MarkerMap> {
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  return (await res.json()) as MarkerMap;
}

/** Neither a submitted key nor any stored envelope may appear in what the wire carried. */
async function assertNoSecrets(deps: ReturnType<typeof createRouteDeps>, texts: readonly string[]): Promise<void> {
  const rows = await deps.mediaProviderCredentialRepo.listByWorkspaceId({ workspaceId: WORKSPACE_ID });
  for (const text of texts) {
    for (const secret of [OPENAI_KEY, GROK_KEY, PLUGIN_KEY]) assert.equal(text.includes(secret), false, "a submitted key reached the wire");
    for (const row of rows) {
      if (row.sealed) assert.equal(text.includes(row.sealed.ciphertext), false, "a sealed envelope reached the wire");
    }
  }
}

/** The composed registry, plus a plugin vendor whose presence the test switches off later. */
function switchablePluginCatalog(base: RouteDeps["mediaProviderRegistry"]): { registry: RouteDeps["mediaProviderRegistry"]; deactivate: () => void } {
  let active = true;
  const registry = Object.create(base) as RouteDeps["mediaProviderRegistry"];
  registry.findProvider = ({ id }: { id: string }) => (active && id === PLUGIN_ID ? { id: PLUGIN_ID } as ReturnType<typeof base.findProvider> : base.findProvider({ id }));
  return { registry, deactivate: () => { active = false; } };
}

test("saving one provider does not wipe a built-in key saved in another window", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const windowA = await patchRow(baseUrl, cookie, "openai", { apiKey: OPENAI_KEY, baseUrl: "https://api.openai.com/v1" });
  assert.equal(windowA.status, 200, windowA.text);
  // Window B never saw openai; it saves grok alone, and only grok travels.
  const windowB = await patchRow(baseUrl, cookie, "grok", { apiKey: GROK_KEY });
  assert.equal(windowB.status, 200, windowB.text);
  assert.match(windowB.etag ?? "", /^"[\x21\x23-\x7e]{1,200}"$/);
  const map = await readMap(baseUrl, cookie);
  assert.equal(map.openai?.apiKeyConfigured, true, "the other window's built-in key must survive");
  assert.equal(map.openai?.baseUrl, "https://api.openai.com/v1");
  assert.equal(map.grok?.apiKeyConfigured, true);
  // A metadata-only PATCH keeps the stored key and the fields it did not name.
  const modelOnly = await patchRow(baseUrl, cookie, "openai", { model: "gpt-image-1" });
  assert.equal(modelOnly.status, 200, modelOnly.text);
  assert.deepEqual((JSON.parse(modelOnly.text) as MarkerMap).openai, { ...map.openai, model: "gpt-image-1" });
  await assertNoSecrets(deps, [windowA.text, windowB.text, modelOnly.text, JSON.stringify(map)]);
});

test("Remove on a plugin-vendor key deletes that key and nothing else", async (t) => {
  const base = createRouteDeps();
  const plugin = switchablePluginCatalog(base.mediaProviderRegistry);
  const deps = testDeps({ mediaProviderRegistry: plugin.registry });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  assert.equal((await patchRow(baseUrl, cookie, "openai", { apiKey: OPENAI_KEY })).status, 200);
  assert.equal((await patchRow(baseUrl, cookie, PLUGIN_ID, { apiKey: PLUGIN_KEY })).status, 200);
  // The plugin is disabled: catalog absence is neither permission nor an obstacle to remove its saved key.
  plugin.deactivate();
  const removed = await deleteRow(baseUrl, cookie, PLUGIN_ID);
  assert.equal(removed.status, 200, removed.text);
  const map = await readMap(baseUrl, cookie);
  assert.deepEqual(Object.keys(map), ["openai"]);
  assert.equal(map.openai?.apiKeyConfigured, true);
  // Removing a provider that holds nothing removes nothing else either.
  assert.equal((await deleteRow(baseUrl, cookie, "grok")).status, 200);
  assert.deepEqual(Object.keys(await readMap(baseUrl, cookie)), ["openai"]);
  await assertNoSecrets(deps, [removed.text]);
});

test("a stale legacy PUT preserves newer credentials", async (t) => {
  const base = createRouteDeps();
  // Takes the FIRST provider-list read made after `armed`, then holds its result until the test
  // releases it, so another window's write lands after that read — a basis compared against such a
  // read, outside the writer boundary, would wrongly pass.
  let armed = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const paused = new Promise<void>((resolve) => { reached = resolve; });
  const repo = Object.create(base.mediaProviderCredentialRepo) as RouteDeps["mediaProviderCredentialRepo"];
  repo.listByWorkspaceId = async (input) => {
    const rows = await base.mediaProviderCredentialRepo.listByWorkspaceId(input);
    if (armed) { armed = false; reached(); await gate; }
    return rows;
  };
  const deps = testDeps({ mediaProviderCredentialRepo: repo });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Sequential: a basis read before another window's save is refused, and nothing is written.
  const staleBasis = await readEtag(baseUrl, cookie);
  assert.equal((await patchRow(baseUrl, cookie, "openai", { apiKey: OPENAI_KEY })).status, 200);
  const refused = await fetch(`${baseUrl}${PATH}`, { method: "PUT", headers: { cookie, "content-type": "application/json", "if-match": staleBasis }, body: "{}" });
  const refusedText = await refused.text();
  assert.equal(refused.status, 409, refusedText);
  assert.equal((JSON.parse(refusedText) as { code?: string }).code, "MEDIA_PROVIDERS_STALE");
  assert.equal((await readMap(baseUrl, cookie)).openai?.apiKeyConfigured, true);

  // Racing: the basis is current when the PUT is sent, but another window saves while it waits.
  const basis = await readEtag(baseUrl, cookie);
  armed = true;
  const racing = fetch(`${baseUrl}${PATH}`, { method: "PUT", headers: { cookie, "content-type": "application/json", "if-match": basis }, body: "{}" });
  await paused;
  const other = await patchRow(baseUrl, cookie, "grok", { apiKey: GROK_KEY });
  release();
  const raced = await racing;
  const racedText = await raced.text();
  assert.equal(other.status, 200, other.text);
  assert.equal((await readMap(baseUrl, cookie)).grok?.apiKeyConfigured, true, "a write that landed after the basis must survive the PUT");
  await assertNoSecrets(deps, [refusedText, racedText]);
});

test("patch- and delete-provider: a mismatched workspace 404s and a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const foreign = `/api/admin/v1/workspaces/not-real/media/providers/openai`;
  const foreignPatch = await fetch(`${baseUrl}${foreign}`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ apiKey: OPENAI_KEY }) });
  assert.equal(foreignPatch.status, 404);
  assert.equal((await fetch(`${baseUrl}${foreign}`, { method: "DELETE", headers: { cookie } })).status, 404);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const deniedPatch = await patchRow(baseUrl, bareCookie, "openai", { apiKey: OPENAI_KEY });
  assert.equal(deniedPatch.status, 403);
  assert.equal((await deleteRow(baseUrl, bareCookie, "openai")).status, 403);
  assert.deepEqual(await readMap(baseUrl, cookie), {}, "a refused write stores nothing");
  await assertNoSecrets(deps, [deniedPatch.text, await foreignPatch.text()]);
});

test("patch-provider: a refused field never echoes the submitted secret", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const leakedIntoBaseUrl = await patchRow(baseUrl, cookie, "openai", { apiKey: OPENAI_KEY, baseUrl: `https://x.test/?key=${GROK_KEY}`.padEnd(3000, "a") });
  assert.equal(leakedIntoBaseUrl.status, 400, leakedIntoBaseUrl.text);
  const unknown = await patchRow(baseUrl, cookie, "totally-unknown", { apiKey: OPENAI_KEY });
  assert.equal(unknown.status, 400, unknown.text);
  assert.deepEqual(await readMap(baseUrl, cookie), {});
  await assertNoSecrets(deps, [leakedIntoBaseUrl.text, unknown.text]);
});
