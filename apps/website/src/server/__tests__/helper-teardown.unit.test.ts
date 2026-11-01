import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Server } from "node:http";
import ts from "typescript";
import { startStubProviderServer } from "./helpers/stub-provider-server.js";

for (const fault of ["work", "remove", "login", "init", "boot", "compose", "configure", "readiness", "none"]) {
  test(`site helper closes server and DB and restores fixtures after ${fault === "none" ? "successful boot" : `${fault} failure`}`, async () => {
    // The child is expected to fail on the injected error; its cleanup must still complete.
    const env: NodeJS.ProcessEnv = { ...process.env, TEARDOWN_FAULT: fault };
    delete env.NODE_TEST_CONTEXT;
    const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=120000",
      fileURLToPath(new URL("./helper-teardown.fixture.ts", import.meta.url))], {
      env, timeout: 15_000,
    }).then(output => ({ ...output, code: 0 }), error => ({ stdout: error.stdout as string, stderr: error.stderr as string, code: error.code }));
    assert.equal(result.code, fault === "none" ? 0 : 1, result.stderr);
    const early = ["init", "boot", "compose", "configure", "readiness"].includes(fault);
    const markers = ["parent removed", "socket removed", "socket env: original"];
    if (!["init", "boot"].includes(fault)) markers.push("database closed");
    if (!early) markers.push("server closed");
    for (const marker of markers) {
      assert.ok(result.stdout.includes(marker), `missing ${marker}: ${result.stdout}`);
    }
    if (!early) assert.ok(result.stdout.indexOf("server closed") < result.stdout.indexOf("database closed"), "HTTP must close before a DB teardown error can skip its hook");
    if (fault === "work") {
      assert.match(result.stdout, /background boot failed/);
      assert.ok(result.stdout.includes("sibling work settled"), result.stdout);
      assert.ok(result.stdout.indexOf("sibling work settled") < result.stdout.indexOf("database closed"), result.stdout);
    }
    if (early) assert.match(result.stdout, new RegExp(`${fault} failed`));
    if (fault === "remove") assert.match(result.stdout, /fixture removal failed/);
    if (fault === "login") assert.match(result.stdout, /login failed after listening/);
  });
}

// Use the existing fixture's effect-injection seam to execute the actual declaration without
// loading the server composition. Assertions target resource state and promise completion.
function helper(name: string, relativeFile: string, bindings: Record<string, unknown>) {
  const source = ts.createSourceFile("helper.ts", readFileSync(new URL(relativeFile, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const code = ts.transpileModule(`return (${declaration.getText(source).replace(/^export /, "")});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings));
}

for (const failure of ["prepare", "kernel", "none"]) {
  test(`prepared content DB transfers ownership only after ${failure === "none" ? "successful preparation" : `${failure} failure`}`, async () => {
    let open = true;
    const db = { $client: { close: () => { open = false; } } };
    const error = new Error(`${failure} failed`);
    const openPrepared = helper("openPreparedContentDb", "../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.ts", {
      openContentDb: () => db,
      contentKernel: () => { if (failure === "kernel") throw error; return {}; },
      prepareContentStore: async () => { if (failure === "prepare") throw error; },
      closeSqliteConnection: (opened: typeof db) => opened.$client.close(),
    });
    if (failure === "none") assert.equal(await openPrepared("fixture.db"), db);
    else await assert.rejects(openPrepared("fixture.db"), caught => caught === error);
    assert.equal(open, failure === "none", "failed setup must relinquish its database");
  });
}

test("readiness rejection waits for every sibling before rethrowing the first listed error", async () => {
  const drain = helper("drainBootReadiness", "./helpers/unrun-site-boot.ts", {});
  const first = new Error("first readiness failed"), second = new Error("second readiness failed");
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let settled = false;
  // The second listed failure happens first in time. Error selection remains deterministic.
  const draining = drain({ identityReady: pending.then(() => { throw first; }), settingsReady: Promise.reject(second), pluginRuntimeReady: pending })
    .then(() => { settled = true; return undefined; }, (error: unknown) => { settled = true; return error; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, "rejected while another boot write was still pending");
  } finally { release(); }
  assert.equal(await draining, first);
});

test("provider stub binds exactly the loopback address advertised to callers", async t => {
  const listens: unknown[][] = [];
  t.mock.method(Server.prototype, "listen", function(this: Server, ...args: unknown[]) {
    listens.push(args);
    setImmediate(() => this.emit("listening"));
    return this;
  });
  t.mock.method(Server.prototype, "address", () => ({ address: "127.0.0.1", family: "IPv4", port: 43210 }));
  const baseUrl = await startStubProviderServer(t, () => ({ status: 200, body: "ok" }));
  assert.equal(baseUrl, "http://127.0.0.1:43210");
  assert.deepEqual(listens, [[0, "127.0.0.1"]]);
});
