import { toolMetadata } from '../contracts/core/tool-metadata/content-read.js';
import { buildDomainRegistrations, dispatchByIdPresence, isRecord, renameInputSelectors, renameSchemaSelector, requireInputRecord, requireString, rewriteSchemaDescriptions, ToolInputError, unionInputSchema, valueAtPath, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolInputNormalizer, type ToolHandler, type ToolRegistration, type AgentToolDefinition } from "@jini-ai/core";

import { indexedDescriptionFor, KEYWORD_MARKER } from "./tool-search-keywords.js";

/**
 * @file Resource-keyed content_read cards share one dispatch factory over existing read handlers.
 * Tool ids carry the resource without a catalog-schema change. Discovery evaluation lives in
 * development/evals/tool-search-parent-tool-read.eval.ts; catalog-dependent scores belong there.
 *
 * This is an assistant composition pass, not a new content domain. The resource is fixed at
 * registration time by CONTENT_READ_CARDS, unlike content_duplicate's caller-selected resource.
 * Every source handler is already built by its domain contributor, so deriving cards from the flat
 * registration list avoids a second per-resource registry, repeated builds and feature imports.
 * The pass must run after contributors because it consumes their registrations and replaces member ids.
 *
 * Permission enforcement remains in the original handler/domain. registration-kit deliberately
 * leaves policy.authorize as pass-through to avoid a second evaluator. Calling those closures
 * unchanged preserves each resource's enforcement exactly once. Card permission/orPermission
 * declarations provide accurate catalog visibility; resources fixed per id make them statically
 * knowable, rather than a misleading generic permission over caller-selected resources.
 *
 * The literal card table pins resource grouping independently of evaluation changes. Paired get/list
 * tools share a card; idProperty comes from each source schema and is not universally "id".
 * Cards publish canonical `id`; the factory translates it back to that source selector.
 * newsletter_list is intentional: newsletter_list_lists lists mailing lists, so "newsletter list"
 * is the resource noun and does not collide with newsletter_campaign.
 *
 * Read-one-by-id (2026-10-08, ADS-memory/reports/tool-crud-coverage-2026-10-08.md): a card whose
 * domain ships a single-item reader names it as `get`. A card whose domain ships only a list reader
 * that returns the WHOLE set names `listLookup` instead, and an id is served by that same list
 * handler's result filtered to the matching item — so its permission check, visibility rules and
 * view shape are the list's own, with no second per-resource reader to drift from it. A paginated
 * or status-filtered list (comment moderation queue) cannot answer "does id X exist" from one
 * page, so those cards get no lookup. A card never carries both: a hand-written get always wins.
 */

/** One card's real, statically-known permission plus which of its (at most two) member tools it
 *  dispatches to. `idProperty` names the GET member's own id parameter — NOT uniformly `"id"` (e.g.
 *  members use `"memberId"`, widgets use `"widgetInstanceId"`/`"regionKey"`) — read directly off
 *  each source domain's own `agent-tools.ts` inputSchema, never assumed. */
interface ContentReadCard {
  readonly resource: string;
  readonly permission: string;
  readonly orPermission?: string;
  readonly get?: { readonly toolId: string; readonly idProperty?: string };
  readonly list?: { readonly toolId: string };
  /** Read-one through the list member (see this file's header). Only for a list that returns the
   *  whole set; a list that reports `truncated: true` makes a miss inconclusive, and says so. */
  readonly listLookup?: ListLookup;
}

/** Where the id lives in a list result. `idProperty` is the source selector (and legacy ingress alias), named the way
 *  the resource's own write tools address it (`themeId`, `formId`, `label`, ...). Each source is one
 *  array in the list result and the path to an item's id inside it (most are `["id"]`; taxonomy rows
 *  are `{ taxonomy, terms }`; plugins_list carries two families with different id fields). */
interface ListLookup {
  readonly idProperty: string;
  readonly sources: readonly { readonly itemsKey: string; readonly idPath: readonly string[] }[];
  /** Declared list-level context to retain when narrowing to one row; counts stay list-only. */
  readonly contextKeys?: readonly string[];
}

/** The common case: one array whose items carry the id at `idField`. */
function lookupIn({ idProperty, itemsKey }: { idProperty: string; itemsKey: string }, { idField = "id" }: { idField?: string } = {}): ListLookup {
  return { idProperty, sources: [{ itemsKey, idPath: [idField] }] };
}

