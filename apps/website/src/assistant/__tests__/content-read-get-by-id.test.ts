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

import { createContributionRegistry, ToolInputError, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";

import { buildFormsRegistrations } from "../../features/forms/tool-registrations.js";
import { buildThemesRegistrations } from "../../features/theme/tool-registrations.js";
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
    policy: { authorize: async () => ({ allowed: true }) },
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
    assert.equal(error.message, "theme 'missing' was not found — call content_read.theme without themeId to list valid ids");
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
  assert.deepEqual(Object.keys(schema.properties).sort(), ["themeId", "tier"]);
  assert.equal(schema.properties.themeId?.type, "string");
  assert.match(schema.properties.themeId?.description ?? "", /Omit to list instead of fetching a single item\.$/);
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
  return {
    workspaceId: "ws-content-read",
    themes: [theme("plain", "declarative"), theme("hb", "handlebars")],
    themesDir: "/nonexistent",
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
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
  return {
    workspaceId: "ws-content-read",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    formDefinitionRepo: { list: async () => [definition("form-1", "contact"), definition("form-2", "signup")] },
  };
}

test("forms (real handler): read one definition by formId; a miss is the exact not-found text", async () => {
  const formDefinition = card(buildFormsRegistrations(formsDeps() as unknown as Parameters<typeof buildFormsRegistrations>[0]), "content_read.form_definition");
  const result = (await formDefinition.handler(executionContext({ formId: "form-2" }))) as { definitions: Array<{ id: string; slug: string }> };
  assert.deepEqual(result.definitions.map((row) => [row.id, row.slug]), [["form-2", "signup"]]);
  await assert.rejects(formDefinition.handler(executionContext({ formId: "form-9" })), {
    message: "form_definition 'form-9' was not found — call content_read.form_definition without formId to list valid ids",
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
    assert.equal(schema.properties?.[idProperty]?.type, "string", `${cardId} must publish '${idProperty}'`);
    assert.ok(!(schema.required ?? []).includes(idProperty), `${cardId}: '${idProperty}' must stay optional, its absence means "list"`);
  }
});
