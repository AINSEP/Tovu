import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSiteScope } from "../agent-daemon-scope.js";
import { createAgentDaemonIdlePark } from "../agent-daemon-idle-park.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

test("site scopes never read ambient environment or working directory", async () => {
  const source = await readFile(new URL("../agent-daemon-scope.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\s*\.\s*(env|cwd)\b/);
});

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "shared-daemon-"));
  const scopes: Awaited<ReturnType<typeof createSiteScope>>[] = [];
  const app = express();
  const mounted = new Map<string, Awaited<ReturnType<typeof createSiteScope>>>();
  app.use("/s/:scopeId", (req, res, next) => {
    const scope = mounted.get(req.params.scopeId);
    if (!scope) { res.status(404).end(); return; }
    scope.app(req, res, next);
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const idlePark = createAgentDaemonIdlePark({ isBusy: () => false, exit: () => assert.fail("unexpected park") }, { env: { TOVU_AGENT_DAEMON_IDLE_MINUTES: "0" } });
  app.get('/internal/tool-catalog', (_req, res) => res.json({ tools: [] }));
  app.post('/internal/agent-plugin-preflight', (_req, res) => res.json({ prefix: '', refusalPrefix: '' }));
  async function site(instance: number, siteLabel: string, db: "memory" | "sqlite" = "memory", options: {
    prepare?: { entered(): void; resume: Promise<void> };
  } = {}) {
    const dir = join(root, `${instance}-${siteLabel}`);
    await mkdir(dir, { recursive: true });
    if (db === "sqlite") {
      await writeFile(join(dir, "content.db"), ""); await writeFile(join(dir, "chat.db"), "");
    }
    const bin = join(dir, "bin");
    if (options.prepare) {
      await mkdir(bin, { recursive: true });
      // Inventory sees a real controlled executable; withdrawal must fence its launch.
      await writeFile(join(bin, "aider"), '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "aider fixture\\n"; exit 0; fi\nprintf "unexpected fixture launch\\n" > "$HOME/fixture-launched"\nexit 98\n', { mode: 0o755 });
    }
    let holdReplyPreferences = false;
    const token = `proxy-${instance}-${siteLabel}-${scopes.length}`;
    const env = { PATH: options.prepare ? bin : "", HOME: dir, TOVU_SITE_DIR: dir, TOVU_DB: db,
      TOVU_WORKSPACE: "workspace-local", TOVU_SITE_LISTENER_ORIGIN: options.prepare ? url : "http://127.0.0.1:1",
      TOVU_AGENT_DAEMON_TOKEN: token, TOVU_AGENT_PERMISSION_MODE: instance ? "restricted" : "bypass",
      JINI_AGENT_DAEMON_URL: `${url}/s/${instance}-${siteLabel}` };
    const scope = await createSiteScope({ siteId: "workspace-local", env, token: `rpc-${instance}-${siteLabel}` }, {
      idlePark, probeBridge: async () => {}, coreOptions: {
        storage: { kind: "sqlite" },
        fetch: async (_input, init) => {
          assert.equal(new Headers(init?.headers).get("authorization"), `Bearer rpc-${instance}-${siteLabel}`);
          const request = JSON.parse(String(init?.body)) as { operation: string; input?: { namespace?: string } };
          if (request.operation === 'getEffective' && request.input?.namespace === 'core.interface' && options.prepare && holdReplyPreferences) {
            options.prepare.entered();
            await options.prepare.resume;
          }
          return Response.json({ value: request.operation === "bootstrap" ? {
            workspaceId: "workspace-local", ownerPrincipalId: "owner", siteBinding: { dir, name: siteLabel },
            siteStoragePaths: { contentDbPath: join(dir, "content.db"), mediaUploadsDir: join(dir, "uploads"), chatAttachmentsDir: join(dir, "attachments") },
            traceCapture: "off", traceEnabled: false,
          } : null });
        },
      },
    });
    scopes.push(scope);
    mounted.set(`${instance}-${siteLabel}`, scope);
    // Boot reads the same namespace; only reply preparation belongs behind this gate.
    holdReplyPreferences = true;
    return { scope, env, token, base: `${url}/s/${instance}-${siteLabel}` };
  }
  return { site, close: async () => {
    await Promise.all(scopes.map(scope => scope.dispose({}, {})));
    idlePark.stop({}, {}); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  } };
}

test("credential selects site despite forged tenant and principal hints", async () => {
  const h = await harness();
  try {
    const a = await h.site(0, "a"); const b = await h.site(0, "b");
    const headers = { authorization: `Bearer ${a.token}`, "x-tovu-principal-id": "owner", "x-site-id": "a" };
    const forged = await fetch(`${b.base}/api/runs`, { headers });
    assert.equal(forged.status, 401); await forged.body?.cancel();
    const own = await fetch(`${a.base}/api/runs`, { headers });
    assert.equal(own.status, 200); assert.deepEqual(await own.json(), { runs: [] });
    assert.equal(a.env.TOVU_AGENT_DAEMON_TOKEN, a.token, "scope construction copies its input");
  } finally { await h.close(); }
});

for (const db of ["memory", "sqlite"] as const) {
test(`equal identifiers remain isolated across two sites and two hosts (${db})`, async () => {
  const h = await harness();
  try {
    const sites = await Promise.all([h.site(0, "a", db), h.site(0, "b", db), h.site(1, "a", db), h.site(1, "b", db)]);
    for (const [index, site] of sites.entries()) {
      await site.scope.lifecycle.start({ contextRef: `instructions-${index}` }, { runId: "same" });
      await site.scope.lifecycle.emit({ runId: "same", input: { event: "stdout", data: { chunk: `event-${index}` } } });
    }
    for (const [index, site] of sites.entries()) {
      for (const other of sites.filter(candidate => candidate !== site)) {
        const response = await fetch(`${site.base}/api/runs`, { headers: { authorization: `Bearer ${other.token}`, "x-tovu-principal-id": "owner" } });
        assert.equal(response.status, 401); await response.body?.cancel();
      }
      const events: string[] = [];
      const subscription = await site.scope.lifecycle.stream({ runId: "same", onEvent: event => { events.push(JSON.stringify(event)); } });
      assert.equal(subscription.kind, "ok");
      if (subscription.kind === "ok") subscription.unsubscribe();
      assert.ok(events.join("").includes(`event-${index}`));
      assert.ok(!events.join("").includes(`event-${(index + 1) % 4}`));
      await site.scope.lifecycle.finish({ runId: "same", status: "succeeded", code: 0, signal: null, resumable: false });
    }
  } finally { await h.close(); }
});

}

test("disposing one site leaves another run streaming and refuses late callbacks", async () => {
  const h = await harness();
  try {
    const a = await h.site(0, "a"); const b = await h.site(0, "b");
    await b.scope.lifecycle.start({ contextRef: "b" }, { runId: "same" });
    await a.scope.dispose({}, {});
    const closed = await fetch(`${a.base}/api/runs`, { headers: { authorization: `Bearer ${a.token}` } });
    assert.equal(closed.status, 503); await closed.body?.cancel();
    const replacement = await h.site(0, "a");
    const late = await fetch(`${replacement.base}/internal/agent-plugin-events`, {
      method: "POST", headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" },
      body: JSON.stringify({ runId: "same", principalId: "owner", payload: { type: "agent_plugins" } }),
    });
    assert.equal(late.status, 401); await late.body?.cancel();
    await b.scope.lifecycle.emit({ runId: "same", input: { event: "stdout", data: { chunk: "still running" } } });
    assert.equal((await b.scope.lifecycle.get({ runId: "same" }))?.state, "running");
    await b.scope.lifecycle.finish({ runId: "same", status: "succeeded", code: 0, signal: null, resumable: false });
  } finally { await h.close(); }
});

test("withdrawing a site while its reply prepares finishes disposal and leaves another site streaming", { timeout: 10_000 }, async t => {
  const h = await harness();
  let resume!: () => void;
  const held = new Promise<void>(resolve => { resume = resolve; });
  let entered!: () => void;
  const preparing = new Promise<void>(resolve => { entered = resolve; });
  let closing: Promise<void> | undefined;
  let stopped: Awaited<ReturnType<typeof h.site>> | undefined;
  let runId: string | undefined;
  try {
    const a = await h.site(0, 'a', 'memory', { prepare: { entered, resume: held } });
    stopped = a;
    const b = await h.site(0, 'b');
    await b.scope.lifecycle.start({ contextRef: 'other site' }, { runId: 'other' });
    const response = await fetch(`${a.base}/api/runs`, { method: 'POST',
      headers: { authorization: `Bearer ${a.token}`, 'x-tovu-principal-id': 'owner', 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'aider', contextRef: JSON.stringify({ prompt: 'hello', principalId: 'owner' }) }),
    });
    assert.equal(response.status, 201);
    runId = ((await response.json()) as { run: { id: string } }).run.id;
    await Promise.race([
      preparing,
      a.scope.lifecycle.waitForTerminal({ runId }, { signal: t.signal }).then(terminal => {
        assert.fail(`reply finished before preference gate: ${terminal.state}`);
      }),
    ]);
    closing = a.scope.dispose({}, {});
    // Let withdrawal fence launch and deliver cancellation while preference I/O is held.
    await new Promise<void>(resolve => setImmediate(resolve));
    resume();
    const terminal = await a.scope.lifecycle.waitForTerminal({ runId }, { signal: AbortSignal.timeout(2_000) });
    assert.equal(terminal.state, 'cancelled');
    await closing;
    await assert.rejects(readFile(join(a.env.HOME, 'fixture-launched')), { code: 'ENOENT' }, 'withdrawal fences the prepared CLI before spawn');
    const replacement = await h.site(0, 'a');
    const ready = await fetch(`${replacement.base}/api/runs`, { headers: { authorization: `Bearer ${replacement.token}`, 'x-tovu-principal-id': 'owner' } });
    assert.equal(ready.status, 200); await ready.body?.cancel();
    const events: string[] = [];
    const subscription = await b.scope.lifecycle.stream({ runId: 'other', onEvent: event => { events.push(JSON.stringify(event)); } });
    await b.scope.lifecycle.emit({ runId: 'other', input: { event: 'stdout', data: { chunk: 'still streaming' } } });
    assert.match(events.join(''), /still streaming/);
    if (subscription.kind === 'ok') subscription.unsubscribe();
    await b.scope.lifecycle.finish({ runId: 'other', status: 'succeeded', code: 0, signal: null, resumable: false });
  } finally {
    resume();
    // The pre-fix regression must also leave no unresolved run or disposal behind.
    if (runId && stopped) await stopped.scope.lifecycle.finish({ runId, status: 'cancelled', code: null, signal: null, resumable: false });
    await closing;
    await h.close();
  }
});

