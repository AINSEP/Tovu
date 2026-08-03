import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { contentTypesAgentToolCatalog } from "../../features/content-types";
import { ForbiddenError } from "../../features/content-types";
import type { ContentTypeRecord } from "../../features/content-types";
import { ForbiddenError as CoreForbiddenError } from "@jini-ai/cms/core";
import type { RouteDeps } from "../../server/routes/types";
import { buildAssistantToolRegistrations } from "../tool-registrations";

/**
 * @file Proves the claim `tool-registrations.ts` makes in its header: its `ToolPolicy.authorize`
 * is a deliberate pass-through `'allow'` because each wired handler's own domain function is the
 * single ADR-021 §2 evaluator, not because the permission goes unchecked.
 *
 * The load-bearing assertions are (per tool, derived from the catalog rather than hardcoded):
 * 1. the handler calls `authorize()` with EXACTLY the permission its `agent-tools.ts` catalog
 *    entry declares, and with the run's own principal id as the acting principal;
 * 2. a denial rejects the tool call AND leaves the database untouched — no `save`, no
 *    `appendRevision`, no index provisioning — i.e. the gate really is ahead of the write, not
 *    beside it;
 * 3. `authorize` is the first thing that happens, before the repo is even read.
 *
 * Because the expectations come from `contentTypesAgentToolCatalog`, wiring a future tool whose
 * handler does not self-enforce (or that declares a different permission than its domain function
 * checks) fails this file instead of silently inheriting the pass-through policy.
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";

interface AuthorizeCall {
  principalId: string;
  permission: string;
  workspaceId: string;
}

/**
 * A `RouteDeps` stand-in carrying only the fields `contentTypesDeps()` reads, plus a call log that
 * records the relative order of `authorize` and every mutating repo/provisioner call.
 */
function fakeRouteDeps(options: { allow: boolean; existing?: ContentTypeRecord }) {
  const authorizeCalls: AuthorizeCall[] = [];
  const order: string[] = [];
  const writes: string[] = [];

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-07-29T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async (params: AuthorizeCall) => {
      authorizeCalls.push(params);
      order.push("authorize");
      return options.allow
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "insufficient_permission" };
    },
    contentTypeRepo: {
      save: async () => {
        order.push("repo.save");
        writes.push("save");
      },
      appendRevision: async () => {
        order.push("repo.appendRevision");
        writes.push("appendRevision");
      },
      findByKey: async () => {
        order.push("repo.findByKey");
        return options.existing ?? null;
      },
      listByWorkspace: async () => {
        order.push("repo.listByWorkspace");
        return options.existing ? [options.existing] : [];
      },
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {
        order.push("index.provision");
        writes.push("index.provision");
      },
      applyFieldIndexTransitions: async () => {
        order.push("index.applyTransitions");
        writes.push("index.applyTransitions");
      },
      tearDownAllIndexesForContentType: async () => {
        order.push("index.tearDown");
        writes.push("index.tearDown");
      },
    },
    outbox: {
      enqueue: async () => {
        order.push("outbox.enqueue");
      },
    },
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, order, writes };
}

/** Minimal but valid input for each wired tool — enough to get past argument parsing into the domain call. */
const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  collections_content_type_define: {
    key: "recipe",
    label: "Recipe",
    fields: [{ name: "title", kind: "text", required: true, queryable: false }],
  },
  collections_content_type_update_fields: {
    key: "recipe",
    fields: [{ name: "title", kind: "text", required: true, queryable: false }],
    expectedVersion: 1,
  },
  collections_content_type_deprecate: { key: "recipe", expectedVersion: 1 },
  collections_content_type_reactivate: { key: "recipe", expectedVersion: 1 },
  collections_content_type_tombstone: { key: "recipe", expectedVersion: 1 },
};

/** The repo state each tool needs to reach its write (status/version the domain function demands). */
function existingFor(toolId: string): ContentTypeRecord | undefined {
  if (toolId === "collections_content_type_define") return undefined;
  return {
    workspaceId: WORKSPACE_ID,
    key: "recipe",
    label: "Recipe",
    fields: [{ name: "title", kind: "text", required: true, queryable: false }],
    status: toolId === "collections_content_type_tombstone" ? "deprecated" : "active",
    version: 1,
    tombstonedAt: null,
  };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
}

