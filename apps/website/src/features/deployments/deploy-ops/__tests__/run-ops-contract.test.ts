import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { InMemoryCustomCredentialSetRepo } from "../../../custom-credentials/repo.memory.js";
import { loadDeployOpsRegistryFromSource } from "../registry.js";
import { MAX_MODULE_SLEEP_MS, runDeploy, runDeployOps, waitForDeployOps } from "../run-ops.js";
import type { DeployOpsContext, DeployOpsStatus } from "../types.js";
import { fixture } from "./example-ops-fixture.js";

/**
 * The bound context a module receives (fail, sleep, get/send failure mapping, cancellation at each
 * I/O boundary) and the wait loop's cancellation edges, driven through one scripted adapter module
 * whose verbs call back into the test.
 */
type Script = (ctx: DeployOpsContext, input: unknown) => Promise<unknown>;
const hooks = globalThis as { __opsScript?: Script };
const MODULE = "const run = (ctx, input) => globalThis.__opsScript(ctx, input);\nexport default { status: run, logs: run, listTargets: run, deploy: run };\n";
const healthy = (summary = "ok"): DeployOpsStatus => ({ platform: "scripted", target: "shop", state: "healthy", summary, items: [], checkedAt: "" });

async function scripted(script: Script, run: (deps: ReturnType<typeof withRegistry>) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-run-ops-contract-"));
  try {
    await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "scripted", label: "Scripted", module: "ops.mjs", hosts: ["api.example-host.dev"] }] }));
    await writeFile(path.join(root, "ops.mjs"), MODULE);
    const registry = await loadDeployOpsRegistryFromSource({ pluginId: "scripted", packageRoot: root });
    assert.deepEqual(registry.refusals, []);
    hooks.__opsScript = script;
    await run(withRegistry(await fixture(), registry));
  } finally { delete hooks.__opsScript; await forceRemove(root); }
}
/** The saved repo, swapped for `next()` on every call once `next()` returns one: the host's captured port changes underneath it. */
function switchingRepo<T extends object>(saved: T, next: () => T | undefined): T {
  return new Proxy(saved, { get: (target, key) => {
    const value = Reflect.get(next() ?? target, key);
    return typeof value === "function" ? value.bind(next() ?? target) : value;
  } });
}
function withRegistry(f: Awaited<ReturnType<typeof fixture>>, registry: Awaited<ReturnType<typeof loadDeployOpsRegistryFromSource>>) {
  return { ...f.deps, loadDeployOps: async () => registry, deployOpsRegistry: registry };
}
const input = { platform: "scripted", target: "shop" };

test("ctx.fail is a model-visible refusal and ctx.sleep clamps to [0, MAX_MODULE_SLEEP_MS] through the wait clock", async () => {
  const slept: number[] = [];
  await scripted(async ctx => {
    for (const ms of [-5, Number.NaN, 25, 1e12]) await ctx.sleep(ms);
    ctx.fail("the platform refused this target");
  }, async deps => {
    await assert.rejects(runDeployOps({ ...deps, waitClock: { now: () => 0, sleep: async ms => { slept.push(ms); } } }, input, "status"), { name: "ToolInputError", message: "the platform refused this target" });
  });
  assert.deepEqual(slept, [0, 0, 25, MAX_MODULE_SLEEP_MS]);
});

test("ctx.sleep on the system clock resolves, and rejects when its signal aborts before or during the pause", async () => {
  const controller = new AbortController();
  await scripted(async ctx => {
    await ctx.sleep(1);
    const pending = ctx.sleep(MAX_MODULE_SLEEP_MS);
    controller.abort();
    await assert.rejects(pending, { message: "Deployment ops wait was aborted." });
    await assert.rejects(ctx.sleep(1), { message: "Deployment ops wait was aborted." });
    return healthy();
  }, async deps => {
    assert.deepEqual(await runDeployOps(deps, input, "logs", controller.signal), healthy());
  });
});

