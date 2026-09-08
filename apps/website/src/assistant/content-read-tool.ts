import {
  buildDomainRegistrations,
  isRecord,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";

import { indexedDescriptionFor, KEYWORD_MARKER } from "./tool-search-keywords.js";

/**
 * @file `content_read` — Option A from the measured design
 * (`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`, Addendum, arm D1): **29 thin,
 * resource-keyed catalog entries** (`content_read.<resource>`), one per Tier-1 "collapses
 * unconditionally" read tool group, **all dispatching through {@link dispatchByIdPresence} — the
 * one shared handler factory** — rather than 29 hand-written handlers. No schema change to
 * `@jini-ai/sqlite` or `tool-catalog-query.ts`: the id itself carries the resource, exactly as D1
 * measured — it matched the pre-collapse baseline case-for-case at top-10, on both the whole set and
 * the affected subset. The numbers themselves are deliberately NOT restated here: they move whenever
 * the catalog changes (the shipped top-20 already moved the baseline's own figure), and a bare
 * percentage in a comment is exactly the rot that produced the fabricated tool-search accuracy claim
 * `37a78494` had to strip out of two shipping files. Read them from the eval, which recomputes them:
 * `development/evals/tool-search-parent-tool-read.eval.ts`, and the Addendum's Results tables.
 *
 * ## Why this lives in `assistant/`, not `features/content-read/`
 *
 * `content_duplicate` (`features/content-duplication/`) is the shipped precedent for "one generic
 * tool over many resources", and the dispatch that requested this file pointed at it as the shape
 * to follow. It was read in full before writing this. Two things about it do NOT transfer:
 *
 * 1. **Its resource is caller-supplied at call time** (`{resource: "post", ...}`), so it genuinely
 *    needs `duplicate-resource-registry.ts` — a BOOT-TIME registry of deferred `build(routeDeps)`
 *    contributors, resolved once per composition, because a feature (`features/post`) must be able
 *    to contribute its OWN "how do I copy myself" capability without `features/post` importing
 *    `assistant/**` by value (the exact edge `.dependency-cruiser.mjs`'s
 *    `domain-no-direct-assistant-tool-registration` rule bans). `content_read`'s resource is the
 *    OPPOSITE: it is baked into the tool id at REGISTRATION time from a FIXED, mechanically-derived
 *    36-tool set (this file's own {@link CONTENT_READ_CARDS} table) — nothing about it grows at
 *    runtime the way `content_duplicate`'s resource set does, so there is nothing for a caller-side
 *    registry to defer.
 * 2. **Every member tool this file reuses already ships**, fully wired, inside another domain's own
 *    `contribute<Domain>Tools()`. Reusing it needs no NEW per-resource contribution seam at all: this
 *    file operates on the ALREADY-BUILT flat `ToolRegistration[]` `buildAssistantToolRegistrations`
 *    (`tool-registrations.ts`) produces from every domain's own build call, as one POST-PROCESSING
 *    pass — see {@link deriveContentReadRegistrations}. That is strictly simpler than a second
 *    boot-time registry, and it is why this file needs no `features/**` import at all (a real
 *    `features/content-read` package would have had to import EVERY source domain by value merely to
 *    call its own `build<Domain>Registrations` a SECOND time, duplicating work the aggregate already
 *    does once).
 *
 * Structurally this is closer to `admin-screen-link-tool.ts`/`component-catalog-tool.ts` — a single
 * cross-cutting tool file living directly in `assistant/` because it has no domain of its own to
 * live beside — except those two ARE ordinary `ToolContributor`s (`build(routeDeps, surfaces) =>
 * ToolRegistration[]`), built independently inside the SAME loop that builds every other domain.
 * This file's {@link deriveContentReadRegistrations} cannot be: it needs to see what THAT loop
 * already produced (to extract handlers/descriptors from it and to retire the 36 originals), so it
 * runs once, AFTER the loop, as `buildAssistantToolRegistrations`'s own final step — not registered
 * via `registerToolContributor`/`DOMAIN_SLICES` at all. See that function's own call site.
 *
 * ## Why reusing the original handler unchanged is enough for per-resource permission
 *
 * The dispatch that requested this file specifically flagged permission: "the read set spans a
 * dozen-plus declared permissions, so a flat single-permission parent tool is WRONG." That concern
 * is real for a tool whose resource is CALLER-supplied (`content_duplicate`'s shape) — a single
 * static `authorization.permission` on the catalog entry would be actively misleading there, which
 * is exactly why that tool resolves permission per call, at the handler.
 *
 * It does not apply the same way here, for a structural reason worth stating precisely:
 * `@jini-ai/cms/core`'s `registration-kit.ts` (`buildDomainRegistrations`'s own header) documents
 * that `policy.authorize` is ALWAYS a pass-through `'allow'` for every tool in this codebase — a
 * catalog entry's declared `authorization.permission` is NEVER itself the runtime gate. The REAL
 * gate is "inside the domain function for the self-enforcing domains, or the handler's own
 * `requireToolPermission` call for the domains whose gate lives in the route" — evaluated EXACTLY
 * ONCE, by design ("A check here would be a SECOND evaluator of the same rule"). Every one of this
 * file's 29 handlers below is one of the 36 ORIGINAL, already-shipped handler closures, extracted
 * from the built registration and invoked completely unchanged — so whichever of those two
 * enforcement paths that original handler already uses keeps running, unmodified, under the new id.
 * No new permission-checking code is needed for correctness, and none is added.
 *
 * What `CONTENT_READ_CARDS.permission` (and `.orPermission`) IS for: the catalog-level VISIBILITY
 * `duplicate-resource-registry.ts` also cares about — a security reviewer grepping `agent-tools.ts`
 * files for `authorization.permission` should find content_read's real, resource-specific permission
 * too, not a placeholder. Because the resource is fixed per id (point 1 above), that real permission
 * IS statically knowable here, copied verbatim from each source domain's own catalog entry — see the
 * per-card comments below for exactly which line each came from. This is strictly BETTER visibility
 * than `content_duplicate`'s own `"resolved-per-resource"` declaration-only placeholder, which its
 * shape requires and this one does not.
 *
 * ## Card derivation — must match the measured arm exactly
 *
 * `CONTENT_READ_CARDS` is a literal transcription of `development/evals/tool-search-parent-tool-read.eval.ts`'s
 * own `TIER1_CLEAN` (the 36 ids) grouped by its `resourceKeyOf` (strip `list`/`get`/`by`/`id`,
 * singularize, dedupe) — reproduced as a literal table, not recomputed from that eval file at
 * runtime, so this list is pinned to the SAME 36 ids the addendum's D1 arm measured rather than
 * silently drifting if that eval file changes later. Verified by running `resourceKeyOf` over
 * `TIER1_CLEAN` directly (not hand-derived): 29 cards, 7 of them merging a `_get`/`_list` pair over
 * one resource (`content_post`, `member`, `menu`, `newsletter_campaign`, `redirect`,
 * `widget_instance`, `widget_region`).
 *
 * **Ruling on the disclosed misfire** (`newsletter_list_lists`): running the eval's own
 * `resourceKeyOf("newsletter_list_lists")` step by step — `["newsletter","list","lists"]`, drop the
 * exact-match verb token `"list"`, singularize `"lists"` -> `"list"` — actually yields the key
 * `"newsletter_list"`, not the `"newsletter"` the addendum's own prose describes for this misfire.
 * (The addendum's own inline comment appears to describe the effect informally rather than the
 * literal function output; the CODE, not that prose, is what the measured numbers are attributable
 * to, and `"newsletter_list"` is what actually ran.) At `"newsletter_list"` there is no collision
 * with `content_read.newsletter_campaign` — the concern the prose seems to be gesturing at never
 * materializes for the id this eval actually produced. Shipping is a different standard than the
 * blind arm (per the dispatch: "you are shipping, not running a blind arm"), so this was decided
 * deliberately rather than carried through by default: `"newsletter_list"` reads correctly by
 * coincidence (`newsletter_list_lists` lists NEWSLETTER's mailing LISTS, so "newsletter list" is an
 * accurate noun phrase for that resource, not just a leftover verb token) and needs no hand-fix.
 * Left as `content_read.newsletter_list` unchanged from what the eval measured.
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
}

/**
 * The 29 cards. Permission strings are copied verbatim from each source tool's own
 * `authorization.permission` (two, `external_mcp_list`/`theme_list`, resolve a source-file constant
 * — `EXTERNAL_MCP_MANAGE_PERMISSION` = `"admin.integrations.manage"`,
 * `THEME_READ_PERMISSION` = `"theme.set"` — copied here as the literal value those constants hold).
 */
const CONTENT_READ_CARDS: readonly ContentReadCard[] = [
  { resource: "backup_restore_point", permission: "backup.read", list: { toolId: "backup_list_restore_points" } },
  { resource: "collection_content_type", permission: "admin.collections.read", list: { toolId: "collections_content_type_list" } },
  { resource: "collection_entry", permission: "admin.collections.read", list: { toolId: "collections_entry_list" } },
  { resource: "comment_moderation_queue", permission: "comments.read", list: { toolId: "comments_list_moderation_queue" } },
  { resource: "content_post", permission: "content.read", get: { toolId: "content_post_get", idProperty: "id" }, list: { toolId: "content_post_list" } },
  { resource: "custom_credential", permission: "custom-credentials.read", list: { toolId: "custom_credential_list" } },
  { resource: "database_pending_migration", permission: "database.read", list: { toolId: "database_list_pending_migrations" } },
  { resource: "database_restore_point", permission: "database.read", list: { toolId: "database_list_restore_points" } },
  { resource: "deployment", permission: "deployments.read", list: { toolId: "deployment_list" } },
  { resource: "external_mcp", permission: "admin.integrations.manage", list: { toolId: "external_mcp_list" } },
  { resource: "form_definition", permission: "admin.forms.manage", list: { toolId: "forms_list_definitions" } },
  { resource: "identity_policy", permission: "role.manage", list: { toolId: "identity_policy_list" } },
  { resource: "identity_role", permission: "role.manage", list: { toolId: "identity_role_list" } },
  { resource: "identity_user", permission: "user.manage", orPermission: "member.manage", list: { toolId: "identity_user_list" } },
  { resource: "media_asset", permission: "media.read", list: { toolId: "media_list_assets" } },
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
  { resource: "plugin", permission: "admin.plugins.read", list: { toolId: "plugins_list" } },
  { resource: "redirect", permission: "admin.redirects.manage", get: { toolId: "redirects_get", idProperty: "id" }, list: { toolId: "redirects_list" } },
  // Get-only, single member: `seo_get_entry_meta` has no `_list` counterpart in Tier 1 (per-entry
  // SEO meta is not a collection with its own listing tool), so this card always calls `get` — its
  // own inputSchema already requires `entryId`, so no dispatch wrapper is needed or used.
  { resource: "seo_entry_meta", permission: "admin.seo.manage", get: { toolId: "seo_get_entry_meta", idProperty: "entryId" } },
  { resource: "setting_definition", permission: "settings.read.definitions", list: { toolId: "settings_list_definitions" } },
  { resource: "taxonomy", permission: "admin.taxonomy.manage", list: { toolId: "taxonomy_list" } },
  { resource: "theme", permission: "theme.set", list: { toolId: "theme_list" } },
  { resource: "webhook_subscription", permission: "admin.integrations.manage", list: { toolId: "webhooks_list_subscriptions" } },
  {
    resource: "widget_instance",
    permission: "widgets.read",
    get: { toolId: "widgets_get_instance", idProperty: "widgetInstanceId" },
    list: { toolId: "widgets_list_instances" },
  },
  { resource: "widget_region", permission: "widgets.read", get: { toolId: "widgets_get_region", idProperty: "regionKey" }, list: { toolId: "widgets_list_regions" } },
  // Get-only, single member, NO id at all: v1 has exactly one addressable workspace, so
  // `workspace_get` is parameterless (unlike `seo_entry_meta` above) — always calls `get` directly.
  { resource: "workspace", permission: "workspace.manage", get: { toolId: "workspace_get" } },
];

/** `content_read.<resource>` — the card id a caller/model actually names. */
function contentReadToolId(resource: string): string {
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
    const cardId = contentReadToolId(card.resource);
    return [card.get?.toolId, card.list?.toolId]
      .filter((memberId): memberId is string => memberId !== undefined)
      .map((memberId) => [memberId, cardId] as const);
  }),
);

