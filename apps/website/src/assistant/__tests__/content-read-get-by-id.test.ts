import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
/**
 * @file Contract tests for `content_read.<resource>` read-one-by-id (2026-10-08, CRUD gap step 1 —
 * `ADS-memory/reports/tool-crud-coverage-2026-10-08.md`).
 *
 * A card whose domain ships a single-item reader keeps dispatching to it (`get`). A card whose
 * domain ships only a list reader that returns the WHOLE set gains read-one through `listLookup`:
 * the list member's own handler runs unchanged (its own input validation and permission check), and
 * its result is filtered to the item whose id matches. Pinned here:
 *
 * 1. Generic dispatch: no id -> the list, unchanged; an id -> the list member is called WITHOUT the
 *    id (several list readers refuse any input) and its result comes back filtered, in the list's
 *    own shape.
 * 2. Exact not-found text, and the inconclusive variant when the list says it is truncated.
 * 3. Permission refusal is the list reader's own refusal, with nothing leaked.
 * 4. A card that already has a hand-written get keeps using it; the lookup never shadows it.
 * 5. Real domain handlers (themes, forms) through the same derivation, so a shape drift in what a
 *    list returns fails here rather than as a silent "not found".
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createContributionRegistry, createToolRegistry, normalizeToolInput, withBatchInput, ToolInputError, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import { createToolExecutor } from "@jini-ai/daemon";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";

import { buildFormsRegistrations } from "../../features/forms/tool-registrations.js";
import { buildThemesRegistrations } from "../../features/theme/tool-registrations.js";
import { buildMediaRegistrations } from "../../features/media/tool-registrations.js";
import { executeRegisteredTool } from "./fixtures/execute-registered-tool.js";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { deriveContentReadRegistrations } from "../content-read-tool.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";

const PERMISSION_DENIED = "permission denied: theme.set";

function executionContext(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-under-test" }, run: { id: "run-1" }, input, signal: new AbortController().signal } as ToolExecutionContext;
}

/** A source registration standing in for a domain's own built tool. */
function fakeRegistration(id: string, handler: ToolHandler, inputSchema: Record<string, unknown> = { type: "object", additionalProperties: false, required: [], properties: {} }): ToolRegistration {
  return {
    descriptor: { id, description: `${id} description.`, inputSchema },
    handler,
    policy: { authorize: async () => "allow" },
  } as unknown as ToolRegistration;
}

/** Records each call's input so a test can see what the list member actually received. */
function recordingList(result: unknown): { handler: ToolHandler; inputs: unknown[] } {
  const inputs: unknown[] = [];
  return {
    inputs,
    handler: async (ctx) => {
      inputs.push(ctx.input);
      return result;
    },
  };
}

