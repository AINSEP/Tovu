import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { commentsAgentToolCatalog } from "../../comments/agent-tools";
import { contentTypesAgentToolCatalog, type AgentToolDefinition } from "../../features/content-types";
import { getDatabaseAgentToolCatalog } from "../../features/database/agent-tools";
import { entriesAgentToolCatalog } from "../../features/entries";
import { pluginAgentToolCatalog } from "../../features/plugin-runtime/agent-tools";
import { postAgentToolCatalog } from "../../features/post/agent-tools";
import { recoveryAgentToolCatalog } from "../../features/recovery/agent-tools";
import { getSettingsAgentToolCatalog } from "../../features/settings";
import { taxonomyAgentToolCatalog } from "../../features/taxonomy/agent-tools";
import { getWorkspaceAgentToolCatalog } from "../../features/workspace/agent-tools";
import { formsAgentToolCatalog } from "../../forms/agent-tools";
import { identityAgentToolCatalog } from "../../identity";
import { getIntegrationsAgentToolCatalog } from "../../integrations/agent-tools";
import { getThemesAgentToolCatalog } from "../../features/theme/agent-tools";
import { mediaAgentToolCatalog } from "../../media";
import { membersAgentToolCatalog } from "../../members/agent-tools";
import { menusAgentToolCatalog } from "../../navigation";
import { newsletterAgentToolCatalog } from "../../newsletter/agent-tools";
import { getRedirectsAgentToolCatalog } from "../../redirects/agent-tools";
import { getSeoAgentToolCatalog } from "../../seo/agent-tools";
import { widgetsAgentToolCatalog } from "../../widgets/agent-tools";
import type { ContentTypeRecord } from "../../features/content-types";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

/**
 * @file The model-facing contract half of `tool-registrations.ts` — companion to
 * `tool-registrations.authorization.test.ts`, which covers the ADR-021 half.
 *
 * Three things are pinned here:
 * 1. every wired tool publishes an `inputSchema`, and a rejected call returns it so the model can
 *    self-correct in one turn rather than guessing the shape;
 * 2. risk metadata is cross-checked, not trusted as declared — a catalog entry cannot downgrade its
 *    own `sideEffects`, and an unclassified tool is refused rather than assumed safe;
 * 3. no tool whose `actorClassRule` demands human confirmation can be wired while Tovu has no
 *    confirmation transport — the guard that keeps `requiresConfirmation` being unset safe.
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";

/** A `RouteDeps` stand-in carrying only the fields `contentTypesDeps()` reads. Permissive by design — authorization is the sibling file's subject. */
function fakeRouteDeps(existing?: ContentTypeRecord) {
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-07-29T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => existing ?? null,
      listByWorkspace: async () => (existing ? [existing] : []),
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
  };
  return deps as unknown as RouteDeps;
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function registrationsById(existing?: ContentTypeRecord): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(fakeRouteDeps(existing)).map((r) => [r.descriptor.id, r]));
}