function permissionFor(toolId: string): string {
  const entry = contentTypesAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for wired tool '${toolId}'`);
  return entry.authorization.permission;
}

function registrationsById(): Map<string, ToolRegistration> {
  const { deps } = fakeRouteDeps({ allow: true });
  return new Map(buildAssistantToolRegistrations(deps).map((registration) => [registration.descriptor.id, registration]));
}

test("every wired CONTENT-TYPES tool has a known input fixture — a newly wired tool must be added here, not silently skipped", () => {
  // Scoped to this domain deliberately: each domain owns its own fixtures in its own sibling file
  // (`tool-registrations.forms.test.ts`, ...), so adding a domain does not force every existing
  // fixture table to grow. The per-domain tripwire is what stays load-bearing.
  //
  // Filters on the CONTENT-TYPE-level sub-prefix, not the bare `collections_` prefix: `features/
  // entries/agent-tools.ts` now also publishes `collections_entry_*` (the sibling half of this SAME
  // ADR-043 "Collections" domain, per `server/routes/admin/content-types/deps.ts`'s own file
  // header) — a bare `collections_` filter would silently pull those into this content-types-only
  // fixture table too.
  //
  // `collections_content_type_list` is excluded from THIS table on purpose: unlike the five below,
  // it is not self-enforcing (see `tool-registrations.ts`'s file header), so its `authorize()` call
  // carries an `entityType` the shared per-tool loop's 3-key `deepEqual` does not expect. It has its
  // own dedicated block further down, the same split `tool-registrations.comments.test.ts` uses
  // between its shared mutation loop and `comments_list_moderation_queue`'s own tests.
  const wiredIds = [...registrationsById().keys()]
    .filter((id) => id.startsWith("collections_content_type_") && id !== "collections_content_type_list")
    .sort();
  assert.deepEqual(wiredIds, Object.keys(TOOL_INPUTS).sort());
  assert.equal(wiredIds.length, 5);
});

test("collections_content_type_list is wired alongside the five mutations — the 6th of 7 catalog entries", () => {
  const wiredIds = [...registrationsById().keys()].filter((id) => id.startsWith("collections_content_type_"));
  assert.equal(wiredIds.length, 6);
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const expectedPermission = permissionFor(toolId);
    const { deps, authorizeCalls } = fakeRouteDeps({ allow: true, existing: existingFor(toolId) });
    const wired = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === toolId);
    assert.ok(wired);
    await wired.handler(executionContext(TOOL_INPUTS[toolId]));

    assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation — ADR-021 §2 'one evaluator'");
    assert.deepEqual(authorizeCalls[0], {
      principalId: PRINCIPAL_ID,
      permission: expectedPermission,
      workspaceId: WORKSPACE_ID,
    });
  });

  test(`${toolId}: a denied principal is rejected and NOTHING is written`, async () => {
    const { deps, writes } = fakeRouteDeps({ allow: false, existing: existingFor(toolId) });
    const wired = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === toolId);
    assert.ok(wired);

    await assert.rejects(
      () => wired.handler(executionContext(TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
        return true;
      }
    );

    assert.deepEqual(writes, [], "the permission gate must run ahead of every durable effect, not alongside it");
  });

  test(`${toolId}: authorize() runs before the repo is even read`, async () => {
    const { deps, order } = fakeRouteDeps({ allow: true, existing: existingFor(toolId) });
    const wired = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === toolId);
    assert.ok(wired);

    await wired.handler(executionContext(TOOL_INPUTS[toolId]));

    assert.equal(order[0], "authorize", `first observable effect was '${order[0]}', not the authorization check`);
  });
}

test("the ToolPolicy layer is a pass-through 'allow' for every registration — enforcement is the domain layer's, by design", () => {
  for (const [toolId, registration] of registrationsById()) {
    const decision = registration.policy.authorize({
      principal: { id: PRINCIPAL_ID },
      run: { id: "run-1" },
      tool: registration.descriptor,
      input: TOOL_INPUTS[toolId],
    });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

test("all five wired tools declare admin.collections.manage — the mutating permission, never the read one", () => {
  for (const toolId of Object.keys(TOOL_INPUTS)) {
    assert.equal(permissionFor(toolId), "admin.collections.manage");
  }
});

// ---------------------------------------------------------------------------
// collections_content_type_list — not self-enforcing, so it is not part of the shared loop above.
// Its handler calls `requireToolPermission` explicitly (the route's own gate, done in the route's
// place), which is why it gets its own block rather than joining TOOL_INPUTS.
// ---------------------------------------------------------------------------

test("collections_content_type_list declares admin.collections.read — the read permission, never the mutating one", () => {
  assert.equal(permissionFor("collections_content_type_list"), "admin.collections.read");
});

test("collections_content_type_list: calls authorize() with 'admin.collections.read' and the run's principal, before touching the repo", async () => {
  const { deps, authorizeCalls, order } = fakeRouteDeps({ allow: true });
  const wired = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === "collections_content_type_list");
  assert.ok(wired);

  await wired.handler(executionContext({}));

  assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation — ADR-021 §2 'one evaluator'");
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "admin.collections.read");
  assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  assert.equal(order[0], "authorize", `first observable effect was '${order[0]}', not the authorization check`);
});

test("collections_content_type_list: a denied principal is rejected and the repo is never read", async () => {
  const { deps, order } = fakeRouteDeps({ allow: false });
  const wired = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === "collections_content_type_list");
  assert.ok(wired);

  await assert.rejects(
    () => wired.handler(executionContext({})),
    (error: unknown) => {
      assert.ok(error instanceof CoreForbiddenError, `expected core/commands' ForbiddenError, got ${String(error)}`);
      assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
      return true;
    },
  );
  assert.equal(order.includes("repo.listByWorkspace"), false, "the permission gate must run ahead of the read, not alongside it");
});

test("collections_content_type_list: a populated input is refused — this tool accepts no arguments", async () => {
  const { deps } = fakeRouteDeps({ allow: true });
  const wired = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === "collections_content_type_list");
  assert.ok(wired);

  await assert.rejects(() => wired.handler(executionContext({ unexpected: true })), /accepts no input/);
});
