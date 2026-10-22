import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Run the real entrypoint functions with boot ports replaced; never import the
// self-starting module, arm its watchdog, open a database, or bind a socket.
function bootHarness(required: {
  memory: boolean;
  tls?: boolean;
  bindError?: Error;
  schema?: "allow" | "refuse";
}, _options: Record<string, never> = {}) {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const declarations = parsed.statements.filter(ts.isFunctionDeclaration).map((node) => node.getFullText(parsed));
  const calls: string[] = [];
  const env: Record<string, string> = {};
  const messages: string[] = [];
  const exits: number[] = [];
  const compositionReached = new Error("composition reached");
  const exit = new Error("process exited");
  const server = { on: () => { calls.push("error-listener"); } };
  let startingResponse: { status: number; headers: unknown; body: string } | undefined;
  const createServer = (handler: (request: unknown, response: unknown) => void) => {
    handler({}, {
      writeHead: (status: number, headers: unknown) => { startingResponse = { status, headers, body: "" }; },
      end: (body: string) => { assert.ok(startingResponse); startingResponse.body = body; },
    });
    return server;
  };
  const context = {
    useMemory: required.memory,
    devTls: { active: required.tls === true, credentials: required.tls ? { cert: "certificate" } : undefined },
    port: 4321, bindHost: "localhost", autoStartPort: true,
    process: { env, exit: (code: number) => { exits.push(code); throw exit; } },
    console: { error: (message: string) => { messages.push(message); } },
    installUnhandledRejectionGuard: () => { calls.push("rejections"); },
    pinDefaultSiteRoot: () => { calls.push("pin-root"); },
    installServerLogCapture: () => { calls.push("capture"); },
    siteDir: () => "/site",
    serverLogFilePaths: () => ({ server: "/site/server.log", daemon: "/site/daemon.log" }),
    attachServerLogFile: (input: { filePath: string }, options: { alsoRead: string[] }) => {
      assert.equal(input.filePath, "/site/server.log");
      assert.deepEqual(Array.from(options.alsoRead), ["/site/daemon.log"]);
      calls.push("attach-logs");
    },
    ensureAgentDaemonToken: () => { calls.push("token"); },
    registerPluginSdkResolver: () => { calls.push("sdk"); },
    runProductionReadinessGateOrExit: async () => { calls.push("production-gate"); },
    warnIfNoSiteKeyAtBoot: () => { calls.push("key-notice"); },
    claimSiteRunning: (input: { dir: string; app: string; scheme: string }) => {
      assert.equal(input.dir, "/site");
      assert.equal(input.app, "Web");
      assert.equal(input.scheme, required.tls ? "https" : "http");
      calls.push("claim");
      return { ready: (input: { port: number }) => { assert.equal(input.port, 4322); calls.push("ready"); } };
    },
    reportSitesSyncWarning: () => { calls.push("sync-warning"); },
    defaultContentDbPath: () => "/site/content.db",
    checkContentDbSchema: async (path: string) => {
      assert.equal(path, "/site/content.db");
      calls.push("schema");
      return { status: required.schema ?? "allow", message: "schema refused" };
    },
    findSiteKeyDependentData: () => {},
    ensureSiteKeyForBoot: async (input: { siteDir: string; findSiteKeyDependentData: unknown }) => {
      assert.equal(input.siteDir, "/site");
      assert.equal(input.findSiteKeyDependentData, context.findSiteKeyDependentData);
      calls.push("ensure-key");
    },
    createHttpServer: (handler: Parameters<typeof createServer>[0]) => { calls.push("http"); return createServer(handler); },
    createHttpsServer: (_credentials: unknown, handler: Parameters<typeof createServer>[0]) => { calls.push("https"); return createServer(handler); },
    reserveBootListener: async (input: { server: unknown; port: number; bindHost: string }, options: { autoStartPort: boolean }) => {
      assert.equal(input.server, server);
      assert.equal(input.port, 4321);
      assert.equal(input.bindHost, "localhost");
      assert.equal(options.autoStartPort, true);
      calls.push("reserve");
      if (required.bindError) throw required.bindError;
      return 4322;
    },
    pinSiteListenerOrigin: (input: { scheme: string; host: string; port: number }) => {
      assert.equal(input.scheme, required.tls ? "https" : "http");
      assert.equal(input.host, "localhost");
      assert.equal(input.port, 4322);
      calls.push("origin");
    },
    createRouteDeps: () => { throw compositionReached; },
    createSiteRouteDeps: () => { throw compositionReached; },
  };
  const compiled = ts.transpileModule(`${declarations.join("\n")}\nmain;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const main = runInNewContext(compiled, context) as () => Promise<void>;
  return { main, calls, env, messages, exits, compositionReached, exit, response: () => startingResponse };
}

for (const memory of [true, false]) {
  for (const tls of [false, true]) {
    test(`boot pins ${memory ? "memory" : "disk"} preparation and ${tls ? "HTTPS" : "HTTP"} listener order`, async () => {
      const boot = bootHarness({ memory, tls });
      await assert.rejects(boot.main(), (error) => error === boot.compositionReached);
      const preparation = memory
        ? ["rejections", "capture", "token", "sdk", "production-gate", "key-notice"]
        : ["rejections", "pin-root", "capture", "attach-logs", "token", "sdk", "production-gate", "claim", "sync-warning", "schema", "ensure-key", "key-notice"];
      assert.deepEqual(boot.calls, [...preparation, tls ? "https" : "http", "reserve", "origin", ...(memory ? [] : ["ready"]), "error-listener"]);
      assert.equal(boot.env.PORT, "4322");
      const response = boot.response();
      assert.ok(response);
      assert.equal(response.status, 503);
      assert.equal(JSON.stringify(response.headers), JSON.stringify({ "Retry-After": "1" }));
      assert.equal(response.body, "Server is starting");
    });
  }
}

test("disk schema refusal exits before key creation and listener reservation", async () => {
  const boot = bootHarness({ memory: false, schema: "refuse" });
  await assert.rejects(boot.main(), (error) => error === boot.exit);
  assert.deepEqual(boot.exits, [1]);
  assert.equal(boot.calls.at(-1), "schema");
  assert.match(boot.messages.join("\n"), /Refusing to boot against \/site\/content.db/);
});

for (const code of ["EADDRINUSE", "EACCES"]) {
  test(`boot ${code === "EADDRINUSE" ? "diagnoses port collision and exits" : "rethrows unexpected listener failure"}`, async () => {
    const error = Object.assign(new Error(code), { code });
    const boot = bootHarness({ memory: false, bindError: error });
    await assert.rejects(boot.main(), (caught) => caught === (code === "EADDRINUSE" ? boot.exit : error));
    assert.equal(boot.calls.at(-1), "reserve");
    assert.equal(boot.env.PORT, undefined);
    assert.deepEqual(boot.exits, code === "EADDRINUSE" ? [1] : []);
    if (code === "EADDRINUSE") assert.match(boot.messages[0], /Refusing to start: port 4321 is already in use/);
    else assert.deepEqual(boot.messages, []);
  });
}