function card(registrations: readonly ToolRegistration[], id: string): ToolRegistration {
  const found = deriveContentReadRegistrations(registrations).find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected '${id}' to be derived`);
  return found;
}

const THEMES = [
  { id: "plain", name: "Plain", tier: "declarative" },
  { id: "hb", name: "HB", tier: "handlebars" },
];

test("no id: the list member runs with the caller's input and its result is returned unchanged", async () => {
  const list = recordingList({ themes: THEMES });
  const theme = card([fakeRegistration("theme_list", list.handler)], "content_read.theme");
  assert.deepEqual(await theme.handler(executionContext({ tier: "declarative" })), { themes: THEMES });
  assert.deepEqual(list.inputs, [{ tier: "declarative" }]);
});

test("an id: the list member runs WITHOUT the id, and only the matching item comes back in the list's own shape", async () => {
  const list = recordingList({ themes: THEMES });
  const theme = card([fakeRegistration("theme_list", list.handler)], "content_read.theme");
  assert.deepEqual(await theme.handler(executionContext({ themeId: "hb" })), { themes: [THEMES[1]] });
  assert.deepEqual(list.inputs, [{}], "a list reader that refuses any input must not be handed the id");
});

test("the other list filters still pass through alongside the id", async () => {
  const list = recordingList({ themes: THEMES });
  const theme = card([fakeRegistration("theme_list", list.handler)], "content_read.theme");
  await theme.handler(executionContext({ themeId: "plain", tier: "declarative" }));
  assert.deepEqual(list.inputs, [{ tier: "declarative" }]);
});

test("not found: exact model-facing text, as a ToolInputError", async () => {
  const theme = card([fakeRegistration("theme_list", recordingList({ themes: THEMES }).handler)], "content_read.theme");
  await assert.rejects(theme.handler(executionContext({ themeId: "missing" })), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, "theme 'missing' was not found — call content_read.theme without id to list valid ids");
    return true;
  });
});

test("a non-string or empty id is refused before the list runs", async () => {
  const list = recordingList({ themes: THEMES });
  const theme = card([fakeRegistration("theme_list", list.handler)], "content_read.theme");
  await assert.rejects(theme.handler(executionContext({ themeId: "" })), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, "'themeId' (non-empty string) is required");
    return true;
  });
  await assert.rejects(theme.handler(executionContext({ themeId: 7 })), ToolInputError);
  assert.deepEqual(list.inputs, []);
});

test("a truncated list makes a miss inconclusive, and the message says so", async () => {
  const users = [{ principalId: "p-1", username: "ada" }];
  const user = card([fakeRegistration("identity_user_list", recordingList({ users, truncated: true, totalCount: 250 }).handler)], "content_read.identity_user");
  assert.deepEqual(await user.handler(executionContext({ principalId: "p-1" })), { users });
  await assert.rejects(user.handler(executionContext({ principalId: "p-999" })), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(
      error.message,
      "identity_user 'p-999' was not found among the listed items, but content_read.identity_user's list is truncated, so it may still exist",
    );
    return true;
  });
});

test("a list with two item families searches both, each by its own id field", async () => {
  const listed = {
    plugins: [{ id: "seo-kit", name: "SEO kit" }],
    agentPlugins: [{ pluginId: "ui-ux-design", skills: [] }],
  };
  const plugin = card([fakeRegistration("plugins_list", recordingList(listed).handler)], "content_read.plugin");
  assert.deepEqual(await plugin.handler(executionContext({ pluginId: "ui-ux-design" })), { plugins: [], agentPlugins: listed.agentPlugins });
  assert.deepEqual(await plugin.handler(executionContext({ pluginId: "seo-kit" })), { plugins: listed.plugins, agentPlugins: [] });
});

test("a nested id path (taxonomy rows are { taxonomy, terms })", async () => {
  const items = [
    { taxonomy: { id: "tx-1", name: "Tags" }, terms: [] },
    { taxonomy: { id: "tx-2", name: "Topics" }, terms: [{ id: "t-1" }] },
  ];
  const taxonomy = card([fakeRegistration("taxonomy_list", recordingList({ items }).handler)], "content_read.taxonomy");
  assert.deepEqual(await taxonomy.handler(executionContext({ taxonomyId: "tx-2" })), { items: [items[1]] });
});

test("the list reader's own permission refusal is the answer, and the id path leaks nothing", async () => {
  const denying: ToolHandler = async () => {
    throw new Error(PERMISSION_DENIED);
  };
  const theme = card([fakeRegistration("theme_list", denying)], "content_read.theme");
  await assert.rejects(theme.handler(executionContext({ themeId: "plain" })), { message: PERMISSION_DENIED });
});

test("a list result missing its declared items key is an internal error, not a silent 'not found'", async () => {
  const theme = card([fakeRegistration("theme_list", recordingList({ rows: THEMES }).handler)], "content_read.theme");
  await assert.rejects(theme.handler(executionContext({ themeId: "plain" })), (error: unknown) => {
    assert.ok(!(error instanceof ToolInputError), "a shape drift must not read as the caller's mistake");
    assert.equal(error instanceof Error ? error.message : "", "content-read-tool.ts: 'theme_list' result has no 'themes' array — the content_read.theme lookup is out of date");
    return true;
  });
});

test("the card schema gains the id as an OPTIONAL property; the list's own properties stay", () => {
  const listSchema = { type: "object", additionalProperties: false, required: [], properties: { tier: { type: "string" } } };
  const theme = card([fakeRegistration("theme_list", recordingList({ themes: [] }).handler, listSchema)], "content_read.theme");
  const schema = theme.descriptor.inputSchema as { required: string[]; properties: Record<string, { type?: string; description?: string }> };
  assert.deepEqual(schema.required, []);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["id", "tier"]);
  assert.equal(schema.properties.id?.type, "string");
  assert.match(schema.properties.id?.description ?? "", /Omit to list instead of fetching a single item\.$/);
});

test("a card with a hand-written get keeps dispatching to it; the list is never consulted for an id", async () => {
  const getInputs: unknown[] = [];
  const get: ToolHandler = async (ctx) => {
    getInputs.push(ctx.input);
    return { redirect: { id: "r-1" } };
  };
  const list = recordingList({ redirects: [] });
  const redirect = card(
    [
      fakeRegistration("redirects_get", get, { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } }),
      fakeRegistration("redirects_list", list.handler),
    ],
    "content_read.redirect",
  );
  assert.deepEqual(await redirect.handler(executionContext({ id: "r-1" })), { redirect: { id: "r-1" } });
  assert.deepEqual(getInputs, [{ id: "r-1" }]);
  assert.deepEqual(list.inputs, []);
});

// ---------------------------------------------------------------------------
// Real domain handlers through the same derivation
// ---------------------------------------------------------------------------

function themeDeps(allow: boolean) {
  const theme = (id: string, tier: string) => ({ manifest: { id, name: id, version: "1.0.0", tier, description: `${id} theme` }, source: "built-in", status: "valid", errors: [] });
  return testSiteLayoutContext({
    workspaceId: "ws-content-read",
    resolveActiveThemeId: async () => "plain",
    themes: [theme("plain", "declarative"), theme("hb", "handlebars")],
    themesDir: "/nonexistent",
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  });
}

function realThemeCard(allow: boolean): ToolRegistration {
  return card(buildThemesRegistrations(themeDeps(allow) as unknown as Parameters<typeof buildThemesRegistrations>[0]), "content_read.theme");
}

test("themes (real handler): read one by themeId", async () => {
  const result = (await realThemeCard(true).handler(executionContext({ themeId: "hb" }))) as { themes: Array<{ id: string; tier: string }> };
  assert.deepEqual(result.themes.map((theme) => [theme.id, theme.tier]), [["hb", "handlebars"]]);
});

test("themes (real handler): the same permission refusal by id as by list, no theme data", async () => {
  const listError = await realThemeCard(false).handler(executionContext({})).then(() => undefined, (error: unknown) => error);
  assert.ok(listError instanceof Error, "the list itself must refuse a principal without theme.set");
  await assert.rejects(realThemeCard(false).handler(executionContext({ themeId: "hb" })), { message: listError.message });
});

test("media (real handler): canonical id and mediaId select one scoped asset, including trashed media", async () => {
  const reads: string[] = [];
  const permissions: unknown[] = [];
  const media = ["active", "trashed"].map((status, index) => ({
    id: `asset-${index}`, slug: `photo-${index}`, title: `Photo ${index}`, alt: "alt", caption: "caption", credit: "credit",
    source: { sha256: `sha-${index}` }, status, version: 1, cssClass: null, htmlAttributes: null,
  }));
  const deps = {
    workspaceId: "ws-media", authorize: async (input: unknown) => { permissions.push(input); return { allowed: true, reason: "test" }; },
    mediaRepo: { list: async ({ workspaceId }: { workspaceId: string }) => { reads.push(workspaceId); return media; } },
  } as unknown as Parameters<typeof buildMediaRegistrations>[0];
  const registration = card(buildMediaRegistrations(deps), "content_read.media_asset");
  for (const input of [{ id: "asset-1" }, { mediaId: "asset-1" }, { id: "asset-1", mediaId: "asset-1" }, { mediaId: "asset-1", id: "asset-1" }]) {
    const result = await executeRegisteredTool({ registration, input });
    assert.equal(result.status, "completed");
    const media = [{ id: "asset-1", createdBy: null, slug: "photo-1", title: "Photo 1", alt: "alt", caption: "caption", credit: "credit", sha256: "sha-1", status: "trashed", version: 1, cssClass: null, htmlAttributes: null, publicUrl: null }];
    // The legacy selector is aliased in the gate, which reports the rename it applied.
    assert.deepEqual(result.output, "mediaId" in input ? { media, normalizationNotes: ["mediaId→id"] } : { media });
  }
  assert.deepEqual(reads, ["ws-media", "ws-media", "ws-media", "ws-media"]);
  assert.equal(permissions.length, 4, "the source authorization runs exactly once per lookup");
  const listed = await executeRegisteredTool({ registration, input: {} });
  assert.equal(listed.status, "completed");
  assert.equal((listed.output as { media: unknown[] }).media.length, 2);
  const missing = await executeRegisteredTool({ registration, input: { id: "other-workspace-asset" } });
  assert.equal(missing.errorKind, "validation");
  assert.match(missing.error!, /media_asset 'other-workspace-asset' was not found.*without id/);
  const readsBeforeInvalid = reads.length;
  for (const input of [{ id: "" }, { id: 42 }, { id: "asset-1", mediaId: "asset-2" }, { mediaId: "asset-2", id: "asset-1" }, { slug: "photo-1" }]) {
    assert.equal((await executeRegisteredTool({ registration, input })).errorKind, "validation");
  }
  assert.equal(reads.length, readsBeforeInvalid, "invalid selectors must not reach the source reader");
});

test("media (real handler): list and id lookup retain the same permission refusal before repo access", async () => {
  const deps = {
    workspaceId: "ws-media", authorize: async () => ({ allowed: false, reason: "test" }),
    mediaRepo: { list: async () => { assert.fail("permission refusal must precede a media read"); } },
  } as unknown as Parameters<typeof buildMediaRegistrations>[0];
  const registration = card(buildMediaRegistrations(deps), "content_read.media_asset");
  const listed = await executeRegisteredTool({ registration, input: {} });
  const selected = await executeRegisteredTool({ registration, input: { id: "asset-1" } });
  assert.notEqual(listed.status, "completed");
  assert.equal(selected.error, listed.error);
});

function formsDeps() {
  const definition = (id: string, slug: string) => ({
    id,
    workspaceId: "ws-content-read",
    name: slug,
    slug,
    status: "active",
    fields: [],
    notify: { enabled: false, recipients: [] },
    version: 1,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  });
  return testSiteLayoutContext({
    workspaceId: "ws-content-read",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    formDefinitionRepo: { list: async () => [definition("form-1", "contact"), definition("form-2", "signup")] },
  });
}

test("forms (real handler): read one definition by formId; a miss is the exact not-found text", async () => {
  const formDefinition = card(buildFormsRegistrations(formsDeps() as unknown as Parameters<typeof buildFormsRegistrations>[0]), "content_read.form_definition");
  const result = (await formDefinition.handler(executionContext({ formId: "form-2" }))) as { definitions: Array<{ id: string; slug: string }> };
  assert.deepEqual(result.definitions.map((row) => [row.id, row.slug]), [["form-2", "signup"]]);
  await assert.rejects(formDefinition.handler(executionContext({ formId: "form-9" })), {
    message: "form_definition 'form-9' was not found — call content_read.form_definition without id to list valid ids",
  });
});

// ---------------------------------------------------------------------------
// The production composition
// ---------------------------------------------------------------------------

/** Every card that gained read-one through `listLookup` -> the id parameter it publishes. */
const LIST_LOOKUP_ID_PROPERTIES: Readonly<Record<string, string>> = {
  "content_read.backup_restore_point": "restorePointId",
  "content_read.collection_content_type": "key",
  "content_read.collection_entry": "id",
  "content_read.custom_credential": "label",
  "content_read.external_mcp": "id",
  "content_read.form_definition": "formId",
  "content_read.identity_policy": "policyId",
  "content_read.identity_role": "roleId",
  "content_read.identity_user": "principalId",
  "content_read.media_asset": "mediaId",
  "content_read.plugin": "pluginId",
  "content_read.taxonomy": "taxonomyId",
  "content_read.theme": "themeId",
  "content_read.webhook_subscription": "subscriptionId",
};

test("the real composition: every list-lookup card publishes its id as an optional string property", () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const byId = new Map(buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, { contributions }).map((r) => [r.descriptor.id, r]));
  for (const [cardId, idProperty] of Object.entries(LIST_LOOKUP_ID_PROPERTIES)) {
    const schema = byId.get(cardId)?.descriptor.inputSchema as { required?: string[]; properties?: Record<string, { type?: string }> } | undefined;
    assert.ok(schema, `expected '${cardId}' in the production catalog`);
    assert.equal(schema.properties?.id?.type, "string", `${cardId} must publish canonical id for ${idProperty}`);
    assert.ok(!(schema.required ?? []).includes("id"), `${cardId}: '${idProperty}' must stay optional, its absence means "list"`);
  }
});

// These cases pin source contracts independently of the card declaration table. Removing the
// canonical-to-source adapter must fail on the handler input, not merely on a schema snapshot.
const GET_SELECTORS = [
  ["comment", "comments_get_comment", "commentId"],
  ["content_post", "content_post_get", "id", "content_post_list"],
  ["member", "members_get_by_id", "memberId", "members_list"],
  ["menu", "menus_get_menu", "menuId", "menus_list_menus"],
  ["newsletter_campaign", "newsletter_get_campaign", "campaignId", "newsletter_list_campaigns"],
  ["redirect", "redirects_get", "id", "redirects_list"],
  ["seo_entry_meta", "seo_get_entry_meta", "entryId"],
  ["site", "sites_get_site", "name", "sites_list"],
  ["term", "taxonomy_get_term", "termId"],
  ["widget_instance", "widgets_get_instance", "widgetInstanceId", "widgets_list_instances"],
  ["widget_region", "widgets_get_region", "regionKey", "widgets_list_regions"],
  ["workspace", "workspace_get", "workspaceId", "workspace_list"],
] as const;

for (const [resource, getId, selector, listId] of GET_SELECTORS) {
  test(`${resource}: canonical/legacy selectors preserve the source ABI, dispatch and required context`, async () => {
    const inputs: unknown[] = [];
    const schema = { type: "object", additionalProperties: false, required: [selector, "context"], properties: {
      [selector]: { type: "string", minLength: 1 }, context: { type: "string" },
    } };
    const originalSchema = structuredClone(schema);
    const get = fakeRegistration(getId, async (ctx) => { inputs.push(ctx.input); return { found: resource }; }, schema);
    const list = recordingList({ listed: resource });
    const sources = [get];
    if (listId) sources.push(fakeRegistration(listId, list.handler, { type: "object", required: ["context"], properties: { context: { type: "string" } } }));
    const registration = card(sources, `content_read.${resource}`);
    const projected = registration.descriptor.inputSchema as { required: string[]; properties: Record<string, unknown> };
    assert.deepEqual(projected.properties.id, { type: "string", minLength: 1,
      ...(listId ? { description: "Omit to list instead of fetching a single item." } : {}),
    });
    assert.equal(projected.required.includes("id"), !listId);
    assert.ok(projected.required.includes("context"));
    if (selector !== "id") assert.ok(!Object.hasOwn(projected.properties, selector));
    for (const key of new Set(["id", selector])) {
      const normalized = await normalizeToolInput({ input: { [key]: "natural-key", context: "ctx" }, registration });
      assert.deepEqual(await registration.handler(executionContext(normalized.input)), { found: resource });
    }
    assert.deepEqual(inputs, Array.from(new Set(["id", selector]), () => ({ [selector]: "natural-key", context: "ctx" })));
    assert.deepEqual(schema, originalSchema, "projection must not mutate a contributor's schema");
    if (listId) {
      assert.deepEqual(await registration.handler(executionContext({ context: "ctx" })), { listed: resource });
      assert.deepEqual(list.inputs, [{ context: "ctx" }]);
    }
    if (selector !== "id") {
      const readsBeforeConflict = inputs.length;
      for (const input of [{ id: "natural-key", [selector]: "other" }, { [selector]: "other", id: "natural-key" }]) await assert.rejects(
        normalizeToolInput({ input, registration }).then(({ input }) => registration.handler(executionContext(input))), /Conflicting inputs/,
      );
      assert.equal(inputs.length, readsBeforeConflict, "conflicting selectors must not reach the source reader");
    }
  });
}

const LOOKUP_SELECTORS = [
  ["backup_restore_point", "backup_list_restore_points", "restorePointId", "items", "id"],
  ["collection_content_type", "collections_content_type_list", "key", "contentTypes", "key"],
  ["collection_entry", "collections_entry_list", "id", "items", "id"],
  ["custom_credential", "custom_credential_list", "label", "credentials", "label"],
  ["external_mcp", "external_mcp_list", "id", "servers", "serverId"],
  ["form_definition", "forms_list_definitions", "formId", "definitions", "id"],
  ["identity_policy", "identity_policy_list", "policyId", "policies", "id"],
  ["identity_role", "identity_role_list", "roleId", "roles", "id"],
  ["identity_user", "identity_user_list", "principalId", "users", "principalId"],
  ["media_asset", "media_list_assets", "mediaId", "media", "id"],
  ["plugin", "plugins_list", "pluginId", "plugins", "id"],
  ["taxonomy", "taxonomy_list", "taxonomyId", "items", "taxonomy"],
  ["theme", "theme_list", "themeId", "themes", "id"],
  ["theme_page_publication", "theme_list_page_publications", "page", "pages", "page"],
  ["webhook_subscription", "webhooks_list_subscriptions", "subscriptionId", "subscriptions", "id"],
] as const;

for (const [resource, listId, selector, itemsKey, itemKey] of LOOKUP_SELECTORS) {
  test(`${resource}: canonical/legacy lookup preserves natural keys, filters, misses and conflicts`, async () => {
    const match = { [itemKey]: itemKey === "taxonomy" ? { id: "folder-or-label" } : "folder-or-label" };
    const listed = { [itemsKey]: [match], ...(resource === "plugin" ? { agentPlugins: [] } : {}) };
    const list = recordingList(listed);
    const registration = card([fakeRegistration(listId, list.handler, {
      type: "object", additionalProperties: false, required: [], properties: { filter: { type: "string" } },
    })], `content_read.${resource}`);
    for (const key of new Set(["id", selector])) {
      const normalized = await normalizeToolInput({ input: { [key]: "folder-or-label", filter: "active" }, registration });
      assert.deepEqual(await registration.handler(executionContext(normalized.input)), listed);
      assert.deepEqual(list.inputs.at(-1), { filter: "active" });
    }
    const normalized = await normalizeToolInput({ input: { id: "missing" }, registration });
    await assert.rejects(registration.handler(executionContext(normalized.input)), /was not found/);
    const readsBeforeConflict = list.inputs.length;
    if (selector !== "id") for (const input of [{ id: "folder-or-label", [selector]: "other" }, { [selector]: "other", id: "folder-or-label" }]) await assert.rejects(
      normalizeToolInput({ input, registration }).then(({ input }) => registration.handler(executionContext(input))), /Conflicting inputs/,
    );
    assert.equal(list.inputs.length, readsBeforeConflict, "conflicting selectors must not reach the source reader");
    assert.deepEqual(await registration.handler(executionContext({})), listed);
  });
}

test("canonical truncated misses and permission refusals preserve the list owner's answer", async () => {
  const list = recordingList({ users: [{ principalId: "p-1" }], truncated: true });
  const user = card([fakeRegistration("identity_user_list", list.handler)], "content_read.identity_user");
  await assert.rejects(user.handler(executionContext({ id: "p-999" })), /list is truncated, so it may still exist/);
  const denied = await realThemeCard(false).handler(executionContext({})).then(() => undefined, (error: unknown) => error);
  assert.ok(denied instanceof Error);
  for (const input of [{}, { id: "hb" }, { themeId: "hb" }]) {
    const normalized = await normalizeToolInput({ input, registration: realThemeCard(false) });
    await assert.rejects(realThemeCard(false).handler(executionContext(normalized.input)), { message: denied.message });
  }
  const result = await realThemeCard(true).handler(executionContext({ id: "hb" })) as { themes: Array<{ id: string }> };
  assert.deepEqual(result.themes.map((theme) => theme.id), ["hb"]);
});

test("batch canonical and legacy selectors reach the original gated get; missing ids never list", async () => {
  const inputs: unknown[] = [];
  const list = recordingList({ instances: [] });
  const get = withBatchInput({ registration: fakeRegistration("widgets_get_instance", async (ctx) => {
    const input = ctx.input as Record<string, unknown>;
    requireWidgetSelector(input);
    inputs.push(input);
    return { instance: { id: input.widgetInstanceId } };
  }, { type: "object", additionalProperties: false, required: ["widgetInstanceId"], properties: { widgetInstanceId: { type: "string" } } }), tool: { toolId: "widgets_get_instance", maxItems: 3 } });
  const registration = card([get, fakeRegistration("widgets_list_instances", list.handler)], "content_read.widget_instance");
  const registry = createToolRegistry({});
  registry.register(registration);
  const executor = createToolExecutor({ registry });
  const execute = (input: unknown) => executor.execute({ principal: { id: "owner" }, run: { id: "batch-card" }, toolId: registration.descriptor.id, input });
  const input = { items: [{ id: "w-1" }, { widgetInstanceId: "w-2" }, {}] };
  const result = await execute(input);
  assert.equal(result.status, "completed");
  const output = result.output as { batch: boolean; results: Array<{ ok: boolean; result?: unknown }> };
  assert.equal(output.batch, true);
  assert.deepEqual(output.results.map((item) => item.ok), [true, true, false]);
  assert.deepEqual(output.results.slice(0, 2).map((item) => item.result), [{ instance: { id: "w-1" } }, { instance: { id: "w-2" } }]);
  assert.deepEqual(inputs, [{ widgetInstanceId: "w-1" }, { widgetInstanceId: "w-2" }]);
  assert.deepEqual(list.inputs, []);
  assert.deepEqual(input, { items: [{ id: "w-1" }, { widgetInstanceId: "w-2" }, {}] });
  const conflict = await execute({ items: [{ id: "w-3" }, { id: "private", widgetInstanceId: "different" }] });
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.errorKind, "validation");
  assert.ok(!conflict.error?.includes("private"));
  assert.equal(inputs.length, 2, "conflicting batch spellings must fail before any read");
  const capped = await execute({ items: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }] });
  assert.equal(capped.status, "failed");
  assert.equal(inputs.length, 2);
  const shorthand = await execute({ items: { id: "w-4" } });
  assert.equal(shorthand.status, "completed");
  assert.deepEqual(inputs.at(-1), { widgetInstanceId: "w-4" });
  const shared = await execute({ id: "default", items: [{ widgetInstanceId: "override" }] });
  assert.equal(shared.status, "completed");
  assert.deepEqual(inputs.at(-1), { widgetInstanceId: "override" });
});

/** The fake source enforces its own ABI, so a bypass or wrong mapping cannot pass. */
function requireWidgetSelector(input: Record<string, unknown>): void {
  if (typeof input.widgetInstanceId !== "string") throw new ToolInputError({ message: "widgetInstanceId required" });
}
