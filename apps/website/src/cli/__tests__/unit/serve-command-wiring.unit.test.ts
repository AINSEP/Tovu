import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";

/**
 * @file Closes the "correct primitive, unwired call site" gap for `pinServedSiteDirIntoEnv`
 * (2026-09-07 audit, claim #5 — see `serve.ts`'s own header on that function).
 *
 * `pinServedSiteDirIntoEnv` itself is fully proven by
 * `serve-site-dir-pin.unit.test.ts` (calls it directly, asserts the env mutation and every
 * downstream resolver that reads `TOVU_SITE_DIR`). What NONE of those tests prove is that
 * `runServeCommand` — the only production call site — actually calls it. Delete
 * `serve.ts`'s `pinServedSiteDirIntoEnv(target);` line and every one of those tests still passes,
 * because they invoke the primitive directly; the API/daemon `TOVU_SITE_DIR` split-brain the audit
 * fixed comes back silently.
 *
 * The only suite that exercises `runServeCommand` itself is the
 * `serve-command*.integration.test.ts` family, which is a real-process-spawn, real-port-bind
 * integration tier currently BANNED from running (it hangs indefinitely and orphans live `tovu
 * serve` children). So this gap has no other net right now.
 *
 * Why this is a source-text check, not a behavioral one: `runServeCommand` takes no injectable
 * deps or env (`RunServeCommandInput` is just `{ dir, port?, workspaceId?, emitBootToken? }`), and
 * `pinServedSiteDirIntoEnv(target)` is called with no env argument, so it always mutates the real
 * `process.env`. Every step around it in `runServeCommand` (`bootSiteDir`, `runBootLifecycle`,
 * `app.listen(port)`) does real filesystem/DB/network work ending in an actual bound TCP listener
 * — precisely the boot-and-bind sequence this dispatch prohibits exercising here. A behavioral test
 * of the real call site would have to be the banned integration suite; there is no lighter seam.
 * Reading `runServeCommand`'s own source for the literal call is the only way left to prove it is
 * still wired, and it genuinely fails the moment that call is deleted, commented out, or moved
 * outside the function.
 */

const SERVE_TS_PATH = path.resolve(import.meta.dirname, "../../commands/serve.ts");
const RUN_SERVE_COMMAND_SIGNATURE = "export async function runServeCommand(";
const PIN_CALL = "pinServedSiteDirIntoEnv(target)";

/**
 * `runServeCommand` is declared last in `serve.ts`, so everything from its signature to end of
 * file IS its body — no matching-brace parser needed, and no risk of accidentally reading into a
 * sibling function's body instead.
 */
function readRunServeCommandBody(source: string): string {
  const start = source.indexOf(RUN_SERVE_COMMAND_SIGNATURE);
  assert.notEqual(
    start,
    -1,
    `could not find "${RUN_SERVE_COMMAND_SIGNATURE}" in serve.ts -- has runServeCommand been renamed, ` +
      "moved, or had its export changed? Update RUN_SERVE_COMMAND_SIGNATURE above if so."
  );
  return source.slice(start);
}

test("runServeCommand's body actually CALLS pinServedSiteDirIntoEnv(target), not just imports/defines it", () => {
  const source = fs.readFileSync(SERVE_TS_PATH, "utf8");
  const body = readRunServeCommandBody(source);

  const callLine = body.split("\n").find((line) => line.includes(PIN_CALL));
  assert.ok(
    callLine,
    `runServeCommand no longer contains the literal call "${PIN_CALL}". Deleting or renaming that ` +
      "call site silently reintroduces the TOVU_SITE_DIR split-brain between this process and the " +
      "agent daemon it spawns (chat.db, the ops journal, skills/agent-plugin roots, and the chat-" +
      "attachment staging directory all diverge again) -- see serve.ts's own header on " +
      "pinServedSiteDirIntoEnv for the full incident. serve-site-dir-pin.unit.test.ts alone cannot " +
      "catch this: it calls the primitive directly and never goes through runServeCommand."
  );
  assert.doesNotMatch(
    callLine!.trim(),
    /^\/\//,
    `found "${PIN_CALL}" in runServeCommand's body, but the line is commented out -- it must ` +
      "actually execute, not merely be present as text."
  );
});

