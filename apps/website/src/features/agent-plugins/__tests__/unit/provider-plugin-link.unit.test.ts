import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";

import { bindProviderFacePorts, followProviderActivations, type ProviderFacePorts } from "@jini-ai/agent-plugins/site/provider-plugin-link";
import { linkedProviderOf } from "@jini-ai/agent-plugins/core/provider-plugin-link";
import { AgentPluginLinkedError, providerFaceLifecycle, warnProviderFace } from "../../provider-plugin-link.js";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "../../identity-read-policy.js";

/** @file The provider plugin's switch is the one switch; its linked agent plugin face follows it. */

const chmod = ({ root }: { root: string }) => promisify(execFile)("chmod", ["-R", "u+w", root]);
const WS = "11111111-1111-4111-8111-111111111111";
const row = (pluginId: string, enabled: boolean, workspaceId = WS) => ({ pluginId, workspaceId, version: "1.0.0", enabled, updatedAt: "2026-10-25T00:00:00.000Z" });

/** Faces in memory; `writes` records every face write so tests can see a no-op stayed a no-op. */
function fakeFaces(initial: Record<string, boolean>, links: Record<string, string>) {
  const faces = new Map(Object.entries(initial));
  const writes: [string, boolean][] = [];
  const ports: ProviderFacePorts = {
    links: async () => new Map(Object.entries(links)),
    reconcileFace: async ({ pluginId, resolveEnabled }) => {
      const enabled = await resolveEnabled();
      if (await ports.isFaceActive({ pluginId }) === enabled) return false;
      faces.set(pluginId, enabled);
      writes.push([pluginId, enabled]);
      return true;
    },
    isFaceActive: async ({ pluginId }) => faces.get(pluginId) ?? true,
  };
  return { faces, writes, ports };
}

test("a face that cannot follow logs the same [agent-plugins] server line as before the move", async (t) => {
  const lines: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { lines.push(args); });
  const failing: ProviderFacePorts = { ...fakeFaces({}, { metrics: "metrics-provider" }).ports, reconcileFace: async () => { throw new Error("disk full"); } };
  const repo = followProviderActivations({ repo: new InMemoryPluginActivationRepo(), workspaceId: WS, ports: failing, reportFollowFailure: warnProviderFace });
  await repo.save(row("metrics-provider", true));
  assert.deepEqual(lines, [["[agent-plugins] the assistant face of 'metrics-provider' could not follow it; the next start retries: disk full"]]);
});

test("the linked-face refusal names the provider plugin's real switch", async () => {
  const { ports } = fakeFaces({}, { metrics: "metrics-provider" });
  assert.equal(await linkedProviderOf({ ports, pluginId: "metrics" }), "metrics-provider");
  assert.equal(await linkedProviderOf({ ports, pluginId: "other" }), undefined);
  const error = new AgentPluginLinkedError({ pluginId: "metrics", providerPluginId: "metrics-provider" });
  assert.equal(error.code, "AGENT_PLUGIN_LINKED");
  assert.match(error.message, /'metrics' is part of the 'metrics-provider' plugin.*family 'site-runtime' and pluginId 'metrics-provider'/);
});

test("a non-Error provider failure is still readable in the retry warning", (t) => {
  const lines: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { lines.push(args); });
  warnProviderFace({ pluginId: "metrics", error: "provider registry not ready" });
  assert.deepEqual(lines, [["[agent-plugins] the assistant face of 'metrics' could not follow it; the next start retries: provider registry not ready"]]);
});