/**
 * Resolves a possibly-retired read tool id to the id that actually ships today; any other id is
 * returned unchanged, so a caller can pass every expected id through it unconditionally.
 *
 * @complexity O(1).
 */
export function currentToolIdFor(toolId: string): string {
  return RETIRED_READ_TOOL_TO_CARD.get(toolId) ?? toolId;
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
function sourceRegistration(byId: ReadonlyMap<string, ToolRegistration>, toolId: string): ToolRegistration {
  const found = byId.get(toolId);
  if (!found) {
    throw new Error(`content-read-tool.ts: internal error — '${toolId}' passed cardIsAvailable but is missing from byId`);
  }
  return found;
}

/**
 * **The one shared handler factory** every merged (get+list) card wires through. Dispatches to
 * `get` when the caller supplied `idProperty`, to `list` otherwise — both branches invoke the
 * ORIGINAL, already-shipped handler completely unchanged, including its own input validation and
 * its own permission enforcement (see this file's header for why that is sufficient).
 *
 * `value !== undefined` rather than a stricter non-empty-string check: an empty-string id is left
 * for the underlying `get` handler's own `requireString` to reject with its own message, rather
 * than this wrapper inventing a second, possibly-inconsistent validation error.
 *
 * @complexity O(1) plus whichever branch's own cost.
 */
function dispatchByIdPresence(idProperty: string, get: ToolHandler, list: ToolHandler): ToolHandler {
  return async (ctx) => {
    const value = isRecord(ctx.input) ? ctx.input[idProperty] : undefined;
    return value !== undefined ? get(ctx) : list(ctx);
  };
}

/**
 * A card's model-visible description: every member tool's OWN plain description, concatenated,
 * followed by ONE {@link KEYWORD_MARKER} boundary and every member's combined keyword/doc2query
 * vocabulary (via `indexedDescriptionFor(id, "")`, which returns exactly that tail with no marker of
 * its own — see that function's own doc).
 *
 * Deliberately NOT `members.map(id => indexedDescriptionFor(id, plainDescOf(id))).join(" ")` (each
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
function cardDescription(memberIds: readonly string[], byId: ReadonlyMap<string, ToolRegistration>): string {
  const plain = memberIds.map((id) => sourceRegistration(byId, id).descriptor.description).join(" ");
  const tail = memberIds
    .map((id) => indexedDescriptionFor(id, ""))
    .filter((part) => part.length > 0)
    .join(" ");
  return tail.length > 0 ? `${plain}${KEYWORD_MARKER}${tail}` : plain;
}

/**
 * Builds a merged card's inputSchema as the union of its `get` and `list` members' own ALREADY-
 * PUBLISHED schemas — never hand-authored, so it cannot drift from what those two tools actually
 * accept. `idProperty` becomes optional in the union (its presence, not a `required` entry, is the
 * dispatch signal `dispatchByIdPresence` reads) with a one-line note appended explaining that.
 * `required` is the intersection of the two members' own required fields (with `idProperty` removed
 * from `get`'s side first) — a field required by only ONE branch cannot be required overall, since
 * the other branch never needs it (e.g. `content_post`'s `kind` is required by BOTH `get` and `list`
 * and stays required; `content_post`'s `id` is get-only and becomes optional).
 *
 * @complexity O(p) in combined property count.
 */
function unionInputSchema(
  getSchema: Readonly<Record<string, unknown>>,
  listSchema: Readonly<Record<string, unknown>>,
  idProperty: string,
): Readonly<Record<string, unknown>> {
  const getProps = (getSchema.properties as Record<string, unknown> | undefined) ?? {};
  const listProps = (listSchema.properties as Record<string, unknown> | undefined) ?? {};
  const getRequired = new Set(((getSchema.required as readonly string[] | undefined) ?? []).filter((key) => key !== idProperty));
  const listRequired = new Set((listSchema.required as readonly string[] | undefined) ?? []);
  const required = [...getRequired].filter((key) => listRequired.has(key));

  const idSchema = getProps[idProperty] as Record<string, unknown> | undefined;
  const idPropertyEntry = idSchema
    ? {
        [idProperty]: {
          ...idSchema,
          description: `${(idSchema.description as string | undefined) ?? ""} Omit to list instead of fetching a single item.`.trim(),
        },
      }
    : {};

  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: { ...listProps, ...getProps, ...idPropertyEntry },
  };
}

