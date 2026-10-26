import assert from "node:assert/strict";
import { spawn as realSpawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureAgentDaemonPortResolved, getAgentDaemonPortForSpawnEnv } from "../agent-daemon-port.js";

let stubPath: string;
let stubImports: string[] = [];
let child: ChildProcess | undefined;
let report: Promise<Record<string, unknown>>;
// Represent an already-resolved proxy port and assert the native spawn receives that value.
// An omitted daemonPortOverride must fail: the parent keeps its allocated port out of its env.
// Keep the production start -> createRealDaemonProcessPorts -> spawn chain and its real
// env/argv options. Substitute only the daemon script at the OS boundary, so this never
// starts a dev server, invokes npx, or opens a real site's stores.
const nativeSpawn: NonNullable<import("../daemon-supervisor.js").StartAssistantDaemonOptions["nativeSpawn"]> = ({ command, args, options }) => {
  // Source mode runs `--import <prune preload> <tsx/cli>` ahead of the script; compiled mode runs it directly.
  assert.equal(command, process.execPath);
  const daemonArgs = args.slice(args.findIndex(arg => /agent-daemon-server\.[jt]s$/.test(arg)));
  assert.ok(/agent-daemon-server\.[jt]s$/.test(daemonArgs[0] ?? ""));
  assert.equal(options.env?.JINI_AGENT_DAEMON_PORT, getAgentDaemonPortForSpawnEnv());
  child = realSpawn(process.execPath, [...stubImports.flatMap(file => ["--import", file]), stubPath, ...daemonArgs.slice(1)], options);
  report = new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    child!.once("error", reject);
    child!.stderr!.on("data", chunk => { errors += String(chunk); });
    child!.once("exit", code => reject(new Error(`daemon fixture exited (${code}): ${errors}`)));
    child!.stdout!.on("data", (chunk) => {
      output += String(chunk);
      const line = output.split("\n").slice(0, -1).find(line => line.startsWith('{"argv":') || line.startsWith('{"inherited":'));
      if (line) resolve(JSON.parse(line));
    });
  });
  return child;
};
const { startAssistantDaemon, shutdownAssistantDaemon, resetAssistantDaemonSingletonForTests } = await import("../daemon-supervisor.js");

test("startAssistantDaemon passes the resolved port, site, socket and identity through the real spawn env", { timeout: 10_000 }, async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-daemon-spawn-"));
  const keys = ["JINI_AGENT_DAEMON_URL", "JINI_AGENT_DAEMON_PORT", "TOVU_SITE_DIR", "TOVU_THEMES_DIR", "TOVU_PG_SOCKET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  resetAssistantDaemonSingletonForTests();
  try {
    for (const key of keys) delete process.env[key];
    await ensureAgentDaemonPortResolved();
    const resolvedPort = getAgentDaemonPortForSpawnEnv();
    assert.ok(resolvedPort, "the proxy must resolve its own port before spawning");
    process.env.TOVU_THEMES_DIR = "/custom/themes";
    stubPath = path.join(fixture, "daemon-stub.cjs");
    writeFileSync(stubPath, `
      console.log(JSON.stringify({
        argv: process.argv.slice(2),
        port: process.env.JINI_AGENT_DAEMON_PORT,
        site: process.env.TOVU_SITE_DIR,
        workspace: process.env.TOVU_WORKSPACE,
        parent: process.env.TOVU_PARENT_PID,
        socket: process.env.TOVU_PG_SOCKET,
        themes: process.env.TOVU_THEMES_DIR,
      }));
      setInterval(() => {}, 1000);
    `);
    startAssistantDaemon({ workspaceId: "workspace-stub", siteDir: "/site/stub", pgSocketPath: "/tmp/stub/.s.PGSQL.5432" }, {
      registerProcessSignalHandlers: false, nativeSpawn,
    });
    assert.deepEqual(await report!, {
      argv: ["--workspace", "workspace-stub"], port: resolvedPort, site: "/site/stub",
      workspace: "workspace-stub", parent: String(process.pid), socket: "/tmp/stub/.s.PGSQL.5432", themes: "/custom/themes",
    });
  } finally {
    const exited = child && child.exitCode === null && child.signalCode === null && new Promise<void>((resolve) => child!.once("exit", () => resolve()));
    shutdownAssistantDaemon();
    if (exited) await exited;
    resetAssistantDaemonSingletonForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(fixture, { recursive: true, force: true });
  }
});

