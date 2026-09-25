import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";

import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery.js";
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
    has: (toolId: string) => descriptors.some((descriptor) => descriptor.id === toolId),
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
  const deps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: randomUUID(),
    postRepo: {},
    pluginActivationRepo: {},
    discoverPlugins: () => {
      events.push("discoverPlugins");
      reachedDiscovery.resolve();
      return discovery.promise;
    },
    federation: {
      deps: { authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: "ws-order" },
      resolveConnections: async () => {
        events.push("resolveConnections");
        return [];
      },
    },
  } as unknown as AttachAssistantToolExtensionsDeps;

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