/**
 * The shipped cards. Permission strings are copied verbatim from each source tool's own
 * `authorization.permission` (two, `external_mcp_list`/`theme_list`, resolve a source-file constant
 * — `EXTERNAL_MCP_MANAGE_PERMISSION` = `"admin.integrations.manage"`,
 * `THEME_READ_PERMISSION` = `"theme.set"` — copied here as the literal value those constants hold).
 */
const CONTENT_READ_CARDS: readonly ContentReadCard[] = [
  { resource: "backup_restore_point", permission: "backup.read", list: { toolId: "backup_list_restore_points" }, listLookup: lookupIn({ idProperty: "restorePointId", itemsKey: "items" }) },
  { resource: "collection_content_type", permission: "admin.collections.read", list: { toolId: "collections_content_type_list" }, listLookup: lookupIn({ idProperty: "key", itemsKey: "contentTypes" }, { idField: "key" }) },
  { resource: "collection_entry", permission: "admin.collections.read", list: { toolId: "collections_entry_list" }, listLookup: lookupIn({ idProperty: "id", itemsKey: "items" }) },
  { resource: "comment", permission: "comments.read", get: { toolId: "comments_get_comment", idProperty: "commentId" } },
  { resource: "comment_moderation_queue", permission: "comments.read", list: { toolId: "comments_list_moderation_queue" } },
  { resource: "content_post", permission: "content.read", get: { toolId: "content_post_get", idProperty: "id" }, list: { toolId: "content_post_list" } },
  { resource: "custom_credential", permission: "custom-credentials.read", list: { toolId: "custom_credential_list" }, listLookup: lookupIn({ idProperty: "label", itemsKey: "credentials" }, { idField: "label" }) },
  { resource: "database_pending_migration", permission: "database.read", list: { toolId: "database_list_pending_migrations" } },
  { resource: "database_restore_point", permission: "database.read", list: { toolId: "database_list_restore_points" } },
  { resource: "external_mcp", permission: "admin.integrations.manage", list: { toolId: "external_mcp_list" }, listLookup: lookupIn({ idProperty: "id", itemsKey: "servers" }, { idField: "serverId" }) },
  { resource: "form_definition", permission: "admin.forms.manage", list: { toolId: "forms_list_definitions" }, listLookup: lookupIn({ idProperty: "formId", itemsKey: "definitions" }) },
  { resource: "identity_policy", permission: "role.manage", list: { toolId: "identity_policy_list" }, listLookup: lookupIn({ idProperty: "policyId", itemsKey: "policies" }) },
  { resource: "identity_role", permission: "role.manage", list: { toolId: "identity_role_list" }, listLookup: lookupIn({ idProperty: "roleId", itemsKey: "roles" }) },
  {
    resource: "identity_user",
    permission: "user.manage",
    orPermission: "member.manage",
    list: { toolId: "identity_user_list" },
    // identity_user_list caps at 200 and reports `truncated`; a miss past the cap says so.
    listLookup: lookupIn({ idProperty: "principalId", itemsKey: "users" }, { idField: "principalId" }),
  },
  // MOVE: media_list_assets returns the complete workspace media set, including trashed assets.
  { resource: "media_asset", permission: "media.read", list: { toolId: "media_list_assets" }, listLookup: lookupIn({ idProperty: "mediaId", itemsKey: "media" }) },
  { resource: "member", permission: "member.manage", get: { toolId: "members_get_by_id", idProperty: "memberId" }, list: { toolId: "members_list" } },
  { resource: "menu", permission: "admin.menus.read", get: { toolId: "menus_get_menu", idProperty: "menuId" }, list: { toolId: "menus_list_menus" } },
  {
    resource: "newsletter_campaign",
    permission: "admin.newsletter.read",
    get: { toolId: "newsletter_get_campaign", idProperty: "campaignId" },
    list: { toolId: "newsletter_list_campaigns" },
  },
  // See this file's header for the ruling on this card's key (the disclosed `resourceKeyOf` misfire).
  { resource: "newsletter_list", permission: "admin.newsletter.read", list: { toolId: "newsletter_list_lists" } },
  {
    resource: "plugin",
    permission: "admin.plugins.read",
    list: { toolId: "plugins_list" },
    // Both families in one list: site plugins by `id`, Agent Plugins by `pluginId`.
    listLookup: { idProperty: "pluginId", sources: [{ itemsKey: "plugins", idPath: ["id"] }, { itemsKey: "agentPlugins", idPath: ["pluginId"] }] },
  },
  { resource: "redirect", permission: "admin.redirects.manage", get: { toolId: "redirects_get", idProperty: "id" }, list: { toolId: "redirects_list" } },
  // Get-only, single member: `seo_get_entry_meta` has no `_list` counterpart in Tier 1 (per-entry
  // SEO meta is not a collection with its own listing tool), so this card always calls `get` — its
  // own inputSchema already requires `entryId`, so no get/list dispatch wrapper is needed or used.
  // The shared card adapter still translates canonical `id` to that source selector.
  { resource: "seo_entry_meta", permission: "admin.seo.manage", get: { toolId: "seo_get_entry_meta", idProperty: "entryId" } },
  { resource: "setting_definition", permission: "settings.read.definitions", list: { toolId: "settings_list_definitions" } },
  { resource: "site", permission: "system.read", get: { toolId: "sites_get_site", idProperty: "name" }, list: { toolId: "sites_list" } },
  { resource: "term", permission: "admin.taxonomy.manage", get: { toolId: "taxonomy_get_term", idProperty: "termId" } },
  { resource: "taxonomy", permission: "admin.taxonomy.manage", list: { toolId: "taxonomy_list" }, listLookup: { idProperty: "taxonomyId", sources: [{ itemsKey: "items", idPath: ["taxonomy", "id"] }] } },
  { resource: "theme", permission: "theme.set", list: { toolId: "theme_list" }, listLookup: { ...lookupIn({ idProperty: "themeId", itemsKey: "themes" }), contextKeys: ["activeThemeId"] } },
  { resource: "theme_page_publication", permission: "theme.set", list: { toolId: "theme_list_page_publications" }, listLookup: lookupIn({ idProperty: "page", itemsKey: "pages" }, { idField: "page" }) },
  { resource: "webhook_subscription", permission: "admin.integrations.manage", list: { toolId: "webhooks_list_subscriptions" }, listLookup: lookupIn({ idProperty: "subscriptionId", itemsKey: "subscriptions" }) },
  {
    resource: "widget_instance",
    permission: "widgets.read",
    get: { toolId: "widgets_get_instance", idProperty: "widgetInstanceId" },
    list: { toolId: "widgets_list_instances" },
  },
  { resource: "widget_region", permission: "widgets.read", get: { toolId: "widgets_get_region", idProperty: "regionKey" }, list: { toolId: "widgets_list_regions" } },
  // v1 has exactly one addressable workspace; the host list calls the same read owner and
  // the host get adapter accepts only that workspaceId. No other database rows are disclosed.
  { resource: "workspace", permission: "workspace.manage", get: { toolId: "workspace_get", idProperty: "workspaceId" }, list: { toolId: "workspace_list" } },
];