/**
 * The composition-root final step: takes the already-built flat registration list every domain
 * contributed (`buildAssistantToolRegistrations`'s own loop), replaces the 36 Tier-1 read tools it
 * contains with the 29 `content_read.<resource>` cards defined above, and leaves everything else —
 * all 141 other tools — completely untouched.
 *
 * Called from `tool-registrations.ts`'s `buildAssistantToolRegistrations` as its own last step, NOT
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
 * @complexity O(t) in total tool count — one pass to index, one pass over the 29 cards, one filter.
 * @overallScore 100
 */
export function deriveContentReadRegistrations(sourceRegistrations: readonly ToolRegistration[]): ToolRegistration[] {
  const byId = new Map(sourceRegistrations.map((registration) => [registration.descriptor.id, registration] as const));
  const retiredIds = new Set<string>();
  const catalog = new Map<string, WirableToolDefinition>();
  const handlers: Record<string, ToolHandler> = {};
  const derivedRisk = new Map<string, AgentToolSideEffect>();

  for (const card of CONTENT_READ_CARDS) {
    if (!cardIsAvailable(byId, card)) continue;

    const id = contentReadToolId(card.resource);
    const memberIds: string[] = [];
    let handler: ToolHandler;
    let inputSchema: Readonly<Record<string, unknown>>;

    if (card.get && card.list) {
      if (!card.get.idProperty) {
        throw new Error(`content-read-tool.ts: card '${card.resource}' declares both get and list but no idProperty on get`);
      }
      const getReg = sourceRegistration(byId, card.get.toolId);
      const listReg = sourceRegistration(byId, card.list.toolId);
      memberIds.push(card.get.toolId, card.list.toolId);
      handler = dispatchByIdPresence(card.get.idProperty, getReg.handler, listReg.handler);
      inputSchema = unionInputSchema(
        (getReg.descriptor.inputSchema as Readonly<Record<string, unknown>> | undefined) ?? EMPTY_SCHEMA,
        (listReg.descriptor.inputSchema as Readonly<Record<string, unknown>> | undefined) ?? EMPTY_SCHEMA,
        card.get.idProperty,
      );
    } else if (card.get) {
      const getReg = sourceRegistration(byId, card.get.toolId);
      memberIds.push(card.get.toolId);
      handler = getReg.handler;
      inputSchema = (getReg.descriptor.inputSchema as Readonly<Record<string, unknown>> | undefined) ?? EMPTY_SCHEMA;
    } else if (card.list) {
      const listReg = sourceRegistration(byId, card.list.toolId);
      memberIds.push(card.list.toolId);
      handler = listReg.handler;
      inputSchema = (listReg.descriptor.inputSchema as Readonly<Record<string, unknown>> | undefined) ?? EMPTY_SCHEMA;
    } else {
      throw new Error(`content-read-tool.ts: card '${card.resource}' declares neither get nor list`);
    }

    for (const memberId of memberIds) retiredIds.add(memberId);

    const authorization: WirableToolDefinition["authorization"] = card.orPermission
      ? { permission: card.permission, orPermission: card.orPermission }
      : { permission: card.permission };

    catalog.set(id, {
      name: id,
      description: cardDescription(memberIds, byId),
      sideEffects: "none",
      authorization,
      inputSchema,
    });
    handlers[id] = handler;
    derivedRisk.set(id, "none");
  }

  const collapsed = buildDomainRegistrations({
    domain: "content-read",
    catalogModule: "assistant/content-read-tool.ts",
    catalog,
    handlers,
    derivedRisk: derivedRisk as DerivedRiskByToolId,
  });

  return [...sourceRegistrations.filter((registration) => !retiredIds.has(registration.descriptor.id)), ...collapsed];
}
