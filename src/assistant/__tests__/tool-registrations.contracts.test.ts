import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { demoA2uiAgentToolCatalog } from "../demo-a2ui-tool.js";
import { demoChoicesAgentToolCatalog } from "../demo-choices-tool.js";
import { demoImageAgentToolCatalog } from "../demo-image-tool.js";
import { renderUiAgentToolCatalog } from "../render-ui-tool.js";
import { commentsAgentToolCatalog } from "../../comments/agent-tools.js";
import {
  contentTypesAgentToolCatalog,
  type AgentToolDefinition,
} from "../../features/content-types/index.js";
import { getDatabaseAgentToolCatalog } from "../../features/database/agent-tools.js";
import { deploymentsAgentToolCatalog } from "../../features/deployments/agent-tools.js";
import { staticPublishAgentToolCatalog } from "../../features/deployments/publish-agent-tools.js";
import { entriesAgentToolCatalog } from "../../features/entries/index.js";
import { pagesAgentToolCatalog } from "../../features/pages/agent-tools.js";
import { pluginAgentToolCatalog } from "../../features/plugin-runtime/agent-tools.js";
import { postAgentToolCatalog } from "../../features/post/agent-tools.js";
import { recoveryAgentToolCatalog } from "../../features/recovery/agent-tools.js";
import { getSettingsAgentToolCatalog } from "../../features/settings/index.js";
import { siteInspectionAgentToolCatalog } from "../../features/site-inspection/index.js";
import { sourceControlAgentToolCatalog } from "../../features/source-control/tool-registrations.js";
import { siteEvidenceAgentToolCatalog } from "../../features/site-evidence/agent-tools.js";
import { taxonomyAgentToolCatalog } from "../../features/taxonomy/agent-tools.js";
import { getWorkspaceAgentToolCatalog } from "../../features/workspace/index.js";
import { formsAgentToolCatalog } from "../../forms/agent-tools.js";
import { identityAgentToolCatalog } from "@jini-ai/cms/identity";
import { getWebhooksAgentToolCatalog } from "../../webhooks/agent-tools.js";
import { getThemesAgentToolCatalog } from "../../features/theme/agent-tools.js";
import { mediaAgentToolCatalog } from "../../media/index.js";
import { membersAgentToolCatalog } from "../../members/agent-tools.js";
import { menusAgentToolCatalog } from "../../navigation/index.js";
import { newsletterAgentToolCatalog } from "../../newsletter/agent-tools.js";
import { getRedirectsAgentToolCatalog } from "../../redirects/agent-tools.js";
import { getSeoAgentToolCatalog } from "../../seo/agent-tools.js";
import { widgetsAgentToolCatalog } from "../../widgets/agent-tools.js";
import type { ContentTypeRecord } from "../../features/content-types/index.js";
import { createRouteDeps } from "../../server/app.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../server/tool-catalog-manifest.js";

