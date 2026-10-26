import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import { PluginInstallError, type PluginInstallerPort, type PluginInstallPreview } from "@jini-ai/plugins/host/node";
import { createSitePluginPolicy } from '#src/features/plugin-runtime/install';
import { MAX_PLUGIN_ARCHIVE_BYTES } from "#src/features/plugin-runtime/install-archive";
import { registerPluginInstallRoutes, type PluginInstallRouteDeps } from "../../install.js";

// Route-level tests for the input/option/error-mapping branches. The integration tests
// (install.integration.test.ts, install-zip.integration.test.ts) cover the real installer and
// session gates; here the installer is a recording fake so every response mapping is pinned.
const WS = "ws-1";
const DIGEST = `sha256-${"a".repeat(64)}`;
type InstallerInput = Parameters<PluginInstallerPort["install"]>[0] | Parameters<PluginInstallerPort["preview"]>[0];
type Call = { method: "preview" | "install"; input: InstallerInput };
type Authorization = Parameters<PluginInstallRouteDeps["authorize"]>[0];
type BootOptions = { installer?: "none" | ((call: Call) => PluginInstallPreview); env?: string; allowed?: boolean; jsonParser?: boolean; policy?: "none"; principal?: "none" };

/** A typed installer result whose `name` records which installer method produced it. */
const plugin = (via: string): PluginInstallPreview => ({ id: "p", name: via, version: "1.0.0", tier: "tier-3", capabilities: [], hooks: [], hasCode: true, digest: DIGEST, contentTypes: [], conflicts: [] });

