import assert from "node:assert/strict";
import test from "node:test";
import { parseDeployOpsFile } from "../registry.js";
import { boundContext, runDeploy, waitForDeployOps, MAX_RESPONSE_CHARS } from "../run-ops.js";
import { runSetSecret, runUnsetSecret, type SecretConfirm } from "../secrets.js";
import { buildDeployOpsRegistrations } from "../tool-registrations.js";
import type { DeployOpsModule, DeployOpsStatus, DeployOpsDeployResult, DeployOpsSecretRead } from "../types.js";
import { fixture, execution } from "./ops-fixture.js";

const entry = { id: "example", label: "Example", module: "ops/main.mjs", hosts: ["api.example.test"] };
test("L041 manifest guards preserve refusal order and contained-path rules", () => {
  for (const [raw, reason] of [
    ["{", "not valid JSON"], ["null", "schemaVersion must be 1"],
    [JSON.stringify({ schemaVersion: 1, platforms: {} }), "platforms must be an array of at most 32 entries"],
    [JSON.stringify({ schemaVersion: 1, platforms: Array(33).fill(entry) }), "platforms must be an array of at most 32 entries"],
    [JSON.stringify({ schemaVersion: 1, platforms: [null] }), "platforms[0] must be an object"],
    ...[undefined, 42, "UPPER", "a".repeat(65)].map(id => [JSON.stringify({ schemaVersion: 1, platforms: [{ ...entry, id }] }), "platforms[0].id must be a lowercase hyphenated id"]),
    ...[undefined, 42, " ", "x".repeat(101)].map(label => [JSON.stringify({ schemaVersion: 1, platforms: [{ ...entry, label }] }), "platforms[0].label must be a non-empty string"]),
    ...[undefined, 42, "a.js", "/a.mjs", "a\\b.mjs", "../a.mjs", "./a.mjs", "a//b.mjs"].map(module => [JSON.stringify({ schemaVersion: 1, platforms: [{ ...entry, module }] }), "platforms[0].module must be a contained relative .mjs path"]),
    ...[null, [], Array(9).fill("api.example.test"), ["https://api.example.test"], [1], ["x".repeat(254)]].map(hosts => [JSON.stringify({ schemaVersion: 1, platforms: [{ ...entry, hosts }] }), "platforms[0].hosts must be a non-empty array of HTTPS hostnames"]),
    [JSON.stringify({ schemaVersion: 1, platforms: [entry, { ...entry, label: "" }] }), "platforms[1].id 'example' is declared twice"],
  ]) assert.deepEqual(parseDeployOpsFile(raw!), { ok: false, reason });
  assert.deepEqual(parseDeployOpsFile(JSON.stringify({ schemaVersion: 1, platforms: [entry] })), { ok: true, descriptors: [entry] });
  assert.deepEqual(parseDeployOpsFile('{"schemaVersion":1,"platforms":[]}'), { ok: true, descriptors: [] });
});

async function fakePlatform({ module }: { module: Partial<DeployOpsModule> }, _options = {}) {
  const f = await fixture();
  const platform = { ...f.registry.get("fly")!, module: { ...f.registry.get("fly")!.module, ...module } };
  const registry = { ...f.registry, get: () => platform, list: () => [platform] };
  return { ...f, platform, deps: { ...f.deps, deployOpsRegistry: registry, loadDeployOps: async () => registry } };
}
const input = { platform: "fly", target: "shop", name: "KEY", source: { kind: "typed" as const } };
const value = ["private", "fixture", "value"].join(":");

test("L041 bound facade retains URL gates, JSON parsing and transport clipping", async () => {
  const f = await fakePlatform({ module: {} });
  const ctx = await boundContext(f.deps, f.platform, undefined);
  for (const url of ["bad url", "http://api.machines.dev/", "https://user@api.machines.dev/", "https://user:pass@api.machines.dev/", "https://api.machines.dev:444/", "https://other.test/"]) {
    await assert.rejects(ctx.get(url), { name: "ToolInputError" });
  }
  assert.equal(f.calls.length, 0);
  for (const [bodyText, json] of [["null", null], ["false", false], ["{}", {}], ["plain logs", undefined]] as const) {
    f.setResponse({ status: 200, headers: {}, bodyText });
    assert.deepEqual(await ctx.get("https://api.machines.dev/"), { status: 200, text: bodyText, truncated: false, ...(json !== undefined ? { json } : {}) });
  }
  f.setResponse({ status: 200, headers: {}, bodyText: " ".repeat(MAX_RESPONSE_CHARS) + "{}" });
  assert.deepEqual(await ctx.get("https://api.machines.dev/"), { status: 200, text: " ".repeat(MAX_RESPONSE_CHARS), truncated: true });
  await ctx.send({ method: "PUT", url: "https://api.machines.dev/" });
  assert.equal(f.calls.at(-1).body, undefined);
});