test("transport failures are named per method; a credential removed after binding is reported as changed", async () => {
  await scripted(async ctx => {
    await assert.rejects(ctx.get("https://api.example-host.dev/v1/targets"), (error: Error) => error.name === "ToolInputError" && error.message.startsWith("Could not reach deployment ops host 'api.example-host.dev' using credential 'ops'."));
    await assert.rejects(ctx.send({ method: "POST", url: "https://api.example-host.dev/v1/targets", body: { a: 1 } }), (error: Error) => error.name === "ToolInputError" && error.message.startsWith("Lost the connection to deployment ops host 'api.example-host.dev' during a POST"));
    return healthy();
  }, async deps => {
    const broken = { ...deps, deployOpsHttpClient: { send: async (): Promise<never> => { throw new Error("socket hang up"); } } };
    assert.deepEqual(await runDeployOps(broken as never, input, "status"), healthy());
  });
  let removed = false;
  await scripted(async ctx => { removed = true; return ctx.get("https://api.example-host.dev/v1/targets"); }, async deps => {
    const empty = new InMemoryCustomCredentialSetRepo();
    // The URL binding still sees the row; it is gone by the time the request itself opens it.
    let readsAfterArming = 0;
    const changing = { ...deps, customCredentialSetRepo: new Proxy(deps.customCredentialSetRepo, { get: (target, key) => {
      const source = removed && readsAfterArming++ > 0 ? empty : target;
      const value = Reflect.get(source, key);
      return typeof value === "function" ? value.bind(source) : value;
    } }) };
    await assert.rejects(runDeployOps(changing as never, { ...input, credentialLabel: "ops" }, "status"), (error: Error) => error.name === "ToolInputError" && /^Credential 'ops' changed or no longer allows host 'api.example-host.dev'\./.test(error.message));
  });
});

test("a request fault the host does not classify (a row this site's sealer cannot open) passes through unchanged and sends nothing", async () => {
  // Another fixture's repo holds a same-labeled row sealed under a different key.
  const moved = (await fixture({ labels: ["ops"], host: "https://elsewhere.example", additionalHosts: [] })).deps.customCredentialSetRepo;
  let armed = false;
  await scripted(async ctx => { armed = true; return ctx.get("https://api.example-host.dev/v1/targets"); }, async deps => {
    let readsAfterArming = 0;
    const sent: unknown[] = [];
    const changing = { ...deps,
      deployOpsHttpClient: { send: async (request: unknown) => { sent.push(request); return { status: 200, headers: {}, bodyText: "[]" }; } },
      customCredentialSetRepo: new Proxy(deps.customCredentialSetRepo, { get: (target, key) => {
        const source = armed && readsAfterArming++ > 0 ? moved : target;
        const value = Reflect.get(source, key);
        return typeof value === "function" ? value.bind(source) : value;
      } }) };
    await assert.rejects(runDeployOps(changing as never, { ...input, credentialLabel: "ops" }, "status"), (error: Error) => error.name !== "ToolInputError" && error.message === "The credential could not be saved or unlocked. Check the site credential store.");
    assert.deepEqual(sent, []);
  });
});

