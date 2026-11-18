import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createToolRegistry, ToolInputError } from "@jini-ai/core";
import { MASKED_IDENTIFIER_ROWS } from "@jini-ai/core/text/masked-identifier-rows";
import { buildMcpJsonServerEntry, createInMemoryEventLog, createRunLifecycle, type ToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, toolCatalogDescribeRoute, type DelegatedToolsHttpDeps } from "@jini-ai/daemon/http";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import { serve } from "@jini-ai/mcp/bin";
import { createAssistantToolExecutor, delegatedToolErrorDisclosure } from "#src/assistant/tool-recovery-preset";
import { daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/** Row 2 of S6's table: a handler's own message that names the tool's declared inputs. */
const ROW_2 = MASKED_IDENTIFIER_ROWS.find(({ row }) => row === 2)?.text ?? "";
/** A vendor-shaped credential in the same message; the host's secret redaction blanks it. */
const VENDOR_KEY = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const MESSAGE = `${ROW_2}; key ${VENDOR_KEY}`;
const SCHEMA = { type: "object", properties: { viewport: { type: "string" }, fullPage: { type: "boolean" }, dismissCookieBanners: { type: "boolean" } } };
/** Described to the model at startup, so the MCP host holds its descriptor. */
const TYPED_ID = "shot_page";
/** Never described to this run: only the gateway reaches it, so only the route's envelope can name its inputs. */
const GATEWAY_ID = "shot_page_unlisted";
const TOKEN = "run-token";

function stdioPair() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const buffer = new ReadBuffer();
  const transport: Transport = {
    start: async () => {
      stdout.on("data", (chunk: Buffer) => {
        buffer.append(chunk);
        let message;
        while ((message = buffer.readMessage()) !== null) transport.onmessage?.(message);
      });
    },
    send: async (message) => { stdin.write(serializeMessage(message)); },
    close: async () => { stdin.end(); transport.onclose?.(); },
  };
  return { stdin, stdout, transport };
}

/** The host's own route deps expression (its real error disclosure and executor ports) on the real daemon route and the
 * real MCP host; only the HTTP framing is a loopback `fetch` that calls the route specs directly. */
function hostFixture() {
  const registry = createToolRegistry({});
  for (const id of [TYPED_ID, GATEWAY_ID]) {
    registry.register({
      descriptor: { id, readOnly: true, inputSchema: SCHEMA },
      policy: { authorize: () => "allow" },
      handler: async () => { throw new ToolInputError({ message: MESSAGE }); },
    });
  }
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 100, maxLifetimeMs: 1_000 });
  const toolExecutor: ToolExecutor = createAssistantToolExecutor({ registry, surfaceExchanges });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const deps = evaluateDaemonExpression<DelegatedToolsHttpDeps>(daemonInitializer("delegatedToolRouteDeps"), {
    lifecycle, toolExecutor, delegatedToolErrorDisclosure, publishJobRecoveryMessage: () => "",
    resolvePrincipal: () => ({ id: "editor" }),
    siteTools: { registry },
  });
  const posted: unknown[] = [];
  const fetchImpl: typeof fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (new Headers(init.headers).get("authorization") !== `Bearer ${TOKEN}`) return Response.json({ error: { code: "UNAUTHORIZED", message: "run ended" } }, { status: 401 });
    if (init.method === "GET") {
      const id = decodeURIComponent(path.slice("/api/tools/".length));
      const found = registry.list({}).find(tool => tool.id === id);
      const result = await toolCatalogDescribeRoute.handle({ input: { id }, deps: { catalog: { search: () => [],
        describe: () => (found ? { ...found, description: found.description ?? "", source: "test" } : null) } } });
      return result.ok ? Response.json(result.value) : Response.json({ error: result.error }, { status: 404 });
    }
    const body: Record<string, unknown> = JSON.parse(String(init.body));
    posted.push(body);
    const parsed = delegatedToolExecuteRoute.parse({ body, params: {}, query: {} });
    assert.ok(parsed.ok);
    const result = await delegatedToolExecuteRoute.handle({ input: parsed.value, deps });
    return result.ok ? Response.json(result.value) : Response.json({ error: result.error }, { status: result.error?.code === "BAD_REQUEST" ? 400 : 500 });
  };
  return { registry, lifecycle, fetchImpl, posted };
}

async function launch({ t, host }: { t: TestContext; host: ReturnType<typeof hostFixture> }) {
  const { run } = await host.lifecycle.start({ contextRef: "editor" });
  const entry = buildMcpJsonServerEntry({ runId: run.id, options: { command: "jini-mcp", daemonUrl: "http://127.0.0.1:4419",
    startupToolIds: () => [TYPED_ID], diagnosticToolIds: () => [TYPED_ID, GATEWAY_ID] } }, { credential: TOKEN });
  const pair = stdioPair();
  const client = new Client({ name: "tovu-host-test", version: "1" });
  const errors: string[] = [];
  const serving = serve({}, { env: entry.env, fetchImpl: host.fetchImpl, stdin: pair.stdin, stdout: pair.stdout,
    writeErr: ({ text }) => errors.push(text), exit: ({ code }) => { throw new Error(`bridge exited ${code}: ${errors.join("")}`); } });
  t.after(async () => { await client.close(); pair.stdin.end(); await serving; pair.stdout.destroy(); });
  await Promise.race([client.connect(pair.transport), serving.then(() => { throw new Error("bridge stopped before handshake"); })]);
  const { tools } = await client.listTools();
  return { client, tools };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text?: string }[]).map(part => part.text ?? "").join("\n");
}

function assertNamesKeptAndKeyBlanked(text: string) {
  assert.ok(text.includes("dismissCookieBanners"), `the input name is kept: ${text}`);
  assert.ok(text.includes("fullPage (optional)"), text);
  assert.equal(text.includes(VENDOR_KEY), false, text);
  assert.ok(text.includes("[redacted]"), text);
}

test("a typed call: the failing tool's declared input names reach the model and a vendor key is blanked", { timeout: 10_000 }, async t => {
  const host = hostFixture();
  const bridge = await launch({ t, host });
  const tool = bridge.tools.find(candidate => candidate.annotations?.title === TYPED_ID);
  assert.ok(tool, "the typed tool is published at startup");
  const result = await bridge.client.callTool({ name: tool.name, arguments: {} });
  assert.equal(result.isError, true);
  assertNamesKeptAndKeyBlanked(textOf(result));
});

test("a gateway call for a tool this run never described: the route's envelope names the inputs", { timeout: 10_000 }, async t => {
  const host = hostFixture();
  const bridge = await launch({ t, host });
  const result = await bridge.client.callTool({ name: "execute_delegated_tool", arguments: { toolId: GATEWAY_ID, input: {} } });
  assert.equal(result.isError, true);
  assert.equal(host.posted.length, 1);
  assertNamesKeptAndKeyBlanked(textOf(result));
});
