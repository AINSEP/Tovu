import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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

test("the BR-07 shutdown awaits the bounded store close before process.exit(0)", () => {
  const body = readRunServeCommandBody(fs.readFileSync(SERVE_TS_PATH, "utf8"));
  const start = body.indexOf("const finish = async (): Promise<void> => {");
  assert.notEqual(start, -1, "the shutdown's finish is no longer an async function");
  const finish = body.slice(start);
  const close = finish.indexOf("await closeWithinBound(");
  const exit = finish.indexOf("process.exit(0)");
  assert.ok(close !== -1 && exit !== -1 && close < exit, "finish must await closeWithinBound(...) before process.exit(0), or PGlite's flush and lock release are cut short");
  assert.ok(finish.slice(close, exit).includes("closeSiteDirBoot(bootResult, owned.composedStore)"), "the bounded close must close the composition's store");
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
  const bootResult = { config: { port: 3456 }, workspaceId: "wiring-workspace", db: {} };
  const deps = { workspaceId: bootResult.workspaceId };
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
      assert.equal(dbPath, path.join(process.env.TOVU_SITE_DIR!, "content.db"));
      assert.equal(options.siteBinding.dir, process.env.TOVU_SITE_DIR);
      options.onStoreOpened(composedStore);
      return deps;
    },
  });
  module("../../../server/runtime/composition/serving-app.ts", {
    createServingApp: () => ({
      app: { listen: (...args: unknown[]) => {
        listens.push(args);
        const server = new EventEmitter() as InstanceType<typeof EventEmitter> & { close(done: () => void): void };
        server.close = done => done();
        queueMicrotask(() => server.emit("listening"));
        return server;
      } },
      outboxDrainer: { stop: async () => { stopped.push("outbox"); } },
      trashSweeper: { stop: async () => { stopped.push("trash"); } },
    }),
  });
  module("../../../server/runtime/boot/plugin-sdk-resolver.ts", { registerPluginSdkResolver: () => {} });
  module("../../../server/runtime/boot/process-error-guards.ts", { installUnhandledRejectionGuard: () => {} });
  module("../../../server/runtime/boot/boot-readiness-gate.ts", { runProductionReadinessGateOrExit: async () => {} });
  module("../../../server/runtime/boot/root-key-boot-notice.ts", { warnIfNoRootKeyAtBoot: () => {} });
  module("../../../features/webhooks/site-key-ensure.ts", { ensureSiteKeyForBoot: async () => {} });
  module("../../../server/runtime/boot/bootstrap.ts", { buildBootModules: () => [], logCriticalBootFailures: () => {} });
  module("../../../server/runtime/lifecycle/boot-lifecycle.ts", { runBootLifecycle: async () => ({ ok: true, modules: [] }) });
  module("../../../server/runtime/lifecycle/readiness-state.ts", { setReadinessSnapshot: () => {} });
  module("../../../server/runtime/lifecycle/agent-daemon-port.ts", { ensureAgentDaemonPortResolved: async () => {} });
  module("../../../server/runtime/boot/agent-daemon-wanted.ts", { agentDaemonWanted: async () => false });
  module("../../../server/inbound/assistant/index.ts", { startAssistantDaemon: () => {}, shutdownAssistantDaemon: () => {} });
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
  const { runServeCommand } = await import("../../commands/serve.js");
  try {
    for (const scenario of [
      { env: undefined, host: undefined, expected: "127.0.0.1" },
      { env: "0.0.0.0", host: undefined, expected: "0.0.0.0" },
      { env: "0.0.0.0", host: "127.0.0.1", expected: "127.0.0.1" },
    ]) {
      if (scenario.env === undefined) delete process.env.TOVU_HOST;
      else process.env.TOVU_HOST = scenario.env;
      const target = path.resolve("/tmp/tovu-serve-wiring-fixture");
      closed = new Promise<void>(resolve => { releaseClose = resolve; });
      closeStarted = false;
      exitCode = undefined;
      stopped.length = 0;
      await runServeCommand({ dir: target, port: "4567", host: scenario.host });
      assert.deepEqual(listens.at(-1), [4567, scenario.expected]);
      assert.equal(process.env.TOVU_SITE_DIR, target);
      assert.ok(signals.has("SIGTERM"));
      assert.ok(signals.has("SIGINT"));
      signals.get(scenario.host ? "SIGINT" : "SIGTERM")!();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(stopped, ["outbox", "trash"], "shutdown must stop both workers before closing storage");
      assert.equal(closeStarted, true);
      assert.equal(exitCode, undefined, "storage close is still pending; exit must wait");
      releaseClose();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(exitCode, 0);
      assert.deepEqual(stopped, ["outbox", "trash"], "each worker stops exactly once");
    }
  } finally {
    releaseClose();
    for (const key of Object.keys(process.env)) if (!(key in envBefore)) delete process.env[key];
    Object.assign(process.env, envBefore);
  }
});
