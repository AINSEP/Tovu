import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { loadDeployOpsRegistryFromSource } from "../registry.js";
import { runListSecrets, runSetSecret } from "../secrets.js";
import { fixture } from "./example-ops-fixture.js";

/**
 * The generic secrets verbs against small scripted adapter modules, so the adapter-shaped edge cases
 * (malformed listings, numeric versions, read-less adapters, secrets-less registries) are exact.
 */
const MANIFEST = (id: string) => ({ id, label: id, module: `${id}.mjs`, hosts: ["api.example-host.dev"] });
const CAPS = 'secretCapabilities: { appliesOn: "immediately", supportsStaging: false }';

async function withAdapters(modules: Record<string, string>, run: (deps: Record<string, unknown>) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-secrets-contract-"));
  try {
    await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: Object.keys(modules).map(MANIFEST) }));
    for (const [id, body] of Object.entries(modules)) await writeFile(path.join(root, `${id}.mjs`), body);
    const registry = await loadDeployOpsRegistryFromSource({ pluginId: "contract", packageRoot: root });
    assert.deepEqual(registry.refusals, []);
    const f = await fixture();
    await run({ ...f.deps, loadDeployOps: async () => registry, readSiteKey: () => "ab".repeat(32) });
  } finally { await forceRemove(root); }
}

test("a malformed adapter listing is refused, never echoed", async () => {
  for (const listing of ["{ secrets: [null] }", '{ secrets: [{ name: "" }] }', "{ secrets: 'all' }", "undefined"]) {
    await withAdapters({ bad: `export default { status() {}, logs() {}, async listSecrets() { return ${listing}; }, setSecret() {}, unsetSecret() {}, ${CAPS} };` }, async deps => {
      await assert.rejects(runListSecrets({ deps: deps as never, input: { platform: "bad", target: "shop" } }), { message: "Deployment ops platform 'bad' returned an invalid secret list." });
    });
  }
});

test("listing keeps only string digests and times, and reports applies-immediately without a deploy", async () => {
  await withAdapters({ ok: `export default { status() {}, logs() {}, async listSecrets() { return { secrets: [{ name: "A", digest: 7, updatedAt: null, value: "x" }] }; }, setSecret() {}, unsetSecret() {}, ${CAPS} };` }, async deps => {
    assert.deepEqual(await runListSecrets({ deps: deps as never, input: { platform: "ok", target: "shop" } }), {
      platform: "ok", target: "shop", secrets: [{ name: "A" }], truncated: false, appliesOn: "immediately", supportsStaging: false, deployNeeded: false,
    });
  });
});

test("an aborted signal refuses before loading any platform", async () => {
  let loads = 0;
  const f = await fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runListSecrets({ deps: { ...f.deps, loadDeployOps: async () => { loads++; return f.registry; } } as never, input: { platform: "example-host", target: "shop" } }, { signal: controller.signal }), { message: "Deployment ops wait was aborted." });
  assert.equal(loads, 0);
});

test("a numeric vendor version is reported as text and the write applies without a deploy step", async () => {
  const writes: unknown[] = [];
  await withAdapters({ num: `export default { status() {}, logs() {}, async listSecrets() { return { secrets: [] }; }, async setSecret(_ctx, input) { globalThis.__secretWrites.push(input.name); return { version: 42 }; }, unsetSecret() {}, ${CAPS} };` }, async deps => {
    (globalThis as { __secretWrites?: unknown[] }).__secretWrites = writes;
    const result = await runSetSecret({ deps: deps as never, input: { platform: "num", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } });
    assert.equal(result.version, "42");
    assert.equal(result.changed, true);
    assert.equal(result.comparison, "absent");
    assert.equal(result.summary, "Set 'TOVU_SITE_KEY' on 'shop' from this site's key.");
    assert.deepEqual(writes, ["TOVU_SITE_KEY"]);
  });
  delete (globalThis as { __secretWrites?: unknown[] }).__secretWrites;
});

test("copying a secret needs an adapter that can read values", async () => {
  await withAdapters({ noread: `export default { status() {}, logs() {}, listSecrets() { return { secrets: [] }; }, setSecret() { throw new Error("must not write"); }, unsetSecret() {}, ${CAPS} };` }, async deps => {
    await assert.rejects(runSetSecret({ deps: deps as never, input: { platform: "noread", target: "shop", name: "NEW_KEY", source: { kind: "secret", name: "OLD_KEY" } } }), {
      message: "Deployment ops platform 'noread' cannot read secret values, so it cannot copy one secret to another. Use source kind 'site-key'.",
    });
  });
});

test("a registry with no secrets adapters names none", async () => {
  await withAdapters({ plain: "export default { status() {}, logs() {} };" }, async deps => {
    await assert.rejects(runListSecrets({ deps: deps as never, input: { platform: "plain", target: "shop" } }), { message: "Deployment ops platform 'plain' has no secrets adapter. Platforms with one: (none)." });
  });
});
