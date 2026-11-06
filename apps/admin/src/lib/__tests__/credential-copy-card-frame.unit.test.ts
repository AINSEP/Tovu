import { setImmediate } from "node:timers";
import { expect, it } from "vitest";
import { createFakeClock } from "../../../../website/src/__tests__/support/fake-clock.js";
import type { SurfaceEmission } from "@jini-ai/core";
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";
import { buildCredentialCopyRegistrations, CREDENTIAL_COPY_TOOL_ID, type CredentialCopyToolDeps } from "../../../../website/src/features/custom-credentials/credential-copy-tool.js";
import { createProjectKeys } from "../../../../website/src/features/project-keys/service.js";
import { fakeAttachments, vaultRow } from "../../../../website/src/features/project-keys/__tests__/helpers.js";

const turn = () => new Promise<void>(resolve => setImmediate(resolve));

// Shared Keys grants a reference through one card; the legacy copy/upgrade screens no longer exist.
it.each([false, true])("saved-key cards grow from content rather than reserving blank frame space (approve=%s)", async approve => {
  const surfaceExchanges = createSurfaceExchangeStore({
    clock: createFakeClock({ startIso: "2026-10-11T00:00:00Z" }),
    idGenerator: { newId: () => "copy-frame" }, defaultChannel: "mcp-ui",
    scheduler: { schedule: () => () => {} },
  });
  const resources: UIResource[] = [];
  const vault = new InMemoryVaultRepo({});
  const attachments = fakeAttachments();
  const key = vaultRow({ id: "one" });
  await vault.put({ record: key, expectedRevision: null });
  const deps: CredentialCopyToolDeps = {
    workspaceId: "target", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => ({ allowed: true, reason: "matched" }), gatedMutations: { gatewayDeps: {} },
    projectKeys: createProjectKeys({ vault, attachments, siteId: "target", siteName: "Target",
      providerUsage: async () => ({ store: "project", usedByThisSite: false, usedBy: [] }),
      reapply: async () => "now", transaction: async ({ run }) => run() }),
  };
  const tool = buildCredentialCopyRegistrations({ deps, surfaces: { surfaceExchanges } })[0]!;
  const emitSurface = async (emission: SurfaceEmission) => { resources.push((emission.payload as { resource: UIResource }).resource); };
  const pending = tool.handler({ executionId: "frame-test", run: { id: "run" }, input: {}, principal: { id: "owner" }, signal: new AbortController().signal }, { emitSurface });
  const answer = (params: Record<string, unknown>) => surfaceExchanges.deliver({ exchangeId: "copy-frame", principalId: "owner", params },
    { toolId: CREDENTIAL_COPY_TOOL_ID, channel: "mcp-ui" });
  await turn();
  expect(resources[0]!.resource.text).toContain("Use a saved key or connection on this site");
  expect(resources[0]!.resource.text).toContain("Production");
  expect(answer(approve ? { credentialId: "one" } : { [SURFACE_DISMISSED_PARAM]: true })).toEqual({ ok: true });
  expect(await pending).toEqual(approve ? { granted: true, credentialId: "one" } : { granted: false });
  expect(await attachments.isAttached({ siteId: "target", keyId: "one" })).toBe(approve);
  expect(await vault.find({ workspaceId: "project", id: "one" })).toEqual(key);
  expect(resources).toHaveLength(1);
  for (const resource of resources) {
    expect(resource.resource._meta?.["mcpui.dev/ui-preferred-frame-size"]).toEqual(["100%", "1px"]);
    // Execute the emitted bridge: frame metadata alone cannot prove a short iframe shrinks.
    const script = resource.resource.text.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    type Message = { id?: string; method?: string; params?: { height?: number } };
    const posted: Message[] = [];
    let receive!: (event: { data: unknown }) => void;
    let resize!: () => void;
    let contentHeight = 212;
    const body = { getBoundingClientRect: () => ({ height: contentHeight }) };
    const document = { documentElement: { scrollHeight: 377, setAttribute: () => {} }, body };
    const window = { parent: { postMessage: (message: Message) => posted.push(message) },
      addEventListener: (_type: string, listener: typeof receive) => { receive = listener; } };
    class Observer {
      constructor(callback: () => void) { resize = callback; }
      observe(target: unknown) { expect(target).toBe(body); }
    }
    new Function("window", "document", "ResizeObserver", script!)(window, document, Observer);
    receive({ data: { jsonrpc: "2.0", id: posted[0]!.id, result: {} } });
    await Promise.resolve();
    await Promise.resolve();
    expect(posted.at(-1)).toMatchObject({ method: "ui/notifications/size-changed", params: { height: 212 } });
    contentHeight = 165;
    resize();
    expect(posted.at(-1)!.params).toEqual({ height: 165 });
  }
  expect(surfaceExchanges.size()).toBe(0);
});
