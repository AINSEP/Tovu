import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { buildPermanentDeleteRegistrations } from "../tool-registrations.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { RouteDeps } from "#src/server/routes/types";
import type { TrashItem } from "@jini-ai/cms/trash";
import { buildPermanentDeleteDeps } from "#src/server/runtime/composition/permanent-delete-deps";
import { InMemoryPrincipalRepo, InMemoryPrincipalRoleRepo, InMemoryPrincipalPolicyRepo, InMemoryRoleRepo,
  InMemoryRolePolicyRepo, InMemoryPolicyPermissionRepo } from "@jini-ai/user-management/server";
import type { PrincipalRecord } from "@jini-ai/user-management";

const row = (id: string, entityType = "post", entityId = `entity-${id}`): TrashItem => ({
  id, workspaceId: "ws", entityType, entityId, trashedAt: "2026-10-01T00:00:00Z", purgeAfter: "2026-12-01T00:00:00Z",
  actorPrincipalId: "owner", actorPluginId: null, displayTitle: `Title ${id}`, displaySubtitle: null, entityVersion: 1, priorMarker: null,
});
function harness(initial: TrashItem[] = [row("a")]) {
  let items = initial;
  let record: Record<string, unknown> | null = { id: "target", label: "Saved credential", updatedAt: "v1", sealed: { ciphertext: "SECRET" }, vendorId: "hosting" };
  let allowed = true;
  let mediaReferenceState: boolean | Error = false;
  const effects: unknown[] = [];
  const permissions: string[] = [];
  const repo = {
    findById: async (spec: unknown) => { effects.push({ read: spec }); return record; },
    delete: async (spec: unknown) => { effects.push({ deleted: spec }); record = null; },
  };
  let media: Record<string, unknown> | null = { id: "target", title: "Test photo", status: "trashed", source: { sha256: "hash" } };
  // Account protection now reads the real target and effective grants. Seed both owners and the
  // disabled principals behind user Trash rows so missing-fixture errors cannot mask those guards.
  const principalIds = new Set(["owner", "seeded-owner", "live-user", ...initial.filter(item => item.entityType === "user").map(item => item.entityId)]);
  const principalRepo = new InMemoryPrincipalRepo({}, { initialRows: [...principalIds].map((id): PrincipalRecord => ({
    id, workspaceId: "ws", kind: "user", displayName: id,
    status: ["owner", "seeded-owner", "live-user"].includes(id) ? "active" : "disabled", createdAt: "2026-10-01T00:00:00Z",
  })) });
  const routeDeps = {
    workspaceId: "ws", clock: { nowIso: () => "2026-10-01T00:00:00Z" }, registry: new Map(), ownerPrincipalId: Promise.resolve("seeded-owner"),
    authorize: async (spec: { permission: string }) => { permissions.push(spec.permission); return { allowed, reason: "test-policy" }; },
    trash: {
      list: async (spec: { limit: number }, optional: { entityTypes?: string[]; cursor?: string | null } = {}) => {
        const matches = optional.entityTypes ? items.filter(i => optional.entityTypes!.includes(i.entityType)) : items;
        const start = optional.cursor ? Number(optional.cursor) : 0;
        return { items: matches.slice(start, start + spec.limit), nextCursor: start + spec.limit < matches.length ? String(start + spec.limit) : null };
      },
      purgeSelected: async (spec: { ids: string[]; authorizeItem: (i: { item: TrashItem }) => Promise<boolean>; actor: unknown; workspaceId: string }) => {
        const results = [];
        for (const id of spec.ids) {
          const item = items.find(i => i.id === id);
          const outcome = !item ? "not-found" : await spec.authorizeItem({ item }) ? "purged" : "forbidden";
          results.push({ id, outcome });
          if (outcome === "purged") { effects.push({ purge: id, workspaceId: spec.workspaceId, actor: spec.actor }); items = items.filter(i => i.id !== id); }
        }
        return { purged: results.filter(r => r.outcome === "purged").length, results };
      },
    },
    customCredentialSetRepo: repo, sourceControlCredentialSetRepo: repo, vendorCredentialSetRepo: repo,
    principalRepo,
    principalRoleRepo: new InMemoryPrincipalRoleRepo({}), roleRepo: new InMemoryRoleRepo({}), rolePolicyRepo: new InMemoryRolePolicyRepo({}),
    principalPolicyRepo: new InMemoryPrincipalPolicyRepo({}, { initialRows: ["owner", "seeded-owner"].map(principalId => ({
      id: `${principalId}-grant`, workspaceId: "ws", principalId, policyId: "owner-policy",
    })) }),
    policyPermissionRepo: new InMemoryPolicyPermissionRepo({}, { initialRows: [{ id: "owner-wildcard", workspaceId: "ws", policyId: "owner-policy", permission: "*" }] }),
    loadDeployTargets: async () => ({ list: () => [{ descriptor: { id: "host", credential: { vendorId: "hosting" } } }] }),
    externalMcpServerRepo: {
      findByServerId: async () => record,
      deleteByServerId: async (spec: unknown) => { effects.push({ serverDeleted: spec }); record = null; return true; },
    },
    entryRefsRepo: { findByTarget: async ({ targetId }: { targetId: string }) => {
      if (mediaReferenceState instanceof Error) throw mediaReferenceState;
      return mediaReferenceState && targetId === "target" ? [{ workspaceId: "ws", sourceEntryId: "post-ref", sourceKind: "config-field", fieldPath: "body", targetKind: "asset", targetId }] : [];
    } },
    postRepo: { list: async () => [] },
    mediaRepo: {
      listRetiredSlugs: async () => [],
      findById: async () => media,
      remove: async (spec: unknown) => { effects.push({ mediaRemoved: spec }); media = null; },
    },
    assetRenditionRepo: { removeByAsset: async (spec: unknown) => { effects.push({ renditionsRemoved: spec }); } },
    assetBlobRepo: { findByHash: async () => null },
    forgetRemovedMedia: async (spec: unknown) => { effects.push({ mediaForgotten: spec }); },
    commentRepo: { findById: async () => record },
    commentWriteService: { purge: async (spec: unknown) => { effects.push({ commentPurged: spec }); record = null; return { ok: true }; } },
  } as unknown as RouteDeps;
  return { deps: buildPermanentDeleteDeps(routeDeps), effects, permissions, setMediaReferences: (state: boolean | Error) => { mediaReferenceState = state; }, setItems: (v: TrashItem[]) => { items = v; }, setRecord: (v: Record<string, unknown> | null) => { record = v; }, setAllowed: (v: boolean) => { allowed = v; }, setMedia: (v: Record<string, unknown> | null) => { media = v; } };
}

