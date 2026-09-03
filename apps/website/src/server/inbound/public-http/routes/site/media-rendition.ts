import type { Request } from "express";

import { ImageSourceCorruptError, ImageTransformUnavailableError, resolveMediaRendition, sniffContentType } from "#src/features/media/index";
import type { PostRecord } from "#src/features/post/index";
import { DefaultMemberAccessResolver, resolvePostMemberAccess, type MemberAccessResolver } from "#src/features/members/index";
import { parseRangeHeader } from "#src/server/inbound/admin-http/range";
import type { MediaRenditionRouteDeps, MediaRenditionRouteRegistrar } from "#src/server/inbound/admin-http/routes/media/deps";
import { DISALLOWED_INLINE_CONTENT_TYPES, resolveMediaOriginalBlob, sendMediaOriginalResponse } from "#src/server/inbound/admin-http/routes/media/original";
import { MEMBER_SESSION_COOKIE } from "../members/complete-sign-in.js";

/**
 * @file Public, unauthenticated media rendition serving route (ADR-027 §4
 * frozen URL contract): `GET /m/{assetId}/{transformName}.v{version}/{slug}.{ext}`.
 *
 * Single-workspace v1 (same disclosed assumption as
 * `routes/site/analytics-ingest.ts`'s `resolveWorkspaceForHost` stub): the
 * frozen URL shape has no workspace segment at all, so this route always
 * resolves against `deps.workspaceId`.
 *
 * `slug`/`ext` (the final path segment) are read only to satisfy Express's
 * routing shape — per ADR-027 §4 they are cosmetic and never participate in
 * the lookup (`resolveMediaRendition` never sees them).
 *
 * This file also owns a second, separate public route (2026-08-24, video/embed capability):
 * `GET /m/{assetId}/original` — see {@link registerMediaOriginalVideoRoute}'s own doc for why
 * video needs a route that bypasses the transform pipeline above entirely, rather than a new
 * `TransformFormat`. Two path segments after `/m/`, never three, so it can never collide with the
 * `{transformName}.v{version}/{slug}.{ext}` shape above regardless of registration order.
 */

const TRANSFORM_SPEC_PATTERN = /^(.+)\.v(\d+)$/;

/**
 * Parses and validates the `{transformName}.v{version}` path segment against `assetId`,
 * returning either the resolved fields or the one-of-two malformed-URL error messages the route
 * has always distinguished. Isolated from the handler so both validation branches (pattern match,
 * version range) live in one place instead of the caller's own complexity budget.
 *
 * @complexity O(1) — one regex match plus two range/shape checks.
 */
function resolveTransformSpec(
  assetId: string,
  transformSpec: string,
): { transformName: string; version: number } | { errorMessage: string } {
  const match = TRANSFORM_SPEC_PATTERN.exec(transformSpec);
  if (!assetId || !match) {
    return { errorMessage: "malformed media rendition URL" };
  }

  const [, transformName, versionText] = match;
  const version = Number(versionText);
  if (!Number.isInteger(version) || version < 1) {
    return { errorMessage: "malformed transform version" };
  }

  return { transformName, version };
}

/** Local copy of `pages.ts`'s own (file-private) `isPlainObject`/`collectImageAssetIds` walk —
 *  duplicated rather than imported, same "each side owns its own copy of a small pure helper"
 *  precedent `9bf661e9`'s content-API gating fix already followed for `readRawCookie`/
 *  `createMemberAccessResolver` below. Walks a TipTap-shaped `bodyJson` tree collecting every
 *  ref-based `image` node's `assetId` (ADR-027 §4's `{assetId, transformName}` shape); a legacy
 *  `src`-only node contributes nothing, matching `render.ts`'s own `image` case, which never reads
 *  `src` at all once a ref shape exists. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectImageAssetIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectImageAssetIds(child, out);
    return;
  }
  if (!isPlainObject(node)) return;
  if (node.type === "image" && isPlainObject(node.attrs) && typeof node.attrs.assetId === "string") {
    out.add(node.attrs.assetId);
  }
  if (Array.isArray(node.content)) collectImageAssetIds(node.content, out);
}

/**
 * Finds every PUBLISHED post whose `bodyJson` embeds `assetId` — the derivation this route uses in
 * place of a hand-maintained asset->post foreign key. There is no such column anywhere in this
 * codebase (`MediaRecord`, `@jini-ai/cms/media`, carries no post/owner reference at all); deriving
 * the relationship from the one place it's actually authored (a post's own body) is the same choice
 * `resolveMediaAssetMetadataForRender` (`pages.ts`) already made for the unrelated width/height/class
 * override lookup, rather than adding a second, independently-writable copy of the same fact.
 *
 * DRAFT posts are deliberately excluded: an asset referenced only by an unpublished draft (or a
 * freshly uploaded asset not yet embedded anywhere) must stay reachable — see
 * `MediaRenditionRouteDeps`'s own doc for why the admin composer needs that. A draft's own content
 * is never served to the public any other way either (`getPublishedPostBySlug` already excludes
 * it), so excluding drafts from this scan opens no new leak.
 *
 * @complexity O(p) over the workspace's published posts, each behind an already-in-memory
 * `bodyJson` walk (no additional I/O per post) — the same `postRepo.list` + linear scan shape
 * `buildSitemap`'s `computeSitemapEntries` and `pages.ts`'s `filterVisiblePosts` already use at
 * this codebase's disclosed single-workspace scale.
 */