/** `content_read.<resource>` — the card id a caller/model actually names. */
function contentReadToolId({ resource }: { resource: string }, _optional = {}): string {
  return `content_read.${resource}`;
}

/**
 * **The single authority for "what id serves this capability now."** Every retired Tier-1 read tool
 * id -> the `content_read.<resource>` card that took over for it, derived from
 * {@link CONTENT_READ_CARDS} itself rather than hand-listed, so it cannot drift from what actually
 * ships.
 *
 * Exists because the collapse invalidated ground truth in several retrieval eval suites at once: a
 * suite whose expected id is `comments_list_moderation_queue` scores a retrieval that correctly
 * returned `content_read.comment_moderation_queue` as a MISS, manufacturing a regression that is not
 * real. The capability did not go away — only its id changed — so the honest fix is to resolve
 * expected ids through here.
 *
 * Deliberately ONE export rather than a mapping table copied into each suite: nine private copies is
 * nine things to forget the next time a tool id is retired, and stranded references surviving a
 * retirement is the exact failure this whole exercise exists to clean up.
 *
 * NOTE this is a *read-side* alias map only. It does NOT belong in `TOOL_SEARCH_KEYWORDS` /
 * `DOC2QUERY` lookups: those are keyed by the MEMBER id on purpose, because {@link cardDescription}
 * folds each member's own vocabulary into the card's indexed text by that key. Re-keying them onto
 * card ids would delete that vocabulary from the index — which is precisely the vocabulary the
 * measured retrieval parity depends on.
 */
export const RETIRED_READ_TOOL_TO_CARD: ReadonlyMap<string, string> = new Map(
  CONTENT_READ_CARDS.flatMap((card) => {
    const cardId = contentReadToolId({ resource: card.resource });
    return [card.get?.toolId, card.list?.toolId]
      .filter((memberId): memberId is string => memberId !== undefined)
      .map((memberId) => [memberId, cardId] as const);
  }),
);