test("empty Trash refuses new arrivals or changed rows before deleting any reviewed item", async () => {
  const h = harness([row("a"), row("b")]);
  const plan = await h.deps.prepare("trash_empty", null, "owner");
  assert.deepEqual(plan.details, [{ label: "Count", value: "2" }, { label: "Trash items", value: "post: Title a (a)\npost: Title b (b)", format: "code" }]);
  h.setItems([row("a"), { ...row("b"), entityId: "replacement" }, row("new")]);
  await assert.rejects(plan.execute(), { message: "trash_empty: target set changed while confirmation was open. Request a new confirmation; nothing was deleted." });
  assert.deepEqual(h.effects, []);
});

test("Trash per-kind permissions use force-delete for media/comments; revocation prevents purge", async () => {
  const h = harness([row("a", "media"), row("b", "comment")]);
  const plan = await h.deps.prepare("trash_empty", null, "owner");
  assert.deepEqual(h.permissions, ["media.delete.force", "comments.delete.force"]);
  h.setAllowed(false);
  assert.deepEqual(await plan.execute(), { removed: false, purged: 0, results: [{ id: "a", outcome: "forbidden" }, { id: "b", outcome: "forbidden" }] });
  assert.deepEqual(h.effects, []);
});

test("empty Trash refuses an empty list and includes every page of a large selection", async () => {
  const empty = harness([]);
  await assert.rejects(empty.deps.prepare("trash_empty", null, "owner"), { message: "trash_empty: Trash is empty. Nothing to permanently delete." });
  const large = harness(Array.from({ length: 201 }, (_, i) => row(String(i))));
  const plan = await large.deps.prepare("trash_empty", null, "owner");
  assert.equal(plan.details.length, 2);
  assert.deepEqual(plan.details[0], { label: "Count", value: "201" });
  const selection = plan.details[1];
  assert.equal(selection?.format, "code");
  assert.ok(typeof selection?.value === "string");
  assert.deepEqual(selection.value.split("\n"), Array.from({ length: 201 }, (_, i) => `post: Title ${i} (${i})`));
  const result = await plan.execute();
  assert.equal(result.purged, 201);
  assert.equal(large.effects.length, 201);
});

