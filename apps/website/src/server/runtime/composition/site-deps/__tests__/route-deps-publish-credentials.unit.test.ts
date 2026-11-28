import assert from "node:assert/strict";
import test from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { routeDepsPublishCredentials } from "../route-deps-publish-credentials.js";

/**
 * @file The late-bound closures `routeDepsPublishCredentials` hands the routes: the published-post
 * lister (reads `routeDeps()` at call time) and the plugin-contribution loaders, each of which must
 * forward the caller's workspace to the lifecycle's own `loadPluginContributions`. The installed
 * deploy-target loader's `readEnabled` maps the plugin's activation verdict to true / false / null.
 * Driven through the assembled deps with the real loaders behind them; only the plugin lifecycle,
 * the workspace layout and the post repo are faked.
 */

type Required = Parameters<typeof routeDepsPublishCredentials>[0];

/** The route-deps type marks these loaders optional; the assembly always supplies them. */
function need<T>(value: T | undefined, name: string): T {
  assert.ok(value, `${name} is assembled`);
  return value;
}
type Load = { workspaceId: string; contribution: string };
type Verdict = "active" | "inactive" | "undetermined";

function rig(options: { verdicts?: Verdict[]; posts?: Array<Record<string, unknown>> } = {}) {
  const loads: Load[] = [];
  const activations: Array<{ workspaceRoot: string; pluginId: string }> = [];
  const enabled: unknown[] = [];
  const repoCalls: unknown[] = [];
  const verdicts = [...(options.verdicts ?? [])];
  const agentPluginLifecycle = {
    loadPluginContributions: async (input: { workspaceId: string; definition: { contribution: string; load: (context: unknown) => unknown } }) => {
      loads.push({ workspaceId: input.workspaceId, contribution: input.definition.contribution });
      // Plays the owner: one trusted package per queued verdict runs the definition's own `load`.
      if (input.definition.contribution === "deploy targets") {
        const packages = verdicts.length;
        for (let index = 0; index < packages; index += 1) {
          const item = await input.definition.load({ plugin: { pluginId: `deploy-${index}`, packageRoot: "/nonexistent" }, descriptor: { id: `t-${index}` }, importModule: async () => "unused" });
          enabled.push((item as { enabled: unknown }).enabled);
        }
      }
      return { items: [], refusals: [] };
    },
    resolveAgentPluginActivation: async (input: { workspaceRoot: string; pluginId: string }) => {
      activations.push(input);
      return { verdict: verdicts.shift() };
    },
  };
  let workspaceId = "ws-early";
  const required = {
    resolvedSiteBinding: { name: "Bakery", dir: "/nonexistent/bakery" },
    agentPluginLayout: { forWorkspace: ({ workspaceId: id }: { workspaceId: string }) => ({ root: `/roots/${id}` }) },
    agentPluginLifecycle,
    kernel: contentKernel({ store: openContentDb(":memory:") }),
    clock: { nowIso: () => "2031-02-03T04:05:06.000Z" },
    idGen: { next: () => "id-1" },
    siteAssistantSecretKeyring: {},
    siteAssistantSecretSealer: {},
    projectVault: undefined,
    customCredentialSetRepo: {},
    observability: undefined,
    customCredentialsHttpClient: {},
    siteBackupHttpClient: {},
    mediaImportHttpClient: {},
    routeDeps: () => ({
      workspaceId,
      postRepo: { list: async (input: unknown) => { repoCalls.push(input); return options.posts ?? []; } },
    }),
  } as unknown as Required;
  const deps = routeDepsPublishCredentials(required);
  return { deps, loads, activations, enabled, repoCalls, setWorkspace: (id: string) => { workspaceId = id; } };
}

test("listPublishedPosts reads routeDeps() at call time and keeps only live public posts", async () => {
  const { deps, repoCalls, setWorkspace } = rig({ posts: [
    { id: "p1", kind: "post", status: "published" },
    { id: "p2", kind: "post", status: "draft" },
    { id: "p3", kind: "page", status: "published" },
  ] });
  setWorkspace("ws-late");
  const result = await deps.listPublishedPosts();
  assert.deepEqual(result.posts.map(post => post.id), ["p1", "p3"]);
  assert.deepEqual(repoCalls, [{ workspaceId: "ws-late" }], "the workspace bound after assembly is the one listed");
});

test("each contribution loader forwards the caller's workspace to the lifecycle's loader", async () => {
  const { deps, loads } = rig();
  await deps.loadDeployTargets({ workspaceId: "ws-a" });
  await need(deps.loadInstalledDeployTargets, "loadInstalledDeployTargets")({ workspaceId: "ws-b" });
  await need(deps.loadDeployWorkflowFiles, "loadDeployWorkflowFiles")({ workspaceId: "ws-c" });
  await need(deps.loadDeployOps, "loadDeployOps")({ workspaceId: "ws-d" });
  await deps.loadSourceControlProviders({ workspaceId: "ws-e" });
  await deps.loadPluginCredentialCards("ws-f");
  assert.deepEqual(await deps.loadAuthSchemes({ workspaceId: "ws-g" }), [], "no installed scheme plugin yields no rules");
  assert.deepEqual(loads, [
    { workspaceId: "ws-a", contribution: "deploy targets" },
    { workspaceId: "ws-b", contribution: "deploy targets" },
    { workspaceId: "ws-c", contribution: "deploy workflow declarations" },
    { workspaceId: "ws-d", contribution: "deploy ops" },
    // The provider registry reads the current descriptors, then the pre-rename ones, in the same workspace.
    { workspaceId: "ws-e", contribution: "source-control providers" },
    { workspaceId: "ws-e", contribution: "source-control providers" },
    { workspaceId: "ws-f", contribution: "mail adapters" },
    { workspaceId: "ws-g", contribution: "credential schemes" },
  ]);
});

test("installed deploy targets read each plugin's activation in its workspace: active -> true, inactive -> false, undetermined -> null", async () => {
  const { deps, activations, enabled } = rig({ verdicts: ["active", "inactive", "undetermined"] });
  await need(deps.loadInstalledDeployTargets, "loadInstalledDeployTargets")({ workspaceId: "ws-b" });
  assert.deepEqual(enabled, [true, false, null]);
  assert.deepEqual(activations, [
    { workspaceRoot: "/roots/ws-b", pluginId: "deploy-0" },
    { workspaceRoot: "/roots/ws-b", pluginId: "deploy-1" },
    { workspaceRoot: "/roots/ws-b", pluginId: "deploy-2" },
  ]);
});
