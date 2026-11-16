import { readRequestCookie } from "#src/server/http/request-cookie";
import type { Request } from "express";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { resolvePostMemberAccess } from "#src/features/members/access-resolver";
import type { MemberAccessDecision, MemberContext, MemberAccessResolver } from "#src/features/members/index";
import { MEMBER_SESSION_COOKIE } from "../../../../http/members.js";
import type { RouteDeps } from "#src/server/routes/types";

/** No cookie-parser middleware is mounted. All request cookies use the shared reader,
 * matching dev-auth without an unguarded decodeURIComponent copy. */

/**
 * Turns this request's member-session cookie into a validated {@link MemberContext}. Reads the
 * cookie through `readRawCookie` above (no `cookie-parser` is mounted anywhere in this app) using
 * `complete-sign-in.ts`'s exported {@link MEMBER_SESSION_COOKIE} rather than a second copy of the
 * literal — the sign-in route that SETS the cookie and this route that READS it must never be able
 * to disagree about its name.
 *
 * No cookie, an unknown/revoked/expired token, or a forged one all resolve to the same anonymous
 * context: `resolveContext` validates the token hash against the session repo and never trusts a
 * client-supplied claim, so none of those cases is distinguishable from "not signed in" here.
 */
export async function resolveMemberContextForRequest({ req, deps, resolver }: { req: Request; deps: RouteDeps; resolver: MemberAccessResolver }, _optional = {}): Promise<MemberContext> {
  return resolver.resolveContext({
    workspaceId: deps.workspaceId,
    sessionToken: readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }),
    nowIso: new Date().toISOString(),
  });
}

/**
 * The gate decision for ONE post — the whole {@link MemberAccessDecision}, deliberately not a
 * boolean. `decision.teaser` and `decision.reason` are the named seam a future teaser /
 * sign-in-prompt render reads (`sign_in_required` and `upgrade_required` are different pages for a
 * visitor); collapsing this to `boolean` at the call site would discard exactly the information
 * that follow-up needs and force it to re-derive the decision a second time. Today every
 * `!allowed` decision renders the same plain 404 — see the `/:slug` handler's own comment.
 *
 * `resolvePostMemberAccess` owns the `JSON.parse` boundary for the column, and fails CLOSED:
 * malformed JSON decodes to a visibility outside the known union, which `decide`'s default branch
 * denies as `unknown_visibility`. A `NULL` column (every pre-existing row) decodes as
 * `{visibility: "public"}`, so an ungated post behaves exactly as it does today.
 */
export function decidePostMemberAccess({ resolver, post, context }: { resolver: MemberAccessResolver; post: PostRecord; context: MemberContext }, _optional = {}): MemberAccessDecision {
  return resolver.decide({ access: resolvePostMemberAccess({ raw: post.memberAccessJson }), context });
}

/**
 * Drops every post this visitor may not read from a LIST bound for a theme render.
 *
 * Gating only the direct `/:slug` fetch would be protection that looks real and isn't: `renderSite`
 * hands `posts` to the theme's home/entry-grid and "more dispatches" regions, which print each
 * post's title and link. A gated post whose own page 404s would still advertise its existence,
 * title, and URL on the ungated home page — which is why the regression suite asserts the listing
 * separately from the single-post 404, with a public positive-control post proving the list renders
 * at all.
 *
 * @complexity O(n) over the already-bounded published-post list; `decide` is pure and does no I/O
 * (the one I/O step, session/entitlement resolution, happened once in
 * {@link resolveMemberContextForRequest} before this is called).
 */
export function filterVisiblePosts({ resolver, posts, context }: { resolver: MemberAccessResolver; posts: readonly PostRecord[]; context: MemberContext }, _optional = {}): PostRecord[] {
  return posts.filter((post) => decidePostMemberAccess({ resolver, post, context }).allowed);
}
