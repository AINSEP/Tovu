import type { PostRecord, PostRepoPort } from "../../features/post/index.js";

/**
 * Structural signature matching `features/post/post.ts`'s real `listPublishedPosts` function.
 * Redeclared locally rather than shared from `tools.ts` — this repo redeclares small structural
 * types per-file rather than sharing them across the module-cycle boundary (same precedent as
 * `dual-read.ts`'s own two types). Importing the FUNCTION as a value here is exactly the edge that
 * used to close the `[assistant, features/post]` module cycle `check:architecture` flags; see
 * `resolvePublicTarget`'s `deps.listPublishedPosts` param doc for how the real function still reaches
 * this file despite the type living here instead of being imported.
 */
type ListPublishedPosts = (
  required: { deps: { repo: PostRepoPort }; input: { workspaceId: string } },
) => Promise<{ posts: PostRecord[] }>;

/**
 * @file SPEC-046 REQ-4/REQ-6/REQ-8 — the client-directive channel's shared shape and its one
 * server-side target resolver.
 *
 * REQ-4 asks for ONE typed event, a discriminated union by `kind`, so a future consumer (an
 * `ui_surface` MCP-UI resource — REQ-7, not built here; the public allowlist ships empty per SPEC-046
 * §8) is an added union member, not a new transport. `ClientDirective` below is that union; only
 * `page_action` has a real producer today (`navigate`/`scroll_to`/`highlight` — spec §4's first
 * consumers).
 *
 * ## REQ-6 — why this file is the only place a path gets constructed
 *
 * The model never emits a URL, path, or selector — every page-action tool in `tools.ts` accepts a
 * `slug` and calls `resolvePublicTarget` below, which is the ONLY function in this codebase that
 * turns a slug into a `path`. It resolves through `listPublishedPosts` — the exact same predicate
 * `tools.ts`'s `readPublished()` and `routes/site/pages.ts` (what a visitor's browser actually
 * renders) already use — never a hand-rolled `status === "published"` check. That matters because
 * `PostRecord.deletedAt` is independent of `status`: a trashed post still reads `status:
 * "published"`, so a status-only check would leak it. A slug absent from that list — off-site by
 * construction (this only ever searches THIS workspace's posts), an admin path (never a post slug),
 * unpublished, or trashed-but-`published` — resolves to `null`, and every capability's `execute()` in
 * `capability-registry.ts` refuses on `null` before anything reaches the client. There is no second
 * path-construction call site to keep in sync with this one.
 *
 * ## REQ-8 — why that makes the injection boundary hold
 *
 * Assistant input includes published post content (a post can try to steer the model that reads it).
 * Because every Tier A page-action target must resolve through the published-content predicate above,
 * the worst case of a successful injection is an already-public page of THIS site — never an off-site
 * URL, an admin route, or hidden content, because none of those can ever come back from
 * `resolvePublicTarget`. That is the invariant REQ-8 requires; it holds structurally, not by prompt
 * instruction.
 */

/** What a page-action tool resolves a model-supplied slug into. `path` is always `/${slug}` — the
 *  same convention `routes/site/pages.ts`'s catch-all `GET /:slug` and its own `canonicalUrl` already
 *  use — never a URL supplied by anything upstream of this function. */
export interface ResolvedPublicTarget {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
}

/**
 * The one function in this codebase that turns a model-supplied slug into a path a visitor's browser
 * may be sent to. Returns `null` for anything not in the published set — see file header for why that
 * single predicate is what makes REQ-6's refusal list (off-site, admin, unpublished, trashed) hold
 * without being enumerated as separate cases here: none of them can ever appear in
 * `listPublishedPosts`'s result.
 *
 * @complexity O(n) in published-post count for the `find` — identical cost profile to
 *   `tools.ts#get_published_entry`'s own by-slug lookup, which this mirrors deliberately (see that
 *   file's own doc for why a slug lookup, not an id lookup, is the correct addressing scheme for
 *   anonymous traffic).
 * @overallScore 100
 */