test("L041 deploy normalization clips optional fields and drops unsafe URLs", async () => {
  const result: DeployOpsDeployResult = { platform: "spoof", target: "spoof", started: true, summary: "x".repeat(2001), runId: "001", sha: "s".repeat(2001), image: "i".repeat(2001), machineIds: Array(33).fill("m".repeat(2001)), url: "https://example.test/" };
  const f = await fakePlatform({ module: { deploy: async () => result } });
  const request = { platform: "fly", target: "shop" };
  assert.deepEqual(await runDeploy({ deps: f.deps, input: request }), { ...request, started: true, summary: "x".repeat(2000), runId: "001", sha: "s".repeat(2000), image: "i".repeat(2000), machineIds: Array(32).fill("m".repeat(2000)), url: result.url });
  delete result.runId; delete result.sha; delete result.image; delete result.machineIds; result.url = "http://example.test/";
  assert.deepEqual(await runDeploy({ deps: f.deps, input: request }), { ...request, started: true, summary: "x".repeat(2000) });
});

test("L041 comparison preserves readable, absent, malformed and unreadable fallbacks", async () => {
  const reads: Array<DeployOpsSecretRead | undefined | Error> = [{ value }, { value: value + "other" }, { absent: true }, undefined, new Error("unreadable")];
  for (const read of reads) {
    for (const present of [false, true]) {
      let writes = 0; let confirmations = 0;
      const f = await fakePlatform({ module: {
        readSecret: async () => { if (read instanceof Error) throw read; return read as unknown as DeployOpsSecretRead; },
        listSecrets: async () => ({ secrets: present ? [{ name: "KEY", digest: "v1" }] : [] }),
        setSecret: async () => { writes++; return { version: 1 }; },
      } });
      const result = await runSetSecret({ deps: f.deps, input }, { typedValue: value, confirm: async () => { confirmations++; return { confirmed: true }; } });
      const comparison = read instanceof Error || read === undefined ? present ? "unknown" : "absent" : "value" in read ? read.value === value ? "same" : "different" : "absent";
      assert.equal(result.comparison, comparison); assert.equal(writes, comparison === "same" ? 0 : 1);
      assert.equal(confirmations, comparison === "unknown" || comparison === "different" ? 1 : 0);
    }
  }
});

test("L041 truncated secret listing requires confirmation for an unlisted name", async () => {
  let writes = 0;
  const f = await fakePlatform({ module: { readSecret: undefined, listSecrets: async () => ({ secrets: [], truncated: true }), setSecret: async () => { writes++; return {}; } } });
  await assert.rejects(runSetSecret({ deps: f.deps, input }, { typedValue: value }), { name: "ToolInputError" });
  assert.equal(writes, 0);
  const declined = await runSetSecret({ deps: f.deps, input }, { typedValue: value, confirm: async request => {
    assert.equal(request.action, "overwrite");
    assert.equal(request.comparison, "unknown");
    return { confirmed: false, result: { cancelled: true, note: "declined" } };
  } });
  assert.equal(declined.comparison, "unknown");
  assert.equal(declined.changed, false);
  assert.equal(writes, 0);
  const confirmed = await runSetSecret({ deps: f.deps, input }, { typedValue: value, confirm: async request => {
    assert.equal(request.comparison, "unknown");
    assert.equal(writes, 0, "the overwrite waits for confirmation");
    return { confirmed: true };
  } });
  assert.equal(confirmed.comparison, "unknown");
  assert.equal(confirmed.changed, true);
  assert.equal(writes, 1);
});

test("L041 dry runs, same values, cancellation and abort preserve write guards", async () => {
  for (const current of [undefined, { value }, { value: value + "other" }] as const) {
    const f = await fakePlatform({ module: { readSecret: async () => current as unknown as DeployOpsSecretRead, listSecrets: async () => ({ secrets: [] }), setSecret: async () => { assert.fail("dry run wrote"); } } });
    const result = await runSetSecret({ deps: f.deps, input: { ...input, dryRun: true } }, { typedValue: value });
    assert.equal(result.changed, false); assert.equal(result.deployNeeded, false);
    assert.equal(result.dryRun, current?.value === value ? undefined : true);
  }
  for (const mode of ["decline", "abort", "missing"] as const) {
    const controller = new AbortController();
    const f = await fakePlatform({ module: { readSecret: async () => ({ value: value + "other" }), setSecret: async () => { assert.fail("guard bypassed"); } } });
    const confirm: SecretConfirm | undefined = mode === "missing" ? undefined : async () => { if (mode === "abort") { controller.abort(); return { confirmed: true }; } return { confirmed: false, result: { cancelled: true, note: "declined" } }; };
    const pending = runSetSecret({ deps: f.deps, input }, { typedValue: value, confirm, signal: controller.signal });
    if (mode === "decline") assert.equal((await pending).cancelled, true); else await assert.rejects(pending, { name: "ToolInputError" });
  }
});