async function findPublishedPostsReferencingAsset(
  deps: Pick<MediaRenditionRouteDeps, "postRepo" | "workspaceId">,
  assetId: string
): Promise<PostRecord[]> {
  const posts = await deps.postRepo.list({ workspaceId: deps.workspaceId });
  const referencing: PostRecord[] = [];
  for (const post of posts) {
    if (post.status !== "published") continue;
    const ids = new Set<string>();
    collectImageAssetIds(post.bodyJson, ids);
    if (ids.has(assetId)) referencing.push(post);
  }
  return referencing;
}

/** Route-local duplicate of `pages.ts`'s own (file-private) `readRawCookie` — no `cookie-parser`
 *  mounted anywhere in this app, same reasoning `9bf661e9`'s content-API fix already gives for its
 *  own copy. `req.headers` is optional-chained for the same direct-invocation-test reason that
 *  file's copy documents. */
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

/** Route-local duplicate of `pages.ts`'s own `createMemberAccessResolver` — built per request from
 *  `deps`, never a module-level singleton, same "tests inject their own in-memory repos per
 *  composition" reason that file's own doc gives. */
function createMemberAccessResolver(
  deps: Pick<MediaRenditionRouteDeps, "memberSessionRepo" | "memberSubscriptionRepo" | "memberTierRepo">
): MemberAccessResolver {
  return new DefaultMemberAccessResolver({
    sessions: deps.memberSessionRepo,
    subscriptions: deps.memberSubscriptionRepo,
    tiers: deps.memberTierRepo,
  });
}

/**
 * Whether `assetId` is gated at all, and — if it is — whether THIS request's caller may read it.
 *
 * `gated: false` ("no need to consult who's asking, always allow") covers TWO cases: no published
 * post references this asset at all (freshly uploaded, only in a draft, or a legacy/unreferenced
 * asset — nothing to gate on), and an asset referenced by at least one `visibility: "public"` post.
 * The second case matters for mixed-visibility embeds: `decidePublicAccess` (`access-resolver.ts`)
 * never consults `context` at all, so if even ONE referencing post is public, the outcome is
 * identical for every visitor regardless of session — exactly the property that makes the
 * route's ordinary long-lived, shared-cacheable response safe, and checking it FIRST also skips
 * the session/subscription/tier repo round trip entirely for the common "referenced by an ordinary
 * public post" case.
 *
 * `gated: true` (every referencing post requires SOME entitlement check) allows if the caller may
 * read ANY ONE of them — most-permissive-of-referrers when the same asset is embedded in posts of
 * mixed gated visibility (e.g. both `members` and `paid`). That is a deliberate choice, not an
 * oversight: if a post the caller CAN read embeds this exact asset, the bytes are already reachable
 * to them through that post's own rendered page, so denying the direct asset URL would only break
 * that post's own display for an entitled visitor without hiding anything from anyone the gate was
 * meant to stop.
 *
 * @complexity O(p) — see {@link findPublishedPostsReferencingAsset}; `decide` itself is pure O(1)
 * per referencing post.
 */
async function resolveMediaAccessDecision(
  deps: MediaRenditionRouteDeps,
  req: Request,
  assetId: string
): Promise<{ gated: boolean; allowed: boolean }> {
  const referencingPosts = await findPublishedPostsReferencingAsset(deps, assetId);
  const hasPubliclyVisibleReferrer = referencingPosts.some(
    (post) => resolvePostMemberAccess(post.memberAccessJson).visibility === "public"
  );
  if (referencingPosts.length === 0 || hasPubliclyVisibleReferrer) {
    return { gated: false, allowed: true };
  }

  const resolver = createMemberAccessResolver(deps);
  const context = await resolver.resolveContext({
    workspaceId: deps.workspaceId,
    sessionToken: readRawCookie(req, MEMBER_SESSION_COOKIE),
    nowIso: new Date().toISOString(),
  });
  const allowed = referencingPosts.some(
    (post) => resolver.decide({ access: resolvePostMemberAccess(post.memberAccessJson), context }).allowed
  );
  return { gated: true, allowed };
}

