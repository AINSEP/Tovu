import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";

import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import { registerInstalledExtensionTools } from "../../server/runtime/composition/installed-extension-tools.js";
import { attachAssistantToolExtensions, type AttachAssistantToolExtensionsDeps } from "../installed-extension-tools.js";

/**
 * @file The disclosed S3 order change (`ADS-memory/.local-artifacts/design-byok-external-mcp-2026-09-24.md`
 * §2.1 item 3): `attachAssistantToolExtensions` must hand its installed-extension promise to the
 * federation runtime as `after`, so the federation boot pass never reads the roster (let alone
 * attaches) while installed-extension registration is still in flight. `external-mcp-federation-runtime.test.ts`
 * proves the runtime honors `after`; this file proves the one registrar actually wires it.
 */

function fakeRegistry(): ToolRegistry {
  const descriptors: ToolDescriptor[] = [];
  return {
    register(registration: ToolRegistration) {
      descriptors.push(registration.descriptor);
    },
    has: ({ toolId }: { toolId: string }) => descriptors.some((descriptor) => descriptor.id === toolId),
    list: () => descriptors,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise<void>((r) => setImmediate(r));
}

test("federation.start() does not read the roster until installed-extension registration settles", async () => {
  const discovery = deferred<readonly PluginDiscoveryRecord[]>();
  const reachedDiscovery = deferred<void>();
  const events: string[] = [];
  const deps = testSiteLayoutContext({
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: randomUUID(),
    postRepo: {},
    pluginActivationRepo: {},
    discoverPlugins: () => {
      events.push("discoverPlugins");
      reachedDiscovery.resolve();
      return discovery.promise;
    },
    registerInstalled: registerInstalledExtensionTools,
    federation: {
      deps: testSiteLayoutContext({ authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: "ws-order" }),
      resolveConnections: async () => {
        events.push("resolveConnections");
        return [];
      },
    },
  }) as unknown as AttachAssistantToolExtensionsDeps;

  const extensions = attachAssistantToolExtensions(fakeRegistry(), deps, "[order-test]");
  const started = extensions.federation.start();
  // The agent-plugin and skill families read disk first, so wait for the capability family to be
  // mid-flight (the last installed-extension step) before asserting federation has not moved.
  await reachedDiscovery.promise;
  await flushMicrotasks();

  assert.deepEqual(events, ["discoverPlugins"], "the federation boot pass must wait for installed-extension registration");
  assert.equal(extensions.federation.started, false);

  discovery.resolve([]);
  await extensions.installed;
  await started;

  assert.deepEqual(events, ["discoverPlugins", "resolveConnections"]);
  assert.equal(extensions.federation.started, true);
});

test("an injected federation connect is the one the boot pass uses for each resolved connection", async () => {
  const { FEDERATED_CONNECTION_DEFAULTS } = await import("@jini-ai/mcp/federation");
  const connected: string[] = [];
  const connection = {
    config: { connectionId: "conn-injected", label: "Injected", allowedToolNames: [], writeAllowedToolNames: [],
      connectTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.connectTimeoutMs, callTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
      maxResultBytes: FEDERATED_CONNECTION_DEFAULTS.maxResultBytes, maxTools: FEDERATED_CONNECTION_DEFAULTS.maxTools },
    launch: { url: "https://example.invalid/conn-injected", headers: {} },
  };
  const deps = testSiteLayoutContext({
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: randomUUID(),
    postRepo: {},
    pluginActivationRepo: {},
    discoverPlugins: async () => [],
    registerInstalled: registerInstalledExtensionTools,
    federation: {
      deps: testSiteLayoutContext({ authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: "ws-connect" }),
      resolveConnections: async () => [connection],
      connect: async (resolved: { config: { connectionId: string } }) => {
        connected.push(resolved.config.connectionId);
        throw new Error("injected connect refuses");
      },
    },
  }) as unknown as AttachAssistantToolExtensionsDeps;

  const extensions = attachAssistantToolExtensions(fakeRegistry(), deps, "[connect-test]");
  await extensions.installed;
  await extensions.federation.start();
  assert.deepEqual(connected, ["conn-injected"]);
});
