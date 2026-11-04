import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, Serializable } from "node:child_process";
import { createDesktopAgentService } from "./desktop-agent-service.ts";

class DaemonChild extends EventEmitter {
  readonly pid: number;
  readonly stdout = new PassThrough(); readonly stderr = new PassThrough();
  connected = true;
  messages: Serializable[] = [];
  constructor(pid: number) { super(); this.pid = pid; }
  send(message: Serializable, callback: (error: Error | null) => void): boolean {
    this.messages.push(message);
    const request = message as { id: string; payload: { operation: string; scopeKey?: string } };
    queueMicrotask(() => this.emit("message", { jiniIpc: 1, kind: "reply", id: request.id, ok: true,
      payload: { url: `http://127.0.0.1:7700${request.payload.scopeKey ? `/s/${request.payload.scopeKey}` : ""}`, pid: this.pid } }));
    callback(null); return true;
  }
  kill() { this.connected = false; this.emit("exit", 0, null); return true; }
}

function harness() {
  const children: DaemonChild[] = []; const environments: NodeJS.ProcessEnv[] = [];
  const output = new PassThrough(); let text = "";
  output.on("data", chunk => { text += String(chunk); });
  const registry = { readLive: async () => {
    const child = children.at(-1);
    return child ? { pid: child.pid, url: "http://127.0.0.1:7700", host: "127.0.0.1", port: 7700, startedAt: "2026-11-03" } : null;
  }, write: async () => {}, removeIfCurrent: async () => {} };
  const service = createDesktopAgentService({ repoRoot: "/repo", registryPath: "/instance/daemon", cliMode: "compiled",
    env: { PATH: "/bin", TOVU_AGENT_DAEMON_TOKEN: "foreign-proxy", TOVU_TOOL_EXEC_TOKEN: "foreign-rpc", TOVU_SITE_DIR: "/foreign" } }, {
    registry, stdout: output, stderr: output, spawn: ({ options }) => {
      assert.ok(Array.isArray(options.stdio)); assert.equal(options.stdio[3], "ipc");
      environments.push(options.env ?? {});
      const child = new DaemonChild(500 + children.length); children.push(child);
      return child as unknown as ChildProcess;
    },
    terminate: async ({ child }) => { child.kill({}, { signal: "SIGTERM" }); },
  });
  const demand = (siteId: string) => service.demand({ siteId, scopeKey: `scope-${siteId}`, token: `rpc-${siteId}`, env: {
    TOVU_SITE_DIR: `/sites/${siteId}`, TOVU_WORKSPACE: siteId, TOVU_AGENT_DAEMON_TOKEN: `proxy-${siteId}`,
  } }, {});
  return { service, demand, children, environments, output: () => text };
}

test("five simultaneous site demands spawn one child", async () => {
  const h = harness();
  try {
    const endpoints = await Promise.all(["a", "b", "c", "d", "e"].map(h.demand));
    assert.equal(h.children.length, 1);
    assert.equal(new Set(endpoints.map(endpoint => new URL(endpoint.url).origin)).size, 1);
    assert.equal(new Set(endpoints.map(endpoint => endpoint.token)).size, 5);
    assert.equal(h.children[0]!.messages.filter(message => (message as { payload: { operation: string } }).payload.operation === "register").length, 5);
  } finally { await h.service.shutdown({}, {}); }
});

test("site shutdown never stops the shared daemon", async () => {
  const h = harness();
  try {
    await Promise.all([h.demand("a"), h.demand("b")]);
    await h.service.withdraw({ scopeKey: "scope-a" }, {});
    assert.equal(h.children[0]!.connected, true);
    await h.demand("b"); assert.equal(h.children.length, 1);
  } finally { await h.service.shutdown({}, {}); }
});

test("park wake races produce one replacement", async () => {
  const h = harness();
  try {
    const before = await h.demand("a");
    h.children[0]!.connected = false; h.children[0]!.emit("exit", 88, null);
    const [after] = await Promise.all([h.demand("a"), h.demand("b"), h.demand("a")]);
    assert.equal(h.children.length, 2);
    assert.notEqual(after!.token, before!.token, "a replacement scope revokes the old site's callback credential");
  } finally { await h.service.shutdown({}, {}); }
});

