import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import {
  getWorkspaceAgentToolCatalog,
  InMemoryWorkspaceRepo,
  type WorkspaceAgentToolDefinition,
} from "../../features/workspace/index.js";
import { contributeWorkspaceTools } from "../../features/workspace/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";

/**
 * @file The Workspace (SPEC-044) tool-wiring test file — mirrors
 * `tool-registrations.database-recovery.test.ts`/`tool-registrations.plugins.test.ts`'s own shape:
 * catalog completeness (wired vs. declared-but-excluded, and WHY), published contract parity, the
 * independent risk-metadata cross-check, the ADR-021 §2 authorization half, and a multi-tool
 * workflow test.
 *
 * Workspace moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
 * tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
 * header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
 * installs it first, mirroring what the real composition roots now do via
 * `installFirstPartyToolContributors()`. Reset first so this file's own registration is the only one
 * this process's registry holds while these tests run.
 */
resetToolContributorsForTests();
registerToolContributor(contributeWorkspaceTools());

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const workspaceRepo = new InMemoryWorkspaceRepo([{ id: WORKSPACE_ID, name: "Original Name", slug: "original-slug", createdAt: NOW }]);

  const deps = {
    workspaceId: WORKSPACE_ID,
    workspaceRepo,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => "id-unused" },
    outbox: { enqueue: async () => {} },
    bus: { publish: async () => {} },
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, workspaceRepo };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function workspaceRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("workspace_") || r.descriptor.id === "content_read.workspace").map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = workspaceRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): WorkspaceAgentToolDefinition {
  const entry = getWorkspaceAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

// ---------------------------------------------------------------------------
// 1. Catalog completeness — wired vs. declared-but-excluded, and excluded tools stay excluded
// ---------------------------------------------------------------------------

test("exactly the 2 wireable workspace entries are registered — get and update, nothing else", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...workspaceRegistrations(deps).keys()].sort(), ["content_read.workspace", "workspace_update"]);
  assert.equal(getWorkspaceAgentToolCatalog().length, 4, "sanity: the full workspace catalog is still 4 entries");
});

test("workspace_create is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(workspaceRegistrations(deps).has("workspace_create"), false);
  assert.throws(() => assertRiskMetadataIsWirable("workspace_create", catalogEntry("workspace_create")), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
});

test("workspace_delete is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(workspaceRegistrations(deps).has("workspace_delete"), false);
  assert.throws(() => assertRiskMetadataIsWirable("workspace_delete", catalogEntry("workspace_delete")), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
});

test("no tool name across the whole assistant tool set implies a workspace can be created or deleted by an agent", () => {
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps).map((r) => r.descriptor.id);
  assert.equal(ids.includes("workspace_create"), false);
  assert.equal(ids.includes("workspace_delete"), false);
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired workspace registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of workspaceRegistrations(deps)) {
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.workspace") continue;
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired workspace tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of workspaceRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for both wired workspace tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of workspaceRegistrations(deps).keys()) {
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.workspace") continue;
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a workspace catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for update fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("workspace_update", { ...catalogEntry("workspace_update"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for both wired workspace registrations", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of workspaceRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  "content_read.workspace": {},
  workspace_update: { name: "Renamed" },
};

test("every wired workspace tool has a known input fixture", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...workspaceRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with 'workspace.manage' and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, "workspace.manage");
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected and nothing is written`, async () => {
    const { deps, workspaceRepo } = fakeRouteDeps({ allow: false });
    const before = await workspaceRepo.findById(WORKSPACE_ID);

    await assert.rejects(
      () => wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
        assert.match((error as Error).message, /^WORKSPACE_FORBIDDEN: .*is not authorized for/);
        return true;
      },
    );

    const after = await workspaceRepo.findById(WORKSPACE_ID);
    assert.deepEqual(after, before, "the permission gate must run ahead of any durable effect");
  });
}

test("workspace_update: rejects an empty update the same way the domain function does", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "workspace_update").handler(executionContext({})), /WORKSPACE_VALIDATION: .*at least one of name or slug is required/);
});

test("workspace_update: rejects a slug collision the same way the domain function does", async () => {
  const { deps, workspaceRepo } = fakeRouteDeps();
  await workspaceRepo.insert({ id: "ws-other", name: "Other", slug: "taken-slug", createdAt: NOW });

  await assert.rejects(() => wired(deps, "workspace_update").handler(executionContext({ slug: "taken-slug" })), /WORKSPACE_CONFLICT: .*already exists/);
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow
// ---------------------------------------------------------------------------

test("workflow: get the current workspace, rename it, get again to confirm the rename is reflected", async () => {
  const { deps } = fakeRouteDeps();

  const before = (await wired(deps, "content_read.workspace").handler(executionContext({}))) as { workspace: { id: string; name: string; slug: string } };
  assert.equal(before.workspace.id, WORKSPACE_ID);
  assert.equal(before.workspace.name, "Original Name");

  await wired(deps, "workspace_update").handler(executionContext({ name: "New Name", slug: "new-slug" }));

  const after = (await wired(deps, "content_read.workspace").handler(executionContext({}))) as { workspace: { id: string; name: string; slug: string } };
  assert.equal(after.workspace.id, before.workspace.id, "id is immutable across the rename");
  assert.equal(after.workspace.name, "New Name");
  assert.equal(after.workspace.slug, "new-slug");
});