test("identical upload batches and principal IDs remain scoped to their site", async () => {
  const h = await harness();
  try {
    const sites = await Promise.all([h.site(0, "a"), h.site(0, "b"), h.site(1, "a"), h.site(1, "b")]);
    const refs: string[] = [];
    for (const [index, site] of sites.entries()) {
      const response = await fetch(`${site.base}/api/attachments?batch=same-batch&name=note.txt`, {
        method: "POST", headers: { authorization: `Bearer ${site.token}`, "x-tovu-principal-id": "same-principal", "content-type": "application/octet-stream" },
        body: `site-specific attachment ${index}`,
      });
      assert.equal(response.status, 201);
      const body = await response.json() as { attachment: { path: string } }; refs.push(body.attachment.path);
    }
    assert.equal(new Set(refs).size, 4);
    for (const [index, site] of sites.entries()) {
      const pending = await fetch(`${site.base}/internal/attachment-lookup`, {
        method: "POST", headers: { authorization: `Bearer ${site.token}`, "content-type": "application/json" },
        body: JSON.stringify({ op: "listPendingForOwner", ownerId: "same-principal" }),
      });
      assert.equal(pending.status, 200);
      const body = await pending.json() as { value: { ref: string }[] };
      assert.deepEqual(body.value.map(value => value.ref), [refs[index]]);
    }
  } finally { await h.close(); }
});