test("cancellation is checked before each request and again after the response; no audit port is required", async () => {
  const controller = new AbortController();
  await scripted(async ctx => { controller.abort(); return ctx.get("https://api.example-host.dev/v1/targets"); }, async deps => {
    const sent: string[] = [];
    const counted = { ...deps, deployOpsHttpClient: { send: async (request: { url: string }) => { sent.push(request.url); return { status: 200, headers: {}, bodyText: "[]" }; } } };
    await assert.rejects(runDeployOps(counted as never, input, "status", controller.signal), { message: "Deployment ops wait was aborted." });
    assert.deepEqual(sent, []);
  });
  const binding = new AbortController();
  let armed = false;
  await scripted(async ctx => { armed = true; return ctx.get("https://api.example-host.dev/v1/targets"); }, async deps => {
    const sent: string[] = [];
    const aborting = { ...deps, customCredentialSetRepo: switchingRepo(deps.customCredentialSetRepo, () => { if (armed) binding.abort(); return undefined; }),
      deployOpsHttpClient: { send: async (request: { url: string }) => { sent.push(request.url); return { status: 200, headers: {}, bodyText: "[]" }; } } };
    await assert.rejects(runDeployOps(aborting as never, input, "status", binding.signal), { message: "Deployment ops wait was aborted." });
    assert.deepEqual(sent, [], "an abort while the URL is being bound sends nothing");
  });
  const pre = new AbortController(); pre.abort();
  await scripted(async () => assert.fail("a pre-aborted call never reaches the module"), async deps => {
    await assert.rejects(runDeployOps(deps as never, input, "status", pre.signal), { message: "Deployment ops wait was aborted." });
  });
  const late = new AbortController();
  await scripted(async ctx => ctx.get("https://api.example-host.dev/v1/targets"), async deps => {
    const { customCredentialsAudit: _audit, ...unaudited } = deps;
    const aborting = { ...unaudited, deployOpsHttpClient: { send: async () => { late.abort(); return { status: 200, headers: {}, bodyText: "[]" }; } } };
    await assert.rejects(runDeployOps(aborting as never, input, "status", late.signal), { message: "Deployment ops wait was aborted." });
  });
  const ok = await (async () => {
    let result: unknown;
    await scripted(async ctx => (await ctx.get("https://api.example-host.dev/v1/targets")).json, async deps => {
      const { customCredentialsAudit: _audit, ...unaudited } = deps;
      result = await runDeployOps({ ...unaudited, deployOpsHttpClient: { send: async () => ({ status: 200, headers: {}, bodyText: "[1]" }) } } as never, input, "status");
    });
    return result;
  })();
  assert.deepEqual(ok, [1]);
});

test("a cancellation while the credential is being bound stops runDeployOps and runDeploy before the module runs", async () => {
  for (const operation of ["status", "deploy"] as const) {
    let ran = 0;
    await scripted(async () => { ran++; return healthy(); }, async deps => {
      const controller = new AbortController();
      const saved = deps.customCredentialSetRepo;
      const aborting = { ...deps };
      Object.defineProperty(aborting, "customCredentialSetRepo", { get: () => { controller.abort(); return saved; } });
      const call = operation === "status" ? runDeployOps(aborting as never, input, "status", controller.signal) : runDeploy({ deps: aborting as never, input }, { signal: controller.signal });
      await assert.rejects(call, { message: "Deployment ops wait was aborted." });
      const pre = new AbortController(); pre.abort();
      await assert.rejects(runDeploy({ deps: deps as never, input }, { signal: pre.signal }), { message: "Deployment ops wait was aborted." });
    });
    assert.equal(ran, 0);
  }
});

test("wait: system clock and default timeout reach healthy on the first poll; a status that aborts as it answers is a cancellation", async () => {
  const reached = await waitForDeployOps({ status: async () => healthy() }, { until: "healthy" });
  assert.equal(reached.reached, true);
  assert.equal(reached.polls, 1);
  assert.ok(reached.waitedSeconds >= 0 && reached.waitedSeconds < 180);
  const controller = new AbortController();
  await assert.rejects(waitForDeployOps({ status: async () => { controller.abort(); return healthy(); } }, { until: "healthy", signal: controller.signal }), { message: "Deployment ops wait was aborted." });
});

test("wait: an abort that lands while the final sleep crosses the deadline is still reported as a cancellation", async () => {
  let now = 0;
  const controller = new AbortController();
  const clock = { now: () => now, sleep: async () => { now = 5_000; controller.abort(); } };
  await assert.rejects(waitForDeployOps({ status: async () => ({ ...healthy(), state: "deploying" as DeployOpsStatus["state"] }), clock }, { until: "healthy", timeoutSeconds: 1, signal: controller.signal }), { message: "Deployment ops wait was aborted." });
});
