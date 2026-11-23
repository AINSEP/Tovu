import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// B240: the fatal boot paths in index.ts called `process.exit(1)` directly, so none of them could be
// observed without dying. They now take an injectable `exit`. This runs the real function bodies
// (never importing the self-starting entrypoint) with `process.exit` poisoned: if a path still reaches
// it, the test throws.
const WANTED = new Set(["exitProcess", "guardContentDbSchemaOrExit", "reserveSiteBootListener", "runBootModulesOrExit"]);

function loadBootFunctions() {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const declarations = parsed.statements
    .filter(ts.isFunctionDeclaration)
    .filter((node) => node.name !== undefined && WANTED.has(node.name.text))
    .map((node) => node.getFullText(parsed));
  const messages: string[] = [];
  const processExitCalls: number[] = [];
  const context = {
    process: { env: {}, exit: (code: number) => { processExitCalls.push(code); throw new Error("process.exit reached"); } },
    console: { error: (message: string) => { messages.push(message); } },
    useMemory: true, port: 4321, bindHost: "localhost", autoStartPort: true, devTls: { active: false },
    defaultContentDbPath: () => "/site/content.db",
    checkContentDbSchema: async () => ({ status: "refuse", message: "schema refused" }),
    reserveBootListener: async () => { throw Object.assign(new Error("in use"), { code: "EADDRINUSE" }); },
    pinSiteListenerOrigin: () => { throw new Error("must not pin after a failed bind"); },
    buildBootModules: () => [],
    runBootLifecycle: async () => ({ ok: false }),
    setReadinessSnapshot: () => {},
    logCriticalBootFailures: () => {},
  };
  const compiled = ts.transpileModule(
    `${declarations.join("\n")}\n({ guardContentDbSchemaOrExit, reserveSiteBootListener, runBootModulesOrExit });`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  const fns = runInNewContext(compiled, context) as {
    guardContentDbSchemaOrExit: (required: { dbPath: string }, optional?: { exit?: (code: number) => void }) => Promise<void>;
    reserveSiteBootListener: (required: { server: unknown; runningLease: undefined }, optional?: { exit?: (code: number) => void }) => Promise<void>;
    runBootModulesOrExit: (deps: unknown, optional?: { exit?: (code: number) => void }) => Promise<void>;
  };
  return { fns, messages, processExitCalls };
}

test("a refused content-db schema ends boot through the injected exit, not process.exit", async () => {
  const { fns, processExitCalls } = loadBootFunctions();
  const exits: number[] = [];
  await fns.guardContentDbSchemaOrExit({ dbPath: "/site/content.db" }, { exit: (code) => { exits.push(code); } });
  assert.deepEqual(exits, [1]);
  assert.deepEqual(processExitCalls, []);
});

test("a port collision ends boot through the injected exit and does not fall through to the rethrow", async () => {
  const { fns, processExitCalls, messages } = loadBootFunctions();
  const exits: number[] = [];
  await fns.reserveSiteBootListener({ server: {}, runningLease: undefined }, { exit: (code) => { exits.push(code); } });
  assert.deepEqual(exits, [1]);
  assert.deepEqual(processExitCalls, []);
  assert.match(messages[0], /Refusing to start: port 4321 is already in use/);
});

test("a failed critical boot module ends boot through the injected exit, not process.exit", async () => {
  const { fns, processExitCalls } = loadBootFunctions();
  const exits: number[] = [];
  await fns.runBootModulesOrExit({}, { exit: (code) => { exits.push(code); } });
  assert.deepEqual(exits, [1]);
  assert.deepEqual(processExitCalls, []);
});

test("without an injected exit the default still ends the process", async () => {
  const { fns, processExitCalls } = loadBootFunctions();
  await assert.rejects(fns.guardContentDbSchemaOrExit({ dbPath: "/site/content.db" }), /process\.exit reached/);
  assert.deepEqual(processExitCalls, [1]);
});
