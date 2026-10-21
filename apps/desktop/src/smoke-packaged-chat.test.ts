import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildServeEnv } from "./tovu-server.ts";
import { assertPackagedChatEvidence, buildPackagedChatServerPlan, PackagedChatSmokeError,
  assertPackagedSiteGuideResult, readPackagedChatModel, runPackagedChatSmoke, selectPackagedChatModel,
  signalPackagedChatGroup, PACKAGED_CHAT_PROMPT } from "./smoke-packaged-chat.ts";
import type { PackagedChatEvidence, PackagedChatSmokePorts } from "./smoke-packaged-chat.ts";

const init = { kind: "raw", line: JSON.stringify({ type: "system", subtype: "init",
  mcp_servers: [{ name: "jini", status: "connected" }] }) };
const tool = { kind: "tool_use", id: "gateway-call", name: "mcp__jini__execute_readonly_delegated_tool",
  input: { toolId: "site_guide", input: { operation: "overview" } } };
const result = { kind: "tool_result", toolUseId: "gateway-call", isError: false, content: "overview" };
const preflight = "[agent-daemon] jini bridge preflight ok (42ms)\n";

function evidence(events: unknown[] = [init, tool, result]): PackagedChatEvidence {
  return { run_id: "smoke-run", run_status: "succeeded", content: "DONE", attempt_base_json: "[]",
    events_json: JSON.stringify(events) };
}

test("inventory poll waits for Claude discovery and uses the existing model selection policy", async () => {
  for (const agents of [[], [{ id: "other" }], [{ id: "claude", discoveryPending: true, models: [{ id: "haiku" }] }]]) {
    assert.equal(await readPackagedChatModel({ response: Response.json({ agents }) }), undefined);
  }
  assert.equal(await readPackagedChatModel({ response: Response.json({ agents: [{ id: "claude", models: [{ id: "haiku" }] }] }) }), "haiku");
  assert.equal(await readPackagedChatModel({ response: Response.json({ agents: [{ id: "claude", models: [{ id: "claude-haiku-4-5" }] }] }) }), "claude-haiku-4-5");
  for (const claude of [{ id: "claude", available: false }, { id: "claude", authStatus: "missing" },
    { id: "claude", models: [{ id: "opus" }] }]) {
    await assert.rejects(readPackagedChatModel({ response: Response.json({ agents: [claude] }) }), PackagedChatSmokeError);
  }
  await assert.rejects(readPackagedChatModel({ response: new Response("not JSON") }), SyntaxError);
});

test("inventory poll cancels failed bodies, retries only 503 and preserves cancellation failures", async () => {
  for (const status of [503, 401, 500]) {
    let canceled = false;
    const response = new Response(new ReadableStream({ cancel() { canceled = true; } }), { status });
    if (status === 503) assert.equal(await readPackagedChatModel({ response }), undefined);
    else await assert.rejects(readPackagedChatModel({ response }), {
      message: "Packaged agent inventory is unavailable.",
    });
    assert.equal(canceled, true);
  }
  assert.equal(await readPackagedChatModel({ response: new Response(null, { status: 503 }) }), undefined);
  const failure = new Error("cancel failed");
  const response = new Response(new ReadableStream({ cancel() { throw failure; } }), { status: 503 });
  await assert.rejects(readPackagedChatModel({ response }), error => error === failure);
});

test("packaged chat signals the entire group and preserves the gate's tolerated signal errors", () => {
  const sent: unknown[] = [];
  const kill: typeof process.kill = (pid, signal) => { sent.push([pid, signal]); return true; };
  signalPackagedChatGroup({ pid: 123, signal: "SIGTERM", kill });
  signalPackagedChatGroup({ pid: 123, signal: "SIGKILL", kill });
  assert.deepEqual(sent, [[-123, "SIGTERM"], [-123, "SIGKILL"]]);
  for (const code of ["ESRCH", "EPERM"]) {
    assert.doesNotThrow(() => signalPackagedChatGroup({ pid: 123, signal: "SIGTERM",
      kill() { throw Object.assign(new Error(code), { code }); } }));
  }
  for (const code of ["EACCES", undefined]) {
    const failure = Object.assign(new Error("signal failed"), { code });
    assert.throws(() => signalPackagedChatGroup({ pid: 123, signal: "SIGKILL", kill() { throw failure; } }), error => error === failure);
  }
});

