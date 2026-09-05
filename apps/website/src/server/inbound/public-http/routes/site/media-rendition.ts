import type { Request, Response } from "express";

import { scanEmbedMarkers } from "#src/contracts/core/embeds/marker";
import { ImageSourceCorruptError, ImageTransformUnavailableError, resolveMediaRendition, sniffContentType } from "#src/features/media/index";
import { isTrashed, type PostRecord } from "#src/features/post/index";
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
 * The body formats this route's own reference scan knows how to read end to end:
 * `"doc"` through {@link collectImageAssetIds}'s `bodyJson` walk, `"html"` through
 * {@link addHtmlEmbedAssetIds}'s marker scan. Deliberately a runtime set rather than a reliance on
 * `PostBodyFormat` being a closed union at compile time — a `bodyFormat` value arrives from a
 * database column (`repo.sqlite.ts`'s `toRecord`), so a THIRD format added later reaches this
 * function as data long before any type error would point at this file. See
 * {@link scanEntryAssets}'s `readable` flag for what happens when one does.
 */
const READABLE_BODY_FORMATS: ReadonlySet<string> = new Set(["doc", "html"]);

/** Whether the author has marked this entry as anything other than freely public. Extracted so the
 *  three call sites that ask this question (live-referrer candidacy, the public-referrer shortcut,
 *  and opaque-body classification) share one definition of "gated" instead of three inline
 *  `resolvePostMemberAccess(...).visibility` reads that could drift apart. */
function isGatedEntry(entry: PostRecord): boolean {
  return resolvePostMemberAccess(entry.memberAccessJson).visibility !== "public";
}

/**
 * Adds every `data-embed-config` MEDIA marker's asset id found in an `"html"`-format Page's
 * `body_html` to `out`, and reports whether the scan was complete.
 *
 * This is the second half of "which entries reference this asset", and it was missing until
 * 2026-09-05. `collectImageAssetIds` walks `bodyJson` only, so it can see a `"doc"`-format entry's
 * ref-based TipTap `image` nodes and nothing else — but an `"html"`-format Page's real content
 * lives in `bodyHtml` (`post.ts`'s own doc: `bodyJson` stays an empty non-null object for those
 * rows), and video has NO TipTap node type in this codebase at all: `render.ts`'s `renderVideoTag`
 * is reached exclusively from `renderWidgetMediaImage`, i.e. from a resolved
 * `data-embed-config='{"type":"media","id":"…"}'` marker. So before this function existed, every
 * embed on an `"html"` Page and every video anywhere was invisible to the gate.
 *
 * Uses `core/embeds/marker.ts`'s `scanEmbedMarkers` directly rather than `widgets/`'s
 * `scanHtmlEmbeds` wrapper, for two reasons: `scanHtmlEmbeds` truncates at
 * `MAX_HTML_EMBEDS_PER_PAGE` (a render-time resource bound — a gate that stopped scanning at
 * marker 50 would hand marker 51 straight to an anonymous caller), and it discards `rejected`,
 * which is exactly the signal {@link scanEntryAssets} needs to know its own scan was incomplete.
 * `marker.type`/`marker.id` are the parsed `config.type`/`config.id` that
 * `resolver-service.ts`'s `parseMediaEmbedRef` reads as `{assetId, transformName}` — same keys,
 * same parser, so what this gate sees and what the renderer resolves cannot disagree.
 *
 * @complexity O(n) over `bodyHtml`'s length (one shared regex scan), plus O(k) over the markers found.
 */
function addHtmlEmbedAssetIds(bodyHtml: string, out: Set<string>): { readable: boolean } {
  const scanned = scanEmbedMarkers(bodyHtml);
  for (const marker of scanned.markers) {
    if (marker.type === "media" && marker.id) out.add(marker.id);
  }
  // A marker carrying `data-embed-config` that failed to parse is a reference this gate cannot
  // see — `describeRejection`'s own doc makes the same point for `entry_refs`. It may or may not
  // name this asset, so the honest answer is "scan incomplete", not "no reference found".
  return { readable: scanned.rejected.length === 0 };
}

/** Every asset id one entry references, across BOTH body columns, plus whether this scan could
 *  read the whole entry. Both columns are always walked rather than switching on `bodyFormat`: a
 *  `"doc"` row's `bodyHtml` is `null` and an `"html"` row's `bodyJson` is empty, so the unused half
 *  costs nothing, and a row that somehow carries both is fully covered instead of half-scanned. */
interface EntryAssetScan {
  readonly ids: Set<string>;
  readonly readable: boolean;
}

function scanEntryAssets(entry: PostRecord): EntryAssetScan {
  const ids = new Set<string>();
  collectImageAssetIds(entry.bodyJson, ids);
  const formatReadable = READABLE_BODY_FORMATS.has(entry.bodyFormat);
  if (entry.bodyHtml === null) return { ids, readable: formatReadable };
  return { ids, readable: formatReadable && addHtmlEmbedAssetIds(entry.bodyHtml, ids).readable };
}

/**
 * Whether this entry's own gating is still a live statement about who may read its media.
 *
 * A PUBLISHED, non-trashed entry always is. A non-published one counts only when it is GATED —
 * the 2026-09-05 fix for "unpublishing a gated post releases its media."
 *
 * The pre-existing rule was `status === "published"` alone, defended for a never-published draft:
 * a draft's content is not public any other way, so excluding it opens no leak. That reasoning does
 * not survive the takedown case. A members-only post that was live and is then reverted to draft
 * has an asset URL its former readers already know; dropping it from this scan flipped that asset
 * from `private, no-store` to `public, max-age=31536000, immutable` — the takedown not only failed,
 * it handed the "removed" bytes to a shared CDN for a year.
 *
 * Keeping a GATED draft as a referrer costs nothing the old rule protected. The admin composer,
 * which `MediaRenditionRouteDeps`'s own doc cites as the reason drafts stay reachable, does not use
 * this route at all — `apps/admin/src/lib/media-image-extension.tsx` resolves editor previews
 * through `api.mediaOriginalUrl(assetId)`, the AUTHENTICATED admin route, precisely because "the
 * editor is itself an authenticated admin surface, unlike the public render path." A PUBLIC draft
 * is still skipped, so a freshly uploaded or draft-only public asset stays reachable exactly as
 * before.
 *
 * TRASHED entries stay excluded, unchanged: `a5c9bac8` (same day) established that a trashed post's
 * stale reference must not gate an asset, and this pass does not reopen that decision.
 */
function isLiveReferrerCandidate(entry: PostRecord): boolean {
  if (isTrashed(entry)) return false;
  return entry.status === "published" || isGatedEntry(entry);
}

/** What one entry is to the asset being requested. `"opaque"` is the fail-closed case: a live,
 *  gated entry whose body this scan could NOT fully read, so "it does not reference this asset"
 *  is an assumption rather than a finding. */
type EntryRelation = "referrer" | "opaque" | "irrelevant";

function classifyEntry(entry: PostRecord, assetId: string): EntryRelation {
  if (!isLiveReferrerCandidate(entry)) return "irrelevant";
  const scan = scanEntryAssets(entry);
  if (scan.ids.has(assetId)) return "referrer";
  if (!scan.readable && isGatedEntry(entry)) return "opaque";
  return "irrelevant";
}

/** The outcome of one full pass over the workspace's entries for a single asset. */
interface AssetReferenceScan {
  readonly referencing: PostRecord[];
  readonly opaqueGated: PostRecord[];
}

/**
 * Finds every live entry (post OR page, `"doc"` OR `"html"`) that embeds `assetId` — the derivation
 * this route uses in place of a hand-maintained asset->entry foreign key. There is no such column
 * anywhere in this codebase (`MediaRecord`, `@jini-ai/cms/media`, carries no post/owner reference at
 * all); deriving the relationship from the one place it's actually authored (an entry's own body) is
 * the same choice `resolveMediaAssetMetadataForRender` (`pages.ts`) already made for the unrelated
 * width/height/class override lookup, rather than adding a second, independently-writable copy of
 * the same fact.
 *
 * `postRepo.list` needs no `kind` handling: it is kind-BLIND by contract and by both adapters
 * (`repo.sqlite.ts:98` selects on `workspaceId` alone), so Pages have always come back from it
 * alongside posts. The axis that actually hid content from this scan was `bodyFormat`, not `kind`.
 *
 * @complexity O(p) over the workspace's entries, each behind an already-in-memory body scan (no
 * additional I/O per entry) — the same `postRepo.list` + linear scan shape `buildSitemap`'s
 * `computeSitemapEntries` and `pages.ts`'s `filterVisiblePosts` already use at this codebase's
 * disclosed single-workspace scale.
 */
async function scanEntriesForAsset(
  deps: Pick<MediaRenditionRouteDeps, "postRepo" | "workspaceId">,
  assetId: string
): Promise<AssetReferenceScan> {
  const entries = await deps.postRepo.list({ workspaceId: deps.workspaceId });
  const referencing: PostRecord[] = [];
  const opaqueGated: PostRecord[] = [];
  for (const entry of entries) {
    const relation = classifyEntry(entry, assetId);
    if (relation === "referrer") referencing.push(entry);
    else if (relation === "opaque") opaqueGated.push(entry);
  }
  return { referencing, opaqueGated };
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
 * `gated: false` ("no need to consult who's asking, always allow") covers TWO cases: no live entry
 * references this asset and none was unreadable (freshly uploaded, only in a public draft, or a
 * legacy/unreferenced asset — nothing to gate on), and an asset referenced by at least one
 * `visibility: "public"` entry.
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
 * THE UNREADABLE-BODY FALLBACK (2026-09-05) is what stops this default from failing open again.
 * "No referrer found" is only a safe reason to allow while the scan can actually READ every entry
 * it looked at — that assumption is precisely what broke here: `bodyHtml` was never scanned, so
 * every gated `"html"` Page reported "no reference" and every one of its embeds was served to
 * anyone. So when {@link scanEntriesForAsset} reports a live, GATED entry whose body it could not
 * fully read ({@link EntryAssetScan}'s `readable`: an unrecognized `bodyFormat`, or a
 * `data-embed-config` marker that failed to parse), those entries become the gating set instead of
 * the empty one, and the caller must satisfy at least one of them. A future third body format
 * therefore denies anonymous access to gated content's media until this scan learns to read it,
 * rather than silently publishing it.
 *
 * Deliberately NOT a blanket "deny whenever nothing references this asset": that would be safe only
 * if entry bodies were the sole legitimate producer of a `/m/` URL, and they are not. Measured
 * counter-examples on this route: `seo/seo.ts`'s `resolveShareImages` turns `settings.defaultOgImage`
 * and an entry's own `seoExtJson.ogImage`/`twitterImage` into `/m/{assetId}/…` URLs fetched by
 * anonymous social crawlers, and `resolver-service.ts`'s media resolver resolves a `"media"` marker
 * authored in a THEME template (documented in the theme-authoring guide; zero occurrences across
 * the shipped themes today, but the grammar allows it). Neither is visible to `postRepo`, so a
 * blanket flip would 404 a site's share cards and any theme-authored media. Those need explicit
 * allow paths before the default can flip the rest of the way — see this route's handoff.
 *
 * @complexity O(p) — see {@link scanEntriesForAsset}; `decide` itself is pure O(1) per gating entry.
 */
async function resolveMediaAccessDecision(
  deps: MediaRenditionRouteDeps,
  req: Request,
  assetId: string
): Promise<{ gated: boolean; allowed: boolean }> {
  const { referencing, opaqueGated } = await scanEntriesForAsset(deps, assetId);
  if (referencing.some((entry) => !isGatedEntry(entry))) {
    return { gated: false, allowed: true };
  }

  // A real referrer always wins over the fallback: once the scan has actually FOUND the entries
  // that embed this asset, an unrelated unreadable entry has no say in who may read it.
  const gating = referencing.length > 0 ? referencing : opaqueGated;
  if (gating.length === 0) {
    return { gated: false, allowed: true };
  }

  const resolver = createMemberAccessResolver(deps);
  const context = await resolver.resolveContext({
    workspaceId: deps.workspaceId,
    sessionToken: readRawCookie(req, MEMBER_SESSION_COOKIE),
    nowIso: new Date().toISOString(),
  });
  const allowed = gating.some(
    (entry) => resolver.decide({ access: resolvePostMemberAccess(entry.memberAccessJson), context }).allowed
  );
  return { gated: true, allowed };
}

/**
 * Reads and coerces the `:assetId`/`:transformSpec` route params to strings, matching Express's
 * always-string-or-undefined param shape. Isolated purely to keep the two nullish-coalescing
 * defaults out of the handler's own branch count (each `??` costs a cyclomatic-complexity point
 * just like a default-parameter assignment does) — no behavior beyond a straight string read.
 */
function readRenditionRouteParams(req: Request): { assetId: string; transformSpec: string } {
  return {
    assetId: String(req.params.assetId ?? ""),
    transformSpec: String(req.params.transformSpec ?? ""),
  };
}

/**
 * Resolves the access gate, fetches (or generates) the rendition, and writes the final HTTP
 * response — every outcome branch {@link registerMediaRenditionRoute}'s handler previously held
 * inline. Extracted verbatim (pure extract-method: same checks, same order, same early returns)
 * so the route handler's own cognitive-complexity count only has to account for the malformed-URL
 * guard above it, not this function's outcome fan-out too.
 *
 * @complexity O(1) plus {@link resolveMediaAccessDecision}'s own O(p) cost over the workspace's
 * published posts.
 */
async function sendMediaRenditionResult(
  deps: MediaRenditionRouteDeps,
  req: Request,
  res: Response,
  assetId: string,
  transformName: string,
  version: number
): Promise<void> {
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
      // Not-yet-generated-and-not-generatable-anonymously (or a wholly unknown assetId/transform).
      //
      // `private, no-store`, matching the gate-denied 404 above BYTE FOR BYTE (2026-09-05 fix).
      // This branch used to send `public, max-age=60`, which made the two 404s trivially
      // distinguishable on a header alone: any caller could ask "does this assetId exist and is it
      // gated?" and read the answer off `Cache-Control`, defeating the indistinguishability the
      // gate branch's own comment says it is there to provide. The two headers can only be
      // reconciled downwards — the gate's outcome depends on the caller's session cookie, so it can
      // never be given a shared-cacheable header. The cost is the 60s negative cache on a
      // not-found rendition, which is the correct thing to trade for closing the oracle.
      res.status(404).set("Cache-Control", "private, no-store").json({ error: "rendition not found" });
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
}

export const registerMediaRenditionRoute: MediaRenditionRouteRegistrar = (app, deps) => {
  app.get("/m/:assetId/:transformSpec/:filename", async (req, res) => {
    const { assetId, transformSpec } = readRenditionRouteParams(req);
    const parsed = resolveTransformSpec(assetId, transformSpec);

    if ("errorMessage" in parsed) {
      res.status(400).json({ error: parsed.errorMessage });
      return;
    }

    const { transformName, version } = parsed;
    await sendMediaRenditionResult(deps, req, res, assetId, transformName, version);
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
        // `private, no-store` for the same reason the rendition route's not-found branch uses it
        // (2026-09-05): it must be byte-identical to this route's own gate-denied 404 just above,
        // or the header alone tells an anonymous caller which of the two they hit.
        res.status(404).set("Cache-Control", "private, no-store").json({ error: "video rendition not found" });
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