async function boot(t: TestContext, options: BootOptions = {}) {
  const previous = process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  if (options.env === undefined) process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1"; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = options.env;
  const calls: Call[] = [];
  const authorizations: Authorization[] = [];
  const respond = options.installer === "none" ? undefined : options.installer ?? ((call: Call) => plugin(call.method));
  const installer = (answer: (call: Call) => PluginInstallPreview): PluginInstallerPort => ({
    preview: async (input) => { calls.push({ method: "preview", input }); return answer({ method: "preview", input }); },
    install: async (input) => { calls.push({ method: "install", input }); return answer({ method: "install", input }); },
  });
  const deps: PluginInstallRouteDeps = {
    tracker: createNoopTracker({}),
    workspaceId: WS,
    ...(options.policy === "none" ? {} : { pluginSourcePolicy: createSitePluginPolicy({ env: { NODE_ENV: 'production', TOVU_PLUGIN_LOCAL_INSTALL: options.env ?? '1' } }) }),
    authorize: async (request) => { authorizations.push(request); return options.allowed === false ? { allowed: false, reason: "denied" } : { allowed: true, reason: "ok" }; },
    ...(respond ? { pluginInstaller: installer(respond) } : {}),
  };
  const app = express();
  if (options.principal !== "none") app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  if (options.jsonParser !== false) app.use(express.json());
  registerPluginInstallRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = previous;
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/v1/workspaces/${WS}/plugins/install`;
  const json = (suffix: string, body: unknown) => fetch(base + suffix, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const zip = (suffix: string, body: Uint8Array<ArrayBuffer> = new Uint8Array([80, 75, 3, 4]), type = "application/zip", extra: Record<string, string> = {}) => fetch(base + suffix, { method: "POST", headers: { "content-type": type, ...extra }, body });
  return { calls, authorizations, json, zip, base };
}
const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const INVALID_OPTIONS = { status: 400, body: { code: "PLUGIN_INSTALL_INPUT_INVALID", error: "Valid replacement options and the reviewed digest are required." } };

test("folder preview/install forward the source path, boolean replace and reviewed digest", async t => {
  const h = await boot(t);
  assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 200, body: { plugin: plugin("preview") } });
  assert.deepEqual(await read(await h.json("", { source: { kind: "folder", path: "/srv/plugin" }, replace: true, expectedDigest: DIGEST })), { status: 201, body: { plugin: plugin("install") } });
  assert.deepEqual(h.calls, [
    { method: "preview", input: { sourceDir: "/srv/plugin", replace: false } },
    { method: "install", input: { sourceDir: "/srv/plugin", replace: true, expectedDigest: DIGEST } },
  ]);
});

test("ZIP preview/install read options from the query and forward the uploaded bytes", async t => {
  const h = await boot(t);
  assert.equal((await h.zip("/zip/preview?replace=false")).status, 200);
  assert.equal((await h.zip(`/zip?replace=true&expectedDigest=${DIGEST}`)).status, 201);
  assert.deepEqual(h.calls.map(call => ({ ...call, input: { ...call.input, archive: [...(call.input.archive ?? [])] } })), [
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

test("a folder route mounted without its JSON body parser refuses the request instead of crashing", async t => {
  const h = await boot(t, { jsonParser: false });
  assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), INVALID_OPTIONS);
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

test("local-install opt-in does not admit dev-link sources on preview or install", async t => {
  const h = await boot(t, { env: "1" });
  for (const kind of ["dev-link", "link", "symlink"]) {
    for (const suffix of ["/preview", ""]) {
      const response = await h.json(suffix, { source: { kind, path: "/srv/plugin" }, expectedDigest: DIGEST });
      assert.deepEqual(await read(response), {
        status: 400,
        body: { code: "PLUGIN_INSTALL_INPUT_INVALID", error: "A folder source is required." },
      });
    }
  }
  assert.deepEqual(h.calls, [], "unsupported link sources never reach the installer");
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

test("each install route asks authorize() for admin.plugins.enable on this workspace as the signed-in principal", async t => {
  const h = await boot(t);
  await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } });
  assert.deepEqual(h.authorizations, [{ principalId: "owner", permission: "admin.plugins.enable", workspaceId: WS }]);
});

test("a route reached without a signed-in principal answers the opaque 500 and never inspects the source", async t => {
  const h = await boot(t, { principal: "none" });
  assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 500, body: { code: "INTERNAL_ERROR", error: "internal error" } });
  assert.deepEqual(h.authorizations, []);
  assert.deepEqual(h.calls, []);
});

/** Makes the env fallback policy read this process as a hosted (Fly) server for one test. */
function hostedProcess(t: TestContext) {
  const previous = process.env.FLY_APP_NAME;
  process.env.FLY_APP_NAME = "hosted-test";
  t.after(() => { if (previous === undefined) delete process.env.FLY_APP_NAME; else process.env.FLY_APP_NAME = previous; });
}

test("without a wired source policy, a hosted server's TOVU_PLUGIN_LOCAL_INSTALL=1 env opt-in admits local installs", async t => {
  hostedProcess(t);
  const h = await boot(t, { policy: "none", env: "1" });
  assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 200, body: { plugin: plugin("preview") } });
});

test("without a wired source policy, a hosted server without the env opt-in refuses local installs with 403", async t => {
  hostedProcess(t);
  const h = await boot(t, { policy: "none", env: "" });
  assert.deepEqual(await read(await h.json("/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 403, body: { code: "PLUGIN_LOCAL_INSTALL_DISABLED", error: "Local folder installs are disabled on this server." } });
  assert.deepEqual(h.calls, []);
});

test("a ZIP install without a replace query installs with replace=false and the reviewed digest", async t => {
  const h = await boot(t);
  assert.equal((await h.zip(`/zip?expectedDigest=${DIGEST}`)).status, 201);
  assert.deepEqual(h.calls.map(call => ({ ...call, input: { ...call.input, archive: [...(call.input.archive ?? [])] } })), [
    { method: "install", input: { archive: [80, 75, 3, 4], replace: false, expectedDigest: DIGEST } },
  ]);
});

test("a folder install with replace=false forwards replace=false", async t => {
  const h = await boot(t);
  assert.equal((await h.json("", { source: { kind: "folder", path: " /srv/plugin " }, replace: false, expectedDigest: DIGEST })).status, 201);
  assert.deepEqual(h.calls, [{ method: "install", input: { sourceDir: " /srv/plugin ", replace: false, expectedDigest: DIGEST } }]);
});

test("a JSON body on a ZIP route is refused as a non-zip upload before any parsing", async t => {
  const h = await boot(t);
  assert.deepEqual(await read(await h.json("/zip/preview", { source: { kind: "folder", path: "/srv/plugin" } })), { status: 400, body: { code: "PLUGIN_INSTALL_INPUT_INVALID", error: "An application/zip upload is required." } });
  assert.deepEqual(h.calls, []);
});