// `comments`/`newsletter` moved off `assistant/tool-registrations.ts`'s static
// `DOMAIN_SLICES` array onto the tool-contribution registry (2026-08-17 — see
// `tool-contribution-registry.ts`'s header). This file builds the FULL catalog and asserts against
// every wired domain, so — like the real composition roots (`agent-daemon-server.ts`,
// `assistant-byok.ts`) — it must install first-party contributors before calling
// `buildAssistantToolRegistrations`, or those 2 domains' tools would simply be missing from
// `registrationsById()` below rather than exercised. (`post` was also tried and reverted the same
// night — see `features/post/tool-registrations.ts`'s trailing comment — so it stays on the static
// seam and needs no install call.)
resetToolContributorsForTests();
installFirstPartyToolContributors();

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
 * be added here — an id missing from all of them fails rather than being skipped. All 24 wired
 * domains are listed (`deployments` added 2026-08-15; `pages` was missing before that dispatch —
 * see the comment on its own array entry below; `static-publish` added 2026-08-15 in this dispatch,
 * for the same reason `deployments` is here — it wires `deployment_preview_static_publish` and
 * needs its catalog entry resolvable for the same generic assertions); the generic contract/risk
 * assertions below iterate EVERY wired registration, not just content-types', so each domain's
 * catalog has to be resolvable from here even when that domain also has its own dedicated test
 * file. The `as unknown as` casts cover the catalogs whose own `AgentToolDefinition` is a
 * structural sibling rather than the content-types one this array is typed as (identity requires
 * `inputSchema`, database/recovery/plugins/workspace/settings/taxonomy/seo/redirects/integrations/
 * post/themes/static-publish each declare their own copy — taxonomy's and static-publish's
 * additionally carry `actorClassRule`) — the shared structural supertype lives in
 * `assistant/tool-registration-kit.ts`. */
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
  ...(getWebhooksAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(postAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(getThemesAgentToolCatalog() as unknown as AgentToolDefinition[]),
  ...(deploymentsAgentToolCatalog as unknown as AgentToolDefinition[]),
  // Pre-existing gap, not introduced by this dispatch: `pages` (`DOMAIN_SLICES`'s own
  // `buildPagesRegistrations` entry) was never added here when it was wired in, so
  // `pages_read_html`/`pages_write_html` failed `catalogEntry()` lookups below at HEAD already —
  // confirmed via `git show HEAD:<this file>`, before this dispatch touched anything. Fixed here
  // since this dispatch is already editing this exact array for `deployments`.
  ...(pagesAgentToolCatalog as unknown as AgentToolDefinition[]),
  // `static-publish` (`DOMAIN_SLICES`'s own `buildStaticPublishRegistrations` entry): as of
  // 2026-08-15 all 3 catalog entries are wired, including `deployment_execute_static_publish` (see
  // `publish-agent-tools.ts`'s own file header for the human-gated MCP-UI mechanism that made
  // wiring it safe). This comment previously said only the preview tool was wired and the execute
  // tool was "never-wired" — that was true before this dispatch and is stale now; corrected here
  // rather than left to mislead the next reader.
  ...(staticPublishAgentToolCatalog as unknown as AgentToolDefinition[]),
  // `source-control` (`DOMAIN_SLICES`'s own `buildSourceControlRegistrations` entry, added
  // 2026-08-16): both catalog entries are wired — `source_control_get_capabilities` (a pure read)
  // and `source_control_execute_commit` (human-gated via the same MCP-UI held-open exchange
  // `deployment_execute_static_publish` uses). See `features/source-control/tool-registrations.ts`'s
  // own file header.
  ...(sourceControlAgentToolCatalog as unknown as AgentToolDefinition[]),
  // `site-evidence` (2026-08-26): one tool, `site_collect_page_evidence` — the browser-backed
  // render-truth capability. Registered through `contributeSiteEvidenceTools()` like every other
  // domain, so its catalog belongs in this array for the same reason theirs do.
  ...(siteEvidenceAgentToolCatalog as unknown as AgentToolDefinition[]),
  // `site-inspection` (2026-08-26): both entries wired — `site_get_profile` (a config snapshot
  // whose FIVE per-section authorization decisions live in `buildSiteProfile`, not in the handler,
  // so its catalog `authorization.permission` is a visibility floor rather than the gate; see
  // `features/site-inspection/agent-tools.ts`'s own header) and `fetch_published_page` (one
  // same-origin render of this site's public surface, gated inline by the handler like `theme_list`).
  ...(siteInspectionAgentToolCatalog as unknown as AgentToolDefinition[]),
  // The four in-chat UI domains (2026-08-26): one tool each — `assistant_demo_choices`,
  // `assistant_demo_a2ui`, `assistant_demo_image`, `assistant_render_ui`. They were absent from
  // this array for as long as `TOVU_ENABLE_DEMO_TOOLS` kept them unwired, so the contract checks
  // below never saw them. Removing that gate is what put them in scope, and this file failing on
  // exactly that is the guard working: a newly-wired tool with no catalog entry here is a tool
  // publishing a descriptor nothing has checked against its own catalog.
  ...(demoChoicesAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(demoA2uiAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(demoImageAgentToolCatalog as unknown as AgentToolDefinition[]),
  ...(renderUiAgentToolCatalog as unknown as AgentToolDefinition[]),
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

// ---------------------------------------------------------------------------
// 5. static-publish reachability — the ASSEMBLED surface, not the source catalog (A3)
// ---------------------------------------------------------------------------

/**
 * `registrationsById()` above (and every other assertion in this file) resolves catalog entries
 * against {@link WIRED_CATALOGS} — an array built directly from each domain's own
 * `*AgentToolCatalog` export. That is the DECLARED side. It is deliberately NOT what the tests below
 * check: `staticPublishAgentToolCatalog` used to carry `deployment_execute_static_publish` as a
 * catalog entry for months while `DOMAIN_SLICES` left it unwired (see this file's own git history
 * and `publish-agent-tools.ts`'s header) — so "present in the catalog array" was true even when the
 * tool could not actually be called by anything. These tests instead build the REAL production
 * objects: a `ToolRegistry` via `createToolRegistry()` + `.register()` (the exact two calls
 * `agent-daemon-server.ts:282-288` and `byok-tool-surface.ts:279-282` make — both real composition
 * roots, not test doubles), a real `ToolExecutor` via `createToolExecutor({registry})` (no
 * `delegate`, matching production), and the real `buildToolCatalogQuery(registry)` that backs
 * `search_tools`/`describe_tool` for both the spawned-CLI and BYOK paths. Presence is asserted
 * against THOSE, plus one tool is actually executed end to end — not merely listed.
 */
async function buildRealAssembledSurface() {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const catalog = buildToolCatalogQuery(registry);
  return { routeDeps, registry, toolExecutor, catalog };
}

test("deployment_execute_static_publish and deployment_get_static_publish_capabilities are present in the REAL ToolRegistry built the same way agent-daemon-server.ts builds it — not merely in the source catalog array", async () => {
  const { registry } = await buildRealAssembledSurface();

  // `registry.has()` reflects `.register()` having actually been called for this id — unreachable
  // if `DOMAIN_SLICES` did not include `static-publish`, or if `buildStaticPublishRegistrations`
  // left either id out of its returned `ToolRegistration[]` (both real ways this could regress).
  assert.equal(registry.has("deployment_execute_static_publish"), true);
  assert.equal(registry.has("deployment_get_static_publish_capabilities"), true);
  assert.equal(registry.has("deployment_preview_static_publish"), true);
});

test("both tools are discoverable through the real search_tools/describe_tool catalog — the actual channel a model uses to find a tool id before calling it", async () => {
  const { catalog } = await buildRealAssembledSurface();

  // `describe()` is an exact id lookup against `buildToolCatalogQuery`'s FTS5 seed
  // (`registry.list()` — see that function's own doc), not a fuzzy `.search()` match that could
  // pass by coincidentally matching an unrelated tool's description.
  const execute = catalog.describe("deployment_execute_static_publish");
  const capabilities = catalog.describe("deployment_get_static_publish_capabilities");
  assert.ok(execute, "deployment_execute_static_publish must be describable — search_tools/describe_tool is how a spawned CLI or a BYOK turn actually finds a tool id");
  assert.ok(capabilities, "deployment_get_static_publish_capabilities must be describable for the same reason");
  assert.match(execute!.description, /Publishes the current site/);

  const hits = catalog.search("publish the site to a host", 25);
  assert.ok(hits.some((hit) => hit.id === "deployment_execute_static_publish"), `expected deployment_execute_static_publish among search hits: ${JSON.stringify(hits.map((h) => h.id))}`);
});

test("deployment_get_static_publish_capabilities actually executes through the REAL ToolExecutor and returns real per-provider data — presence in the registry is not the same as being callable", async () => {
  const { routeDeps, toolExecutor } = await buildRealAssembledSurface();
  // A bare/unknown principal id is genuinely refused by `createRouteDeps()`'s real `authorize()`
  // ("principal_disabled") — confirmed while writing this test. That is ADR-021's authorization
  // layer doing its job, a different concern from what this test certifies, so this uses the same
  // seeded owner principal `tool-dispatch/forms.dispatch.test.ts` uses for its own real-executor
  // canary rather than working around the denial.
  const ownerPrincipal = { id: await routeDeps.ownerPrincipalId };

  const result = await toolExecutor.execute(ownerPrincipal, { id: "run-1" }, "deployment_get_static_publish_capabilities", {});

  assert.equal(result.status, "completed", `expected a real completed execution, got: ${JSON.stringify(result)}`);
  const output = result.output as { executionMode: string; providers: Array<{ providerId: string }> };
  // Stale expectation fixed 2026-08-16 (pre-existing, unrelated to source-control's own dispatch):
  // this asserted 4 providers/no 's3-compatible' after that 5th static-publish target had already
  // shipped in `publish-agent-tools.ts`'s own `PROVIDER_IDS` — the assertion had drifted behind the
  // real catalog, not the other way around.
  assert.equal(output.providers.length, 5, "all five static-publish providers must be reported");
  assert.deepEqual(
    output.providers.map((p) => p.providerId).sort(),
    ["cloudflare-pages", "github-pages", "netlify", "s3-compatible", "vercel"],
  );
});