for (const mode of ['https-dev', 'desktop'] as const) {
  // The child cold-compiles the full route composition through tsx; 30 s timed out under load
  // and the late finally then shut down the next test's daemon.
  test(`${mode}: boot listener selection reaches the daemon child's real guide composition`, { timeout: 120_000 }, async () => {
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const { pinSiteListenerOrigin } = await import('../../boot/site-listener-origin.js');
    const { deriveDevScheme, resolveDevTls } = await import('../../boot/dev-tls.js');
    const fixture = mkdtempSync(path.join(tmpdir(), 'tovu-origin-spawn-'));
    const keys = ['JINI_AGENT_DAEMON_URL', 'JINI_AGENT_DAEMON_PORT', 'TOVU_SITE_DIR', 'TOVU_SITE_LISTENER_ORIGIN', 'PORT', 'TOVU_DISABLE_DEV_TLS', 'TOVU_DB', 'HOME'];
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    resetAssistantDaemonSingletonForTests();
    try {
      for (const key of keys) delete process.env[key];
      // The child composes real route deps; node:test children must not touch the owner's home.
      process.env.HOME = fixture;
      await ensureAgentDaemonPortResolved();
      // Wrong fallback settings make a lost inherited listener pin observable in the child.
      process.env.PORT = '3000';
      process.env.TOVU_DISABLE_DEV_TLS = '1';
      process.env.TOVU_DB = 'memory';
      process.env.TOVU_SITE_LISTENER_ORIGIN = 'http://stale.invalid:1';
      const tls = resolveDevTls({ certPath: '/fixture/cert.pem', keyPath: '/fixture/key.pem' }, {
        env: {}, existsSync: () => true, readFileSync: () => Buffer.from('fixture PEM'),
      });
      assert.equal(tls.active, true);
      const selected = mode === 'https-dev'
        ? { scheme: deriveDevScheme(tls.active), host: undefined, port: 3047 }
        : { scheme: 'http' as const, host: '127.0.0.1', port: 43127 };
      pinSiteListenerOrigin(selected);
      const expected = mode === 'https-dev' ? 'https://localhost:3047' : 'http://127.0.0.1:43127';
      const appModule = pathToFileURL(path.resolve(import.meta.dirname, '../../composition/app.ts')).href;
      const guideModule = pathToFileURL(path.resolve(import.meta.dirname, '../../composition/site-guide-tools.ts')).href;
      const coreModule = import.meta.resolve('@jini-ai/core');
      const daemonModule = import.meta.resolve('@jini-ai/daemon');
      stubPath = path.join(fixture, 'guide-daemon.mjs');
      stubImports = [createRequire(import.meta.url).resolve('tsx')];
      writeFileSync(stubPath, `
        import { createRouteDeps } from ${JSON.stringify(appModule)};
        import { buildSiteGuideRegistrations } from ${JSON.stringify(guideModule)};
        import { createToolRegistry } from ${JSON.stringify(coreModule)};
        import { createToolExecutor } from ${JSON.stringify(daemonModule)};
        const deps = createRouteDeps();
        const registry = createToolRegistry({});
        for (const registration of buildSiteGuideRegistrations({ deps: {
          ...deps, authorize: async () => ({ allowed: true, reason: 'test' }),
        } })) registry.register(registration);
        const result = await createToolExecutor({ registry }).execute({
          principal: { id: 'caller' }, run: { id: 'origin-run' }, toolId: 'site_guide', input: { operation: 'overview' },
        });
        console.log(JSON.stringify({ inherited: process.env.TOVU_SITE_LISTENER_ORIGIN, derived: deps.derivedPublicOrigin, result }));
        setInterval(() => {}, 1000);
      `);
      startAssistantDaemon({ workspaceId: 'workspace-origin', siteDir: fixture }, { registerProcessSignalHandlers: false, nativeSpawn });
      const childReport = await report!;
      assert.equal(childReport.inherited, expected);
      assert.equal(childReport.derived, expected);
      const result = childReport.result as { status: string; output: { siteOrigin: string; navigationHint: string } };
      assert.equal(result.status, 'completed');
      assert.equal(result.output.siteOrigin, expected);
      assert.ok(result.output.navigationHint.includes(`${expected}/`));
    } finally {
      const exited = child && child.exitCode === null && child.signalCode === null && new Promise<void>(resolve => child!.once('exit', () => resolve()));
      shutdownAssistantDaemon();
      if (exited) await exited;
      resetAssistantDaemonSingletonForTests();
      stubImports = [];
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