/** The one registration under test, asserted present so no call site needs a non-null assertion. */
function wiredRegistration(toolId: string, existing?: ContentTypeRecord): ToolRegistration {
  const found = registrationsById(existing).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/** Every catalog whose entries `buildAssistantToolRegistrations` wires. A newly wired domain must
 * be added here — an id missing from all of them fails rather than being skipped. All 21 wired
 * domains are listed; the generic contract/risk assertions below iterate EVERY wired registration,
 * not just content-types', so each domain's catalog has to be resolvable from here even when that
 * domain also has its own dedicated test file. The `as unknown as` casts cover the catalogs whose
 * own `AgentToolDefinition` is a structural sibling rather than the content-types one this array is
 * typed as (identity requires `inputSchema`, database/recovery/plugins/workspace/settings/taxonomy/
 * seo/redirects/integrations/post/themes each declare their own copy — taxonomy's additionally carries
 * `actorClassRule`) — the shared structural supertype lives in `assistant/tool-registration-kit.ts`. */
const WIRED_CATALOGS: AgentToolDefinition[] = [
  ...contentTypesAgentToolCatalog,
  ...formsAgentToolCatalog,
  ...identityAgentToolCatalog,
  ...commentsAgentToolCatalog,
  ...membersAgentToolCatalog,
  ...newsletterAgentToolCatalog,
  ...mediaAgentToolCatalog,
  ...widgetsAgentToolCatalog,
  ...menusAgentToolCatalog,
  ...(getDatabaseAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(recoveryAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(pluginAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(getWorkspaceAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(getSettingsAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(entriesAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(taxonomyAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(getSeoAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(getRedirectsAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(getIntegrationsAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(postAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(getThemesAgentToolCatalog() as unknown as AgentToolDefinition[]),
];

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = WIRED_CATALOGS.find((tool) => tool.name === toolId);
  assert.ok(entry, `no wired catalog has an entry for '${toolId}'`);
  return entry;
}

// ---------------------------------------------------------------------------
// 1. Published contracts
// ---------------------------------------------------------------------------

test("every wired registration publishes the inputSchema from its catalog entry — the descriptor no longer carries only {id, description}", () => {
  for (const [id, registration] of registrationsById()) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is still unset on every wired tool — setting it with no ExecutionDelegate would park the execution forever", () => {
  for (const [id, registration] of registrationsById()) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined, `${id} must not request confirmation until a transport exists`);
  }
});

test("a rejected 'fields' payload returns the tool's own schema plus an explicit non-retryable instruction, so the model can correct in one turn", async () => {
  const registration = registrationsById().get("collections_content_type_define");
  assert.ok(registration);

  const error = await registration.handler(executionContext({ key: "recipe", label: "Recipe", fields: [{ name: "a", kind: "text", required: "yes", queryable: false }] })).then(
    () => null,
    (e: unknown) => e as Error,
  );

  assert.ok(error, "a non-boolean 'required' must reject");
  assert.match(error.message, /fields\[0\]\.required must be a boolean, received a string/);
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure");
  assert.match(error.message, /"queryable"/, "the schema in the message must actually describe the field that failed");
});

test("the schema-bearing rejection happens for the update-fields tool too, naming that tool's own schema", async () => {
  const registration = registrationsById(existingRecipe()).get("collections_content_type_update_fields");
  assert.ok(registration);

  const error = await registration.handler(executionContext({ key: "recipe", fields: [null], expectedVersion: 1 })).then(
    () => null,
    (e: unknown) => e as Error,
  );

  assert.ok(error);
  assert.match(error.message, /fields\[0\] must be an object, received null/);
  assert.match(error.message, /"expectedVersion"/, "update_fields' schema includes expectedVersion, so its message must differ from define's");
});

test("no rejection message echoes the offending value — a fields payload can carry operator content", async () => {
  const registration = registrationsById().get("collections_content_type_define");
  assert.ok(registration);
  const secret = "s3cret-operator-content";

  const error = await registration.handler(executionContext({ key: "recipe", label: "Recipe", fields: [{ name: "a", kind: "text", required: secret, queryable: false }] })).then(
    () => null,
    (e: unknown) => e as Error,
  );

  assert.ok(error);
  assert.equal(error.message.includes(secret), false, `message leaked the value: ${error.message}`);
});

// ---------------------------------------------------------------------------
// 2. Output projection
// ---------------------------------------------------------------------------

function existingRecipe(status: ContentTypeRecord["status"] = "active"): ContentTypeRecord {
  return {
    workspaceId: WORKSPACE_ID,
    key: "recipe",
    label: "Recipe",
    fields: [{ name: "title", kind: "text", required: true, queryable: false }],
    status,
    version: 1,
    tombstonedAt: null,
  };
}

test("a tool result is an explicit model-facing view: workspaceId is dropped, version is kept for the next call's expectedVersion", async () => {
  const registration = registrationsById().get("collections_content_type_define");
  assert.ok(registration);

  const output = (await registration.handler(
    executionContext({ key: "recipe", label: "Recipe", fields: [{ name: "title", kind: "text", required: true, queryable: false }] }),
  )) as { contentType: Record<string, unknown> };

  assert.deepEqual(Object.keys(output.contentType).sort(), ["fields", "key", "label", "status", "version"]);
  assert.equal("workspaceId" in output.contentType, false, "the agent is already scoped to one workspace it cannot change — echoing the id spends attention for nothing");
  assert.equal(output.contentType.version, 1);
});

test("tombstonedAt appears only when set, so an active type's payload carries no always-null key", async () => {
  const active = (await wiredRegistration("collections_content_type_deprecate", existingRecipe()).handler(executionContext({ key: "recipe", expectedVersion: 1 }))) as {
    contentType: Record<string, unknown>;
  };
  assert.equal("tombstonedAt" in active.contentType, false);

  const tombstoned = (await wiredRegistration("collections_content_type_tombstone", existingRecipe("deprecated")).handler(
    executionContext({ key: "recipe", expectedVersion: 1 }),
  )) as { contentType: Record<string, unknown> };
  assert.equal(typeof tombstoned.contentType.tombstonedAt, "string");
  assert.equal(tombstoned.contentType.status, "tombstone");
});

test("collections_content_type_list returns every content type as the same model-facing view, regardless of status", async () => {
  const registration = wiredRegistration("collections_content_type_list", existingRecipe("deprecated"));

  const output = (await registration.handler(executionContext({}))) as { contentTypes: Array<Record<string, unknown>> };

  assert.equal(output.contentTypes.length, 1);
  assert.deepEqual(Object.keys(output.contentTypes[0]).sort(), ["fields", "key", "label", "status", "version"]);
  assert.equal(output.contentTypes[0].status, "deprecated");
  assert.equal("workspaceId" in output.contentTypes[0], false, "same drop as every other content-type view — the agent cannot change its own workspace");
});

test("collections_content_type_list returns an empty list rather than an error when the workspace has none", async () => {
  const registration = wiredRegistration("collections_content_type_list");
  const output = (await registration.handler(executionContext({}))) as { contentTypes: unknown[] };
  assert.deepEqual(output.contentTypes, []);
});

test("the returned fields array is a copy — a tool caller cannot mutate domain state through it", async () => {
  const record = existingRecipe();
  const output = (await wiredRegistration("collections_content_type_deprecate", record).handler(executionContext({ key: "recipe", expectedVersion: 1 }))) as {
    contentType: { fields: unknown[] };
  };

  output.contentType.fields.push({ name: "injected", kind: "text", required: false, queryable: false });
  assert.equal(record.fields.length, 1, "pushing onto the returned view must not reach the record the domain still holds");
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted (finding 3a)
// ---------------------------------------------------------------------------

test("the real catalog and this layer's independent classification agree for every wired tool", () => {
  for (const id of registrationsById().keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for a mutating handler fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("collections_content_type_tombstone", { ...catalogEntry("collections_content_type_tombstone"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("an unclassified tool id is refused rather than assumed safe — the conservative default is 'refuse'", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("collections_future_tool", { ...catalogEntry("collections_content_type_define"), name: "collections_future_tool" }),
    /has no entry in DERIVED_RISK_BY_TOOL_ID/,
  );
});

test("the mismatch check is symmetric — an over-declared risk fails too, so the two sources must genuinely agree", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("collections_content_type_define", { ...catalogEntry("collections_content_type_define"), sideEffects: "mints-token" }),
    /declares sideEffects 'mints-token' but this layer derives 'mutates-durable-state'/,
  );
});

// ---------------------------------------------------------------------------
// 4. Confirmation-transport guard (finding 3c)
// ---------------------------------------------------------------------------

test("a tool declaring confirmer-must-equal-own-delegatedBy cannot be wired while no confirmation transport exists", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("collections_content_type_tombstone", { ...catalogEntry("collections_content_type_tombstone"), actorClassRule: "confirmer-must-equal-own-delegatedBy" }),
    /requires a human-confirmation transport/,
  );
});

test("no CURRENTLY wired tool carries a confirmation-requiring actor-class rule — the guard above is an invariant, not a live fix", () => {
  for (const id of registrationsById().keys()) {
    assert.notEqual(catalogEntry(id).actorClassRule, "confirmer-must-equal-own-delegatedBy", `${id} is wired, so it must not claim a human-confirmation requirement Tovu cannot honor`);
  }
});

test("collections_execute_cleanup — the one catalog entry that DOES carry the rule — is still not wired", () => {
  const wired = [...registrationsById().keys()];

  assert.equal(catalogEntry("collections_execute_cleanup").actorClassRule, "confirmer-must-equal-own-delegatedBy");
  assert.equal(wired.includes("collections_execute_cleanup"), false, "wiring it would fail assertRiskMetadataIsWirable — this test records that it is not wired in the first place");
});

test("an actorClassRule that does NOT require confirmation is wirable — the guard is specific, not a blanket ban on actor-class rules", () => {
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("collections_content_type_define", { ...catalogEntry("collections_content_type_define"), actorClassRule: "user-only" }));
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("collections_content_type_define", { ...catalogEntry("collections_content_type_define"), actorClassRule: "none" }));
});
