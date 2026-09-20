import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { adminScreenLinkAgentToolCatalog } from "../admin-screen-link-tool.js";
import { agentPluginSearchAgentToolCatalog, agentPluginUninstallAgentToolCatalog } from "../../features/agent-plugins/tool-registrations.js";
import { contentDuplicationAgentToolCatalog } from "../../features/content-duplication/agent-tools.js";
import { publishContentAgentToolCatalog } from "../../features/publish-content/agent-tools.js";
import { getTrashAgentToolCatalog } from "../../features/trash/agent-tools.js";
import { getFsFilesAgentToolCatalog } from "../../features/fs-files/agent-tools.js";
import { supabaseConnectAgentToolCatalog } from "../../features/supabase-connect/agent-tools.js";
import { externalMcpAgentToolCatalog } from "../../features/external-mcp/agent-tools.js";
import { askChoiceAgentToolCatalog } from "../ask-choice-tool.js";
import { componentCatalogAgentToolCatalog } from "../component-catalog-tool.js";
import { demoA2uiAgentToolCatalog } from "../demo-a2ui-tool.js";
import { demoChoicesAgentToolCatalog } from "../demo-choices-tool.js";
import { demoImageAgentToolCatalog } from "../demo-image-tool.js";
import { externalMcpReauthAgentToolCatalog } from "../external-mcp-reauth-tool.js";
import { renderUiAgentToolCatalog } from "../render-ui-tool.js";
import { commentsAgentToolCatalog } from "../../features/comments/agent-tools.js";
import {
  contentTypesAgentToolCatalog,
  type AgentToolDefinition,
} from "../../features/content-types/index.js";
import { customCredentialsAgentToolCatalog } from "../../features/custom-credentials/agent-tools.js";
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
import { sitesAgentToolCatalog } from "../../features/sites/index.js";
import { sourceControlAgentToolCatalog } from "../../features/source-control/tool-registrations.js";
import { siteEvidenceAgentToolCatalog } from "../../features/site-evidence/agent-tools.js";
import { taxonomyAgentToolCatalog } from "../../features/taxonomy/agent-tools.js";
import { getWorkspaceAgentToolCatalog } from "../../features/workspace/index.js";
import { formsAgentToolCatalog } from "../../features/forms/agent-tools.js";
import { identityAgentToolCatalog } from "@jini-ai/cms/identity";
import { getWebhooksAgentToolCatalog } from "../../features/webhooks/agent-tools.js";
import { getThemesAgentToolCatalog } from "../../features/theme/agent-tools.js";
import { mediaAgentToolCatalog } from "../../features/media/index.js";
import { mediaGenerationAgentToolCatalog } from "../../features/media-generation/agent-tools.js";
import { mediaImportAgentToolCatalog } from "../../features/media-import/agent-tools.js";
import { membersAgentToolCatalog } from "../../features/members/agent-tools.js";
import { menusAgentToolCatalog } from "../../features/navigation/index.js";
import { newsletterAgentToolCatalog } from "../../features/newsletter/agent-tools.js";
import { getRedirectsAgentToolCatalog } from "../../features/redirects/agent-tools.js";
import { getSeoAgentToolCatalog } from "../../features/seo/agent-tools.js";
import { widgetsAgentToolCatalog } from "../../features/widgets/agent-tools.js";
import type { ContentTypeRecord } from "../../features/content-types/index.js";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { listToolContributors, resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { RETIRED_READ_TOOL_TO_CARD } from "../content-read-tool.js";

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

/**
 * Every wired domain's own catalog, keyed by the exact `domain` string that domain registers
 * under — either `tool-contribution-registry.ts`'s `listToolContributors()` (every
 * `contribute<Domain>Tools()` call `installFirstPartyToolContributors()` makes; see that file's
 * own header) or `tool-registrations.ts`'s private, not-yet-converted `DOMAIN_SLICES` array (today:
 * the four in-chat UI domains plus `component-catalog`/`ask-choice` — see that file's own header
 * for why both seams still coexist).
 *
 * This is the declared side of every cross-check below, independent of what
 * `buildAssistantToolRegistrations` actually builds — so keying it by domain and checking it
 * against the REAL registered-domain list (the completeness test right after this) is what makes a
 * newly wired domain's missing catalog entry fail LOUDLY, by domain name, instead of silently
 * reproducing the exact drift `media_generate_asset` hit here (registered via
 * `contributeMediaGenerationTools()` on 2026-09-02; this map never got its `media-generation` entry
 * added) — and `pages` hit before it (`DOMAIN_SLICES`'s own `buildPagesRegistrations` entry, added
 * without its catalog import; confirmed via `git show HEAD:<this file>` before this dispatch touched
 * anything). Both are entries below now.
 *
 * The completeness test can only walk `listToolContributors()` for the 29 registry-based domains —
 * `DOMAIN_SLICES` itself is a private, unexported const in `assistant/tool-registrations.ts`
 * (confirmed: no exported getter for its domain names exists there as of this dispatch), and adding
 * one is a production-file change outside this dispatch's scope (`assistant/tool-registrations.ts`
 * is exactly the file a concurrently-running sibling agent may also be editing to add DOMAIN_SLICES'
 * next entry, per this dispatch's own brief — editing it here risks a live collision, not just a
 * scope violation). So the 6 DOMAIN_SLICES-only domains below (`demo-choices`/`demo-a2ui`/
 * `demo-image`/`render-ui`/`component-catalog`/`ask-choice`) stay a disclosed, hand-maintained
 * fallback for exactly that reason — everything else derives.
 *
 * The `as unknown as` casts cover the catalogs whose own `AgentToolDefinition` is a structural
 * sibling rather than the content-types one this map is typed as (identity requires `inputSchema`,
 * database/recovery/plugins/workspace/settings/taxonomy/seo/redirects/integrations/post/themes/
 * static-publish/media-generation each declare their own copy — taxonomy's and static-publish's
 * additionally carry `actorClassRule`) — the shared structural supertype lives in
 * `assistant/tool-registration-kit.ts`.
 */
const CATALOGS_BY_DOMAIN: Record<string, AgentToolDefinition[]> = {
  "content-types": contentTypesAgentToolCatalog,
  forms: formsAgentToolCatalog,
  identity: identityAgentToolCatalog,
  comments: commentsAgentToolCatalog,
  members: membersAgentToolCatalog,
  newsletter: newsletterAgentToolCatalog,
  media: mediaAgentToolCatalog,
  widgets: widgetsAgentToolCatalog,
  menus: menusAgentToolCatalog,
  database: getDatabaseAgentToolCatalog() as unknown as AgentToolDefinition[],
  recovery: recoveryAgentToolCatalog as unknown as AgentToolDefinition[],
  plugins: pluginAgentToolCatalog as unknown as AgentToolDefinition[],
  workspace: getWorkspaceAgentToolCatalog() as unknown as AgentToolDefinition[],
  settings: getSettingsAgentToolCatalog() as unknown as AgentToolDefinition[],
  entries: entriesAgentToolCatalog as unknown as AgentToolDefinition[],
  taxonomy: taxonomyAgentToolCatalog as unknown as AgentToolDefinition[],
  seo: getSeoAgentToolCatalog() as unknown as AgentToolDefinition[],
  redirects: getRedirectsAgentToolCatalog() as unknown as AgentToolDefinition[],
  integrations: getWebhooksAgentToolCatalog() as unknown as AgentToolDefinition[],
  post: postAgentToolCatalog as unknown as AgentToolDefinition[],
  themes: getThemesAgentToolCatalog() as unknown as AgentToolDefinition[],
  deployments: deploymentsAgentToolCatalog as unknown as AgentToolDefinition[],
  pages: pagesAgentToolCatalog as unknown as AgentToolDefinition[],
  "static-publish": staticPublishAgentToolCatalog as unknown as AgentToolDefinition[],
  "source-control": sourceControlAgentToolCatalog as unknown as AgentToolDefinition[],
  "site-evidence": siteEvidenceAgentToolCatalog as unknown as AgentToolDefinition[],
  "site-inspection": siteInspectionAgentToolCatalog as unknown as AgentToolDefinition[],
  // 2026-09-05: `sites` — `sites_duplicate_site`, wiring `platform/site-dir/duplicate-site.ts`'s
  // `duplicateSite` to the assistant. See `server/tool-catalog-manifest.ts`'s own header.
  sites: sitesAgentToolCatalog as unknown as AgentToolDefinition[],
  "custom-credentials": customCredentialsAgentToolCatalog as unknown as AgentToolDefinition[],
  // `media-generation` (2026-09-02): `media_generate_asset`, wired via
  // `contributeMediaGenerationTools()` — see `features/media-generation/tool-registrations.ts`'s own
  // header. The entry this dispatch was sent to add; see this const's own doc above.
  "media-generation": mediaGenerationAgentToolCatalog as unknown as AgentToolDefinition[],
  // `media-import` (2026-09-06): `media_import_from_url`, wired via `contributeMediaImportTools()` —
  // see `features/media-import/tool-registrations.ts`'s own header. Added at the same time the
  // contributor was, rather than after the completeness test above caught it.
  "media-import": mediaImportAgentToolCatalog as unknown as AgentToolDefinition[],
  // The 8 `DOMAIN_SLICES`-only domains — disclosed hand-maintained fallback, see this const's own
  // doc above for why they cannot derive the same way.
  "demo-choices": demoChoicesAgentToolCatalog as unknown as AgentToolDefinition[],
  "demo-a2ui": demoA2uiAgentToolCatalog as unknown as AgentToolDefinition[],
  "demo-image": demoImageAgentToolCatalog as unknown as AgentToolDefinition[],
  "render-ui": renderUiAgentToolCatalog as unknown as AgentToolDefinition[],
  "component-catalog": componentCatalogAgentToolCatalog as unknown as AgentToolDefinition[],
  "ask-choice": askChoiceAgentToolCatalog as unknown as AgentToolDefinition[],
  "external-mcp-reauth": externalMcpReauthAgentToolCatalog as unknown as AgentToolDefinition[],
  // 2026-09-03: `admin-screen-link` — the general "take the human to the right admin screen"
  // fallback. See `admin-screen-link-tool.ts`'s own header for why it is read-only and returns a
  // path rather than driving `page.navigate` itself.
  "admin-screen-link": adminScreenLinkAgentToolCatalog as unknown as AgentToolDefinition[],
  // 2026-09-09: `agent-plugin-search` — `search_agent_plugin_local`, wired via
  // `contributeAgentPluginSearchTools()`. See `features/agent-plugins/tool-registrations.ts`'s own
  // "search_agent_plugin_local" section header for why this is a SEPARATE, static tool from the
  // dynamic `agent_plugin_<pluginId>` tools that same file also registers (those are NOT wired
  // through the tool-contribution registry at all, so they never appear in this map either).
  "agent-plugin-search": agentPluginSearchAgentToolCatalog as unknown as AgentToolDefinition[],
  // 2026-09-09: `agent-plugin-uninstall` — `agent_plugins_uninstall`, wired via
  // `contributeAgentPluginUninstallTools()`. See `features/agent-plugins/tool-registrations.ts`'s
  // own "agent_plugins_uninstall" section header — added at the same time the contributor was,
  // rather than after this file's completeness test caught it (the `media-generation` drift above).
  "agent-plugin-uninstall": agentPluginUninstallAgentToolCatalog as unknown as AgentToolDefinition[],
  // Pre-existing gap, unrelated to `agent-plugin-search` — found and fixed opportunistically while
  // adding the entry above. `content-duplication` (`content_duplicate`, 2026-09-07 per
  // `tool-catalog-manifest.ts`'s own header) was already wired in production with no entry here,
  // the exact "domain wired, catalog entry forgotten" drift this whole file exists to catch.
  "content-duplication": contentDuplicationAgentToolCatalog as unknown as AgentToolDefinition[],
  // Same pre-existing class as `content-duplication` above: `external-mcp` (`external_mcp_list`/
  // `external_mcp_save`/etc., 2026-09-07) was wired via `contributeExternalMcpTools()` with no
  // catalog entry here — distinct from the already-present `external-mcp-reauth` above, a different
  // domain that only wires the single re-auth notice tool.
  "external-mcp": externalMcpAgentToolCatalog as unknown as AgentToolDefinition[],
  // Same class again: `fs-files` (`fs_list_files`/`fs_read_file`, 2026-09-10) was wired via
  // `contributeFsFilesTools()` with no entry here, so the completeness test above and every per-tool
  // lookup that reached `fs_list_files` went red.
  "fs-files": getFsFilesAgentToolCatalog() as unknown as AgentToolDefinition[],
  // And again: `supabase-connect` (SPEC-052 M2, d0666279) wired via `contributeSupabaseConnectTools()`
  // with no entry here — surfaced the moment the `fs-files` entry above let the loop get past it.
  "supabase-connect": supabaseConnectAgentToolCatalog as unknown as AgentToolDefinition[],
  // Same class again: `publish-content` was wired via `contributePublishContentTools()` with no
  // entry here, so the completeness test above and every per-tool lookup that reached
  // `publish_content_status` went red. Found already failing at HEAD while adding `trash` below.
  "publish-content": publishContentAgentToolCatalog as unknown as AgentToolDefinition[],
  // 2026-09-20: `trash` — `trash_list_items` and `trash_restore_item`, wired via
  // `contributeTrashTools()`. Added with the contributor rather than after this test caught it.
  // The catalog has exactly two entries and must never grow a purge tool; see
  // `features/trash/__tests__/tool-registrations.purge-ban.test.ts`.
  trash: getTrashAgentToolCatalog() as unknown as AgentToolDefinition[],
};

/** Flattened view of {@link CATALOGS_BY_DOMAIN} for the per-tool-id lookups below — every catalog
 * whose entries `buildAssistantToolRegistrations` wires, in one array. */
const WIRED_CATALOGS: AgentToolDefinition[] = Object.values(CATALOGS_BY_DOMAIN).flat();

test("CATALOGS_BY_DOMAIN has an entry for every domain the tool-contribution registry actually has installed — not just the domains this file remembered to add", () => {
  const registeredDomains = listToolContributors().map((contributor) => contributor.domain);
  assert.ok(registeredDomains.length > 0, "installFirstPartyToolContributors() must have run (see this file's top-level call) before this check means anything");

  for (const domain of registeredDomains) {
    assert.ok(
      domain in CATALOGS_BY_DOMAIN,
      `'${domain}' is registered in the tool-contribution registry (installFirstPartyToolContributors wired it) but CATALOGS_BY_DOMAIN has no entry for it — add that domain's own *AgentToolCatalog import here. This is the exact drift 'media_generate_asset' hit: a domain wired in production with no catalog entry in this test file.`,
    );
  }
});

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = WIRED_CATALOGS.find((tool) => tool.name === toolId);
  assert.ok(entry, `no wired catalog has an entry for '${toolId}'`);
  return entry;
}