test("site guide evidence requires the delegated call's first matching result to succeed", () => {
  assert.doesNotThrow(() => assertPackagedSiteGuideResult({ events: [
    { ...result, kind: "tool_use", isError: true }, { ...result, toolUseId: "other", isError: true }, result,
  ], delegated: tool }));
  assert.throws(() => assertPackagedSiteGuideResult({ events: [result], delegated: undefined }), {
    message: "The run did not call site_guide overview through the jini gateway.",
  });
  for (const events of [[], [{ ...result, toolUseId: "other" }], [{ ...result, isError: true }],
    [{ ...result, isError: undefined }], [{ ...result, isError: 0 }], [{ ...result, isError: true }, result]]) {
    assert.throws(() => assertPackagedSiteGuideResult({ events, delegated: tool }), {
      message: "The delegated site_guide call did not return a successful result.",
    });
  }
});

test("the spawn plan uses only the shipped binary, entry and assets and preserves shell env policy", () => {
  const baseEnv = { PATH: "/cli/bin", HOME: "/synthetic/home", PORT: "3600", TOVU_CONTENT_DB: "/foreign/db",
    TOVU_DB: "/foreign/other", TOVU_SITE_DIR: "/foreign/site", TOVU_AGENT_CWD: "/foreign/cwd",
    TOVU_HOST: "0.0.0.0", TOVU_PUBLIC_URL: "https://foreign.invalid", TOVU_PLUGINS_DIR: "/foreign/plugins",
    TOVU_AGENT_PLUGINS_DIR: "/foreign/agent-plugins", TOVU_SKILLS_DIR: "/foreign/skills",
    JINI_AGENT_DAEMON_URL: "http://localhost:4319", JINI_AGENT_DAEMON_PORT: "4319",
    NODE_OPTIONS: "--import dev-loader", NODE_PATH: "/checkout/node_modules", TOVU_ADMIN_DEV_PROXY_URL: "http://localhost:5173",
    TOVU_ADMIN_DIST: "/checkout/admin", TOVU_SITE_CHAT_DIST: "/checkout/chat", TOVU_REPO_ROOT: "/checkout" };
  const serveEnv = buildServeEnv({ repoRoot: "/shipped/tovu", siteDir: "/scratch/site", baseEnv }, { warn() {} });
  const before = { ...serveEnv };
  const plan = buildPackagedChatServerPlan({ executablePath: "/shipped/Tovu", nodeModulesDir: "/shipped/tovu/node_modules",
    siteDir: "/scratch/site", port: 43123, serveEnv });
  assert.equal(plan.command, "/shipped/Tovu");
  assert.deepEqual(plan.args, [path.join("/shipped/tovu", "dist/src/cli/main.js"), "serve", "/scratch/site", "--port", "43123", "--emit-boot-token"]);
  assert.equal(plan.payloadRoot, "/shipped/tovu");
  assert.equal(plan.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(plan.env.TOVU_SITE_DIR, "/scratch/site");
  assert.equal(plan.env.TOVU_AGENT_CWD, "/scratch/site");
  assert.equal(plan.env.TOVU_HOST, "127.0.0.1");
  assert.equal(plan.env.TOVU_REPO_ROOT, "/shipped/tovu");
  assert.equal(plan.env.TOVU_ADMIN_DIST, path.join("/shipped/tovu", "apps/admin/dist"));
  assert.equal(plan.env.TOVU_SITE_CHAT_DIST, path.join("/shipped/tovu", "apps/site-chat/dist"));
  assert.equal(plan.env.PATH, "/cli/bin");
  assert.equal(plan.env.HOME, "/synthetic/home");
  for (const key of ["PORT", "TOVU_CONTENT_DB", "TOVU_DB", "TOVU_PUBLIC_URL", "TOVU_PLUGINS_DIR", "TOVU_SKILLS_DIR",
    "TOVU_AGENT_PLUGINS_DIR", "NODE_OPTIONS", "NODE_PATH", "TOVU_ADMIN_DEV_PROXY_URL",
    "JINI_AGENT_DAEMON_URL", "JINI_AGENT_DAEMON_PORT", "TOVU_AGENT_DAEMON_TOKEN"]) assert.equal(plan.env[key], undefined, key);
  assert.deepEqual(serveEnv, before);
});

test("the prompt is the release contract and Haiku comes from the actual picker", () => {
  assert.equal(PACKAGED_CHAT_PROMPT, 'Call the site_guide tool with operation "overview" and then reply with exactly DONE.');
  assert.equal(selectPackagedChatModel({ agents: [{ id: "claude", models: [{ id: "opus" }, { id: "haiku" }] }] }), "haiku");
  assert.equal(selectPackagedChatModel({ agents: [{ id: "claude", models: [{ id: "claude-haiku-4-5" }] }] }), "claude-haiku-4-5");
  for (const agents of [[], [{ id: "claude", available: false }], [{ id: "claude", authStatus: "missing" }],
    [{ id: "claude", discoveryPending: true }], [{ id: "claude", models: [{ id: "sonnet" }] }], [{ id: "claude" }]]) {
    assert.throws(() => selectPackagedChatModel({ agents }), PackagedChatSmokeError);
  }
});

test("durable first-attempt evidence uses the live projection beside its empty recovery baseline", () => {
  assert.doesNotThrow(() => assertPackagedChatEvidence({ row: evidence(), runId: "smoke-run", daemonLog: preflight }));
  const writeGateway = { ...tool, name: "mcp__jini__execute_delegated_tool" };
  assert.doesNotThrow(() => assertPackagedChatEvidence({ row: evidence([init, writeGateway, result]), runId: "smoke-run", daemonLog: preflight }));
  const row = evidence([tool, result]);
  row.attempt_base_json = JSON.stringify([{ ...init, line: ["not json", init.line + "\n"] }]);
  assert.doesNotThrow(() => assertPackagedChatEvidence({ row, runId: "smoke-run", daemonLog: preflight }));
});

const badEvents: [string, unknown[]][] = [
  ["missing init", [tool, result]],
  ["unrelated connected server", [{ ...init, line: JSON.stringify({ type: "system", subtype: "init", mcp_servers: [{ name: "other", status: "connected" }] }) }, tool, result]],
  ["failed jini", [{ ...init, line: JSON.stringify({ type: "system", subtype: "init", mcp_servers: [{ name: "jini", status: "failed" }] }) }, tool, result]],
  ["non-init connected claim", [{ ...init, line: JSON.stringify({ type: "result", mcp_servers: [{ name: "jini", status: "connected" }] }) }, tool, result]],
  ["unrelated tool mentioning site_guide", [init, { ...tool, name: "search_tools" }, result]],
  ["wrong delegated tool", [init, { ...tool, input: { toolId: "site_guider", input: { operation: "overview" } } }, result]],
  ["wrong operation", [init, { ...tool, input: { toolId: "site_guide", input: { operation: "edit" } } }, result]],
  ["no result", [init, tool]],
  ["error result", [init, tool, { ...result, isError: true }]],
  ["other call result", [init, tool, { ...result, toolUseId: "other-call" }]],
];
for (const [name, events] of badEvents) test(`rejects ${name}`, () => {
  assert.throws(() => assertPackagedChatEvidence({ row: evidence(events), runId: "smoke-run", daemonLog: preflight }), PackagedChatSmokeError);
});

test("rejects missing/wrong runs, failed status, malformed JSON, wrong reply and absent preflight", () => {
  for (const row of [null, { ...evidence(), run_id: "other-run" }, { ...evidence(), run_status: "failed" },
    { ...evidence(), content: "It worked: DONE" }, { ...evidence(), attempt_base_json: "{broken" },
    { ...evidence(), events_json: "{}" }, { ...evidence(), events_json: "[null]" }]) {
    assert.throws(() => assertPackagedChatEvidence({ row, runId: "smoke-run", daemonLog: preflight }), PackagedChatSmokeError);
  }
  for (const daemonLog of ["", "jini bridge preflight FAILED", "[agent-daemon] jini bridge preflight okay (42ms)",
    JSON.stringify({ seq: 3, level: "error", message: "[agent-daemon] jini bridge preflight FAILED (exit=1, signal=null): ERR_MODULE_NOT_FOUND" })]) {
    assert.throws(() => assertPackagedChatEvidence({ row: evidence(), runId: "smoke-run", daemonLog }), PackagedChatSmokeError);
  }
});

test("accepts the preflight line inside the packaged daemon's JSONL log", () => {
  const daemonLog = [
    JSON.stringify({ seq: 2, level: "info", source: "daemon", message: "[agent-daemon] listening on http://127.0.0.1:57391" }),
    JSON.stringify({ seq: 3, level: "info", source: "daemon", message: "[agent-daemon] jini bridge preflight ok (445ms)" }),
  ].join("\n");
  assert.doesNotThrow(() => assertPackagedChatEvidence({ row: evidence(), runId: "smoke-run", daemonLog }));
});

test("raw lines that are not strings or not JSON objects are skipped, and never count as the init frame", () => {
  const noise = { kind: "raw", line: [42, "null", "[1,2]", init.line] };
  assert.doesNotThrow(() => assertPackagedChatEvidence({ row: evidence([noise, tool, result]), runId: "smoke-run", daemonLog: preflight }));
  // An init-shaped OBJECT smuggled in as a non-string line is not a CLI frame and proves nothing.
  const objectLine = { kind: "raw", line: [JSON.parse(init.line) as unknown] };
  assert.throws(() => assertPackagedChatEvidence({ row: evidence([objectLine, tool, result]), runId: "smoke-run", daemonLog: preflight }),
    /did not report jini connected/);
});

test("daemon.log JSON lines without a string message are matched as raw text, not dropped", () => {
  const daemonLog = ["42", JSON.stringify({ seq: 1, message: 7 }), "null", preflight.trim()].join("\n");
  assert.doesNotThrow(() => assertPackagedChatEvidence({ row: evidence(), runId: "smoke-run", daemonLog }));
  // A JSONL entry whose message is not a string is kept as its raw line, so a preflight claim inside
  // some other field still has to match end-anchored and does not.
  const misplaced = JSON.stringify({ seq: 1, message: 7, note: "[agent-daemon] jini bridge preflight ok (5ms)" });
  assert.throws(() => assertPackagedChatEvidence({ row: evidence(), runId: "smoke-run", daemonLog: misplaced }), /no successful jini bridge preflight/);
});

function fakePorts(failures: string[] = []): { ports: PackagedChatSmokePorts; calls: string[] } {
  const calls: string[] = [];
  async function step(name: string): Promise<void> {
    calls.push(name);
    if (failures.includes(name)) throw new Error(name);
  }
  return { calls, ports: {
    async acquireLock() { await step("lock"); return () => step("unlock"); },
    async createSite() { await step("site"); return "/scratch/site"; },
    async start(siteDir) { assert.equal(siteDir, "/scratch/site"); await step("start"); return { stop: () => step("stop") }; },
    async chat() { await step("chat"); return "smoke-run"; },
    async evidence(siteDir, runId) {
      assert.equal(siteDir, "/scratch/site"); assert.equal(runId, "smoke-run");
      await step("evidence"); return { row: evidence(), daemonLog: preflight };
    },
    async removeSite(siteDir) { assert.equal(siteDir, "/scratch/site"); await step("remove"); },
  } };
}

test("DI journey holds the lock through server and site teardown", async () => {
  const { ports, calls } = fakePorts();
  await runPackagedChatSmoke({ ports });
  assert.deepEqual(calls, ["lock", "site", "start", "chat", "evidence", "stop", "remove", "unlock"]);
});

for (const failed of ["lock", "site", "start", "chat", "evidence", "stop", "remove", "unlock"]) {
  test(`DI failure at ${failed} cleans every acquired resource and fails the gate`, async () => {
    const { ports, calls } = fakePorts([failed]);
    await assert.rejects(runPackagedChatSmoke({ ports }));
    const stages = ["lock", "site", "start", "chat", "evidence"];
    const at = stages.indexOf(failed);
    const expected = at >= 0 ? stages.slice(0, at + 1) : [...stages];
    if (at < 0 || at > 2) expected.push("stop");
    if (at < 0 || at > 1) expected.push("remove");
    if (failed !== "lock") expected.push("unlock");
    assert.deepEqual(calls, expected);
  });
}

test("DI assertion failure still stops the server, removes the site and unlocks", async () => {
  const { ports, calls } = fakePorts();
  ports.evidence = async () => ({ row: evidence([init]), daemonLog: preflight });
  await assert.rejects(runPackagedChatSmoke({ ports }), AggregateError);
  assert.deepEqual(calls.slice(-3), ["stop", "remove", "unlock"]);
});

test("simultaneous teardown failures are all retained and never skip unlock", async () => {
  const { ports, calls } = fakePorts(["chat", "stop", "remove", "unlock"]);
  await assert.rejects(runPackagedChatSmoke({ ports }), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors.map((item: Error) => item.message), ["chat", "stop", "remove", "unlock"]);
    return true;
  });
  assert.deepEqual(calls.slice(-3), ["stop", "remove", "unlock"]);
});
