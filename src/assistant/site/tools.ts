/**
 * @file The public site assistant's entire tool surface (ADR-054).
 *
 * Three read-only tools over published content, and nothing else. This file is the allowlist —
 * there is no registry lookup, no dynamic dispatch, and no path by which a tool not written here
 * becomes callable. That is deliberate: the visitor assistant runs for anonymous internet traffic,
 * and a surface you have to remember to restrict is one you will eventually forget to restrict.
 *
 * ## Published-only is a contract term, not a filter
 *
 * `PostStatus` is `"draft" | "published"`, and a row can independently carry a trash marker
 * (`PostRecord.deletedAt`). "Not a draft" is not the same as "public": a trashed row can still read
 * `status: "published"` (`PostRepoPort.softDelete` only stamps `deletedAt`; it does not touch
 * `status` — see that port's own doc). Every read here pins BOTH `status === "published"` AND
 * `!isTrashed(row)`.
 *
 * Unlike the `entries`/`EntryListPort` model this file used before, `PostRepoPort.list()` takes only
 * `{ workspaceId }` — it has no `status` parameter to push down into the query at all
 * (`PostRepoPort` keeps `findById`/`findBySlug`/`list` deliberately trash- and status-BLIND so
 * uniqueness checks and reverters elsewhere can see every row; see `post.ts`'s `PostRecord.deletedAt`
 * doc). That means the `status === "published" && !isTrashed(row)` predicate is not a second
 * belt-and-braces layer on top of a query-level one — it is the ONLY filter standing between
 * anonymous traffic and every draft/trashed row in the workspace. There is no query-level fallback
 * to lean on here.
 *
 * That predicate is not reimplemented in this file. `readPublished()` below calls
 * `deps.listPublishedPosts` — INJECTED (see `SiteAssistantToolDeps.listPublishedPosts`'s own doc),
 * not statically imported from `features/post` — but wired at the one production composition root
 * (`server/modules/site-assistant.ts`) to the real `features/post`'s own `listPublishedPosts`, the
 * SAME function `routes/site/pages.ts` calls to decide what a visitor's browser renders. "What is
 * publicly visible" has exactly one definition in this codebase; this file consumes it rather than
 * keeping a second copy that happens to agree today. A second copy is exactly how the assistant would
 * end up MORE permissive than the site it speaks for the first time someone adds a visibility
 * condition — scheduled publishing, per-post visibility, membership gating — to `listPublishedPosts`
 * alone: the site would start honoring it and a locally-reimplemented filter here would not, silently.
 * The injection exists ONLY to break a module cycle (`assistant/site/*` value-importing
 * `features/post` while `features/post/tool-registrations.ts` registers into `assistant` — see
 * `SiteAssistantToolDeps.listPublishedPosts`'s doc); it does not weaken this guarantee, because the
 * composition root still passes the real function, never a reimplementation. Note what this file
 * still deliberately does NOT do: call `deps.postRepo.list()` directly and filter (or trust a caller
 * to have filtered) — every read goes through `readPublished()`, so there is exactly one call site in
 * this file that decides what "public" means, and it defers that decision to the one place in the
 * codebase that already owns it.
 */

import type { PostRecord, PostRepoPort } from "../../features/post";
import { resolvePublicTarget, type ClientDirective } from "./client-directives";

/**
 * Structural signature matching `features/post/post.ts`'s real `listPublishedPosts` function.
 * Declared locally (rather than importing `typeof listPublishedPosts`) so this module's only tie to
 * `features/post` is the two `import type`s above (`PostRecord`/`PostRepoPort`, already erased at
 * runtime) — importing the FUNCTION as a value here is exactly the edge that used to close the
 * `[assistant, features/post]` module cycle `check:architecture` flags (`assistant/site/*` both
 * value-importing `features/post` while `features/post/tool-registrations.ts` registers into
 * `assistant`). See `SiteAssistantToolDeps.listPublishedPosts`'s doc for how the real function still
 * reaches this file despite the type living here instead of being imported.
 */
type ListPublishedPosts = (
  required: { deps: { repo: PostRepoPort }; input: { workspaceId: string } },
) => Promise<{ posts: PostRecord[] }>;