test("single Trash lookup paginates; a missing row and an unauthorized kind fail before consent", async () => {
  const h = harness(Array.from({ length: 110 }, (_, i) => row(String(i))));
  const plan = await h.deps.prepare("trash_purge_item", "109", "owner");
  assert.deepEqual(await plan.execute(), { removed: true, purged: 1, results: [{ id: "109", outcome: "purged" }] });
  await assert.rejects(h.deps.prepare("trash_purge_item", "missing", "owner"), { message: "trash_purge_item: item was not found. List the resource and check its id." });
  h.setAllowed(false);
  await assert.rejects(h.deps.prepare("trash_purge_item", "0", "owner"), { message: "trash_purge_item: permission denied for a selected Trash item. Nothing was deleted." });
});

test("user deletion refuses self/seeded owner/live users and purges only the trashed principal", async () => {
  const h = harness([row("u", "user", "target")]);
  for (const id of ["owner", "seeded-owner"]) {
    await assert.rejects(h.deps.prepare("identity_user_delete", id, "owner"), { message: "identity_user_delete: cannot permanently delete yourself or the seeded owner." });
  }
  await assert.rejects(h.deps.prepare("identity_user_delete", "live-user", "owner"), { message: "identity_user_delete: user is not in Trash. Move the user to Trash first, then request permanent deletion." });
  await assert.rejects(h.deps.prepare("identity_user_delete", "missing-user", "owner"), { message: "identity_user_delete: item was not found. List the resource and check its id." });
  const plan = await h.deps.prepare("identity_user_delete", "target", "owner");
  assert.deepEqual(await plan.execute(), { removed: true, purged: 1, results: [{ id: "u", outcome: "purged" }] });
});

// REGRESSION (r4-trash verify, 2026-10-03): the user lookup must stay scoped to `user` rows. When the
// Jini adoption moved `entityTypes` to `list`'s second argument, the filter here was left in the
// first one and silently dropped, so a trashed post sharing the user's id became the purge target.
test("user deletion only considers trashed users, never another kind's row with the same entity id", async () => {
  const h = harness([row("p", "post", "target")]);
  await assert.rejects(h.deps.prepare("identity_user_delete", "target", "owner"), { message: "identity_user_delete: item was not found. List the resource and check its id." });
  assert.deepEqual(h.effects, []);
});

test("generic Trash purges cannot bypass self and seeded-owner protection", async () => {
  for (const principalId of ["owner", "seeded-owner"]) {
    const h = harness([row("protected", "user", principalId)]);
    for (const toolId of ["trash_empty", "trash_purge_item"] as const) {
      await assert.rejects(h.deps.prepare(toolId, toolId === "trash_empty" ? null : "protected", "owner"), {
        message: `${toolId}: permission denied for a selected Trash item. Nothing was deleted.`,
      });
    }
    assert.deepEqual(h.effects, []);
  }
});

