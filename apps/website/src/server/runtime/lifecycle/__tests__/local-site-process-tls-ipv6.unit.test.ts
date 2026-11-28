import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test, { mock, type TestContext } from "node:test";

/**
 * @file The two native inputs `createLocalSiteProcessPort` reads but does not take injected, each
 * replaced at its module boundary while the unit under test stays real:
 * - dev TLS: the real `resolveDevTls` runs with its own env gate, but sees cert files present, so the
 *   port must switch every loopback URL to https and hand the cert to each request it makes;
 * - the IPv4/IPv6 port probe: `allocatePort` answers per host, so `isPortFree`'s dual-stack policy is
 *   pinned on a machine with or without IPv6.
 */
const devTls = await import("../../../../platform/dev-host/dev-tls.js");
mock.module("../../../../platform/dev-host/dev-tls.js", { namedExports: { ...devTls,
  resolveDevTls: (input: Parameters<typeof devTls.resolveDevTls>[0], deps: Parameters<typeof devTls.resolveDevTls>[1] = {}) =>
    devTls.resolveDevTls(input, { ...deps, existsSync: () => true, readFileSync: (file: string) => Buffer.from(`pem:${path.basename(file)}`) }),
} });

type RetireCall = [{ url: string; method: string; headers: Record<string, string> }, { certificate?: Buffer }];
const retireCalls: RetireCall[] = [];
const net = await import("@jini-ai/platform/net");
mock.module("@jini-ai/platform/net", { namedExports: { ...net,
  requestLoopbackHttp: async (input: RetireCall[0], options: RetireCall[1]) => { retireCalls.push([input, options]); return { status: 204 }; },
} });

const allocations: Array<[string, number]> = [];
let allocateOn: (host: string) => Promise<void> = async () => {};
const sidecar = await import("@jini-ai/sidecar");
mock.module("@jini-ai/sidecar", { namedExports: { ...sidecar,
  allocatePort: async (_required: object, { port, host }: { port: number; host: string }) => { allocations.push([host, port]); await allocateOn(host); return port; },
} });

const { createLocalSiteProcessPort } = await import("../local-site-process.js");

function siteFixture(t: TestContext, siteId: string) {
  const switcherBase = fs.mkdtempSync(path.join(os.tmpdir(), "site-tls-"));
  t.after(() => fs.rmSync(switcherBase, { recursive: true, force: true }));
  const siteDir = path.join(switcherBase, "sites/secure");
  fs.mkdirSync(path.join(siteDir, "ops"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name: "secure" }));
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "blank",
    templateVersion: "1", schemaTag: "test", schemaVersion: 0, createdAt: "2026-11-28" }));
  return { switcherBase };
}

test("with dev certs present, the site child gets an https API URL and every probe and retirement request carries the cert", async (t) => {
  const { switcherBase } = siteFixture(t, "secure-tls-on");
  // Above Linux's largest possible pid_max, so this stand-in can never name a real process.
  const child = Object.assign(new EventEmitter(), { pid: 4_194_501, stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
  t.after(() => { child.stdout.end(); child.stderr.end(); retireCalls.length = 0; });
  let spawnedEnv: NodeJS.ProcessEnv | undefined;
  const probes: Array<[string, unknown]> = [];
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: { spawn: ({ options }) => { spawnedEnv = options.env; return child as unknown as ChildProcess; } },
    probeHttp: async ({ url }, options) => { probes.push([url, options]); return true; },
  });
  t.after(() => local.dispose?.());
  const cert = Buffer.from("pem:localhost.pem");

  const launched = await local.launch({ name: "secure", port: 4801, daemonPort: 4802 });
  assert.equal(spawnedEnv?.TOVU_API_URL, "https://localhost:4801");
  assert.equal(await launched.ready(), true);
  assert.deepEqual(probes, [
    ["https://127.0.0.1:4801/readyz", { certificate: cert, servername: "localhost" }],
    ["https://127.0.0.1:4801/admin/", { certificate: cert, servername: "localhost" }],
  ]);

  assert.equal(await launched.tryRetire!(), true);
  const token = spawnedEnv?.TOVU_DEV_RETIRE_TOKEN;
  assert.match(token ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(retireCalls, [[
    { url: "https://localhost:4801/internal/dev-site-retire", method: "POST", headers: { "x-tovu-retire": token } },
    { certificate: cert },
  ]]);
});

test("TOVU_DISABLE_DEV_TLS keeps plain http even when certs exist, and requests carry no cert", async (t) => {
  const { switcherBase } = siteFixture(t, "secure-tls-off");
  const child = Object.assign(new EventEmitter(), { pid: 4_194_502, stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
  t.after(() => { child.stdout.end(); child.stderr.end(); retireCalls.length = 0; });
  let spawnedEnv: NodeJS.ProcessEnv | undefined;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_ADMIN_DIST: "/prebuilt/dist", TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: ({ options }) => { spawnedEnv = options.env; return child as unknown as ChildProcess; } },
  });
  t.after(() => local.dispose?.());

  const launched = await local.launch({ name: "secure", port: 4803, daemonPort: 4804 });
  assert.equal(spawnedEnv?.TOVU_API_URL, "http://localhost:4803");
  await launched.cancelRetirement!();
  assert.deepEqual(retireCalls, [[
    { url: "http://localhost:4803/internal/dev-site-retire", method: "DELETE", headers: { "x-tovu-retire": spawnedEnv?.TOVU_DEV_RETIRE_TOKEN } },
    { certificate: undefined },
  ]]);
});

function portOnly() {
  return createLocalSiteProcessPort({ switcherBase: fs.mkdtempSync(path.join(os.tmpdir(), "site-ipv6-")) }, { env: { TOVU_DISABLE_DEV_TLS: "1" } });
}

test("isPortFree is true only when both the IPv4 and the IPv6 loopback can take the port", async (t) => {
  t.after(() => { allocations.length = 0; allocateOn = async () => {}; });
  const local = portOnly();
  assert.equal(await local.isPortFree({ port: 4811 }), true);
  assert.deepEqual(allocations, [["127.0.0.1", 4811], ["::1", 4811]]);

  allocations.length = 0;
  allocateOn = async (host) => { if (host === "127.0.0.1") throw new Error("listen EADDRINUSE: address already in use 127.0.0.1:4812"); };
  assert.equal(await local.isPortFree({ port: 4812 }), false);
  assert.deepEqual(allocations, [["127.0.0.1", 4812]], "an IPv4 collision refuses without probing IPv6");
});

test("isPortFree ignores a missing IPv6 stack but refuses an IPv6 collision or an unexplained failure", async (t) => {
  t.after(() => { allocations.length = 0; allocateOn = async () => {}; });
  const local = portOnly();
  const ipv6Fails = (failure: unknown) => { allocateOn = async (host) => { if (host === "::1") throw failure; }; };

  ipv6Fails(new Error("listen EADDRNOTAVAIL: address not available ::1:4821"));
  assert.equal(await local.isPortFree({ port: 4821 }), true);
  ipv6Fails(new Error("listen EAFNOSUPPORT: address family not supported ::1:4822"));
  assert.equal(await local.isPortFree({ port: 4822 }), true);
  ipv6Fails(new Error("listen EADDRINUSE: address already in use ::1:4823"));
  assert.equal(await local.isPortFree({ port: 4823 }), false);
  // Only an Error's message is trusted; a bare string that merely names the code is not a missing stack.
  ipv6Fails("EADDRNOTAVAIL");
  assert.equal(await local.isPortFree({ port: 4824 }), false);
});