test("sanity: the exact call-site text is not also the primitive's own declaration line (a regex that matched both would prove nothing)", () => {
  const source = fs.readFileSync(SERVE_TS_PATH, "utf8");
  const occurrences = source.split(PIN_CALL).length - 1;
  assert.equal(
    occurrences,
    1,
    `expected "${PIN_CALL}" to appear exactly once in serve.ts (the call site); found ${occurrences}. ` +
      "The primitive's own declaration is `export function pinServedSiteDirIntoEnv(target: string, ...)` " +
      "-- note the `: string` after `target`, which is why it does not also match this literal string."
  );
});

/**
 * LAN-bind plan (2026-09-23), Slice 1: same "correct primitive, unwired call site" gap as
 * `pinServedSiteDirIntoEnv` above, for `resolveBindHost`/`app.listen(port, host)`. The banned
 * `serve-command*.integration.test.ts` family is the only suite that would exercise a real bound
 * listener's actual interface, so a source-text check is the only net available here too.
 */
test("runServeCommand's body resolves --host/TOVU_HOST via resolveBindHost(input.host ?? process.env.TOVU_HOST, DEFAULT_LOCAL_BIND_HOST)", () => {
  const source = fs.readFileSync(SERVE_TS_PATH, "utf8");
  const body = readRunServeCommandBody(source);
  assert.ok(
    body.includes("resolveBindHost(input.host ?? process.env.TOVU_HOST, DEFAULT_LOCAL_BIND_HOST)"),
    "runServeCommand no longer resolves --host/TOVU_HOST with " +
      "resolveBindHost(input.host ?? process.env.TOVU_HOST, DEFAULT_LOCAL_BIND_HOST) -- deleting or rewording " +
      "that call silently reintroduces the all-interfaces default for tovu serve, or drops --host's precedence " +
      "over TOVU_HOST (see ADS-memory/.local-artifacts/lan-bind-plan-2026-09-23.md)."
  );
});

test("runServeCommand's body passes the resolved host into app.listen(port, host)", () => {
  const source = fs.readFileSync(SERVE_TS_PATH, "utf8");
  const body = readRunServeCommandBody(source);
  assert.ok(
    body.includes("app.listen(port, host)"),
    "runServeCommand no longer calls app.listen(port, host) -- a bare app.listen(port) silently reverts " +
      "to Node's own all-interfaces default, undoing the loopback default."
  );
});

test("program.ts registers --host and threads it into runServeCommand's input", () => {
  const programSource = fs.readFileSync(path.resolve(import.meta.dirname, "../../program.ts"), "utf8");
  assert.ok(
    programSource.includes('.option("--host <ip>"'),
    'program.ts no longer registers a --host <ip> option on the serve command -- an operator has no CLI flag ' +
      'to widen or narrow the bind host without exporting TOVU_HOST (see ADS-memory/.local-artifacts/lan-bind-plan-2026-09-23.md).'
  );
  assert.ok(
    programSource.includes("host: options.host"),
    "program.ts's serve action no longer threads options.host into runServeCommand's input -- the --host flag " +
      "would be parsed but silently ignored."
  );
});

test("the BR-07 shutdown uses the shared bounded store close with the composition and boot work", () => {
  const body = readRunServeCommandBody(fs.readFileSync(SERVE_TS_PATH, "utf8"));
  assert.ok(body.includes("closeStoreOnShutdown({"));
  assert.ok(body.includes("close: () => closeSiteDirBoot(bootResult, owned.composedStore)"), "the shared close must close the composition and the CLI's borrowed content handle");
  assert.ok(body.includes("bootWork: () => owned.bootWork"), "boot work must settle before the store closes");
  assert.ok(body.includes("stopServing: () => stopServingWithinGrace({ server,"));
  assert.ok(body.includes("onShutdown: shutdownAssistantDaemon"));
});