/**
 * Every `content_read.<resource>` id the Tier-1 read collapse (`content-read-tool.ts`,
 * `deriveContentReadRegistrations`) produces, derived from {@link RETIRED_READ_TOOL_TO_CARD}'s own
 * values rather than a hand-copied prefix check.
 *
 * These ids are excluded from the three generic per-tool loops below (`catalogEntry()` cannot
 * resolve them, and never should):
 * 1. a merged (get+list) card's published `inputSchema`/`description` is `unionInputSchema()`'s
 *    union / a concatenation of its member(s)' own already-published values (`content-read-
 *    tool.ts`'s `cardDescription`/`unionInputSchema`) — not a literal `AgentToolDefinition`. No
 *    domain catalog declares an entry named `content_read.*`; there is nothing for `catalogEntry()`
 *    to find.
 * 2. `assertRiskMetadataIsWirable`'s risk cross-check cannot apply either, and not only because
 *    `catalogEntry()` has nothing to hand it: `deriveContentReadRegistrations` runs in
 *    `buildAssistantToolRegistrations` AFTER every member's own risk was already cross-checked
 *    under its ORIGINAL id, as part of that domain's normal `buildDomainRegistrations` wiring
 *    (confirmed: `backup_list_restore_points` is checked there, before the collapse ever sees it).
 *    Re-running the same gate under the card's relabeled id would look up a key
 *    `derivedRiskByToolId()` never contributes an entry for — always "no entry in
 *    DERIVED_RISK_BY_TOOL_ID", regardless of what `catalogEntry()` returns — not real drift.
 * 3. same reasoning for `actorClassRule`: CONTENT_READ_CARDS are exclusively read-only
 *    (`content-read-tool.ts` hardcodes `derivedRisk.set(id, "none")` for every card), so no member
 *    ever carries a confirmation-requiring rule in the first place; the property this guards is
 *    already true by construction here, not something worth re-deriving from a nonexistent entry.
 *
 * `collections_content_type_list`'s own carve-out in `tool-registrations.authorization.test.ts` is
 * the identical reasoning, one domain earlier (that file's header explains it in full).
 */