/** What a tool hands back to the model. Deliberately not `PostRecord` — that carries `workspaceId`,
 *  `version`, `ext`, and internal ids the model has no use for and that should not enter a prompt.
 *
 *  `updatedAt`, not `publishedAt`: `PostRecord` has no separate "when this was published" timestamp
 *  (only `status` and `updatedAt`). Calling this field `publishedAt` would tell the model something
 *  the database does not actually know — a post's `updatedAt` can move on any later edit, published
 *  or not, so this is honestly "last changed," not "went live." */
export interface PublicEntrySummary {
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: string;
  /** `PostRecord.kind` ("post" | "page") — the closest concept this content model has to a category. */
  readonly type: string;
}

export interface PublicEntryDetail extends PublicEntrySummary {
  /** Plain text, never the raw Tiptap JSON — the model gets prose, not a document tree. */
  readonly text: string;
}

export interface SiteAssistantToolDeps {
  readonly postRepo: PostRepoPort;
  readonly workspaceId: string;
  /**
   * The real `features/post`'s own `listPublishedPosts` — injected rather than statically imported
   * (see this file's header for the security reasoning behind calling that exact function, and the
   * `ListPublishedPosts` type doc above for the module-cycle reason it is injected rather than
   * imported). Wired to the real implementation at the one production composition root,
   * `server/modules/site-assistant.ts`. Tests may pass the real `features/post` export directly (test
   * files are exempt from `check:architecture`'s module-cycle graph) or a fake with the same shape —
   * either way, this field is never reimplemented locally.
   */
  readonly listPublishedPosts: ListPublishedPosts;
  /** Hard ceiling on rows returned by `search_published_entries`, applied after the published/trash
   *  filter and after the query-string match. A visitor cannot raise it. Not applied to
   *  `get_published_entry` (a single addressed lookup already returns at most one row, so a list
   *  ceiling has nothing to bound there) or `list_categories` (capping the pool before deriving
   *  categories would make older categories silently vanish once the workspace has more than
   *  `maxResults` published posts — a correctness bug, not a cost control). */
  readonly maxResults?: number;
  /**
   * SPEC-046 D-1: whether `navigate_to_entry` may resolve to an auto-executing `navigate` action
   * (`auto: true`) rather than a clickable proposal (`auto: false`). Computed ONCE by
   * `site-assistant.ts`, before any tool call runs, from `detectsExplicitNavigationIntent(message)` —
   * the visitor's own live message, never from anything the model or a tool result produced. This is
   * what keeps a hijacked model's worst case bounded to "renders a proposal a human must click": the
   * model cannot raise this flag itself by calling the tool differently, and neither can injected
   * post content, since both run after this deps object is already built. Defaults to `false`
   * (propose-only) so a caller that omits it gets the safer behavior, not the more permissive one. */
  readonly autoNavigateAllowed?: boolean;
}

const DEFAULT_MAX_RESULTS = 20;
/** Per-entry character cap on extracted body text. A single very long post would otherwise dominate
 *  the context window and crowd out the visitor's actual question. */
const MAX_TEXT_CHARS = 4000;

function toSummary(post: PostRecord): PublicEntrySummary {
  return { slug: post.slug, title: post.title, updatedAt: post.updatedAt, type: post.kind };
}

/**
 * Depth-first text extraction from a Tiptap document. Deliberately tolerant: `PostRecord.bodyJson`
 * is typed as `JsonObject` but this runs against whatever is actually in the database, including
 * rows written by older schema versions or hand-edited — the type does not guarantee the shape.
 * Anything unrecognized contributes nothing rather than throwing — a malformed body must degrade to
 * a thinner answer, never to a failed request.
 */
function extractText(node: unknown, out: string[] = [], budget = { left: MAX_TEXT_CHARS }): string[] {
  if (budget.left <= 0 || node === null || typeof node !== "object") return out;

  if (Array.isArray(node)) {
    for (const child of node) extractText(child, out, budget);
    return out;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.length > 0) {
    const slice = record.text.slice(0, budget.left);
    budget.left -= slice.length;
    out.push(slice);
  }
  if (Array.isArray(record.content)) extractText(record.content, out, budget);
  return out;
}

