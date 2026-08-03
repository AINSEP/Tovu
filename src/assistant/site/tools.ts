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
 * doc). That means the filter below is not a second belt-and-braces layer on top of a query-level
 * one — it is the ONLY filter standing between anonymous traffic and every draft/trashed row in the
 * workspace. There is no query-level fallback to lean on here.
 *
 * Note what this file deliberately does NOT use: calling `deps.postRepo.list()` and trusting the
 * caller to filter. Every read goes through this file's own `readPublished()`, so there is exactly
 * one place that decides what "public" means.
 */

import type { PostRecord, PostRepoPort } from "../../features/post";
import { isTrashed } from "../../features/post";

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
  /** Hard ceiling on rows returned by `search_published_entries`, applied after the published/trash
   *  filter and after the query-string match. A visitor cannot raise it. Not applied to
   *  `get_published_entry` (a single addressed lookup already returns at most one row, so a list
   *  ceiling has nothing to bound there) or `list_categories` (capping the pool before deriving
   *  categories would make older categories silently vanish once the workspace has more than
   *  `maxResults` published posts — a correctness bug, not a cost control). */
  readonly maxResults?: number;
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
   * One place that decides what "public" means, so no tool below can quietly disagree with another.
   *
   * `PostRepoPort.list()` returns every row in the workspace regardless of status or trash state
   * (see this file's header) — there is no query-level filter to push down here, unlike the
   * `entries`/`EntryListPort` model this file used before. This filter is therefore the entire
   * enforcement, not a second pass on top of one.
   *
   * Proven by test: a fake port that returns drafts and trashed rows alongside published ones is
   * still withheld here.
   */
  async function readPublished(): Promise<PostRecord[]> {
    const rows = await deps.postRepo.list({ workspaceId: deps.workspaceId });
    // Positive match on the one allowed status — never `!== "draft"`, which would admit every
    // status added to the union tomorrow. `!isTrashed` is independent of `status`: trashing only
    // stamps `deletedAt`, so a trashed row can still read `status: "published"`.
    return rows.filter((row) => row.status === "published" && !isTrashed(row));
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
] as const;