test("L041 removal needs a version, approval and an unchanged snapshot", async () => {
  for (const mode of ["absent", "truncated", "unversioned", "declined", "changed", "abort", "accepted"] as const) {
    let lists = 0; let removed = 0; const controller = new AbortController();
    const f = await fakePlatform({ module: {
      listSecrets: async () => ({ secrets: mode === "absent" || mode === "truncated" ? [] : [{ name: "KEY", ...(mode === "unversioned" ? {} : { updatedAt: mode === "changed" && ++lists > 1 ? "v2" : "v1" }) }], truncated: mode === "truncated" }),
      unsetSecret: async () => { removed++; return { version: "2" }; },
    } });
    const pending = runUnsetSecret({ deps: f.deps, input }, { signal: controller.signal, confirm: async () => { if (mode === "abort") controller.abort(); return mode === "declined" ? { confirmed: false, result: { cancelled: true, note: "declined" } } : { confirmed: true }; } });
    if (["truncated", "unversioned", "changed", "abort"].includes(mode)) await assert.rejects(pending, { name: "ToolInputError" });
    else assert.equal((await pending).removed, mode === "accepted");
    assert.equal(removed, mode === "accepted" ? 1 : 0);
  }
});

test("L041 wait handles zero deadline, late observations and reader errors", async () => {
  const observation: DeployOpsStatus = { platform: "fly", target: "shop", state: "healthy", summary: "ok", items: [], checkedAt: "" };
  let now = 0; let polls = 0;
  const clock = { now: () => now, sleep: async (ms: number) => { now += ms; } };
  const zero = await waitForDeployOps({ clock, status: async () => { assert.fail("zero deadline polled"); } }, { until: "healthy", timeoutSeconds: 0 });
  assert.equal(zero.reached, false); assert.equal(zero.polls, 0);
  const late = await waitForDeployOps({ clock, status: async () => { polls++; now = 10001; return observation; } }, { until: "healthy", timeoutSeconds: 10 });
  assert.deepEqual(late, { reached: false, waitedSeconds: 10, polls: 1, last: observation });
  const error = new Error("reader refused");
  await assert.rejects(waitForDeployOps({ clock, status: async () => { throw error; } }, { until: "finished", timeoutSeconds: 10 }), error);
  assert.equal(polls, 1);
});

test("L041 closed tool inputs retain source shapes, selectors and setup diagnostic", async () => {
  const f = await fixture(); const tools = new Map(buildDeployOpsRegistrations(f.deps).map(tool => [tool.descriptor.id, tool]));
  const set = tools.get("deployment_ops_set_secret")!;
  for (const source of [null, [], "typed", { kind: "typed", value }, { kind: "site-key", extra: true }, { kind: "secret" }, { kind: "secret", name: 1 }, { kind: "other" }]) {
    await assert.rejects(set.handler(execution({ ...input, source })), { message: "source must be {kind:'typed'}, {kind:'site-key'} or {kind:'secret', name}." });
  }
  await assert.rejects(set.handler(execution({ ...input, dryRun: "yes" })), { message: "dryRun must be a boolean." });
  for (const id of ["deployment_ops_status", "deployment_ops_logs", "deployment_ops_list_targets", "deployment_ops_wait", "deployment_ops_deploy"]) {
    // why: list_targets never accepted `target` (its closed keys are platform/credentialLabel/org), so only the others send one.
    const selector = id === "deployment_ops_list_targets" ? {} : { target: "shop" };
    await assert.rejects(tools.get(id)!.handler(execution({ platform: "fly", ...selector, unexpected: true })), { message: "Unexpected deployment ops input 'unexpected'." });
  }
  const missing = await fixture([]);
  const status = buildDeployOpsRegistrations(missing.deps).find(tool => tool.descriptor.id === "deployment_ops_status")!;
  assert.equal((await status.handler(execution({ platform: "fly", target: "shop" })) as { executed: boolean }).executed, false);
  assert.equal(f.calls.length, 0);
});


test("L041 private typed values preserve exact bytes and reject unusable values", async () => {
  let written: string | undefined;
  const f = await fakePlatform({ module: { readSecret: async () => ({ absent: true }), setSecret: async (_ctx, request) => { written = request.value; return {}; } } });
  for (const typedValue of [undefined, null, 42, " ", "x".repeat(8193)]) {
    await assert.rejects(runSetSecret({ deps: f.deps, input }, { typedValue }), { message: "The secure form requires a non-blank secret of at most 8192 characters." });
  }
  assert.equal(written, undefined);
  const typedValue = "  " + value + "\r\nsecond line  ";
  const result = await runSetSecret({ deps: f.deps, input }, { typedValue });
  assert.equal(written, typedValue); assert.equal(JSON.stringify(result).includes(typedValue), false);
});

test("L041 an aborted secret read rethrows its error without falling back to a list", async () => {
  const controller = new AbortController(); const error = new Error("read cancelled");
  const f = await fakePlatform({ module: {
    readSecret: async () => { controller.abort(); throw error; },
    listSecrets: async () => { assert.fail("aborted comparison fell back to listing"); },
    setSecret: async () => { assert.fail("aborted comparison wrote"); },
  } });
  await assert.rejects(runSetSecret({ deps: f.deps, input }, { typedValue: value, signal: controller.signal }), error);
});