const DERIVED_CONTENT_READ_IDS: ReadonlySet<string> = new Set(RETIRED_READ_TOOL_TO_CARD.values());

// ---------------------------------------------------------------------------
// 1. Published contracts
// ---------------------------------------------------------------------------

test("every wired registration publishes the inputSchema from its catalog entry — the descriptor no longer carries only {id, description}", () => {
  for (const [id, registration] of registrationsById()) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    if (DERIVED_CONTENT_READ_IDS.has(id)) continue; // union schema / concatenated description — see DERIVED_CONTENT_READ_IDS's own doc
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

test("content_read.collection_content_type returns every content type as the same model-facing view, regardless of status", async () => {
  const registration = wiredRegistration("content_read.collection_content_type", existingRecipe("deprecated"));

  const output = (await registration.handler(executionContext({}))) as { contentTypes: Array<Record<string, unknown>> };

  assert.equal(output.contentTypes.length, 1);
  assert.deepEqual(Object.keys(output.contentTypes[0]).sort(), ["fields", "key", "label", "status", "version"]);
  assert.equal(output.contentTypes[0].status, "deprecated");
  assert.equal("workspaceId" in output.contentTypes[0], false, "same drop as every other content-type view — the agent cannot change its own workspace");
});

test("content_read.collection_content_type returns an empty list rather than an error when the workspace has none", async () => {
  const registration = wiredRegistration("content_read.collection_content_type");
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
    if (DERIVED_CONTENT_READ_IDS.has(id)) continue; // already cross-checked pre-collapse, under its original id — see DERIVED_CONTENT_READ_IDS's own doc
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
    if (DERIVED_CONTENT_READ_IDS.has(id)) continue; // read-only by construction — see DERIVED_CONTENT_READ_IDS's own doc
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

// ---------------------------------------------------------------------------
// 6. component-catalog reachability — BYOK's ONLY path to search_components/describe_component (2026-08-30)
// ---------------------------------------------------------------------------

/**
 * The bug this pins: `search_components`/`describe_component` were real `@jini-ai/mcp` top-level
 * tools for the spawned-CLI path (`registerComponentCatalogRoutes` in `agent-daemon-server.ts`), but
 * `byok-tool-surface.ts` publishes only 3 meta-tools and resolves every other tool by an id through
 * `execute_delegated_tool` against the SAME `ToolRegistry` `buildRealAssembledSurface()` builds
 * below. Before `component-catalog-tool.ts` existed, neither id was registered there, so a BYOK turn
 * had no path to the interactive-component catalog at all — confirmed in production
 * `agent_tool_attempts` (`phase='unknown-tool'`) for exactly these two ids, plus two guessed variants
 * (`assistant_search_components`/`assistant_describe_component`) from a model that had correctly
 * learned "look this up like any other tool" but found no registry entry under either name.
 */
test("search_components and describe_component are present in the REAL ToolRegistry, built the same way agent-daemon-server.ts and byok-tool-surface.ts both build it", async () => {
  const { registry } = await buildRealAssembledSurface();

  assert.equal(registry.has("search_components"), true);
  assert.equal(registry.has("describe_component"), true);
});

test("both are discoverable through the real search_tools/describe_tool catalog — the ONLY channel a BYOK turn has to reach them", async () => {
  const { catalog } = await buildRealAssembledSurface();

  const search = catalog.describe("search_components");
  const describe = catalog.describe("describe_component");
  assert.ok(search, "search_components must be describable via describe_tool");
  assert.ok(describe, "describe_component must be describable via describe_tool");
  assert.match(search!.description, /interactive-UI component catalog/);

  const hits = catalog.search("find a UI component to render a chart", 25);
  assert.ok(
    hits.some((hit) => hit.id === "search_components"),
    `expected search_components among search hits: ${JSON.stringify(hits.map((h) => h.id))}`,
  );
});

test("search_components actually executes through the REAL ToolExecutor and returns real manifest hits — the same gate execute_delegated_tool routes through", async () => {
  const { routeDeps, toolExecutor } = await buildRealAssembledSurface();
  const ownerPrincipal = { id: await routeDeps.ownerPrincipalId };

  const result = await toolExecutor.execute(ownerPrincipal, { id: "run-1" }, "search_components", { query: "button" });

  assert.equal(result.status, "completed", `expected a real completed execution, got: ${JSON.stringify(result)}`);
  assert.ok(Array.isArray(result.output), "search_components must return an array of hits");
});

test("describe_component actually executes and rejects an unknown id with a plain, non-crashing error — presence in the registry is not the same as being callable", async () => {
  const { routeDeps, toolExecutor } = await buildRealAssembledSurface();
  const ownerPrincipal = { id: await routeDeps.ownerPrincipalId };

  const result = await toolExecutor.execute(ownerPrincipal, { id: "run-1" }, "describe_component", { id: "nonexistent.component" });

  assert.equal(result.status, "failed", `expected a real failed execution for an unknown id, got: ${JSON.stringify(result)}`);
  assert.match(result.error ?? "", /nonexistent\.component.*was not found/);
});

// ---------------------------------------------------------------------------
// 7. admin-screen-link wiring (2026-09-03) — the general "take the human to the right admin
//    screen" fallback actually reaches buildAssistantToolRegistrations, not just its own catalog
// ---------------------------------------------------------------------------

test("assistant_admin_screen_link is wired into the real assistant tool registry, read-only, with no confirmation requirement", () => {
  const registration = wiredRegistration("assistant_admin_screen_link");

  assert.equal(registration.descriptor.readOnly, true, "a fallback that only points at a screen must be read-only");
  assert.equal(registration.descriptor.requiresConfirmation, undefined);
  assert.deepEqual(registration.descriptor.inputSchema, adminScreenLinkAgentToolCatalog[0]!.inputSchema);
});

// ---------------------------------------------------------------------------
// 8. agent_plugins_uninstall wiring (2026-09-09) — present in the REAL ToolRegistry, not merely
//    compiling. See `features/agent-plugins/tool-registrations.ts`'s own "agent_plugins_uninstall"
//    section header and `uninstall.ts`'s file header for the domain function this wires.
// ---------------------------------------------------------------------------

test("agent_plugins_uninstall is present in the REAL ToolRegistry built the same way agent-daemon-server.ts builds it — not merely in the source catalog array", async () => {
  const { registry } = await buildRealAssembledSurface();

  // `registry.has()` reflects `.register()` having actually been called for this id —
  // unreachable if `contributeAgentPluginUninstallTools()` were not installed by
  // `installFirstPartyToolContributors()`, or if `buildAgentPluginUninstallRegistrations` left the
  // id out of its returned `ToolRegistration[]` (both real ways this could regress).
  assert.equal(registry.has("agent_plugins_uninstall"), true);

  const registration = wiredRegistration("agent_plugins_uninstall");
  assert.equal(registration.descriptor.readOnly, false, "a delete must never be reported read-only");
});

test("agent_plugins_uninstall is discoverable through the real search_tools/describe_tool catalog", async () => {
  const { catalog } = await buildRealAssembledSurface();

  const described = catalog.describe("agent_plugins_uninstall");
  assert.ok(described, "agent_plugins_uninstall must be describable — search_tools/describe_tool is how a spawned CLI or a BYOK turn actually finds a tool id");
  assert.match(described!.description, /PERMANENTLY removes an installed Agent Plugin/);

  const hits = catalog.search("uninstall an agent plugin", 25);
  assert.ok(hits.some((hit) => hit.id === "agent_plugins_uninstall"), `expected agent_plugins_uninstall among search hits: ${JSON.stringify(hits.map((h) => h.id))}`);
});

test("agent_plugins_uninstall actually executes through the REAL ToolExecutor and rejects an unknown pluginId as a validation failure, not a crash", async () => {
  const { routeDeps, toolExecutor } = await buildRealAssembledSurface();
  const ownerPrincipal = { id: await routeDeps.ownerPrincipalId };

  const result = await toolExecutor.execute(ownerPrincipal, { id: "run-1" }, "agent_plugins_uninstall", { pluginId: "definitely-not-installed" });

  assert.equal(result.status, "failed", `expected a real failed execution for an unknown id, got: ${JSON.stringify(result)}`);
  assert.match(result.error ?? "", /not installed/);
});