test("runServeCommand pins the site before boot, forwards the resolved bind host, and awaits storage closure before exiting", async (t) => {
  const { EventEmitter } = await import("node:events");
  const envBefore = { ...process.env };
  const signals = new Map<string, () => void>();
  const listens: unknown[][] = [];
  const composedStore = { fixture: "composed" };
  let closeStarted = false;
  let releaseClose: () => void = () => {};
  let closed: Promise<void>;
  let exitCode: number | undefined;
  const stopped: string[] = [];
  const bootResult = { config: { port: 3456 }, workspaceId: "wiring-workspace", storage: { kind: "sqlite" }, db: {} };
  const deps: { workspaceId: string; legacyPublishCredentialsReady?: Promise<void>; identityReady?: Promise<unknown> } = { workspaceId: bootResult.workspaceId };
  // Per-scenario switches for the steps around the listener (see the scenarios below).
  let daemonWanted = false;
  const daemonStarts: unknown[][] = [];
  let lifecycle: { ok: boolean; modules: unknown[] } = { ok: true, modules: [] };
  const criticalFailureLogs: unknown[] = [];
  let leaseReadyError: Error | undefined;
  let serverCloses = 0;
  // Boot work the composition starts and returns before it finishes: the detached legacy
  // publish-credential tail (on `deps`) and `createApp`'s BYOK pass (`createServingApp`'s `bootWork`).
  // The store close must wait for both, or they log "The database connection is not open".
  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve: () => void = () => {};
    return { promise: new Promise<void>((res) => (resolve = res)), resolve };
  }
  let legacyWork = deferred();
  let byokWork = deferred();
  const moduleStubs = new Map<string, Record<string, unknown>>();
  function module(relative: string, namedExports: Record<string, unknown>): void {
    moduleStubs.set(new URL(relative, import.meta.url).href, namedExports);
  }
  module("../../../platform/site-dir/boot-site-dir.ts", {
    bootSiteDir: async ({ dir }: { dir: string }) => {
      assert.equal(process.env.TOVU_SITE_DIR, dir, "site must be pinned before boot reads it");
      return bootResult;
    },
    closeSiteDirBoot: async (boot: unknown, store: unknown) => {
      assert.equal(boot, bootResult);
      assert.equal(store, composedStore);
      closeStarted = true;
      await closed;
    },
  });
  module("../../../server/runtime/composition/deps.ts", {
    createSiteRouteDeps: async (dbPath: string, options: { onStoreOpened(store: unknown): void; siteBinding: { dir: string } }) => {
      // The site's resolved placement (data.nosync on a sites-home site since 1cffdf3cf), not a fixed root file.
      assert.equal(dbPath, resolveSiteDatabasePaths({ dir: process.env.TOVU_SITE_DIR! }).contentDbPath);
      assert.equal(options.siteBinding.dir, process.env.TOVU_SITE_DIR);
      options.onStoreOpened(composedStore);
      return deps;
    },
  });
  module("../../../server/runtime/composition/serving-app.ts", {
    createServingApp: () => ({
      app: { listen: (...args: unknown[]) => {
        listens.push(args);
        const server = new EventEmitter() as InstanceType<typeof EventEmitter> & { close(done?: () => void): void };
        server.close = done => { serverCloses += 1; done?.(); };
        queueMicrotask(() => server.emit("listening"));
        return server;
      } },
      outboxDrainer: { stop: async () => { stopped.push("outbox"); } },
      trashSweeper: { stop: async () => { stopped.push("trash"); } },
      themeWatcher: { stop: async () => { stopped.push("themes"); } },
      formPullTrigger: { stop: async () => { stopped.push("form-pull"); } },
      webhookDeliveryWorker: { stop: async () => { stopped.push("webhooks"); } },
      bootWork: [byokWork.promise],
    }),
  });
  // The running lease (1cffdf3cf) releases on a real process exit, which this test mocks away; each
  // scenario would otherwise find the previous one still "Running in Web".
  module("../../../platform/site-dir/site-running.ts", { claimSiteRunning: () => ({ ready: () => { if (leaseReadyError) throw leaseReadyError; }, release: () => {} }) });
  module("../../../server/runtime/boot/plugin-sdk-resolver.ts", { registerPluginSdkResolver: () => {} });
  module("../../../server/runtime/boot/process-error-guards.ts", { installUnhandledRejectionGuard: () => {} });
  module("../../../server/runtime/boot/boot-readiness-gate.ts", { runProductionReadinessGateOrExit: async () => {} });
  module("../../../server/runtime/boot/site-key-boot-notice.ts", { warnIfNoSiteKeyAtBoot: () => {} });
  module("../../../features/webhooks/site-key-ensure.ts", { ensureSiteKeyForBoot: async () => {} });
  module("../../../server/runtime/boot/bootstrap.ts", { buildBootModules: () => [], logCriticalBootFailures: (result: unknown) => { criticalFailureLogs.push(result); } });
  module("../../../server/runtime/lifecycle/boot-lifecycle.ts", { runBootLifecycle: async () => lifecycle });
  module("../../../server/runtime/lifecycle/readiness-state.ts", { setReadinessSnapshot: () => {} });
  module("../../../server/runtime/lifecycle/agent-daemon-port.ts", { ensureAgentDaemonPortResolved: async () => {} });
  module("../../../server/runtime/boot/agent-daemon-wanted.ts", { agentDaemonWanted: async () => daemonWanted });
  module("../../../server/inbound/assistant/index.ts", { startAssistantDaemon: (...args: unknown[]) => { daemonStarts.push(args); }, shutdownAssistantDaemon: () => {} });
  module("../../../assistant/index.ts", { ensureAgentDaemonToken: () => {} });
  module("../../../server/inbound/admin-http/admin-dev-proxy.ts", { registerAdminDevProxyUpgrade: () => {} });
  // Preserve other exports used by transitive imports while observing only the command's dependencies.
  const originals = await Promise.all([...moduleStubs.keys()].map(url => import(url)));
  let index = 0;
  for (const [url, stub] of moduleStubs) t.mock.module(url, { namedExports: { ...originals[index++], ...stub } });
  const once = process.once.bind(process);
  t.mock.method(process, "once", ((event: string, listener: () => void) => {
    if (event === "SIGINT" || event === "SIGTERM") { signals.set(event, listener); return process; }
    return once(event, listener);
  }) as typeof process.once);
  t.mock.method(process, "exit", ((code: number) => { exitCode = code; }) as typeof process.exit);
  const logged: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const stderr: string[] = [];
  const writeStderr = process.stderr.write.bind(process.stderr);
  t.mock.method(process.stderr, "write", ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stderr.push(String(chunk));
    return (writeStderr as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write);
  const readinessFailure = new Error("identity seeding failed");
  const { runServeCommand } = await import("../../commands/serve.js");
  try {
    for (const scenario of [
      { env: undefined, host: undefined, expected: "127.0.0.1", daemonWanted: true },
      { env: "0.0.0.0", host: undefined, expected: "0.0.0.0", identityFails: true },
      { env: "0.0.0.0", host: "127.0.0.1", expected: "127.0.0.1" },
      // `::` is Node's own all-interfaces default: the listener gets no host argument at all.
      { env: "::", host: undefined, expected: undefined, emitBootToken: true },
    ]) {
      daemonWanted = scenario.daemonWanted === true;
      daemonStarts.length = 0;
      errors.length = 0;
      logged.length = 0;
      stderr.length = 0;
      if (scenario.identityFails === true) {
        const failing = Promise.reject(readinessFailure);
        failing.catch(() => {});
        deps.identityReady = failing;
      } else delete deps.identityReady;
      if (scenario.env === undefined) delete process.env.TOVU_HOST;
      else process.env.TOVU_HOST = scenario.env;
      const target = path.resolve("/tmp/tovu-serve-wiring-fixture");
      closed = new Promise<void>(resolve => { releaseClose = resolve; });
      closeStarted = false;
      exitCode = undefined;
      stopped.length = 0;
      legacyWork = deferred();
      byokWork = deferred();
      deps.legacyPublishCredentialsReady = legacyWork.promise;
      await runServeCommand({ dir: target, port: "4567", host: scenario.host, emitBootToken: scenario.emitBootToken });
      assert.deepEqual(listens.at(-1), scenario.expected === undefined ? [4567] : [4567, scenario.expected]);
      await new Promise(resolve => setImmediate(resolve));
      const startup = `tovu serve: dir=${target} port=4567 schemaVersion=`;
      const startupIndex = logged.findIndex(line => line.startsWith(startup));
      assert.ok(startupIndex >= 0, "the documented startup line is printed once the listener is bound");
      const tokenIndex = logged.findIndex(line => /^tovu serve: bootToken=\S+$/.test(line));
      if (scenario.emitBootToken === true) assert.equal(tokenIndex, startupIndex - 1, "the boot token is printed on its own line just before the startup line");
      else assert.equal(tokenIndex, -1, "no boot token is printed unless asked for");
      const widened = stderr.filter(line => line.includes("this site is reachable from other machines"));
      if (scenario.expected === "127.0.0.1") assert.deepEqual(widened, []);
      else assert.deepEqual(widened, [`tovu serve: warning: listening on ${scenario.expected ?? "all interfaces"}; this site is reachable from other machines on your network (--host/TOVU_HOST)\n`]);
      if (scenario.daemonWanted === true) {
        assert.deepEqual(daemonStarts, [[{ workspaceId: "wiring-workspace", siteDir: target, pgSocketPath: undefined }, { registerProcessSignalHandlers: false }]]);
      } else assert.deepEqual(daemonStarts, []);
      if (scenario.identityFails === true) {
        // Server log capture (installed by the command) formats console.error's arguments into one line.
        assert.equal(errors.length, 1);
        assert.match(String(errors[0]![0]), /^\[cli\/serve\] a boot-readiness promise rejected — not starting the agent daemon Error: identity seeding failed\n/);
      }
      assert.equal(process.env.TOVU_SITE_DIR, target);
      assert.ok(signals.has("SIGTERM"));
      assert.ok(signals.has("SIGINT"));
      signals.get(scenario.host ? "SIGINT" : "SIGTERM")!();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(stopped, ["outbox", "trash", "themes", "form-pull", "webhooks"], "shutdown must stop all workers before closing storage");
      assert.equal(closeStarted, false, "the store close must wait for the boot work still running");
      legacyWork.resolve();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(closeStarted, false, "the BYOK tool-registration pass is still running");
      byokWork.resolve();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(closeStarted, true);
      assert.equal(exitCode, undefined, "storage close is still pending; exit must wait");
      releaseClose();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(exitCode, 0);
      assert.deepEqual(stopped, ["outbox", "trash", "themes", "form-pull", "webhooks"], "each worker stops exactly once");
    }

    // Refusals after the boot: nothing keeps serving, and what the boot opened is closed again.
    const refusalTarget = path.resolve("/tmp/tovu-serve-wiring-fixture");
    delete process.env.TOVU_HOST;
    delete deps.identityReady;
    closed = Promise.resolve();
    legacyWork = deferred();
    legacyWork.resolve();
    deps.legacyPublishCredentialsReady = legacyWork.promise;
    byokWork = deferred();
    byokWork.resolve();

    // A critical boot module failing refuses to serve: failures logged, no listener, store closed.
    lifecycle = { ok: false, modules: [{ name: "settings", status: "failed" }] };
    const listensBeforeRefusal = listens.length;
    closeStarted = false;
    stopped.length = 0;
    await assert.rejects(runServeCommand({ dir: refusalTarget, port: "4567" }), (error: unknown) => {
      assert.equal((error as Error).message, "Refusing to boot — a critical module failed. See failures above.");
      return true;
    });
    assert.deepEqual(criticalFailureLogs, [lifecycle]);
    assert.equal(listens.length, listensBeforeRefusal, "a refused boot never listens");
    assert.deepEqual(stopped, [], "no worker was started yet");
    assert.equal(closeStarted, true);
    lifecycle = { ok: true, modules: [] };

    // The running-site record failing to take the bound port closes the listener and the workers.
    leaseReadyError = new Error("site registry unwritable");
    const closesBefore = serverCloses;
    closeStarted = false;
    stopped.length = 0;
    await assert.rejects(runServeCommand({ dir: refusalTarget, port: "4567" }), (error: unknown) => error === leaseReadyError);
    assert.equal(serverCloses, closesBefore + 1, "the just-bound listener is closed again");
    assert.deepEqual(stopped, ["outbox", "trash", "themes", "form-pull", "webhooks"]);
    assert.equal(closeStarted, true);
    leaseReadyError = undefined;
  } finally {
    releaseClose();
    for (const key of Object.keys(process.env)) if (!(key in envBefore)) delete process.env[key];
    Object.assign(process.env, envBefore);
  }
});
