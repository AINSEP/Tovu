import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner } from "../../features/content-types/index.js";
import { registerContentType } from "../../features/content-types/index.js";
import { entriesAgentToolCatalog, type AgentToolDefinition as EntriesAgentToolDefinition } from "../../features/entries/index.js";
import { InMemoryEntryRepo } from "../../features/entries/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeEntriesTools } from "../../features/entries/tool-registrations.js";

// Entries moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
contributeEntriesTools();

/**
 * @file The Entries (Collections authoring surface) tool-wiring test file — mirrors
 * `tool-registrations.widgets-contracts.test.ts`/`tool-registrations.settings.test.ts`'s own shape:
 * catalog completeness, published contract parity, the risk cross-check, the ADR-021 §2
 * authorization half (mixed self-enforcing writes + inline-gated read), field-validation shape
 * rejection, and a multi-tool workflow test chaining create -> update -> publish -> unpublish.
 *
 * Real in-memory adapters throughout (`InMemoryEntryRepo`, `InMemoryContentTypeRepo`), no mocking
 * of the chokepoint itself, per Constitution Article V (Integration-First Testing) — mirrors
 * `tool-registrations.widgets-contracts.test.ts`'s identical discipline.
 */

const WORKSPACE_ID = "ws-entries-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const CONTENT_TYPE_KEY = "article";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const entryRepo = new InMemoryEntryRepo();
  const contentTypeRepo = new InMemoryContentTypeRepo();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined },
    entryRepo,
    contentTypeRepo,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, entryRepo, contentTypeRepo, authorizeCalls };
}

/** Registers a real, active content type with one required 'summary' text field, through the real
 * chokepoint — so field-validation tests exercise genuine domain rejection, not a fixture stub. */
async function seedContentType(deps: RouteDeps): Promise<void> {
  const routeDeps = deps as unknown as { contentTypeRepo: InMemoryContentTypeRepo };
  const ctDeps = {
    repo: routeDeps.contentTypeRepo,
    clock: { nowIso: () => NOW },
    ids: { newId: () => `ct-${Math.random()}` },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    indexProvisioner: new NoopContentTypeIndexProvisioner(),
    outbox: { enqueue: async () => undefined },
  };
  const result = await registerContentType({
    deps: ctDeps,
    input: {
      actorId: PRINCIPAL_ID,
      workspaceId: WORKSPACE_ID,
      key: CONTENT_TYPE_KEY,
      label: "Article",
      fields: [{ name: "summary", kind: "text", required: true, queryable: false }],
    },
  });
  if (!result.ok) throw result.error;
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): EntriesAgentToolDefinition {
  const entry = entriesAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function entriesRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("collections_entry_")).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = entriesRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

const VALID_FIELDS_JSON = { ext: { site: { summary: "hello" } } };

// ---------------------------------------------------------------------------
// 1. Catalog completeness
// ---------------------------------------------------------------------------

test("exactly the 5 Entries operations are wired — the entire catalog, no delete/purge tool", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...entriesRegistrations(deps).keys()].sort(),
    ["collections_entry_create", "collections_entry_list", "collections_entry_publish", "collections_entry_unpublish", "collections_entry_update"],
  );
  assert.equal(entriesAgentToolCatalog.length, 5, "sanity: no catalog entry is silently excluded");
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired Entries registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of entriesRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Entries tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of entriesRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for all 5 wired Entries tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of entriesRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a catalog entry cannot downgrade its own risk — declaring collections_entry_create sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("collections_entry_create", { ...catalogEntry("collections_entry_create"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired Entries registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of entriesRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2) — mixed shape: 4 self-enforcing writes + 1 inline-gated read
// ---------------------------------------------------------------------------

test("collections_entry_list: calls authorize() with admin.collections.read, inline (listEntries has no authorize of its own)", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired("collections_entry_list", deps).handler(executionContext(undefined));

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "admin.collections.read");
});

test("collections_entry_list: a denied principal is rejected", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired("collections_entry_list", deps).handler(executionContext(undefined)), /is not authorized for 'admin\.collections\.read'/);
});

test("collections_entry_create: calls authorize() with admin.collections.manage (createEntry's own self-enforced check)", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  await seedContentType(deps);
  authorizeCalls.length = 0;

  await wired("collections_entry_create", deps).handler(executionContext({ type: CONTENT_TYPE_KEY, slug: "hello-world", title: "Hello World", fieldsJson: VALID_FIELDS_JSON }));

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "admin.collections.manage");
});

test("collections_entry_create: a denied principal is rejected and nothing is written", async () => {
  const { deps, entryRepo } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired("collections_entry_create", deps).handler(executionContext({ type: CONTENT_TYPE_KEY, slug: "s", title: "T" })),
    /principal '.*' cannot create an entry \(insufficient_permission\)/,
  );
  assert.equal((await entryRepo.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 0);
});