test("spawn environments contain no shared or foreign-site credentials", async () => {
  const h = harness();
  try {
    await h.demand("a");
    assert.equal(h.environments[0]!.ELECTRON_RUN_AS_NODE, "1");
    for (const key of ["TOVU_AGENT_DAEMON_TOKEN", "TOVU_TOOL_EXEC_TOKEN", "TOVU_SITE_DIR", "TOVU_WORKSPACE"]) {
      assert.equal(h.environments[0]![key], undefined, key);
    }
    assert.doesNotMatch(JSON.stringify(h.environments), /foreign|rpc-a|proxy-a/);
  } finally { await h.service.shutdown({}, {}); }
});

test("shared child output redacts the registered scopes' credentials", async () => {
  const h = harness();
  try {
    const connection = await h.demand("a");
    h.children[0]!.stdout.write(`unlabelled ${connection!.token} rpc-a\n`);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.doesNotMatch(h.output(), /rpc-a/);
    assert.equal(h.output().includes(connection!.token), false);
    assert.ok(h.output().includes("unlabelled"));
  } finally { await h.service.shutdown({}, {}); }
});

/** A site server's inherited channel as `bindServer` sees it; `ask` sends one control request. */
class ServerChild extends EventEmitter {
  connected = true;
  private replies = new Map<string, (reply: { ok: boolean; payload?: unknown }) => void>();
  send(message: Serializable, callback: (error: Error | null) => void): boolean {
    const reply = message as { kind: string; id: string; ok: boolean; payload?: unknown };
    if (reply.kind === "reply") this.replies.get(reply.id)?.(reply);
    callback(null); return true;
  }
  ask(payload: unknown): Promise<{ ok: boolean; payload?: unknown }> {
    const id = `req-${Math.random()}`;
    return new Promise(resolve => {
      this.replies.set(id, resolve);
      this.emit("message", { jiniIpc: 1, kind: "request", id, payload });
    });
  }
}

test("two sites sharing one workspace id each keep their own ready daemon scope", async () => {
  const h = harness();
  // Every local site is `workspace-local`; only the directory tells two running sites apart.
  const sites = ["/sites/bigger-tax", "/sites/story-squid"].map(siteDir => {
    const child = new ServerChild();
    const binding = h.service.bindServer({ child: child as unknown as ChildProcess, siteDir }, {});
    binding.setIdentity({ siteId: "workspace-local" }, {});
    const register = () => child.ask({ operation: "register", siteId: "workspace-local", token: `rpc-${siteDir}`,
      env: { TOVU_SITE_DIR: siteDir, TOVU_WORKSPACE: "workspace-local", TOVU_AGENT_DAEMON_TOKEN: `proxy-${siteDir}` } });
    return { child, register };
  });
  try {
    const [first, second] = await Promise.all(sites.map(site => site.register()));
    assert.equal(first!.ok, true); assert.equal(second!.ok, true);
    const urls = [first, second].map(reply => (reply!.payload as { url: string }).url);
    assert.notEqual(urls[0], urls[1], "each site gets its own scope route");
    assert.equal(h.children.length, 1, "one shared daemon serves both");
    const registered = h.children[0]!.messages.map(message => (message as { payload: { operation: string; siteId?: string } }).payload)
      .filter(payload => payload.operation === "register");
    assert.deepEqual(registered.map(payload => payload.siteId), ["workspace-local", "workspace-local"], "the scope keeps its real workspace id");

    assert.equal((await sites[0]!.child.ask({ operation: "withdraw", siteId: "workspace-local" })).ok, true);
    const again = await sites[1]!.register();
    assert.equal(again.ok, true, "withdrawing one site keeps the other usable");
    assert.equal((again.payload as { url: string }).url, urls[1]);
    const withdrawn = h.children[0]!.messages.map(message => (message as { payload: { operation: string; scopeKey?: string } }).payload)
      .filter(payload => payload.operation === "withdraw");
    assert.equal(withdrawn.length, 1);
    assert.equal(`http://127.0.0.1:7700/s/${withdrawn[0]!.scopeKey}`, urls[0], "only the withdrawn site's scope left the daemon");
  } finally { await h.service.shutdown({}, {}); }
});