for (const id of ["custom_credential_delete", "deployment_delete_provider_credential", "source_control_delete_credential", "external_mcp_delete", "comments_purge_comment"] as const) {
  test(`${id}: real adapter scopes writes to the workspace and keeps secret fields off the card`, async () => {
    const h = harness();
    const plan = await h.deps.prepare(id, "target", "owner");
    assert.equal(JSON.stringify(plan.details).includes("SECRET"), false);
    const result = await plan.execute();
    assert.deepEqual(result, { removed: true, id: "target", ...(id === "external_mcp_delete" ? { restartRequired: true } : {}) });
    const key = id === "external_mcp_delete" ? "serverDeleted" : id === "comments_purge_comment" ? "commentPurged" : "deleted";
    const spec = id === "external_mcp_delete" ? { workspaceId: "ws", serverId: "target" } : id === "comments_purge_comment" ? { workspaceId: "ws", id: "target", actorPrincipalId: "owner", note: null } : { workspaceId: "ws", id: "target" };
    assert.deepEqual(h.effects.filter(e => key in (e as object)), [{ [key]: spec }]);
  });
  test(`${id}: missing and changed records never reach the deletion service`, async () => {
    const h = harness();
    const plan = await h.deps.prepare(id, "target", "owner");
    h.setRecord({ id: "target", label: "New saved account", updatedAt: "v2", vendorId: "hosting" });
    await assert.rejects(plan.execute(), { message: `${id}: item changed while confirmation was open. Request a new confirmation; nothing was deleted.` });
    h.setRecord(null);
    await assert.rejects(plan.execute(), { message: `${id}: item was not found. List the resource and check its id.` });
    await assert.rejects(h.deps.prepare(id, "target", "owner"), { message: `${id}: item was not found. List the resource and check its id.` });
    assert.deepEqual(h.effects.filter(e => !("read" in (e as object))), []);
  });
}


test("media purge reuses purgeMedia and removes renditions, asset and Trash index only after preparation", async () => {
  const h = harness();
  const plan = await h.deps.prepare("media_purge_asset", "target", "owner");
  assert.deepEqual(plan.details, [{ label: "Count", value: "1" }, { label: "Item", value: "Test photo (target)" }]);
  assert.deepEqual(h.effects, []);
  assert.deepEqual(await plan.execute(), { removed: true, id: "target" });
  assert.deepEqual(h.effects, [
    { renditionsRemoved: { workspaceId: "ws", assetId: "target" } },
    { mediaRemoved: { workspaceId: "ws", id: "target" } },
    { mediaForgotten: { workspaceId: "ws", id: "target" } },
  ]);
});

test("media purge refuses a missing asset, a live asset, and an edit during confirmation", async () => {
  const h = harness();
  const plan = await h.deps.prepare("media_purge_asset", "target", "owner");
  h.setMedia({ id: "target", title: "Changed photo", status: "trashed", source: { sha256: "new-hash" } });
  await assert.rejects(plan.execute(), { message: "media_purge_asset: item changed while confirmation was open. Request a new confirmation; nothing was deleted." });
  h.setMedia({ id: "target", status: "active" });
  await assert.rejects(h.deps.prepare("media_purge_asset", "target", "owner"), { message: "media_purge_asset: media must be trashed first. Use media_trash_asset, then request permanent deletion." });
  h.setMedia(null);
  await assert.rejects(h.deps.prepare("media_purge_asset", "target", "owner"), { message: "media_purge_asset: item was not found. List the resource and check its id." });
  assert.deepEqual(h.effects, []);
});

test("an unlabeled MCP server is identified on the card by its saved server id", async () => {
  const h = harness();
  h.setRecord({ serverId: "target", label: null });
  const plan = await h.deps.prepare("external_mcp_delete", "target", "owner");
  assert.deepEqual(plan.details, [{ label: "Count", value: "1" }, { label: "Item", value: "target (target)" }]);
});