test("concurrent scope launches keep filesystem roots and host permission signals separate", async () => {
  const launches = await Promise.all(Array.from({ length: 4 }, (_, index) => captureDaemonRun({ prompt: `scope-${index}` }, {
    bindings: {
      env: { TOVU_RUNTIME_MODE: index % 2 === 0 ? "local" : "production", TOVU_AGENT_NATIVE_FALLBACKS: "1", HOME: `/home/scope-${index}` },
      routeDeps: { workspaceId: "workspace-local", ownerPrincipalId: Promise.resolve("daemon-test-principal"), siteBinding: { dir: `/sites/scope-${index}` } },
      createToolGapCollector: () => ({ observe() {} }),
    },
  })));
  for (const [index, launch] of launches.entries()) {
    assert.equal(launch.cwd, `/sites/scope-${index}`);
    assert.equal(launch.nativeToolAccess, index % 2 === 0);
    assert.ok(launch.prompt.endsWith(`scope-${index}`));
  }
});

test("withdrawing a site releases its finished-run owner retention timers", async t => {
  // Advance each clock read so Jini's remaining terminal-record TTL is below Tovu's full owner TTL.
  // Equal millisecond timestamps otherwise make two distinct timers look like the same owner.
  let timestamp = Date.now();
  t.mock.method(Date, "now", () => timestamp++);
  const h = await harness();
  const scheduled = t.mock.method(globalThis, "setTimeout");
  const cleared = t.mock.method(globalThis, "clearTimeout");
  try {
    const site = await h.site(0, "a");
    const response = await fetch(`${site.base}/api/runs`, { method: "POST",
      headers: { authorization: `Bearer ${site.token}`, "x-tovu-principal-id": "owner", "content-type": "application/json" },
      body: JSON.stringify({ contextRef: JSON.stringify({ prompt: "hello", principalId: "owner" }) }),
    });
    assert.equal(response.status, 201);
    const { run } = await response.json() as { run: { id: string } };
    // The fixture's absent site-tool listener fails preparation before any CLI can launch.
    await site.scope.lifecycle.waitForTerminal({ runId: run.id }, { signal: AbortSignal.timeout(2_000) });
    await new Promise<void>(resolve => setImmediate(resolve));
    const retention = scheduled.mock.calls.filter(call => call.arguments[1] === 24 * 60 * 60 * 1000);
    assert.equal(retention.length, 1);
    const ownerRetention = retention[0]!;
    await site.scope.dispose({}, {});
    assert.ok(cleared.mock.calls.some(call => call.arguments[0] === ownerRetention.result));
  } finally { await h.close(); }
});
