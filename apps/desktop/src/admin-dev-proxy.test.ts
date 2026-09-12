import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { TestContext } from "node:test";

import { adminDevProxyCandidates, resolveAdminDevProxyUrl, DEFAULT_VITE_PORT } from "./admin-dev-proxy.ts";
import { buildServeEnv } from "./tovu-server.ts";

const REPO_ROOT = "/Users/someone/Programming/Tovu";

/** A stand-in Vite: any listener that speaks HTTP is "up" as far as the probe is concerned. */
async function listeningServer(t: TestContext): Promise<number> {
  const server = createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  // @ts-expect-error `.address()` types as `AddressInfo | string | null`; bound to a host/port
  // (never a Unix socket path), it is always an AddressInfo with `.port`, which the type can't narrow.
  return server.address().port;
}

test("a packaged app offers no candidate at all — the gate that keeps packaged behavior unchanged", () => {
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: true, env: {} }), []);
  // Even an operator-set variable must not re-enable it: packaged is packaged.
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: true, env: { TOVU_ADMIN_DEV_PROXY_URL: "https://localhost:5173" } }), []);
});

test("a checkout offers both schemes on Vite's port, because dev TLS is decided by cert files this process cannot read", () => {
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: false, env: {} }), [
    `https://localhost:${DEFAULT_VITE_PORT}`,
    `http://localhost:${DEFAULT_VITE_PORT}`,
  ]);
});

test("TOVU_ADMIN_DEV_PORT moves the candidates, matching vite.config.ts's own default", () => {
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: false, env: { TOVU_ADMIN_DEV_PORT: "6000" } }), [
    "https://localhost:6000",
    "http://localhost:6000",
  ]);
});

test("an operator-set origin is honored verbatim and ALONE — never silently widened to a guessed localhost", () => {
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: false, env: { TOVU_ADMIN_DEV_PROXY_URL: "https://vite.internal:4443" } }), [
    "https://vite.internal:4443",
  ]);
});

test("a nonsense port yields no candidate rather than an unparseable origin", () => {
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: false, env: { TOVU_ADMIN_DEV_PORT: "not-a-port" } }), []);
  assert.deepEqual(adminDevProxyCandidates({ isPackaged: false, env: { TOVU_ADMIN_DEV_PORT: "70000" } }), []);
});

test("resolve returns the origin when something is actually listening there", async (t) => {
  const port = await listeningServer(t);
  const resolved = await resolveAdminDevProxyUrl({ isPackaged: false, env: { TOVU_ADMIN_DEV_PROXY_URL: `http://127.0.0.1:${port}` } });
  assert.equal(resolved, `http://127.0.0.1:${port}`);
});

test("resolve returns null when nothing is listening — the case that must NOT break a desktop with no Vite running", async () => {
  // Port 1 is privileged and unbound; the connection is refused immediately rather than timing out.
  const resolved = await resolveAdminDevProxyUrl({ isPackaged: false, env: { TOVU_ADMIN_DEV_PROXY_URL: "http://127.0.0.1:1" } });
  assert.equal(resolved, null);
});

test("resolve returns null when packaged, without probing anything", async () => {
  let probed = false;
  const requestFn = () => {
    probed = true;
    throw new Error("a packaged app must never probe for a dev server");
  };
  assert.equal(await resolveAdminDevProxyUrl({ isPackaged: true, env: {}, requestFn }), null);
  assert.equal(probed, false);
});

test("buildServeEnv sets TOVU_ADMIN_DEV_PROXY_URL only when a resolved origin is passed", () => {
  const base = { repoRoot: REPO_ROOT, siteDir: "/tmp/site", baseEnv: {} };

  assert.equal(buildServeEnv(base).TOVU_ADMIN_DEV_PROXY_URL, undefined);
  // @ts-expect-error tovu-server.ts's BuildServeEnvInput types this field `string | undefined`, but
  // buildServeEnv also guards `typeof input.adminDevProxyUrl === "string"` at runtime — this case
  // exercises that guard against a non-string value the declared type no longer admits.
  assert.equal(buildServeEnv({ ...base, adminDevProxyUrl: null }).TOVU_ADMIN_DEV_PROXY_URL, undefined);
  assert.equal(buildServeEnv({ ...base, adminDevProxyUrl: "" }).TOVU_ADMIN_DEV_PROXY_URL, undefined);
  assert.equal(buildServeEnv({ ...base, adminDevProxyUrl: "https://localhost:5173" }).TOVU_ADMIN_DEV_PROXY_URL, "https://localhost:5173");
});

test("the dev proxy does not disturb the admin/site-chat dist variables the same env already carries", () => {
  // `admin-static.ts` decides between them by precedence, not by their absence — so setting the
  // proxy must not also start deleting the fallback values this env has always carried.
  const env = buildServeEnv({
    repoRoot: REPO_ROOT,
    siteDir: "/tmp/site",
    baseEnv: { TOVU_ADMIN_DIST: "/prebuilt/admin", TOVU_SITE_CHAT_DIST: "/prebuilt/site-chat" },
    adminDevProxyUrl: "https://localhost:5173",
  });
  assert.equal(env.TOVU_ADMIN_DIST, "/prebuilt/admin");
  assert.equal(env.TOVU_SITE_CHAT_DIST, "/prebuilt/site-chat");
  assert.equal(env.TOVU_ADMIN_DEV_PROXY_URL, "https://localhost:5173");
});