/** Earlier card names survive in agent conversations, separately from the pre-collapse members:
 * kept out of {@link RETIRED_READ_TOOL_TO_CARD}, which must list exactly the collapsed member ids. */
const RENAMED_CARD_IDS: ReadonlyMap<string, string> = new Map([
  ["content_read.content_region", "content_read.widget_region"],
  ["content_read.form", "content_read.form_definition"],
]);

/**
 * Resolves a possibly-retired read tool id to the id that actually ships today; any other id is
 * returned unchanged, so a caller can pass every expected id through it unconditionally.
 *
 * @complexity O(1).
 */
export function currentToolIdFor({ toolId }: { toolId: string }, _optional = {}): string {
  return RENAMED_CARD_IDS.get(toolId) ?? RETIRED_READ_TOOL_TO_CARD.get(toolId) ?? toolId;
}

/** One card id repeated in a list ("X, X, or Y", "X or X", "X/X") once two retired members of the
 *  same card both resolve to it. */
const REPEATED_CARD_ID_PATTERN = /(content_read\.[a-z_]+)(?:\s*(?:[,/]|\s(?:or|and)\s)\s*\1\b)+/g;

/**
 * Builds the rewrite that points every retired read tool id in a registration's description and
 * input-schema descriptions at the card that serves it now.
 *
 * Package-owned catalogs (menus, media, identity, ...) still say "the menu's id, as returned by
 * menus_list_menus" — true in a host that does not collapse reads, but in this one those ids no
 * longer exist and a model told to call them finds nothing. The
 * collapse is THIS host's decision, so the rewrite lives here rather than in each package. Only the
 * plain text before {@link KEYWORD_MARKER} is rewritten: the indexed tail is keyed vocabulary, not
 * prose, and must stay exactly what the retrieval measurements scored.
 *
 * @param required.retiredIds the member ids this collapse actually retired. A member whose card was
 *        skipped (not every member present) still ships under its own id and must keep its name.
 * @returns a function returning the registration unchanged (same object) when nothing mentions a
 *          retired id, else a copy with the rewritten descriptor.
 * @complexity O(r) to build; O(n) per registration in its descriptor size.
 */
export function createRetiredReadToolIdRewriter(required: { retiredIds: ReadonlySet<string> }): (registration: ToolRegistration) => ToolRegistration {
  if (required.retiredIds.size === 0) return (registration) => registration;
  // Whole words only: `\b` stops `content_post_get` matching inside a longer id.
  const retiredIdPattern = new RegExp(`\\b(${[...required.retiredIds].join("|")})\\b`, "g");
  const rewriteText = ({ text }: { text: string }, _optional = {}): string => {
    const markerAt = text.indexOf(KEYWORD_MARKER);
    const plain = markerAt === -1 ? text : text.slice(0, markerAt);
    const tail = markerAt === -1 ? "" : text.slice(markerAt);
    return plain.replace(retiredIdPattern, (id) => currentToolIdFor({ toolId: id })).replace(REPEATED_CARD_ID_PATTERN, "$1") + tail;
  };
  return (registration) => {
    const description = registration.descriptor.description === undefined ? undefined : rewriteText({ text: registration.descriptor.description });
    const inputSchema = rewriteSchemaDescriptions({ value: registration.descriptor.inputSchema, rewriteText: rewriteText }) as typeof registration.descriptor.inputSchema;
    if (description === registration.descriptor.description && JSON.stringify(inputSchema) === JSON.stringify(registration.descriptor.inputSchema)) return registration;
    return { ...registration, descriptor: { ...registration.descriptor, description, inputSchema } };
  };
}

/** Every wired tool in this codebase publishes a real `inputSchema` (`buildDomainRegistrations`
 *  refuses to wire one that does not), so this is a type-satisfying fallback only, never expected
 *  to actually apply — typed explicitly because a bare `{}` literal has no index signature. */
const EMPTY_SCHEMA: Readonly<Record<string, unknown>> = {};

