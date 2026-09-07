import { DEFAULT_POST_LIST_LIMIT, MAX_POST_LIST_LIMIT, MAX_SLUG_LENGTH, MAX_TITLE_LENGTH, SLUG_FORMAT_PATTERN } from "./post.js";
import { DEFAULT_POST_SEARCH_LIMIT, MAX_POST_SEARCH_LIMIT } from "./search.js";

/**
 * @file The Posts + Pages agent-tool catalog — this domain's instance of the per-domain
 * `agent-tools.ts` convention every other wired domain (`features/entries/agent-tools.ts`,
 * `widgets/agent-tools.ts`, `forms/agent-tools.ts`, ...) already uses.
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes. Every
 * entry maps 1:1 onto a real exported function of `features/post/post.ts` (`createPost`,
 * `updatePost`, `listAdminPosts`, `listAdminPages`, `getAdminPostById`) — this catalog never names
 * an operation the domain cannot perform.
 *
 * ONE domain, not two catalogs. `features/post/post.ts`'s own `PostKind` doc is explicit: "Same
 * record shape, same repo, same editor — `kind` only changes which admin list surfaces a row and
 * how it's created." Posts and Pages are the SAME backend (`server/routes/admin/posts/*` and
 * `server/routes/admin/pages/*` both call straight into `createPost`/`updatePost`/`getAdminPostById`/
 * `listAdminPosts`/`listAdminPages`, no other library involved) — so this catalog is one cohesive
 * set of `content_post_*` tools taking an explicit `kind` parameter, not a `post_*` catalog plus a
 * separate `page_*` one.
 *
 * Naming, disclosed to avoid the collision this project has hit before (ADR-049 Decision 4's own
 * `backup_create_restore_point` precedent, and `features/entries/agent-tools.ts`'s own naming
 * disclosure): prefixed `content_post_*` — checked against every existing catalog's ids
 * (`grep -rn 'name: "[a-z_]*"' src/**\/agent-tools.ts`) before choosing it. It is deliberately NOT
 * `entry_*`/`post_*`/`page_*` (any of which could be misread as reaching `features/entries`, a
 * wholly unrelated backend with no relationship to this module at all — no shared table, no shared
 * write chokepoint, no shared permission, per `entries/agent-tools.ts`'s own file header), and NOT
 * `collections_*` (already `collections_entry_*` for Entries and `collections_content_type_*` for
 * Content Types — a genuinely different domain each).
 *
 * HISTORY — this file previously recorded "There is NO delete tool", on the accurate observation
 * that `PostRepoPort` exposed exactly four methods (`findById`/`findBySlug`/`list`/`save`) with no
 * delete method anywhere in the domain to wrap. That is no longer true and the absence is no longer
 * deliberate: `post.ts` now exports `deletePost`, `PostRepoPort` now carries `softDelete`, both
 * adapters implement it, and `server/routes/admin/posts/delete.ts` + `.../pages/delete.ts` are the
 * human-facing routes `content_post_delete` mirrors. The note is kept rather than erased because a
 * reader who remembers the old claim needs to see that it was retired on purpose.
 *
 * Deliberate absences (the point of a catalog, not an oversight):
 * - There is NO separate publish/unpublish tool. Unlike `features/entries/write-service.ts`
 *   (`publishEntry`/`unpublishEntry` as their own functions), `post.ts` has exactly one write path
 *   for status changes: `updatePost`'s `status` field, validated by `classifyStatusTransition`.
 *   `content_post_update` IS how an agent publishes or unpublishes a post/page — there is no second,
 *   narrower tool to add, because the domain itself has no narrower function.
 * - `content_post_update` requires EVERY field (`title`/`slug`/`bodyJson`/`status`) rather than
 *   accepting a partial patch, unlike `collections_entry_update`/`forms_update_definition`'s partial
 *   shape. This is not a design choice this catalog made — `updatePost` (`post.ts`) itself has no
 *   partial-update capability: it reads `input.title.trim()`/`input.slug.trim()`/`isJsonObject(input.
 *   bodyJson)`/`isValidPostStatus(input.status)` unconditionally, so an omitted field would throw a
 *   raw `TypeError` (`undefined.trim()`) rather than a clean validation rejection or a "leave
 *   unchanged" no-op. Mirroring `posts/update.ts`/`pages/update.ts` (both of which always send the
 *   full record from the admin editor's own save button) precisely means requiring the same four
 *   fields here too, validated before the domain call so a missing field is a clean rejection
 *   instead of a crash.
 * - `content_post_get`'s and `content_post_update`'s `kind`-mismatch behavior is intentionally
 *   ASYMMETRIC between `kind:"post"` and `kind:"page"`, and that asymmetry is inherited, not
 *   invented. `posts/get-by-id.ts` and `posts/update.ts` (legacy, kind-blind routes — confirmed by
 *   reading both) never check whether the row they found is actually a `"post"`; `pages/get-by-id.ts`
 *   and `pages/update.ts` (the newer routes) both guard explicitly and 404 a kind mismatch
 *   "indistinguishable from not-found" (their own doc comments' words). This catalog's handlers
 *   mirror each real route's actual behavior for the `kind` the caller asked for — `kind:"post"`
 *   inherits the legacy laxity, `kind:"page"` inherits the guard — rather than picking one behavior
 *   and silently applying it to both, which would invent a capability (or a restriction) neither
 *   real route has.
 *
 * `content_post_search` is the one entry here that does NOT mirror an existing admin screen, and
 * that is deliberate rather than an oversight in the "mirror the routes" discipline the rest of this
 * catalog follows. The mirroring rule exists so a catalog never advertises a capability the product
 * does not have; it is not a rule that an agent may only do what a human can already click. There is
 * no admin search screen yet, but there IS a real capability underneath (`features/post/search.ts`
 * plus a durable FTS5 index, migration 0022), and the alternative for a model that needs to find
 * something is `content_post_list` — whose own description above admits it requires a `kind`, offers
 * no filter of any sort, and returns full `bodyJson` for every row. On a site with real content that
 * is not a search, it is a corpus dump. `content_post_search` exists so the "find the page about X,
 * then navigate to it with `page.navigate`" flow costs one bounded, ranked result set instead.
 *
 * What IS included, and why it is safe: `content_post_create`/`content_post_update` are wired
 * through `core/commands`'s `executeCommand` — the SAME command gateway `posts/create.ts`,
 * `posts/update.ts`, `pages/create.ts`, and `pages/update.ts` all route through, gated on the
 * identical `content.write` permission. `createPost`/`updatePost` themselves have no `authorize()`
 * call of their own (confirmed by reading `post.ts` in full), so `executeCommand`'s gate is the ONLY
 * enforcement point for either — not a second evaluator alongside a self-enforcing domain function
 * (ADR-021 §2), because no such self-enforcement exists here to duplicate.
 *
 * `bodyJson`'s published schema (see `TIPTAP_DOC_SCHEMA` below) describes the TipTap/ProseMirror
 * document vocabulary this codebase's own renderer (`server/http/site/render.ts`'s `renderDocNode`)
 * actually interprets: `doc`/`paragraph`/`heading`/`text` (with `bold`/`italic`/`code`/`link` marks)/
 * `bulletList`/`orderedList`/`listItem`/`blockquote`/`codeBlock`/`horizontalRule`/`widgetEmbed`. This
 * is documentation for the model, not a runtime validator: `post.ts`'s own `isJsonObject` check is
 * the only real gate `createPost`/`updatePost` apply to `bodyJson` (disclosed directly in that file's
 * `createPost` doc comment — "this codebase has no deeper TipTap schema validation anywhere else...
 * so none is invented here"), and this catalog does not invent one either. What it DOES add is a
 * structural map of the vocabulary a model needs to author a real, renderable document through this
 * tool instead of guessing an opaque blob shape — every node/mark type named here is one
 * `renderDocNode` actually switches on, so a model that follows this schema produces content the
 * renderer will not silently drop into its `default:` (children-only, formatting-losing) fallback.
 *
 * How it relates to the project:
 * `features/post/tool-registrations.ts` maps these entries into `@jini-ai/core` `ToolRegistration`s.
 *
 * Architectural role:
 * `features/post` domain declaration. Imports only the constants `post.ts` already enforces
 * (`MAX_TITLE_LENGTH`/`MAX_SLUG_LENGTH`/`SLUG_FORMAT_PATTERN`), so the published JSON Schema cannot
 * drift from what the domain function actually validates.
 */

