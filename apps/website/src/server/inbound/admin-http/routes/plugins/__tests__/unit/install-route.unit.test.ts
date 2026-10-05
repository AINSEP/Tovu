import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import { PluginInstallError } from "#src/features/plugin-runtime/install";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "#src/features/plugin-runtime/install-archive";
import { registerPluginInstallRoutes } from "../../install.js";
import type { PluginsRouteDeps } from "../../deps.js";

// Route-level tests for the input/option/error-mapping branches. The integration tests
// (install.integration.test.ts, install-zip.integration.test.ts) cover the real installer and
// session gates; here the installer is a recording fake so every response mapping is pinned.
const WS = "ws-1";
const DIGEST = `sha256-${"a".repeat(64)}`;
type Call = { method: "preview" | "install"; input: Record<string, unknown> };

async function boot(t: TestContext, options: { installer?: "none" | ((call: Call) => unknown); env?: string; allowed?: boolean } = {}) {
  const previous = process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  if (options.env === undefined) process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1"; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = options.env;
  const calls: Call[] = [];
  const respond = options.installer === "none" ? undefined : options.installer ?? ((call: Call) => ({ id: "p", via: call.method }));
  const record = (method: Call["method"]) => async (input: Record<string, unknown>) => { calls.push({ method, input }); return respond!({ method, input }); };
  const deps = {
    workspaceId: WS,
    authorize: async () => (options.allowed === false ? { allowed: false, reason: "denied" } : { allowed: true }),
    ...(respond ? { pluginInstaller: { preview: record("preview"), install: record("install") } } : {}),
  } as unknown as PluginsRouteDeps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  app.use(express.json());
  registerPluginInstallRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = previous;
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/v1/workspaces/${WS}/plugins/install`;
  const json = (suffix: string, body: unknown) => fetch(base + suffix, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const zip = (suffix: string, body: Uint8Array = new Uint8Array([80, 75, 3, 4]), type = "application/zip", extra: Record<string, string> = {}) => fetch(base + suffix, { method: "POST", headers: { "content-type": type, ...extra }, body });
  return { calls, json, zip, base };
}
const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const INVALID_OPTIONS = { status: 400, body: { code: "PLUGIN_INSTALL_INPUT_INVALID", error: "Valid replacement options and the reviewed digest are required." } };

test("folder preview/install forward the source path, boolean replace and reviewed digest", async t => {
  const h = await boot(t);
  assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 200, body: { plugin: { id: "p", via: "preview" } } });
  assert.deepEqual(await read(await h.json("", { source: { kind: "folder", path: "/srv/plugin" }, replace: true, expectedDigest: DIGEST })), { status: 201, body: { plugin: { id: "p", via: "install" } } });
  assert.deepEqual(h.calls, [
    { method: "preview", input: { sourceDir: "/srv/plugin", replace: false } },
    { method: "install", input: { sourceDir: "/srv/plugin", replace: true, expectedDigest: DIGEST } },
  ]);
});

test("ZIP preview/install read options from the query and forward the uploaded bytes", async t => {
  const h = await boot(t);
  assert.equal((await h.zip("/zip/preview?replace=false")).status, 200);
  assert.equal((await h.zip(`/zip?replace=true&expectedDigest=${DIGEST}`)).status, 201);
  assert.deepEqual(h.calls.map(call => ({ ...call, input: { ...call.input, archive: [...(call.input.archive as Buffer)] } })), [
    { method: "preview", input: { archive: [80, 75, 3, 4], replace: false } },
    { method: "install", input: { archive: [80, 75, 3, 4], replace: true, expectedDigest: DIGEST } },
  ]);
});

test("installs are refused unless the env opt-in is exactly 1 and an installer is wired", async t => {
  for (const options of [{ env: "true" }, { env: "" }, { installer: "none" as const }]) {
    const h = await boot(t, options);
    assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 403, body: { code: "PLUGIN_LOCAL_INSTALL_DISABLED", error: "Local folder installs are disabled on this server." } });
    assert.deepEqual(h.calls, []);
  }
});

test("replace must be a boolean (JSON) or 'true'/'false' (query), and install needs a sha256 digest", async t => {
  const h = await boot(t);
  const source = { kind: "folder", path: "/srv/plugin" };
  assert.deepEqual(await read(await h.json("/preview", { source, replace: "true" })), INVALID_OPTIONS);
  assert.deepEqual(await read(await h.zip("/zip/preview?replace=yes")), INVALID_OPTIONS);
  for (const expectedDigest of [undefined, 7, "sha256-" + "A".repeat(64), "sha512-" + "a".repeat(64), DIGEST + "0"]) {
    assert.deepEqual(await read(await h.json("", { source, expectedDigest })), INVALID_OPTIONS, String(expectedDigest));
  }
  assert.deepEqual(await read(await h.zip("?expectedDigest=nope")), INVALID_OPTIONS);
  assert.deepEqual(h.calls, []);
});

test("folder routes need a non-blank folder source", async t => {
  const h = await boot(t);
  for (const source of [undefined, { kind: "url", path: "/x" }, { kind: "folder" }, { kind: "folder", path: 3 }, { kind: "folder", path: "   " }]) {
    assert.deepEqual(await read(await h.json("/preview", { source })), { status: 400, body: { code: "PLUGIN_INSTALL_INPUT_INVALID", error: "A folder source is required." } }, JSON.stringify(source));
  }
  assert.deepEqual(h.calls, []);
});

test("ZIP routes need an application/zip body", async t => {
  const h = await boot(t);
  assert.deepEqual(await read(await h.zip("/zip/preview", new Uint8Array([1]), "application/octet-stream")), { status: 400, body: { code: "PLUGIN_INSTALL_INPUT_INVALID", error: "An application/zip upload is required." } });
  assert.deepEqual(h.calls, []);
});

test("installer errors map to 409 conflicts, 500 recovery, 400 other refusals and an opaque 500", async t => {
  const cases: Array<[unknown, number, Record<string, string>]> = [
    ...["PLUGIN_SHADOWS_BUILT_IN", "PLUGIN_ID_CONFLICT", "PLUGIN_IN_TRASH", "PLUGIN_ENABLED", "PLUGIN_VERSION_EXISTS", "PLUGIN_DOWNGRADE", "PLUGIN_CHANGED_SINCE_PREVIEW", "PLUGIN_INSTALL_BUSY"]
      .map((code): [unknown, number, Record<string, string>] => [new PluginInstallError(code, `msg ${code}`), 409, { code, error: `msg ${code}` }]),
    [new PluginInstallError("PLUGIN_INSTALL_RECOVERY_REQUIRED", "recover"), 500, { code: "PLUGIN_INSTALL_RECOVERY_REQUIRED", error: "recover" }],
    [new PluginInstallError("PLUGIN_MANIFEST_INVALID", "bad manifest"), 400, { code: "PLUGIN_MANIFEST_INVALID", error: "bad manifest" }],
    [new Error("/private/server/path exploded"), 500, { code: "INTERNAL_ERROR", error: "internal error" }],
  ];
  for (const [error, status, body] of cases) {
    const h = await boot(t, { installer: () => { throw error; } });
    assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status, body }, body.code);
  }
});

test("other workspaces 404 and denied principals 403 before any installer or env check", async t => {
  const h = await boot(t, { env: "0" });
  const other = await fetch(h.base.replace(`/workspaces/${WS}/`, "/workspaces/ws-2/") + "/preview", { method: "POST" });
  assert.deepEqual(await read(other), { status: 404, body: { error: "workspace was not found" } });
  const denied = await boot(t, { allowed: false });
  const response = await denied.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } });
  assert.equal(response.status, 403);
  assert.equal((await response.json() as { code: string }).code, "FORBIDDEN");
  assert.deepEqual(denied.calls, []);
});

test("ZIP bodies over the upload cap get 413; unreadable bodies get PLUGIN_ARCHIVE_INVALID", async t => {
  const h = await boot(t);
  assert.deepEqual(await read(await h.zip("/zip/preview", new Uint8Array(MAX_PLUGIN_ARCHIVE_BYTES + 1))), { status: 413, body: { code: "PLUGIN_PACKAGE_TOO_LARGE", error: "ZIP exceeds the 32 MiB upload limit." } });
  // inflate is off, so a compressed transfer encoding cannot be read.
  assert.deepEqual(await read(await h.zip("/zip/preview", new Uint8Array([1, 2]), "application/zip", { "content-encoding": "gzip" })), { status: 400, body: { code: "PLUGIN_ARCHIVE_INVALID", error: "ZIP upload could not be read." } });
  assert.deepEqual(h.calls, []);
});