/**
 * Whether EVERY member tool a card names is actually present in this composition's built
 * registration set.
 *
 * A narrow/partial composition is ordinary, not an error: many existing tests build an isolated
 * registry holding only ONE domain's contributor (`resetToolContributorsForTests()` plus a single
 * `registerToolContributor(contribute<Domain>Tools())`) and call `buildAssistantToolRegistrations`
 * directly to exercise that domain alone. Such a composition legitimately has no
 * `backup_list_restore_points` at all when it is testing Post, say — that is not catalog drift, it
 * is the test's own deliberate scope. A card whose members are not all present is simply left
 * un-collapsed for that composition: its member tool(s) pass through under their ORIGINAL id(s),
 * completely unaffected by this file, exactly as they did before this file existed. Only the one
 * real production composition (`installFirstPartyToolContributors()`, all ~30 domains) ever has
 * every member of every card present, so only there do all 29 cards actually get built — which is
 * the composition the measured retrieval numbers describe.
 *
 * @complexity O(1) per member, O(m) per card (m <= 2).
 */
function cardIsAvailable(byId: ReadonlyMap<string, ToolRegistration>, card: ContentReadCard): boolean {
  return (!card.get || byId.has(card.get.toolId)) && (!card.list || byId.has(card.list.toolId));
}

/**
 * Looks up one already-built source registration by its ORIGINAL tool id.
 *
 * Callers only ever pass a `toolId` a prior {@link cardIsAvailable} check already confirmed is
 * present, so an absent id here is a genuine internal-invariant break — the two checks disagreeing
 * — not a normal "this composition doesn't include that domain" case.
 *
 * @throws {Error} If `toolId` is absent from `sourceRegistrations` despite `cardIsAvailable` having
 * confirmed it. This can only fire from a bug in this file, never from a caller's input or from a
 * narrow test composition.
 * @complexity O(1) against the pre-indexed map the caller builds once.
 */
function sourceRegistration({ byId, toolId }: { byId: ReadonlyMap<string, ToolRegistration>; toolId: string }, _optional = {}): ToolRegistration {
  const found = byId.get(toolId);
  if (!found) {
    throw new Error(`content-read-tool.ts: internal error — '${toolId}' passed cardIsAvailable but is missing from byId`);
  }
  return found;
}

/**
 * The `get` half of a {@link ListLookup} card: runs the list member's ORIGINAL handler — so its own
 * input validation and permission check run exactly as for a plain list call — with the id removed
 * from the input (several list readers refuse any input at all; the list's other filters still pass
 * through), then returns each source array filtered to the matching item plus declared context.
 *
 * Returning the list shape rather than a bare item keeps one view contract per resource and stays
 * honest if two families both match (plugins_list).
 *
 * @throws {ToolInputError} when the id is not a non-empty string, or when nothing matches (the
 *         message names how to list valid ids, or that a truncated list makes the miss inconclusive).
 * @throws {Error} when the list result lacks a declared source array — a shape drift in the list
 *         reader, which must not read as "not found".
 * @complexity O(n) in the listed items; one list call, no per-item I/O of its own.
 */
function lookupInList(required: { resource: string; listToolId: string; lookup: ListLookup; list: ToolHandler }, _options = {}): ToolHandler {
  const { resource, listToolId, lookup, list } = required;
  const cardId = contentReadToolId({ resource: resource });
  return async (ctx) => {
    const input = requireInputRecord({ input: ctx.input });
    const id = requireString({ input, key: lookup.idProperty });
    const listInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== lookup.idProperty));
    const listed = { value: await list({ ...ctx, input: listInput }) };
    if (!isRecord(listed)) throw new Error(`content-read-tool.ts: '${listToolId}' returned a non-object result`);

    const filtered: Record<string, unknown[]> = {};
    let matches = 0;
    for (const source of lookup.sources) {
      const items = listed.value[source.itemsKey];
      if (!Array.isArray(items)) {
        throw new Error(`content-read-tool.ts: '${listToolId}' result has no '${source.itemsKey}' array — the ${cardId} lookup is out of date`);
      }
      const matchingItems = items.filter((item) => valueAtPath({ item: item, path: source.idPath }) === id);
      filtered[source.itemsKey] = matchingItems;
      matches += matchingItems.length;
    }
    if (matches > 0) {
      const context = Object.fromEntries((lookup.contextKeys ?? [])
        .filter(key => Object.hasOwn(listed.value, key)).map(key => [key, listed.value[key]]));
      return { ...context, ...filtered };
    }

    throw new ToolInputError({
      message:
        listed.value.truncated === true
          ? `${resource} '${id}' was not found among the listed items, but ${cardId}'s list is truncated, so it may still exist`
          : `${resource} '${id}' was not found — call ${cardId} without id to list valid ids`,
    });
  };
}