export const registerMediaRenditionRoute: MediaRenditionRouteRegistrar = (app, deps) => {
  app.get("/m/:assetId/:transformSpec/:filename", async (req, res) => {
    const assetId = String(req.params.assetId ?? "");
    const transformSpec = String(req.params.transformSpec ?? "");
    const parsed = resolveTransformSpec(assetId, transformSpec);

    if ("errorMessage" in parsed) {
      res.status(400).json({ error: parsed.errorMessage });
      return;
    }

    const { transformName, version } = parsed;

    try {
      const access = await resolveMediaAccessDecision(deps, req, assetId);
      if (!access.allowed) {
        // ADR-030 §4 gate (2026-09-03 sweep): the SAME "rendition not found" 404 an unknown
        // assetId already gets below — a gated asset must be indistinguishable from one that
        // doesn't exist, matching `9bf661e9`'s content-API fix. `private, no-store`, never the
        // short-TTL `public` header the plain not-found branch below uses: this outcome depends on
        // the caller's own session cookie, so a shared/CDN cache must never replay it to a
        // DIFFERENT visitor (see `MediaRenditionRouteDeps`'s own doc).
        res.status(404).set("Cache-Control", "private, no-store").json({ error: "rendition not found" });
        return;
      }

      const result = await resolveMediaRendition({
        deps: {
          mediaRepo: deps.mediaRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          transformRepo: deps.transformDefinitionRepo,
          blobStore: deps.blobStore,
          imageTransformer: deps.imageTransformer,
          clock: deps.clock,
          idGen: deps.idGen,
        },
        input: { workspaceId: deps.workspaceId, assetId, transformName, version },
      });

      if (result.outcome === "gone") {
        // ADR-027 §4: a purged/gone asset is `410 no-store`. See
        // `rendition-service.ts`'s doc comment for the disclosed
        // trashed-stands-in-for-purged mapping this build uses.
        res.status(410).set("Cache-Control", "no-store").end();
        return;
      }

      if (result.outcome === "not-found") {
        // Not-yet-generated-and-not-generatable-anonymously (or a wholly
        // unknown assetId/transform) -> short-TTL 404, never the long-lived
        // immutable cache header.
        res.status(404).set("Cache-Control", "public, max-age=60").json({ error: "rendition not found" });
        return;
      }

      res
        .status(200)
        // `access.gated`: a gated asset's ALLOW outcome is per-viewer (it depended on this
        // request's session cookie), so it must never be handed the long-lived, shared/CDN-facing
        // `immutable` header below — the next, possibly unentitled, visitor to hit a public/shared
        // cache would be served this same cached response. Ungated media (the overwhelming common
        // case) keeps the original immutable header unchanged.
        .set("Cache-Control", access.gated ? "private, no-store" : "public, max-age=31536000, immutable")
        .set("Content-Type", result.contentType)
        .send(Buffer.from(result.bytes));
    } catch (err) {
      if (err instanceof ImageTransformUnavailableError) {
        // The transform is valid and generation was allowed, but the real pixel-operation
        // adapter can't run in this environment (disclosed `sharp`-not-installed blocker — see
        // `image-transformer.sharp.ts`). Service-unavailable, not a routine 404/410/500.
        res.status(503).set("Cache-Control", "no-store").json({ error: err.message });
        return;
      }
      if (err instanceof ImageSourceCorruptError) {
        // The asset and transform are both valid, but the STORED bytes cannot actually be
        // decoded/re-encoded by the pixel pipeline (a corrupt or codec-rejected blob — see that
        // error's own doc for how bytes can pass this package's upload allowlist and its
        // magic-byte sniff while still failing here). A data condition on this one asset, not a
        // server fault — 422, never the opaque catch-all 500, and never cached (a future fix to
        // the stored blob must not stay masked by a long-lived negative cache entry).
        res.status(422).set("Cache-Control", "no-store").json({ error: "source image could not be processed" });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * Public, unauthenticated `GET /m/{assetId}/original` — the video/embed capability's real
 * render-path fix (2026-08-24; see the video-embed handoff report for the full investigation).
 *
 * WHY THIS EXISTS RATHER THAN A NEW TRANSFORM: {@link registerMediaRenditionRoute} above always
 * resolves a request through `resolveMediaRendition` (`rendition-service.ts`), which — for any
 * not-yet-generated rendition — calls `imageTransformer.transform()` with the transform
 * definition's `params.format`. `TransformFormat` (`transform-types.ts`) is a closed
 * `"jpeg" | "png" | "webp" | "gif"` union with no video member, and the one core transform this
 * host registers (`media/bootstrap.ts`'s `"public"`, `format: "webp"`) is a `sharp` re-encode —
 * pointing a `<video>` tag's `src` at that same URL would hand raw video bytes to `sharp`, which
 * cannot process them. Extending `TransformFormat`/`imageTransformer` to understand video would
 * mean teaching the ADR-027 §4 "frozen" contract a passthrough format it was never designed for,
 * for a media kind (video) that has no resize/re-encode step to apply in the first place — video
 * is served byte-identical to how it was uploaded, same as every image's own `"original"`
 * passthrough rendition row already is, just without a transform-definition lookup gating it.
 *
 * So this route bypasses the transform system entirely: {@link resolveMediaOriginalBlob} +
 * {@link sendMediaOriginalResponse} are the SAME functions `routes/admin/media/original.ts`'s
 * authenticated admin-preview route already uses (content-type sniffed fresh from bytes, SVG/HTML
 * forced to `application/octet-stream` + `attachment`, `nosniff`/CSP/CORP headers, `Range` support
 * for video seeking) — reused, not reimplemented, so the two routes' security posture can't drift
 * apart. The one behavioral difference from the admin route: no `requireAdminSession`/`media.read`
 * gate, since this URL is meant to sit in a `<video src>` on a public page.
 *
 * VIDEO-ONLY, DELIBERATELY: an asset whose sniffed content type does not start with `"video/"`
 * 404s here rather than serving. This route is not a general "fetch any asset's raw bytes
 * publicly" escape hatch — an image asset must still only ever reach the public web through
 * {@link registerMediaRenditionRoute}'s sanitizing re-encode above. Narrowing to video keeps that
 * existing design intent (every publicly-served image passes through `sharp`) intact; widening
 * this route to other types later is a deliberate future decision, not a side effect of this one.
 *
 * ADR-030 §4 gate (2026-09-03 sweep): {@link resolveMediaAccessDecision} runs before the blob is
 * even fetched, same as {@link registerMediaRenditionRoute} above — a denied caller gets the SAME
 * "video rendition not found" 404 the not-a-video branch below already uses, so a gated video is
 * indistinguishable from one that was never a video at all. No cache-header special-casing is
 * needed on the ALLOW path here: {@link sendMediaOriginalResponse} already sends `private, no-store`
 * unconditionally for every successful response, gated or not.
 *
 * @complexity O(1) plus the byte copy for a partial range (inherited from
 * {@link sendMediaOriginalResponse}), plus {@link resolveMediaAccessDecision}'s own O(p) cost.
 */
export const registerMediaOriginalVideoRoute: MediaRenditionRouteRegistrar = (app, deps) => {
  app.get("/m/:assetId/original", async (req, res) => {
    const assetId = String(req.params.assetId ?? "");

    try {
      const access = await resolveMediaAccessDecision(deps, req, assetId);
      if (!access.allowed) {
        res.status(404).set("Cache-Control", "private, no-store").json({ error: "video rendition not found" });
        return;
      }

      const resolved = await resolveMediaOriginalBlob(deps, res, { workspaceId: deps.workspaceId, mediaId: assetId });
      if (!resolved) {
        return;
      }
      const { blob } = resolved;

      const bytes = await deps.blobStore.get({ storageKey: blob.storageKey });
      const sniffed = sniffContentType(bytes);
      if (!sniffed.startsWith("video/")) {
        // Not a video asset (or an unrecognized/corrupt one) — this route only ever serves video;
        // everything else's public URL is `registerMediaRenditionRoute`'s transform-backed one.
        res.status(404).set("Cache-Control", "public, max-age=60").json({ error: "video rendition not found" });
        return;
      }

      const totalLength = bytes.byteLength;
      const range = parseRangeHeader({ header: req.get("range"), totalLength });
      sendMediaOriginalResponse(res, bytes, range, {
        safe: sniffed,
        forceDownload: DISALLOWED_INLINE_CONTENT_TYPES.has(sniffed),
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
