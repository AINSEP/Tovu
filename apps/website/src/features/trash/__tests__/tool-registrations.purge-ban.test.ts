import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";

import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { isMcpUiToolCallPermitted } from "#src/assistant/mcp-ui-tool-calls";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/** Owner Q1 (2026-10-01) supersedes the purge ban: permanent deletion is callable only
 * through an authenticated human confirmation exchange. The handler suite probes bypasses. */
const IDS = [
  "trash_empty", "trash_purge_item", "media_purge_asset", "comments_purge_comment",
  "identity_user_delete", "external_mcp_delete", "custom_credential_delete",
  "deployment_delete_provider_credential", "source_control_delete_credential",
];

for (const id of IDS) {
  test(`${id} is registered as a durable mutation and its card can answer only an open exchange`, () => {
    contributions.contributors.clear({});
    installFirstPartyToolContributors({ contributions });
    const registration = buildAssistantToolRegistrations(createRouteDeps(), undefined, { contributions }).find(r => r.descriptor.id === id);
    assert.ok(registration, `Missing confirmed permanent-delete tool: ${id}`);
    assert.equal(registration.descriptor.readOnly, false);
    assert.equal(isMcpUiToolCallPermitted(id, true), true);
    assert.equal(isMcpUiToolCallPermitted(id, false), false, "a callback must never execute a new delete call");
    const schema = registration.descriptor.inputSchema as { additionalProperties: boolean; properties: Record<string, unknown> };
    assert.equal(schema.additionalProperties, false);
    for (const field of ["confirmed", "decision", "__exchangeId", "confirmationToken"]) {
      assert.equal(field in schema.properties, false, `the agent cannot supply ${field}`);
    }
  });
}

// The old capability ban becomes a behavioral proof through the real manifest/host adapter.
// A fake Trash port is the effect seam; catalog/handler/confirmation wiring remain production.
for (const [id, input] of [
  ["trash_empty", {}], ["trash_purge_item", { trashItemId: "row-1" }],
  ["identity_user_delete", { principalId: "target-user" }],
] as const) {
  test(`${id}: real composition cannot reach purgeSelected without a human click`, async () => {
    const { createSurfaceExchangeStore } = await import("#src/contracts/core/tool-surface-exchanges");
    const store = createSurfaceExchangeStore();
    const deps = createRouteDeps();
    let purges = 0;
    const item = {
      id: "row-1", workspaceId: deps.workspaceId, entityType: "user", entityId: "target-user",
      displayTitle: "Target user", displaySubtitle: null, entityVersion: null, priorMarker: "active",
      actorPrincipalId: "owner", actorPluginId: null, trashedAt: "2026-10-01T00:00:00Z", purgeAfter: "2026-12-01T00:00:00Z",
    };
    const routeDeps = {
      ...deps, ownerPrincipalId: Promise.resolve("seeded-owner"),
      authorize: async () => ({ allowed: true, reason: "matched" }),
      trash: { ...deps.trash, list: async () => ({ items: [item], nextCursor: null }), purgeSelected: async (spec: Parameters<typeof deps.trash.purgeSelected>[0]) => {
        assert.equal(await spec.authorizeItem(item), true);
        assert.deepEqual(spec.ids, ["row-1"]);
        purges++;
        return { purged: 1, results: [{ id: "row-1", outcome: "purged" as const }] };
      } },
    };
    const registration = buildAssistantToolRegistrations(routeDeps, { surfaceExchanges: store }, { contributions }).find(r => r.descriptor.id === id)!;
    const ctx = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal };
    await assert.rejects(registration.handler(ctx), { message: `PERMANENT_DELETE_NO_CONFIRMATION_CHANNEL: ${id}: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.` });
    assert.equal(purges, 0);
    assert.deepEqual(await registration.handler({ ...ctx }, { emitSurface: async () => {
      assert.equal(purges, 0);
      const exchangeId = store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!;
      store.deliver({ exchangeId, principalId: "owner", toolId: id, params: { decision: "cancel" } });
    } }), { removed: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
    assert.equal(purges, 0);
    assert.deepEqual(await registration.handler({ ...ctx }, { emitSurface: async () => {
      assert.equal(purges, 0);
      const exchangeId = store.findTypedAnswerTarget({ principalId: "owner", toolId: id })!;
      store.deliver({ exchangeId, principalId: "owner", toolId: id, params: { decision: "confirm" } });
    } }), { removed: true, purged: 1, results: [{ id: "row-1", outcome: "purged" }] });
    assert.equal(purges, 1);
  });
}

test("new purge capabilities cannot enter the catalog outside the reviewed confirmed-delete set", () => {
  const registrations = buildAssistantToolRegistrations(createRouteDeps(), undefined, { contributions });
  const unreviewed = registrations.map(r => r.descriptor.id)
    .filter(id => /purge|hard_?delete|permanently/i.test(id) && !IDS.includes(id));
  assert.deepEqual(unreviewed, [], "A new permanent-purge capability must join the confirmed-call contract tests.");
});