/** The synthetic get-side schema a {@link ListLookup} card feeds {@link unionInputSchema}. */
function listLookupIdSchema(required: { resource: string; lookup: ListLookup; listSchema: Readonly<Record<string, unknown>> }, _optional: Record<string, never> = {}): Readonly<Record<string, unknown>> {
  const { resource, lookup, listSchema } = required;
  return {
    ...listSchema,
    type: "object",
    // Lookup still needs the list's context (for example themeId); both branches require it.
    required: [...((listSchema.required as readonly string[] | undefined) ?? []), lookup.idProperty],
    properties: {
      ...((listSchema.properties as Record<string, unknown> | undefined) ?? {}),
      [lookup.idProperty]: {
        type: "string",
        minLength: 1,
        description: `Fetch the one ${resource.replace(/_/g, " ")} with this id, as ${contentReadToolId({ resource: resource })} lists it.`,
      },
    },
  };
}

/**
 * A card's model-visible description: every member tool's OWN plain description, concatenated,
 * plus the exact id parameter guidance, followed by ONE {@link KEYWORD_MARKER} boundary and every member's combined keyword/doc2query
 * vocabulary (via `indexedDescriptionFor({ toolId: id, description: "" })`, which returns exactly that tail with no marker of
 * its own — see that function's own doc).
 *
 * Deliberately NOT `members.map(id => indexedDescriptionFor({ toolId: id, description: plainDescOf(id) })).join(" ")` (each
 * member's own already-marked text, naively concatenated) even though that is what the measured
 * eval arm literally computes and BM25 scores identically either way (same token bag, order-blind).
 * The reason to build it this way instead: {@link stripSearchKeywords} cuts a description at the
 * FIRST marker it finds. A naive per-member concatenation embeds a marker after the FIRST member
 * that happens to have a keyword entry, silently truncating every LATER member's plain prose from
 * what the model ever sees in `describe_tool` — invisible to the eval (which only scores the FTS
 * index, never the stripped/display text) but a real product bug for a merged card. Collecting every
 * member's plain text first and every member's tail second, with exactly one marker between them,
 * produces the SAME indexed token bag (so the measured retrieval numbers still apply) while keeping
 * the full, untruncated prose visible after stripping.
 *
 * @complexity O(m) in member count (at most 2).
 */
function cardDescription(
  { id, memberIds, byId, idDescription }: { id: string; memberIds: readonly string[]; byId: ReadonlyMap<string, ToolRegistration>; idDescription: string },
  _optional: Record<string, never> = {},
): string {
  const prose = [...memberIds.map((id) => sourceRegistration({ byId: byId, toolId: id }).descriptor.description), idDescription,
    "content_read is a namespace, not a tool; call this exact tool id without a resource argument."].filter(Boolean).join(" ");
  const plain = `${id}: ${prose}`;
  const tail = memberIds
    .map((id) => indexedDescriptionFor({ toolId: id, description: "" }))
    .filter((part) => part.length > 0)
    .join(" ");
  return tail.length > 0 ? `${plain}${KEYWORD_MARKER}${tail}` : plain;
}

/** Put the exact id parameter name in both model-visible surfaces so generic "id" prose cannot
 * obscure it. The card publishes `id`; the source selector remains an ingress alias for 90 days
 * from release. Natural keys (labels, folder names, page names) keep their source meaning.
 * Copies only selector schema keys and descriptions; validation and dispatch stay with their owners.
 * @complexity O(p) time and space for p schema properties; no I/O or input mutation.
 */
function describeCardIdInput(
  { card, inputSchema }: { card: ContentReadCard; inputSchema: Readonly<Record<string, unknown>> },
  _optional: Record<string, never> = {},
): { inputSchema: Readonly<Record<string, unknown>>; idDescription: string } {
  const idProperty = card.get?.idProperty ?? card.listLookup?.idProperty;
  if (!idProperty || idProperty === "id") return { inputSchema, idDescription: "" };
  const idDescription = `id: the ${card.resource.replace(/_/g, " ")}'s selector, using the same value as legacy '${idProperty}' (accepted for 90 days from release).`;
  return { inputSchema: renameSchemaSelector({ inputSchema, from: idProperty, to: "id" }), idDescription };
}

/** Adapt canonical card input back to the original handler ABI; aliases belong to the gate hook.
 * The direct handler also refuses collisions for callers that already own their execution gate.
 * @complexity O(k) time/space in supplied keys, plus the unchanged source handler cost.
 */
