import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, Serializable } from "node:child_process";
import { createDesktopAgentService, siteScopeKey } from "./desktop-agent-service.ts";

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

function harness(cliMode: "compiled" | "source" = "compiled") {
  const spawnArgs: string[][] = [];
  const children: DaemonChild[] = []; const environments: NodeJS.ProcessEnv[] = [];
  const output = new PassThrough(); let text = "";
  output.on("data", chunk => { text += String(chunk); });
  const registry = { readLive: async () => {
    const child = children.at(-1);
    return child ? { pid: child.pid, url: "http://127.0.0.1:7700", host: "127.0.0.1", port: 7700, startedAt: "2026-11-03" } : null;
  }, write: async () => {}, removeIfCurrent: async () => {} };
  const service = createDesktopAgentService({ repoRoot: "/repo", registryPath: "/instance/daemon", cliMode,
    env: { PATH: "/bin", TOVU_AGENT_DAEMON_TOKEN: "foreign-proxy", TOVU_TOOL_EXEC_TOKEN: "foreign-rpc", TOVU_SITE_DIR: "/foreign" } }, {
    registry, stdout: output, stderr: output, spawn: ({ args, options }) => {
      spawnArgs.push([...args]);
      assert.ok(Array.isArray(options.stdio)); assert.equal(options.stdio[3], "ipc");
      environments.push(options.env ?? {});
      const child = new DaemonChild(500 + children.length); children.push(child);
      return child as unknown as ChildProcess;
    },
    terminate: async ({ child }) => { child.kill({}, { signal: "SIGTERM" }); },
  });
  const demand = (siteId: string) => service.demand({ siteId: "workspace-local", scopeKey: siteScopeKey({ siteDir: `/sites/${siteId}` }), token: `rpc-${siteId}`, env: {
    TOVU_SITE_DIR: `/sites/${siteId}`, TOVU_WORKSPACE: "workspace-local", TOVU_AGENT_DAEMON_TOKEN: `proxy-${siteId}`,
  } }, {});
  return { service, demand, children, environments, spawnArgs, output: () => text };
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
    await h.service.withdraw({ scopeKey: siteScopeKey({ siteDir: "/sites/a" }) }, {});
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

for (const chunks of [
  [`before\n${["-----BEGIN", "PRIVATE", "KEY-----"].join(" ")}\nYm9keS1vbmU=\nYm9keS10d28=\n-----END PRIVATE KEY-----\nafter\n`],
  ["before\n-----BE", "GIN RSA PRIVATE KEY-----\nYm9keS1v", "bmU=\nYm9keS10d28=\n-----END RSA PRIVATE KEY-----\nafter\n"],
  [`before\n${["-----BEGIN", "EC PRIVATE", "KEY-----"].join(" ")}\nYm9keS1vbmU=\n`, "Ym9keS10d28="],
]) {
  test(`private-key bodies never reach either child output sink (${chunks.length} writes)`, async () => {
    const h = harness();
    try {
      await h.demand("a");
      for (const stream of [h.children[0]!.stderr, h.children[0]!.stdout]) {
        const ended = new Promise<void>(resolve => stream.once("end", resolve));
        for (const chunk of chunks) stream.write(chunk);
        stream.end();
        await ended;
      }
      assert.doesNotMatch(h.output(), /Ym9keS1v|Ym9keS10|PRIVATE KEY/);
      assert.match(h.output(), /before/);
      if (chunks.join("").includes("after")) assert.match(h.output(), /after/);
    } finally { await h.service.shutdown({}, {}); }
  });
}

test("shared child output preserves workspace identifiers and masks complete local paths", async () => {
  const h = harness();
  try {
    await h.service.demand({ siteId: "customer-42", scopeKey: siteScopeKey({ siteDir: "/srv/workspaces/customer-42" }), token: "private-rpc", env: {
      TOVU_SITE_DIR: "/srv/workspaces/customer-42", TOVU_WORKSPACE: "customer-42",
    } }, {});
    h.children[0]!.stderr.write("customer-42 could not open /srv/workspaces/customer-42/ops/db\n");
    assert.match(h.output(), /customer-42 could not open/);
    assert.doesNotMatch(h.output(), /\/srv\/workspaces|ops\/db/);
    assert.match(h.output(), /could not open/);
  } finally { await h.service.shutdown({}, {}); }
});


test("output redaction preserves site identities and masks paths on both streams", async () => {
  const h = harness();
  try {
    await h.service.demand({ siteId: "private-site", scopeKey: siteScopeKey({ siteDir: "/srv/workspaces/customer-42" }), token: "private-rpc", env: {
      TOVU_SITE_DIR: "/srv/workspaces/customer-42", TOVU_WORKSPACE: "private-workspace",
    } }, {});
    for (const stream of [h.children[0]!.stdout, h.children[0]!.stderr]) {
      stream.write('private-site private-workspace could not open "/srv/workspaces/customer-42/ops/db"\n');
      stream.write(String.raw`failed C:\workspaces\customer-42\ops\db` + '\n');
    }
    assert.match(h.output(), /private-site private-workspace/);
    assert.doesNotMatch(h.output(), /customer-42|workspaces|ops\\db/);
    assert.match(h.output(), /could not open/);
    assert.match(h.output(), /failed/);
  } finally { await h.service.shutdown({}, {}); }
});

test("an unterminated stderr key cannot suppress stdout or the next child's output", async () => {
  const h = harness();
  try {
    await h.demand("a");
    h.children[0]!.stderr.write(["-----BEGIN", "PRIVATE", "KEY-----"].join(" ") + '\nYm9keS1vbmU=\n');
    h.children[0]!.stdout.write('other stream diagnostic\n');
    const ended = new Promise<void>(resolve => h.children[0]!.stderr.once('end', resolve));
    h.children[0]!.stderr.end();
    // EOF unpipes the persistent sink; the replacement must not inherit the open PEM state.
    await ended;
    h.children[0]!.emit('exit', 88, null);
    await h.demand("a");
    h.children[1]!.stderr.write('next child diagnostic\n');
    assert.doesNotMatch(h.output(), /Ym9keS|PRIVATE KEY/);
    assert.match(h.output(), /other stream diagnostic/);
    assert.match(h.output(), /next child diagnostic/);
  } finally { await h.service.shutdown({}, {}); }
});

/** A site server's inherited channel as `bindServer` sees it; `ask` sends one control request. */
class ServerChild extends EventEmitter {
  connected = true;
  exitCode: number | null = null;
  signalCode: string | null = null;
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

/** Bind a fake owned boot; no server process or server-originated withdrawal is involved. */
function serverBoot(h: ReturnType<typeof harness>, token: string, siteDir = "/sites/story-squid") {
  const child = new ServerChild();
  const binding = h.service.bindServer({ child: child as unknown as ChildProcess, siteDir }, {});
  binding.setIdentity({ siteId: "workspace-local" }, {});
  const register = () => child.ask({ operation: "register", siteId: "workspace-local", token,
    env: { TOVU_SITE_DIR: siteDir, TOVU_SITE_LISTENER_ORIGIN: `http://127.0.0.1:${token === "old" ? 3100 : 3200}` } });
  return { child, binding, register };
}

function daemonOperations(h: ReturnType<typeof harness>) {
  return h.children[0]!.messages.map(message => (message as { payload: { operation: string; scopeKey?: string } }).payload);
}

for (const cause of ["stop", "crash"] as const) {
  test(`desktop withdraws on ${cause} without server withdrawal; restart accepts the new boot`, async () => {
    const h = harness();
    try {
      const old = serverBoot(h, "old");
      assert.equal((await old.register()).ok, true);
      if (cause === "stop") {
        old.child.connected = false;
        old.child.emit("disconnect");
        assert.equal(daemonOperations(h).filter(op => op.operation === "withdraw").length, 0,
          "disconnect alone does not prove that a server has exited");
      }
      old.child.exitCode = cause === "stop" ? 0 : 1;
      old.child.emit("exit", old.child.exitCode, null);
      const next = await serverBoot(h, "new").register();
      assert.equal(next.ok, true);
      assert.equal(daemonOperations(h).filter(op => op.operation === "withdraw").length, 1);
      assert.equal(daemonOperations(h).filter(op => op.operation === "register").length, 2);
      assert.equal(h.children.length, 1, "the shared daemon survives site restarts");
    } finally { await h.service.shutdown({}, {}); }
  });
}

for (const death of ["exitCode", "signalCode"] as const) {
  test(`a boot with ${death} is replaced even before its exit listener runs`, async () => {
    const h = harness();
    try {
      const old = serverBoot(h, "old");
      await old.register();
      if (death === "exitCode") old.child.exitCode = 1;
      else old.child.signalCode = "SIGKILL";
      const replacement = serverBoot(h, "new");
      const next = await replacement.register();
      assert.equal(next.ok, true);
      assert.ok((next.payload as { token?: string }).token, "replacement returns a fresh capability");
      assert.deepEqual(daemonOperations(h).map(op => op.operation), ["ready", "register", "withdraw", "register"]);
      old.child.emit("exit", old.child.exitCode, old.child.signalCode);
      await replacement.register();
      assert.equal(daemonOperations(h).filter(op => op.operation === "withdraw").length, 1,
        "the old boot's delayed exit cannot withdraw the replacement");
    } finally { await h.service.shutdown({}, {}); }
  });
}

test("disconnect alone never authorizes a second live boot", async () => {
  const h = harness();
  try {
    const old = serverBoot(h, "old");
    await old.register(); old.child.connected = false; old.child.emit("disconnect");
    const contender = serverBoot(h, "new");
    const reply = await contender.register();
    assert.equal((reply as unknown as { refusalReason?: string }).refusalReason,
      "The assistant service still holds an older copy of this site. Restart the site or the app.");
    old.child.exitCode = 1; old.child.emit("exit", 1, null);
    assert.ok(((await contender.register()).payload as { token?: string }).token);
  } finally { await h.service.shutdown({}, {}); }
});

test("a different directory under the same scope key remains refused, even after death", async () => {
  const h = harness();
  try {
    const old = serverBoot(h, "old");
    await old.register(); old.child.exitCode = 1;
    await assert.rejects(h.service.demand({ siteId: "workspace-local", scopeKey: siteScopeKey({ siteDir: "/sites/story-squid" }),
      token: "new", env: { TOVU_SITE_DIR: "/sites/somewhere-else" } }, {}), /another directory/);
    assert.equal(daemonOperations(h).filter(op => op.operation === "withdraw").length, 0);
  } finally { await h.service.shutdown({}, {}); }
});

test("a second live boot gets a plain refusal and its exit cannot withdraw the first", async () => {
  const h = harness();
  try {
    const old = serverBoot(h, "old");
    const first = await old.register();
    const contender = serverBoot(h, "new");
    const refused = await contender.register();
    assert.equal(refused.ok, false);
    assert.equal((refused as unknown as { refusalReason: string }).refusalReason,
      "The assistant service still holds an older copy of this site. Restart the site or the app.");
    contender.child.exitCode = 1; contender.child.emit("exit", 1, null);
    const again = await old.register();
    assert.equal(again.ok, true);
    assert.deepEqual(again.payload, first.payload, "the live boot keeps its original capability");
    assert.equal(daemonOperations(h).filter(op => op.operation === "withdraw").length, 0);
  } finally { await h.service.shutdown({}, {}); }
});

test("an exit while demand is queued cannot recreate the departed boot's scope", async () => {
  const h = harness();
  try {
    const old = serverBoot(h, "old");
    const pending = h.service.demand({ siteId: "workspace-local", scopeKey: siteScopeKey({ siteDir: "/sites/story-squid" }),
      token: "old", env: { TOVU_SITE_DIR: "/sites/story-squid" } }, { server: old.child as unknown as ChildProcess });
    old.child.exitCode = 1; old.child.emit("exit", 1, null);
    await assert.rejects(pending, /site scope was withdrawn/);
    assert.equal(h.children.length, 0, "a dead boot cannot wake the daemon");
    const replacement = await serverBoot(h, "new").register();
    assert.ok((replacement.payload as { token?: string }).token);
  } finally { await h.service.shutdown({}, {}); }
});

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

for (const mode of ["compiled", "source"] as const) {
  test(`shared daemon ${mode} launches and park wakes put the size flag before loaders`, async () => {
    const h = harness(mode);
    try {
      await h.demand("a");
      h.children[0]!.connected = false;
      h.children[0]!.emit("exit", 88, null);
      await h.demand("a");
      assert.equal(h.spawnArgs.length, 2);
      for (const args of h.spawnArgs) {
        assert.equal(args[0], "--optimize-for-size");
        assert.equal(args.filter(arg => arg === "--optimize-for-size").length, 1);
        assert.match(args.at(-1)!, mode === "source" ? /agent-daemon-server\.ts$/ : /agent-daemon-server\.js$/);
        if (mode === "source") assert.equal(args[1], "--import");
      }
    } finally { await h.service.shutdown({}, {}); }
  });
}


test("sleep exit uses the existing control channel and P0 withdraws before the same directory registers again", async () => {
  const h = harness();
  try {
    const old = serverBoot(h, "old");
    await old.register();
    const original = old.child.send.bind(old.child);
    old.child.send = (message, callback) => {
      const request = message as { kind: string; id: string; payload?: { operation: string } };
      if (request.kind === 'request') {
        assert.deepEqual(request.payload, { operation: 'stopIfIdle' });
        queueMicrotask(() => old.child.emit('message', { jiniIpc: 1, kind: 'reply', id: request.id, ok: true, payload: { idle: true } }));
      }
      return original(message, callback);
    };
    assert.equal(old.child.listenerCount('message'), 1, 'no second control channel');
    assert.equal(await old.binding.stopIfIdle({}, {}), true);
    assert.equal(daemonOperations(h).filter(op => op.operation === 'withdraw').length, 0, 'asking is not proof of exit');
    old.child.exitCode = 89;
    old.child.emit('exit', 89, null);
    assert.equal((await serverBoot(h, 'new').register()).ok, true);
    assert.deepEqual(daemonOperations(h).map(op => op.operation), ['ready', 'register', 'withdraw', 'register']);
    assert.equal(await old.binding.stopIfIdle({}, {}), false, 'disposed channels are busy');
  } finally { await h.service.shutdown({}, {}); }
});

test("stopIfIdle treats a rejected, timed out or malformed reply as busy", async () => {
  const h = harness();
  try {
    for (const payload of [{ idle: false }, { idle: true, extra: 'invalid' }, { refusalReason: 'unavailable' }]) {
      const boot = serverBoot(h, 'new');
      boot.child.send = (message, callback) => {
        const request = message as { id: string };
        queueMicrotask(() => boot.child.emit('message', { jiniIpc: 1, kind: 'reply', id: request.id, ok: true, payload }));
        callback(null); return true;
      };
      assert.equal(await boot.binding.stopIfIdle(), false);
      boot.binding.dispose();
    }
    const failed = serverBoot(h, 'new');
    failed.child.send = (_message, callback) => { callback(new Error('send failed')); return false; };
    assert.equal(await failed.binding.stopIfIdle(), false);
  } finally { await h.service.shutdown({}, {}); }
});


test("stopIfIdle request timeout is busy and never withdraws or signals", async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  try {
    const boot = serverBoot(h, 'new');
    const stopping = boot.binding.stopIfIdle(); // Fake server intentionally never replies.
    t.mock.timers.tick(30_000);
    assert.equal(await stopping, false);
    assert.equal(h.children.length, 0, 'no daemon demand or withdrawal for an idle probe');
  } finally { await h.service.shutdown({}, {}); }
});