export function createSiteAssistantTools(deps: SiteAssistantToolDeps) {
  const limit = deps.maxResults ?? DEFAULT_MAX_RESULTS;

  /**
   * One place that decides what "public" means, so no tool below can quietly disagree with another
   * — and so this file agrees with the public site itself, not just with its own idea of "public".
   *
   * `PostRepoPort.list()` returns every row in the workspace regardless of status or trash state
   * (see this file's header) — there is no query-level filter to push down here, unlike the
   * `entries`/`EntryListPort` model this file used before. `listPublishedPosts` applies
   * `status === "published" && !isTrashed(row)` (a positive match on the one allowed status, never
   * `!== "draft"`, which would admit every status added to the union tomorrow; `isTrashed` is
   * independent of `status`, since trashing only stamps `deletedAt`) — that predicate is therefore
   * the entire enforcement standing between anonymous traffic and hidden content, not a second pass
   * on top of a query-level one. It just now lives in `features/post/post.ts`, reused rather than
   * copied — see this file's header for why that reuse is load-bearing, not tidiness.
   *
   * Proven by test: a fake `PostRepoPort` that returns drafts and trashed rows alongside published
   * ones is still withheld here.
   */
  async function readPublished(): Promise<PostRecord[]> {
    const { posts } = await deps.listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } });
    return posts;
  }

  return {
    /**
     * Substring match over title and slug. Not a ranked search engine — it is the honest primitive
     * available without adding an index, and calling it `search` in the model-facing schema while
     * it does substring matching is fine as long as this comment exists. If it needs to be better,
     * that is a real feature, not a tweak here.
     */
    async search_published_entries(input: { query?: unknown }): Promise<readonly PublicEntrySummary[]> {
      const query = typeof input?.query === "string" ? input.query.trim().toLowerCase() : "";
      const entries = await readPublished();
      const matched = query.length === 0
        ? entries
        : entries.filter(
            (e) => e.title.toLowerCase().includes(query) || e.slug.toLowerCase().includes(query),
          );
      return matched.slice(0, limit).map(toSummary);
    },

    /**
     * Resolved by slug against the SAME published-only read as everything else, rather than by id
     * via a direct `findById`. A slug is what a visitor can legitimately know; an id lookup would
     * accept an identifier they could only have obtained from somewhere they should not have been,
     * and would need its own status/trash check that could drift from the one above.
     */
    async get_published_entry(input: { slug?: unknown }): Promise<PublicEntryDetail | { error: string }> {
      const slug = typeof input?.slug === "string" ? input.slug.trim() : "";
      if (slug.length === 0) return { error: "slug is required" };

      const entries = await readPublished();
      const found = entries.find((e) => e.slug === slug);
      // Same response for "does not exist" and "exists but is not published/is trashed" —
      // distinguishing them would confirm the existence of hidden content to anyone who can guess a
      // slug.
      if (!found) return { error: `no published entry with slug "${slug}"` };

      return { ...toSummary(found), text: extractText(found.bodyJson).join(" ").trim() };
    },

    /**
     * Derived from published posts' own `kind` field ("post" | "page") rather than any registry,
     * for the same reason the original entries-based version avoided the content-type registry:
     * listing kinds that have no public content would tell a visitor about sections of the site
     * they cannot see. Runs over the full published set, not a capped page of it — see
     * `SiteAssistantToolDeps.maxResults`'s doc for why capping first would be a correctness bug
     * here, not a cost control.
     */
    async list_categories(): Promise<readonly string[]> {
      const entries = await readPublished();
      return [...new Set(entries.map((e) => e.kind))].sort();
    },

    /**
     * SPEC-046 REQ-4/REQ-6, Tier A (REQ-5). Resolves `input.slug` through `resolvePublicTarget` —
     * the ONLY place a path gets constructed (see `client-directives.ts`'s file header) — and returns
     * a `directive` alongside the model-facing `result`. `directive.action.auto` is
     * `deps.autoNavigateAllowed`, set once per request from the visitor's own message (see that
     * field's doc): the model chooses WHETHER to call this tool, never whether the resulting action
     * auto-executes or renders a proposal.
     */
    async navigate_to_entry(input: { slug?: unknown }): Promise<{ result: unknown; directive?: ClientDirective }> {
      const target = await resolvePublicTarget({ postRepo: deps.postRepo, workspaceId: deps.workspaceId, listPublishedPosts: deps.listPublishedPosts }, input?.slug);
      if (!target) return { result: { error: "no published entry with that slug — it may be unpublished, trashed, or not exist" } };

      const auto = deps.autoNavigateAllowed === true;
      return {
        result: { status: auto ? "navigated" : "proposed", slug: target.slug, title: target.title },
        directive: { kind: "page_action", action: { type: "navigate", target, auto } },
      };
    },

    /**
     * SPEC-046 REQ-4/REQ-6, Tier A. Same target resolution as `navigate_to_entry`; always executes on
     * the client immediately (no auto/propose split — scrolling into view carries no navigation risk
     * to weigh, so there is nothing D-1's gate needs to decide here).
     */
    async scroll_to_entry(input: { slug?: unknown }): Promise<{ result: unknown; directive?: ClientDirective }> {
      const target = await resolvePublicTarget({ postRepo: deps.postRepo, workspaceId: deps.workspaceId, listPublishedPosts: deps.listPublishedPosts }, input?.slug);
      if (!target) return { result: { error: "no published entry with that slug — it may be unpublished, trashed, or not exist" } };

      return {
        result: { status: "scrolled", slug: target.slug, title: target.title },
        directive: { kind: "page_action", action: { type: "scroll_to", target } },
      };
    },

    /**
     * SPEC-046 REQ-4/REQ-6, Tier A. Same target resolution again; the client applies the visual
     * highlight treatment (spec §4) on top of the same scroll-into-view behavior `scroll_to_entry`
     * uses — see `apps/site-chat/src/highlight.ts`.
     */
    async highlight_entry(input: { slug?: unknown }): Promise<{ result: unknown; directive?: ClientDirective }> {
      const target = await resolvePublicTarget({ postRepo: deps.postRepo, workspaceId: deps.workspaceId, listPublishedPosts: deps.listPublishedPosts }, input?.slug);
      if (!target) return { result: { error: "no published entry with that slug — it may be unpublished, trashed, or not exist" } };

      return {
        result: { status: "highlighted", slug: target.slug, title: target.title },
        directive: { kind: "page_action", action: { type: "highlight", target } },
      };
    },
  };
}