function canonicalCardDispatch(
  { card, byId }: { card: ContentReadCard; byId: ReadonlyMap<string, ToolRegistration> }, _options = {},
) {
  const dispatch = cardDispatch({ card, byId });
  const idProperty = card.get?.idProperty ?? card.listLookup?.idProperty;
  if (!idProperty || idProperty === "id") return { ...dispatch, normalizeInput: undefined };
  const normalizeInput: ToolInputNormalizer = ({ input }, _optional = {}) => {
    // Slug lookup belongs to the host target adapter after site selection and authorization;
    // this card owns only canonical id ↔ source-selector spelling.
    return renameInputSelectors({ input, from: idProperty, to: "id" });
  };
  const handler: ToolHandler = (ctx, options) => dispatch.handler({ ...ctx, input: renameInputSelectors({ input: ctx.input, from: "id", to: idProperty }).input }, options);
  return { ...dispatch, handler, normalizeInput };
}

/** A merged card may advertise peer reads only when either dispatch branch can honor them:
 *  `site` survives {@link unionInputSchema} only when both members declare it. In the union, shared
 *  required context stays required; `content_post`'s `id` is get-only and becomes optional, while
 *  its `kind` is optional on both branches. */
const PEER_READ_KEYS: readonly string[] = ["site"];

/**
 * The composition-root read pass: takes the already-built flat registration list every domain
 * contributed (`buildAssistantToolRegistrations`'s own loop), replaces the 36 Tier-1 read tools it
 * contains with the `content_read.<resource>` cards defined above, and leaves everything else —
 * all 141 other tools — untouched except that a retired id named in their prose is pointed at its
 * card (see {@link createRetiredReadToolIdRewriter}).
 *
 * Called from `tool-registrations.ts`'s `buildAssistantToolRegistrations` before host target and batch wrappers, NOT
 * registered as a `ToolContributor` — see this file's header for why it structurally cannot be one
 * (it needs to see what the contributor loop already produced).
 *
 * @param sourceRegistrations Every domain's own registrations, exactly as `buildAssistantToolRegistrations`'s
 * main loop assembled them, before this collapse.
 * @returns The same list with each FULLY-AVAILABLE card's member ids removed and that card appended
 * in their place. A card whose member(s) are not all present in `sourceRegistrations` (see
 * {@link cardIsAvailable}) is skipped entirely — its members pass through unchanged.
 * @throws {Error} If `buildDomainRegistrations`'s own build-time gates refuse (see that function's
 * own throws) — never for a missing member, which {@link cardIsAvailable} filters out first.
 * @complexity O(t) in total tool count — one pass to index, one pass over the cards, one filter.
 * @overallScore 100
 */
export function deriveContentReadRegistrations({ sourceRegistrations }: { sourceRegistrations: readonly ToolRegistration[] }, _optional: Record<string, never> = {}): ToolRegistration[] {
  const byId = new Map(sourceRegistrations.map((registration) => [registration.descriptor.id, registration] as const));
  const retiredIds = new Set<string>();
  const catalog = new Map<string, AgentToolDefinition>();
  const handlers: Record<string, ToolHandler> = {};
  const inputNormalizers: Record<string, ToolInputNormalizer> = {};
  const derivedRisk = new Map<string, AgentToolSideEffect>();

  for (const card of CONTENT_READ_CARDS) {
    if (!cardIsAvailable(byId, card)) continue;

    const id = contentReadToolId({ resource: card.resource });
    const { memberIds, handler, inputSchema, normalizeInput } = canonicalCardDispatch({ card, byId });

    for (const memberId of memberIds) retiredIds.add(memberId);

    const authorization: AgentToolDefinition["authorization"] = card.orPermission
      ? { permission: card.permission, orPermission: card.orPermission }
      : { permission: card.permission };

    const described = describeCardIdInput({ card, inputSchema });
    catalog.set(id, {
      name: id,
      description: cardDescription({ id, memberIds, byId, idDescription: described.idDescription }),
      sideEffects: "none",
      authorization,
      inputSchema: described.inputSchema,
    });
    handlers[id] = handler;
    if (normalizeInput) inputNormalizers[id] = normalizeInput;
    derivedRisk.set(id, "none");
  }

  const collapsed = buildDomainRegistrations({ metadata: toolMetadata,
    domain: "content-read",
    catalogModule: "assistant/content-read-tool.ts",
    catalog,
    handlers,
    inputNormalizers,
    derivedRisk: derivedRisk as DerivedRiskByToolId,
  });

  // Survivors and cards alike may still name a retired id in their prose; see `createRetiredReadToolIdRewriter`.
  return [...sourceRegistrations.filter((registration) => !retiredIds.has(registration.descriptor.id)), ...collapsed].map(createRetiredReadToolIdRewriter({ retiredIds }));
}