for (const toolId of ["collections_entry_update", "collections_entry_publish", "collections_entry_unpublish"]) {
  test(`${toolId}: a denied principal is rejected`, async () => {
    const { deps } = fakeRouteDeps({ allow: false });
    // `createEntry`/`resolveExistingEntryForTransition` (`write-service.ts`) throw their OWN
    // domain-worded `ForbiddenError` — a different message shape than the kit's
    // `requireToolPermission` helper (used only by the inline-gated read), but the SAME class and
    // the SAME "denied means nothing runs" guarantee.
    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext({ id: "nonexistent", expectedVersion: 1 })),
      /principal '.*' cannot modify entry 'nonexistent' \(insufficient_permission\)/,
    );
  });
}

// ---------------------------------------------------------------------------
// 5. Field-validation shape rejection
// ---------------------------------------------------------------------------

test("collections_entry_create rejects fieldsJson missing a required field, with the schema attached for retry", async () => {
  const { deps } = fakeRouteDeps();
  await seedContentType(deps);

  const error = await wired("collections_entry_create", deps)
    .handler(executionContext({ type: CONTENT_TYPE_KEY, slug: "bad", title: "Bad", fieldsJson: { ext: { site: {} } } }))
    .then(
      () => null,
      (e: unknown) => e as Error,
    );

  assert.ok(error, "missing required field must reject");
  assert.match(error.message, /required field is missing/);
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"required":\["type","slug","title"\]/, "the published schema must travel with the failure");
});

// ---------------------------------------------------------------------------
// 6. Multi-tool workflow — create -> update -> publish -> unpublish, id/version threaded throughout
// ---------------------------------------------------------------------------

test("workflow: create an entry, update it, publish it, then unpublish it — version and id thread through consistently", async () => {
  const { deps } = fakeRouteDeps();
  await seedContentType(deps);

  // Step 1: create.
  const created = (await wired("collections_entry_create", deps).handler(
    executionContext({ type: CONTENT_TYPE_KEY, slug: "my-article", title: "My Article", fieldsJson: VALID_FIELDS_JSON }),
  )) as { entry: { id: string; status: string; version: number; title: string } };
  assert.equal(created.entry.status, "draft");
  assert.equal(created.entry.version, 1);
  const entryId = created.entry.id;

  // Step 2: update, using the id AND version step 1 returned.
  const updated = (await wired("collections_entry_update", deps).handler(
    executionContext({ id: entryId, expectedVersion: created.entry.version, title: "My Updated Article" }),
  )) as { entry: { id: string; title: string; version: number; status: string } };
  assert.equal(updated.entry.id, entryId, "the update must operate on the SAME entry created in step 1");
  assert.equal(updated.entry.title, "My Updated Article");
  assert.equal(updated.entry.version, 2, "version must have advanced from step 1's version 1");
  assert.equal(updated.entry.status, "draft", "updating must not itself change status");

  // A stale version from step 1 must now be rejected (proves the version returned really is live).
  await assert.rejects(
    () => wired("collections_entry_update", deps).handler(executionContext({ id: entryId, expectedVersion: 1, title: "Stale Write" })),
    /expected version 1/,
  );

  // Step 3: publish, using step 2's own returned version.
  const published = (await wired("collections_entry_publish", deps).handler(
    executionContext({ id: entryId, expectedVersion: updated.entry.version }),
  )) as { entry: { id: string; status: string; version: number; publishedAt: string | null } };
  assert.equal(published.entry.id, entryId);
  assert.equal(published.entry.status, "published");
  assert.equal(published.entry.version, 3);
  assert.ok(published.entry.publishedAt, "publishedAt must be set");

  // Step 4: unpublish, chained off step 3's own returned version — proves the full chain leaves
  // consistent, inspectable state end to end, not just that each tool works alone.
  const unpublished = (await wired("collections_entry_unpublish", deps).handler(
    executionContext({ id: entryId, expectedVersion: published.entry.version }),
  )) as { entry: { id: string; status: string; version: number; publishedAt: string | null; title: string } };
  assert.equal(unpublished.entry.id, entryId);
  assert.equal(unpublished.entry.status, "unpublished");
  assert.equal(unpublished.entry.version, 4);
  assert.equal(unpublished.entry.publishedAt, published.entry.publishedAt, "publishedAt is left as-is by unpublish, not cleared");
  assert.equal(unpublished.entry.title, "My Updated Article", "the title from step 2 must still be intact after two lifecycle transitions");

  // Cross-check via the read tool: the list must reflect the SAME final state.
  const listed = (await wired("collections_entry_list", deps).handler(executionContext({ type: CONTENT_TYPE_KEY }))) as {
    items: Array<{ id: string; status: string; version: number }>;
  };
  const row = listed.items.find((item) => item.id === entryId);
  assert.ok(row, "the entry must appear in the list");
  assert.equal(row.status, "unpublished");
  assert.equal(row.version, 4);
});