/** Model-facing schemas. Kept beside the implementations so a tool cannot be described to the model
 *  in terms the implementation does not honor. */
export const SITE_ASSISTANT_TOOL_SCHEMAS = [
  {
    name: "search_published_entries",
    description:
      "Search this site's published posts and pages by title or slug. Returns summaries only. Omit query to list everything published.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Text to match against title or slug." } },
    },
  },
  {
    name: "get_published_entry",
    description: "Read the full text of one published entry, addressed by its slug.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string", description: "The entry's URL slug." } },
      required: ["slug"],
    },
  },
  {
    name: "list_categories",
    description: "List the content types that have published entries on this site.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "navigate_to_entry",
    description:
      "Send the visitor to a published entry's page, addressed by slug. By default this only proposes " +
      "the page as a clickable link for the visitor to choose — it only navigates automatically when the " +
      "visitor has explicitly asked to be taken there in their own words. Use this when the visitor asks " +
      "to go to, see, or read a specific published entry. The client renders the clickable link (or " +
      "performs the navigation) itself from this call — do not also write a markdown link in your reply; " +
      "just acknowledge in plain prose.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string", description: "The entry's URL slug." } },
      required: ["slug"],
    },
  },
  {
    name: "scroll_to_entry",
    description:
      "Scroll the visitor's current page to a published entry's content, addressed by slug, without " +
      "highlighting it. The client performs the scroll itself from this call — do not also write a " +
      "markdown link in your reply; just acknowledge in plain prose.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string", description: "The entry's URL slug." } },
      required: ["slug"],
    },
  },
  {
    name: "highlight_entry",
    description:
      "Scroll to and visually highlight a published entry's content, addressed by slug, so the visitor can " +
      "easily spot what you are referring to. The client performs the scroll and highlight itself from " +
      "this call — do not also write a markdown link in your reply; just acknowledge in plain prose.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string", description: "The entry's URL slug." } },
      required: ["slug"],
    },
  },
] as const;