/** Resolve a card through its original domain handlers; permission enforcement stays there. */
function cardDispatch({ card, byId }: { card: ContentReadCard; byId: ReadonlyMap<string, ToolRegistration> }, _options = {}) {
  const memberIds: string[] = [];
  let handler: ToolHandler;
  let inputSchema: Readonly<Record<string, unknown>>;
  if (card.get && card.listLookup) {
    throw new Error(`content-read-tool.ts: card '${card.resource}' declares both get and listLookup — a hand-written get always serves read-one`);
  }

  if (card.list && card.listLookup) {
    return lookupCardDispatch({ card, list: card.list, lookup: card.listLookup, byId });
  } else if (card.get && card.list) {
    return pairedCardDispatch({ card, get: card.get, list: card.list, byId });
  } else if (card.get) {
    const getReg = sourceRegistration({ byId: byId, toolId: card.get.toolId });
    memberIds.push(card.get.toolId);
    handler = getReg.handler;
    inputSchema = registrationInputSchema({ registration: getReg });
  } else if (card.list) {
    const listReg = sourceRegistration({ byId: byId, toolId: card.list.toolId });
    memberIds.push(card.list.toolId);
    handler = listReg.handler;
    inputSchema = registrationInputSchema({ registration: listReg });
  } else {
    throw new Error(`content-read-tool.ts: card '${card.resource}' declares neither get nor list`);
  }

  return { memberIds, handler, inputSchema };
}

function pairedCardDispatch({ card, get, list, byId }: {
  card: ContentReadCard; get: NonNullable<ContentReadCard["get"]>; list: NonNullable<ContentReadCard["list"]>;
  byId: ReadonlyMap<string, ToolRegistration>;
}, _options = {}) {
  if (!get.idProperty) {
    throw new Error(`content-read-tool.ts: card '${card.resource}' declares both get and list but no idProperty on get`);
  }
  const getReg = sourceRegistration({ byId: byId, toolId: get.toolId });
  const listReg = sourceRegistration({ byId: byId, toolId: list.toolId });
  const getSchema = registrationInputSchema({ registration: getReg });
  const handler = dispatchByIdPresence({ idProperty: get.idProperty, get: getReg.handler, list: listReg.handler }, {
    batchGet: Object.hasOwn((getSchema.properties as Readonly<Record<string, unknown>> | undefined) ?? EMPTY_SCHEMA, "items"),
  });
  const inputSchema = unionInputSchema(
    { getSchema: getSchema,
    listSchema: registrationInputSchema({ registration: listReg }),
    idProperty: get.idProperty }, { sharedOnlyKeys: PEER_READ_KEYS },
  );
  return { memberIds: [get.toolId, list.toolId], handler, inputSchema };
}

function registrationInputSchema({ registration }: { registration: ToolRegistration }, _options = {}): Readonly<Record<string, unknown>> {
  return (registration.descriptor.inputSchema as Readonly<Record<string, unknown>> | undefined) ?? EMPTY_SCHEMA;
}

function lookupCardDispatch({ card, list, lookup, byId }: {
  card: ContentReadCard; list: NonNullable<ContentReadCard["list"]>; lookup: ListLookup;
  byId: ReadonlyMap<string, ToolRegistration>;
}, _options = {}) {
  const listReg = sourceRegistration({ byId: byId, toolId: list.toolId });
  const get = lookupInList({ resource: card.resource, listToolId: list.toolId, lookup, list: listReg.handler });
  const handler = dispatchByIdPresence({ idProperty: lookup.idProperty, get, list: listReg.handler });
  const inputSchema = unionInputSchema(
    { getSchema: listLookupIdSchema({ resource: card.resource, lookup, listSchema: registrationInputSchema({ registration: listReg }) }),
    listSchema: registrationInputSchema({ registration: listReg }),
    idProperty: lookup.idProperty }, { sharedOnlyKeys: PEER_READ_KEYS },
  );
  return { memberIds: [list.toolId], handler, inputSchema };
}
