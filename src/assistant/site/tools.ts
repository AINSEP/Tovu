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
 * `EntryStatus` is `"draft" | "published" | "unpublished"`, so "not a draft" is **not** the same as
 * "public" — `unpublished` is content that was deliberately taken down. Every read here pins
 * `status: "published"` and pushes it into the query via `EntryListPort.listByWorkspace`, which
 * every real adapter applies in SQL rather than after a full scan.
 *
 * Note what this file deliberately does NOT use: `features/entries/list.ts`'s `listEntries()`
 * helper. Its signature accepts only `{repo, workspaceId, type}` and never forwards `status`, so it
 * returns drafts. It is the obvious-looking call and it would silently leak unreleased content to
 * the public.
 */

import type { EntryListPort } from "@jini-ai/cms/entries";

/** What a tool hands back to the model. Deliberately not `EntryRecord` — that carries `workspaceId`,
 *  `version`, and internal ids the model has no use for and that should not enter a prompt. */
export interface PublicEntrySummary {
  readonly slug: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly type: string;
}

export interface PublicEntryDetail extends PublicEntrySummary {
  /** Plain text, never the raw Tiptap JSON — the model gets prose, not a document tree. */
  readonly text: string;
}

export interface SiteAssistantToolDeps {
  readonly entryList: EntryListPort;
  readonly workspaceId: string;
  /** Hard ceiling on rows returned to the model, applied at the query. Bounds both prompt size and
   *  the cost of a pathological request; a visitor cannot raise it. */
  readonly maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 20;
/** Per-entry character cap on extracted body text. A single very long post would otherwise dominate
 *  the context window and crowd out the visitor's actual question. */
const MAX_TEXT_CHARS = 4000;

function toSummary(entry: {
  slug: string;
  title: string;
  publishedAt: string | null;
  type: string;
}): PublicEntrySummary {
  return { slug: entry.slug, title: entry.title, publishedAt: entry.publishedAt, type: entry.type };
}

/**
 * Depth-first text extraction from a Tiptap document. Deliberately tolerant: `bodyJson` is
 * `unknown` on `EntryRecord` and this runs against whatever is actually in the database, including
 * rows written by older schema versions. Anything unrecognized contributes nothing rather than
 * throwing — a malformed body must degrade to a thinner answer, never to a failed request.
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
   * The filter is applied **twice, on purpose**: pushed into the query (so a real adapter resolves
   * it in SQL rather than scanning), and re-asserted on the rows that come back. The second pass is
   * not redundant defensiveness — it is the difference between a bug and a breach. `EntryListPort`
   * is an interface, so the adapter on the other side is swappable and includes in-memory and
   * future implementations this file will never see. If any of them ignores or mishandles `status`,
   * the failure mode without this line is *silently serving drafts to the public*.
   *
   * Proven by test: a deliberately leaky adapter that returns every row is still withheld here.
   */
  async function readPublished() {
    const rows = await deps.entryList.listByWorkspace({
      workspaceId: deps.workspaceId,
      status: "published",
      orderBy: "updatedAt",
      limit,
    });
    // Positive match on the one allowed value — never `!== "draft"`, which would admit
    // `"unpublished"` today and every status added to the union tomorrow.
    return rows.filter((row) => row.status === "published");
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
      return matched.map(toSummary);
    },

    /**
     * Resolved by slug against the SAME published-only read as everything else, rather than by id
     * via a direct `findById`. A slug is what a visitor can legitimately know; an id lookup would
     * accept an identifier they could only have obtained from somewhere they should not have been,
     * and would need its own status check that could drift from the one above.
     */
    async get_published_entry(input: { slug?: unknown }): Promise<PublicEntryDetail | { error: string }> {
      const slug = typeof input?.slug === "string" ? input.slug.trim() : "";
      if (slug.length === 0) return { error: "slug is required" };

      const entries = await readPublished();
      const found = entries.find((e) => e.slug === slug);
      // Same response for "does not exist" and "exists but is not published" — distinguishing them
      // would confirm the existence of unpublished content to anyone who can guess a slug.
      if (!found) return { error: `no published entry with slug "${slug}"` };

      return { ...toSummary(found), text: extractText(found.bodyJson).join(" ").trim() };
    },

    /**
     * Derived from published entries' own `type` field rather than read from the content-type
     * registry. The registry lists every type that EXISTS, including ones with no public content,
     * which would tell a visitor about sections of the site they cannot see.
     */
    async list_categories(): Promise<readonly string[]> {
      const entries = await readPublished();
      return [...new Set(entries.map((e) => e.type))].sort();
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