/**
 * This domain's copy of the shared union (see `assistant/tool-registration-kit.ts`'s own
 * `AgentToolSideEffect` for why `deletes-durable-state` is a distinct member and not a flavor of
 * `mutates-durable-state`).
 */
export type AgentToolSideEffect =
  | "none"
  | "mutates-durable-state"
  | "deletes-durable-state"
  | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registration-kit.ts`'s `buildDomainRegistrations`, which refuses to wire any
   * tool lacking one).
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

const POST_KIND_SCHEMA = {
  type: "string",
  enum: ["post", "page"],
  description:
    "'post' for a blog-style entry (surfaces on the admin Posts list), 'page' for a standalone document " +
    "(About, Contact, ... — surfaces on the admin Pages list). Same underlying record, same editor — this " +
    "is fixed at creation and cannot be changed afterward.",
} as const;

const POST_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "The post/page's id, as returned by content_post_create or content_post_list.",
} as const;

// ---------------------------------------------------------------------------
// TipTap/ProseMirror `bodyJson` vocabulary — see this file's header for why this schema exists and
// what it does (and does not) validate. Mirrors exactly the node/mark types
// `server/http/site/render.ts`'s `renderDocNode`/`renderMarks` switch on; nothing here describes a
// node type the renderer would not recognize.
// ---------------------------------------------------------------------------

/** A `text` node's formatting mark. `link` is the only mark carrying `attrs` (`href`); the other
 * three are boolean-style (present or absent). */
const TIPTAP_MARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: { type: "string", enum: ["bold", "italic", "code", "link"], description: "The mark type." },
    attrs: {
      type: "object",
      additionalProperties: false,
      properties: {
        href: { type: "string", description: "Required for a 'link' mark. Ignored (and should be omitted) for bold/italic/code." },
      },
      description: "Only 'link' marks carry attrs.",
    },
  },
} as const;

/** The only inline (text-bearing) node type this renderer supports — every paragraph/heading/
 * codeBlock's `content` is an array of these. */
const TIPTAP_TEXT_NODE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type", "text"],
  properties: {
    type: { const: "text" },
    text: { type: "string", description: "The literal text. Escaped automatically at render time — do not include HTML." },
    marks: { type: "array", items: TIPTAP_MARK_SCHEMA, description: "Zero or more formatting marks applied to this whole text run. Omit for unformatted text." },
  },
} as const;

/**
 * The full TipTap/ProseMirror doc-node vocabulary, as a recursive JSON Schema (`$defs`/`$ref`) — the
 * one part of this catalog that needed real design rather than wiring (see file header). Every
 * `type` named in `$defs.blockNode`'s `oneOf` is a case `renderDocNode` actually switches on; nothing
 * here is speculative.
 *
 * `widgetEmbed` is a block-level atom (no `content`) referencing an existing widget instance's
 * placement — it is inserted/removed/reordered through `widgets_insert_embed`/`widgets_remove_embed`/
 * `widgets_reorder_embeds` (see `widgets/agent-tools.ts`), not hand-authored here; it is included in
 * this schema only so a model reading an EXISTING document's `bodyJson` back (via content_post_list/
 * content_post_get) can recognize the node rather than being surprised by an unfamiliar `type`.
 */
const TIPTAP_DOC_SCHEMA = {
  $defs: {
    mark: TIPTAP_MARK_SCHEMA,
    textNode: TIPTAP_TEXT_NODE_SCHEMA,
    inlineContent: {
      type: "array",
      items: { $ref: "#/$defs/textNode" },
      description: "Inline (text) content — this codebase's renderer supports only 'text' nodes here, no other inline node type.",
    },
    blockNode: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "content"],
          properties: { type: { const: "paragraph" }, content: { $ref: "#/$defs/inlineContent" } },
          description: "A paragraph. Renders as <p>.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "content"],
          properties: {
            type: { const: "heading" },
            attrs: {
              type: "object",
              additionalProperties: false,
              required: ["level"],
              properties: { level: { type: "integer", minimum: 1, maximum: 6, description: "Heading level 1-6 (h1-h6). Defaults to 2 if attrs/level is omitted entirely." } },
            },
            content: { $ref: "#/$defs/inlineContent" },
          },
          description: "A heading. Renders as <h1>-<h6> per attrs.level.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "content"],
          properties: { type: { const: "bulletList" }, content: { type: "array", items: { $ref: "#/$defs/listItemNode" } } },
          description: "An unordered list. Renders as <ul>; content must be listItem nodes only.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "content"],
          properties: { type: { const: "orderedList" }, content: { type: "array", items: { $ref: "#/$defs/listItemNode" } } },
          description: "An ordered list. Renders as <ol>; content must be listItem nodes only.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "content"],
          properties: { type: { const: "blockquote" }, content: { type: "array", items: { $ref: "#/$defs/blockNode" } } },
          description: "A blockquote. Renders as <blockquote>, wrapping ordinary block content (typically paragraphs).",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "content"],
          properties: { type: { const: "codeBlock" }, content: { $ref: "#/$defs/inlineContent" } },
          description: "A preformatted code block. Renders as <pre><code>. Marks on its text nodes are typically omitted.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type"],
          properties: { type: { const: "horizontalRule" } },
          description: "A horizontal rule. Renders as <hr/>. Carries no content or attrs.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "attrs"],
          properties: {
            type: { const: "widgetEmbed" },
            attrs: {
              type: "object",
              additionalProperties: false,
              required: ["placementId"],
              properties: { placementId: { type: "string", description: "An existing embed placement id, as returned by widgets_insert_embed." } },
            },
          },
          description:
            "A block-level widget embed reference (see this schema's own top-level doc). Read-and-recognize only through this tool — author new embeds via widgets_insert_embed, not by hand-writing this node.",
        },
      ],
    },
    listItemNode: {
      type: "object",
      additionalProperties: false,
      required: ["type", "content"],
      properties: { type: { const: "listItem" }, content: { type: "array", items: { $ref: "#/$defs/blockNode" } } },
      description: "One list item. content is ordinary block content (typically a single paragraph, optionally followed by a nested bulletList/orderedList).",
    },
  },
  type: "object",
  additionalProperties: false,
  required: ["type", "content"],
  properties: {
    type: { const: "doc" },
    content: { type: "array", items: { $ref: "#/$defs/blockNode" } },
  },
  description:
    "A TipTap/ProseMirror document: { type: 'doc', content: [...blockNode] }. An empty document is { type: 'doc', content: [] }. " +
    "Every node type named in this schema's $defs.blockNode is one this codebase's renderer actually recognizes — an unrecognized " +
    "type is not rejected, but silently renders its children only, losing its own formatting (matching renderDocNode's default case).",
} as const;

/**
 * The Posts + Pages domain's fixed agent-tool catalog: 3 reads (`content_post_search`/
 * `content_post_list`/`content_post_get`) plus the 3 writes `post.ts` actually exposes
 * (`content_post_create`/`content_post_update`/`content_post_delete`) — see this file's header for
 * the 2 remaining deliberate absences (no separate publish/unpublish, no partial update), the
 * retired no-delete-tool note, and the disclosed `kind`-guard asymmetry.
 *
 * Ordered read-first and destructive-last, matching `widgets/agent-tools.ts`'s/
 * `identity/agent-tools.ts`'s convention: a model needs a `postId` before it can update or delete
 * one, and `content_post_search`/`content_post_list` (or `content_post_create`'s own result) is how
 * it learns one. `content_post_search` leads because it is the one a model should reach for first —
 * see its own entry for why.
 */
export const postAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "content_post_search",
    description:
      "Finds posts and pages by relevance to a search query — the RIGHT WAY to locate content when you do not already " +
      "know its id or exact slug (for example, to answer 'where is the page about pricing?' and then navigate there with " +
      "page.navigate). Searches titles, slugs, and the body text of every post and page in the workspace, ranked best " +
      "match first. Drafts are included; trashed items are never returned. " +
      "Returns SUMMARIES ONLY — id, kind, title, slug, status, updatedAt, a short body snippet, and a relevance score. " +
      "It deliberately does NOT return bodyJson: call content_post_get with the id once you have picked a result. " +
      "PREFER THIS OVER content_post_list for finding things — content_post_list has no query and returns the full body " +
      "of every row, which will flood your context on a site with real content. Use content_post_list only when you " +
      "genuinely need the complete inventory of one kind. " +
      "Scores are relative within one result set (higher is better) and are not comparable across different queries; " +
      "an empty result means no post or page contains any of your terms, so try fewer or more general words.",
    sideEffects: "none",
    authorization: { permission: "content.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description:
            "Words to search for. Plain words only — this is not a query language, and punctuation/operators are " +
            "stripped rather than interpreted. Terms are OR'd, so a result matching only one of several words can " +
            "still rank; more specific queries simply rank better than broader ones. Rejected only if it contains " +
            "no letter or digit at all.",
        },
        kind: {
          ...POST_KIND_SCHEMA,
          description: `${POST_KIND_SCHEMA.description} Omit to search posts AND pages together — unlike content_post_list, this tool does not require a kind.`,
        },
        status: {
          type: "string",
          enum: ["draft", "published"],
          description: "Omit to search drafts and published entries together. Set to 'published' to search only what is live on the public site.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_POST_SEARCH_LIMIT,
          description: `Maximum results to return. Defaults to ${DEFAULT_POST_SEARCH_LIMIT}; values above ${MAX_POST_SEARCH_LIMIT} are clamped to ${MAX_POST_SEARCH_LIMIT} rather than rejected.`,
        },
      },
    },
  },
  {
    name: "content_post_list",
    description:
      "Lists posts or pages in the workspace (id, kind, title, slug, status, bodyJson, updatedAt, version, publicUrl) — drafts " +
      "included. publicUrl is the row's resolved public path (e.g. '/about'), ready to pass straight to fetch_published_page — " +
      "or null for a draft/unpublished row, since it has no live link yet. " +
      "Mirrors the admin Posts/Pages list screens exactly: kind is required because there is no combined 'list everything' admin " +
      "screen to mirror, and no status/date filter is available because neither list route exposes one. " +
      `Capped at ${DEFAULT_POST_LIST_LIMIT} rows by default (raise with limit, up to ${MAX_POST_LIST_LIMIT}) — the response's ` +
      "total is the full un-truncated workspace count and hasMore is true whenever posts.length < total, so truncation is " +
      "never silent.",
    sideEffects: "none",
    authorization: { permission: "content.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: POST_KIND_SCHEMA,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_POST_LIST_LIMIT,
          description: `Maximum rows to return. Defaults to ${DEFAULT_POST_LIST_LIMIT}; values above ${MAX_POST_LIST_LIMIT} are clamped to ${MAX_POST_LIST_LIMIT} rather than rejected.`,
        },
      },
    },
  },
  {
    name: "content_post_get",
    description:
      "Reads one post or page by id (id, kind, title, slug, status, bodyJson, updatedAt, version, publicUrl). publicUrl is the " +
      "row's resolved public path (e.g. '/about'), ready to pass straight to fetch_published_page to verify it renders — or " +
      "null for a draft/unpublished row, since it has no live link yet. " +
      "Disclosed asymmetry inherited from the two real admin routes this mirrors: with kind:'page', a row whose actual kind is " +
      "'post' is rejected as not-found (mirrors pages/get-by-id.ts's explicit guard) — but with kind:'post', a row whose actual " +
      "kind is 'page' is still returned (mirrors posts/get-by-id.ts's own legacy, kind-blind lookup). Use content_post_list first " +
      "if you are not certain which kind an id belongs to.",
    sideEffects: "none",
    authorization: { permission: "content.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind"],
      properties: { id: POST_ID_SCHEMA, kind: POST_KIND_SCHEMA },
    },
  },
  {
    name: "content_post_create",
    description:
      "Creates a new post or page. Always starts as 'draft' unless status is explicitly set to 'published'. slug is derived from " +
      "title when omitted (disambiguated on collision); bodyJson defaults to an empty TipTap document ({ type: 'doc', content: [] }) " +
      "when omitted. Rejected if an explicitly-supplied slug is malformed, reserved ('admin'/'api'), or already taken in this workspace. " +
      "The returned post includes publicUrl — its resolved public path when created with status 'published', or null for the " +
      "default 'draft' (nothing to link to yet until it is published via content_post_update).",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "content.write" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "title"],
      properties: {
        kind: POST_KIND_SCHEMA,
        title: { type: "string", maxLength: MAX_TITLE_LENGTH, description: `Human-readable title, up to ${MAX_TITLE_LENGTH} characters. An empty/whitespace-only title defaults to 'Untitled'.` },
        slug: {
          type: "string",
          pattern: SLUG_FORMAT_PATTERN.source,
          maxLength: MAX_SLUG_LENGTH,
          description: `Optional explicit URL slug (lowercase letters, numbers, dashes; max ${MAX_SLUG_LENGTH} characters; cannot be 'admin' or 'api'). Omit to derive one from title.`,
        },
        bodyJson: { ...TIPTAP_DOC_SCHEMA, description: `${TIPTAP_DOC_SCHEMA.description} Omit for an empty document.` },
        status: { type: "string", enum: ["draft", "published"], description: "Omit to default to 'draft'." },
      },
    },
  },
  {
    name: "content_post_update",
    description:
      "Replaces an existing post/page's title, slug, bodyJson, and status IN FULL — every field is required, there is no partial " +
      "patch (the underlying updatePost function itself has no partial-update path; this mirrors the admin editor's own save " +
      "button, which always sends the complete record). This is also how a post/page is published or unpublished: set status to " +
      "'published'/'draft'. Rejected if the row does not exist, if kind:'page' is given for an actual kind:'post' row (see " +
      "content_post_get's identical disclosed asymmetry — not rejected the other way around), if slug is malformed/reserved/taken " +
      "by another row, or if bodyJson is not a JSON object. " +
      "SEND expectedVersion whenever you are editing content you read earlier: it is how you avoid silently erasing a change a " +
      "human made in the admin editor between your read and your write. Pass the 'version' from the content_post_get / " +
      "content_post_list row you based your edit on. If it no longer matches, the call is rejected with VERSION_CONFLICT and " +
      "NOTHING is written — re-read the row, reapply your change to the body you get back, and resend with the new version.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "content.write" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "title", "slug", "bodyJson", "status"],
      properties: {
        id: POST_ID_SCHEMA,
        kind: POST_KIND_SCHEMA,
        title: { type: "string", minLength: 1, maxLength: MAX_TITLE_LENGTH, description: "Required, non-empty (unlike create, an empty title is rejected here rather than defaulted)." },
        slug: {
          type: "string",
          pattern: SLUG_FORMAT_PATTERN.source,
          maxLength: MAX_SLUG_LENGTH,
          description: `Required. Lowercase letters, numbers, and dashes; max ${MAX_SLUG_LENGTH} characters.`,
        },
        bodyJson: { ...TIPTAP_DOC_SCHEMA, description: `Required — the COMPLETE replacement body. ${TIPTAP_DOC_SCHEMA.description}` },
        status: { type: "string", enum: ["draft", "published"], description: "Required. Setting this to 'published' from 'draft' is how a post/page is published; back to 'draft' is how it is unpublished." },
        // OPTIONAL, and it must stay optional: making it required would break every caller that
        // predates it, and the domain guard itself is opt-in (`updatePost` treats an absent basis as
        // "no basis sent" and keeps its original last-write-wins behavior).
        expectedVersion: {
          type: "integer",
          minimum: 0,
          description:
            "OPTIONAL optimistic-concurrency basis — the 'version' of the row you read before making this edit. Omit it and " +
            "this update simply overwrites whatever is currently stored, INCLUDING a human's unseen changes. Send it and the " +
            "update is rejected with VERSION_CONFLICT (nothing written) if anyone saved in the meantime. Send it whenever you " +
            "have a version to send.",
        },
      },
    },
  },
  {
    name: "content_post_delete",
    description:
      "Moves a post or page to the trash. HUMAN-GATED — call it with just { id, kind }. This one call shows an interactive " +
      "confirmation dialog to the human and WAITS: it does not return until the human answers, or the dialog times out. " +
      "There is no second call to make. If the human clicks Delete, THIS SAME CALL performs the deletion and returns " +
      "{ deleted: true, cancelled: false, post }. If they click Cancel, it returns { deleted: false, cancelled: true, post } " +
      "and nothing is deleted. If nobody answers in time (or the run ends first), it returns " +
      "{ deleted: false, cancelled: false, reason: 'expired' | 'abandoned' } and nothing is deleted. Simply wait for the " +
      "result and report the true outcome to the user — do not tell them a dialog is open and stop, and do not re-call this " +
      "tool while it is already pending (a fresh call raises a second, separate dialog rather than answering the first). " +
      "The delete is a SOFT delete: the row is marked as trashed (it disappears from every posts/pages list, from get-by-id, " +
      "and from the public site) but is retained and can be restored by reverting the resulting change set. Rejected if the " +
      "row does not exist, is already trashed, or if kind:'page' is given for an actual kind:'post' row (the same disclosed " +
      "asymmetry content_post_get and content_post_update carry — not rejected the other way around).",
    // Genuinely destructive, and classified as its own thing rather than folded into the same
    // bucket as an edit — `tool-registrations.ts`'s independent `postDerivedRisk` derives the
    // identical value from what the handler actually calls, and the two are compared for equality
    // at build time (`assertToolIsWirable`), so this declaration cannot quietly soften itself.
    sideEffects: "deletes-durable-state",
    // `content.write`, not a new `content.delete`: deleting content is writing content, this
    // codebase grants no `content.delete` anywhere, and inventing a permission no policy grants
    // would make the tool unusable rather than safer. Matches `posts/delete.ts`/`pages/delete.ts`.
    authorization: { permission: "content.write" },
    // NOTE the absence of `actorClassRule: "confirmer-must-equal-own-delegatedBy"`. That rule is on
    // the kit's `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` deny-list precisely because it
    // depends on `descriptor.requiresConfirmation`, which would park the execution forever with no
    // `ExecutionDelegate` wired. This tool needs no such transport (ADR-055 Decision 2): its
    // confirmation channel is the exchange machinery in `assistant/surface-exchanges.ts`
    // (`ToolExecutionContext.emitSurface` + `SurfaceExchangeStore`), which parks THIS SAME call —
    // still with no `ExecutionDelegate`/`resumeConfirmation` involved. Declaring the rule would
    // (correctly) fail the build for a transport this tool does not use.
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind"],
      // Deliberately just these two fields. The old two-call shape needed a model-visible
      // `confirmationToken`/`decision` pair the model was told never to set (ADR-053). Now the
      // model's call carries no such fields at all — the human's answer arrives on a completely
      // separate channel (a browser POST the exchange store routes to THIS SAME held-open call,
      // never a fresh call the model could construct), so there is nothing here to warn it away
      // from; `additionalProperties: false` refuses the field outright rather than merely asking.
      properties: { id: POST_ID_SCHEMA, kind: POST_KIND_SCHEMA },
    },
  },
];
