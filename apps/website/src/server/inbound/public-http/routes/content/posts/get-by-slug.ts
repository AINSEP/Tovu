import type { Request } from "express";

import { getPublishedPostBySlug, PostNotFoundError } from "#src/features/post/index";
import { getPresentationSettings, PresentationSettingsNotFoundError } from "#src/features/presentation/index";
import { DefaultMemberAccessResolver, resolvePostMemberAccess, type MemberAccessResolver } from "#src/features/members/index";
import { toContentPostResponse } from "#src/server/inbound/public-http/http/content/posts";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";
import { MEMBER_SESSION_COOKIE } from "../../members/complete-sign-in.js";

/**
 * Manual `req.headers.cookie` parse -- no `cookie-parser` middleware mounted anywhere in this app;
 * duplicated from `routes/site/pages.ts`'s own (file-private, unexported) `readRawCookie` rather
 * than imported, matching this codebase's established precedent for small route-local pure
 * helpers (`access-resolver.ts`'s own `hashToken` docs the same "each side owns its own copy"
 * reasoning). `req.headers` is optional-chained: unlike `pages.ts`'s handler, this route's own
 * direct-invocation tests (`content-post-get-by-slug.test.ts`) call the extracted handler with a
 * bare `{ params }` object that carries no `headers` at all, and a missing cookie header must
 * resolve to "anonymous", not throw.
 */
function readRawCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Same `MemberAccessResolver` construction as `routes/site/pages.ts`'s own `createMemberAccessResolver`
 *  (ADR-030 §4) -- built per request from the three member repo ports already on `RouteDeps`, never a
 *  module-level singleton, for the same "tests inject their own in-memory repos per composition" reason
 *  that file's own doc gives. */
function createMemberAccessResolver(deps: RouteDeps): MemberAccessResolver {
  return new DefaultMemberAccessResolver({
    sessions: deps.memberSessionRepo,
    subscriptions: deps.memberSubscriptionRepo,
    tiers: deps.memberTierRepo,
  });
}

export const registerContentPostGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/content/v1/workspaces/:workspaceId/posts/:slug", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const slug = String(req.params.slug ?? "");
      const memberAccessResolver = createMemberAccessResolver(deps);
      const [{ post }, { settings }, memberContext] = await Promise.all([
        getPublishedPostBySlug({
          deps: { repo: deps.postRepo },
          input: { workspaceId: deps.workspaceId, slug },
        }),
        getPresentationSettings({
          deps: { repo: deps.presentationRepo },
          input: { workspaceId: deps.workspaceId },
        }),
        memberAccessResolver.resolveContext({
          workspaceId: deps.workspaceId,
          sessionToken: readRawCookie(req, MEMBER_SESSION_COOKIE),
          nowIso: new Date().toISOString(),
        }),
      ]);

      // ADR-030 §4 gate, matching `routes/site/pages.ts`'s `GET /:slug` single-post gate: a denied
      // caller gets the SAME `PostNotFoundError`-shaped 404 a nonexistent slug already gets below, so
      // a gated post is indistinguishable from one that doesn't exist -- no separate 403/teaser
      // response that would itself leak "a post exists at this slug, but you can't read it."
      const decision = memberAccessResolver.decide({
        access: resolvePostMemberAccess(post.memberAccessJson),
        context: memberContext,
      });
      if (!decision.allowed) {
        throw new PostNotFoundError(`post '${slug}' was not found`);
      }

      // SECURITY FIX (2026-09-05, Gemini audit finding #7): this response depends on the caller's
      // OWN member session cookie (the gate decision above is per-visitor), so a shared cache in
      // front of the origin must never store and replay it to a later, different caller. Matches
      // the convention every other gated route in this codebase already uses for exactly this
      // reason -- `routes/site/pages.ts`'s `CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE` and
      // `routes/site/media-rendition.ts`'s gated branch both send the identical `private, no-store`.
      res.set("Cache-Control", "private, no-store").json(toContentPostResponse({ post, activeThemeId: settings.activeThemeId }));
    } catch (err) {
      if (err instanceof PostNotFoundError || err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