export async function resolvePublicTarget(
  deps: {
    readonly postRepo: PostRepoPort;
    readonly workspaceId: string;
    /** Injected rather than statically imported — see the `ListPublishedPosts` type doc above.
     *  Callers must pass the real `features/post`'s own `listPublishedPosts` (wired at the one
     *  production composition root, `server/modules/site-assistant.ts`) so this resolves through the
     *  exact same predicate `tools.ts`'s `readPublished()` and `routes/site/pages.ts` use — see this
     *  file's header for why that equality is what makes REQ-8's injection-containment invariant
     *  hold. */
    readonly listPublishedPosts: ListPublishedPosts;
  },
  slug: unknown,
): Promise<ResolvedPublicTarget | null> {
  if (typeof slug !== "string" || slug.trim().length === 0) return null;
  const trimmed = slug.trim();

  const { posts } = await deps.listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } });
  const found = posts.find((p: PostRecord) => p.slug === trimmed);
  if (!found) return null;

  return { slug: found.slug, title: found.title, path: `/${found.slug}` };
}

/** One page-action, always carrying the server-resolved target — never a raw selector (REQ-6). */
export type PageAction =
  | { readonly type: "navigate"; readonly target: ResolvedPublicTarget; readonly auto: boolean }
  | { readonly type: "scroll_to"; readonly target: ResolvedPublicTarget }
  | { readonly type: "highlight"; readonly target: ResolvedPublicTarget };

/**
 * REQ-4's one new SSE event payload. `page_action` is Tier A (REQ-5) — resolved and validated here,
 * server-side, before the event is ever written to the stream; the client executes it verbatim,
 * choosing nothing on its own beyond DOM lookup mechanics. `ui_surface` is the REQ-7 extension point:
 * defined so a future MCP-UI resource is an added `kind`, not a transport change, but nothing in this
 * codebase constructs one yet — the public redemption allowlist ships empty (SPEC-046 §8), so Tier B
 * has no live producer.
 */
export type ClientDirective =
  | { readonly kind: "page_action"; readonly action: PageAction }
  | { readonly kind: "ui_surface"; readonly toolId: string; readonly resource: unknown };

/**
 * Phrases that count as the visitor's OWN explicit request to navigate (SPEC-046 D-1). Matched only
 * against `body.message` — the live turn the visitor just typed — never against tool results, prior
 * `history` turns, or post content, all of which an injection can influence. This is what makes D-1's
 * security property hold: "in the default path a hijacked model cannot move anyone" requires that
 * whether a `navigate` action auto-executes is decided from evidence the model does not control, and
 * the visitor's own current keystrokes are the one input in this request that qualifies.
 *
 * A small, literal phrase list rather than a model-judged classification, deliberately: the whole
 * point is that this decision must not run through anything the model (or content it read) could
 * sway. False negatives here just mean a visitor gets a clickable proposal instead of an instant
 * navigation — never a security gap; false positives could auto-navigate on a message that did not
 * really mean it, which is why the list stays narrow and literal rather than broadened to catch every
 * paraphrase.
 */
const EXPLICIT_NAVIGATION_PATTERNS: readonly RegExp[] = [
  /\btake me (there|to)\b/i,
  /\bbring me (there|to)\b/i,
  /\bgo there\b/i,
  /\bnavigate me\b/i,
  /\bnavigate (there|to)\b/i,
];

/**
 * SPEC-046 D-1's server-side gate: true only when the VISITOR's own current message contains an
 * explicit navigation request. See the constant above for why this reads `message` specifically and
 * why the pattern list stays deliberately narrow.
 *
 * @complexity O(1) — a fixed, small pattern list against one bounded message string
 *   (`MAX_MESSAGE_CHARS`, `site-assistant.ts`).
 * @overallScore 100
 */
export function detectsExplicitNavigationIntent(message: string): boolean {
  return EXPLICIT_NAVIGATION_PATTERNS.some((pattern) => pattern.test(message));
}