test("empty Trash requires a new card when the only change is a new arrival", async () => {
  const h = harness([row("a")]);
  const plan = await h.deps.prepare("trash_empty", null, "owner");
  h.setItems([row("a"), row("new")]);
  await assert.rejects(plan.execute(), { message: "trash_empty: target set changed while confirmation was open. Request a new confirmation; nothing was deleted." });
  assert.deepEqual(h.effects, []);
});
test("one Trash purge requires a new card when the reviewed row disappears", async () => {
  const h = harness([row("a")]);
  const plan = await h.deps.prepare("trash_purge_item", "a", "owner");
  h.setItems([]);
  await assert.rejects(plan.execute(), { message: "trash_purge_item: target set changed while confirmation was open. Request a new confirmation; nothing was deleted." });
  assert.deepEqual(h.effects, []);
});

test("Empty Trash card renders every row across pages with its type/title and exact count", async () => {
  const h = harness(Array.from({ length: 201 }, (_, i) => row(String(i))));
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tool = buildPermanentDeleteRegistrations(h.deps, { surfaceExchanges: store, assertChatDeleteAllowed: async () => {} }).find(tool => tool.descriptor.id === "trash_empty")!;
  const result = await tool.handler({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal }, { emitSurface: async emission => {
    const html = JSON.stringify(emission.payload);
    for (let i = 0; i < 201; i++) assert.ok(html.includes(`Title ${i} (${i})`), `row ${i} missing from card`);
    assert.ok(html.includes("Count")); assert.ok(html.includes("201")); assert.ok(html.includes("post"));
    assert.ok(html.includes("mcpui-code")); assert.ok(html.includes("overflow: auto"));
    assert.deepEqual(h.effects, []);
    store.deliver({ exchangeId: store.findTypedAnswerTarget({ principalId: "owner", toolId: "trash_empty" })!, principalId: "owner", params: { decision: "confirm" } }, { toolId: "trash_empty" });
  } }) as { purged: number };
  assert.equal(result.purged, 201);
});


for (const toolId of ["custom_credential_delete", "deployment_delete_provider_credential", "source_control_delete_credential", "external_mcp_delete"] as const) {
  test(`${toolId}: the real emitted card names the saved label/id/count and never exposes ciphertext`, async () => {
    const h = harness();
    const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
    const tool = buildPermanentDeleteRegistrations(h.deps, { surfaceExchanges: store, assertChatDeleteAllowed: async () => {} }).find(tool => tool.descriptor.id === toolId)!;
    const key = toolId === "external_mcp_delete" ? "serverId" : "credentialId";
    const result = await tool.handler({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: { [key]: "target" }, signal: new AbortController().signal }, { emitSurface: async emission => {
      const html = JSON.stringify(emission.payload);
      assert.ok(html.includes("Saved credential")); assert.ok(html.includes("target")); assert.ok(html.includes("Count"));
      assert.equal(html.includes("SECRET"), false); assert.equal(html.includes("ciphertext"), false);
      assert.equal(h.effects.some(effect => "deleted" in (effect as object) || "serverDeleted" in (effect as object)), false);
      store.deliver({ exchangeId: store.findTypedAnswerTarget({ principalId: "owner", toolId })!, principalId: "owner", params: { decision: "cancel" } }, { toolId });
    } }) as { removed: boolean };
    assert.equal(result.removed, false);
  });
}


test("media purge rechecks references after confirmation and refuses lookup failures without effects", async () => {
  const h = harness();
  const plan = await h.deps.prepare("media_purge_asset", "target", "owner");
  h.setMediaReferences(true);
  await assert.rejects(plan.execute(), /still referenced/);
  assert.deepEqual(h.effects, []);
  h.setMediaReferences(new Error("reference lookup failed"));
  await assert.rejects(plan.execute(), /reference lookup failed/);
  assert.deepEqual(h.effects, []);
});