test("production ports read the shipped links and switch the real activation record", async (t) => {
  const { createTovuAgentPluginLifecycle } = await import("../../lifecycle.js");
  const { resolveAgentPluginLayout } = await import("../../layout.js");
  const root = await mkdtemp(path.join(os.tmpdir(), "tovu-provider-link-"));
  // Installed packages are read-only; make them writable so the temp tree can be removed.
  t.after(async () => { await chmod({ root }); await rm(root, { recursive: true, force: true }); });
  const sourceRoot = path.join(root, "bundled");
  for (const name of ["posthog", "sentry", "opentelemetry", "vercel"]) await cp(agentPluginSourceDir({ pluginId: name }), path.join(sourceRoot, name), { recursive: true });
  const layout = resolveAgentPluginLayout({ siteDir: root }, { env: {} });
  await createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: sourceRoot }).seedBundledAgentPlugins({ layout, workspaceId: "ws", sourceRoot });
  const ports = bindProviderFacePorts({ workspaceRoot: () => layout.forWorkspace({ workspaceId: "ws" }).root, ...providerFaceLifecycle });
  const links = await ports.links({});
  assert.deepEqual([...links].filter(([face]) => ["posthog", "sentry", "opentelemetry"].includes(face)).sort(),
    [["opentelemetry", "observability-opentelemetry"], ["posthog", "analytics-posthog"], ["sentry", "observability-sentry"]]);
  assert.equal(links.has("vercel"), false);
  assert.equal(await ports.isFaceActive({ pluginId: "posthog" }), false, "bundled faces seed inactive");
  const repo = followProviderActivations({ repo: new InMemoryPluginActivationRepo(), workspaceId: WS, ports, reportFollowFailure: warnProviderFace });
  await repo.save(row("analytics-posthog", true));
  // These shipped faces are "Soon" plugins (`soon-lock.ts`, owner 2026-11-10): locked off, so the
  // real record stays off even when the provider plugin is switched on.
  assert.equal(await ports.isFaceActive({ pluginId: "posthog" }), false);
  assert.equal(await ports.isFaceActive({ pluginId: "sentry" }), false);
});


test("a delayed older mirror reads current provider state inside the lifecycle owner", async (t) => {
  const { agentPluginActivations } = await import("../../activation-effects.js");
  for (const finalEnabled of [false, true]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "tovu-provider-race-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: root, pluginId: "face", enabled: finalEnabled, actor: "test" });
    const bound = bindProviderFacePorts({ workspaceRoot: () => root, ...providerFaceLifecycle });
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let scans = 0;
    const ports = { ...bound, links: async () => {
      if (++scans === 1) { started.resolve(); await release.promise; }
      return new Map([["face", "provider"]]);
    } };
    const repo = followProviderActivations({ repo: new InMemoryPluginActivationRepo(), workspaceId: WS, ports, reportFollowFailure: warnProviderFace });
    const earlier = repo.save(row("provider", !finalEnabled));
    await started.promise;
    await repo.save(row("provider", finalEnabled));
    release.resolve();
    await earlier;
    assert.equal((await repo.getActivation({ workspaceId: WS, pluginId: "provider" }))?.enabled, finalEnabled);
    assert.equal(await bound.isFaceActive({ pluginId: "face" }), finalEnabled);
  }
});

test("link discovery selects the bundled revision, honors removed links, and refuses ambiguous revisions", async () => {
  const installed = [
    { pluginId: "face", archiveDigest: "old", packageRoot: "/old" },
    { pluginId: "face", archiveDigest: "current", packageRoot: "/current" },
    { pluginId: "custom", archiveDigest: "a", packageRoot: "/custom-a" },
    { pluginId: "custom", archiveDigest: "b", packageRoot: "/custom-b" },
  ] as unknown as Awaited<ReturnType<typeof import("../../lifecycle.js").listInstalledPlugins>>;
  let removed = false;
  let ambiguous = false;
  const reads: string[] = [];
  const ports = bindProviderFacePorts({ workspaceRoot: () => "/workspace", activations: providerFaceLifecycle.activations, catalog: { preferBundled: providerFaceLifecycle.catalog.preferBundled,
    list: async () => ambiguous ? installed : installed.filter(plugin => plugin.pluginId === "face"),
    bundled: async () => new Map([["face", "current"]]),
    read: async ({ plugin, filename }) => {
      assert.equal(filename, "plugin.json");
      reads.push(plugin.packageRoot);
      return JSON.stringify({ extensions: { tovu: removed ? {} : { providerPlugin: plugin.packageRoot === "/current" ? "current-provider" : "stale-provider" } } });
    },
  } }, TOVU_AGENT_PLUGIN_IDENTITY_READ);
  assert.deepEqual([...(await ports.links({}))], [["face", "current-provider"]]);
  removed = true;
  assert.deepEqual([...(await ports.links({}))], []);
  assert.deepEqual(reads, ["/current", "/current"]);
  ambiguous = true;
  await assert.rejects(ports.links({}), { message: "Agent Plugin 'custom' matches 2 installed packages — refusing to guess which one to use" });
});
