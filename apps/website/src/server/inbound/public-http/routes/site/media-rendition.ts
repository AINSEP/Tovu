import { createRenditionAccess } from "@jini-ai/cms/media/site/rendition-access";
import { mediaRenditionRoute, mediaOriginalVideoRoute } from "@jini-ai/cms/public-http/routes/site/media-rendition";
import { findMediaByIdOrSlug, resolveMediaRendition, sanitizeOriginalBytes } from "@jini-ai/cms/media";
import { ImageSourceCorruptError, ImageTransformUnavailableError } from "@jini-ai/cms/media/node";
import { DefaultMemberAccessResolver, resolvePostMemberAccess } from "@jini-ai/user-management/members/access-resolver";
import { parseRangeHeader } from "@jini-ai/http-kit/range";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import type { MediaRenditionRouteDeps, MediaRenditionRouteRegistrar } from "#src/server/inbound/admin-http/routes/media/deps";
import { sendMediaOriginalTrashed, writeMediaOriginalReply } from "#src/server/inbound/shared/media-original-writer";
import { MEMBER_SESSION_COOKIE } from "../../http/members.js";
import { asyncRoute } from "../../../../../platform/express/async-route.js";

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

function resolveMediaAccessDecision({ deps, req }: { deps: MediaRenditionRouteDeps; req: Request }, _optional = {}) {
  return {
    get access() { return createRenditionAccess({ get workspaceId() { return deps.workspaceId; },
      get cache() { return deps.mediaAccessEvidence.getCache({ postRepo: deps.postRepo, entryRepo: deps.entryRepo }); },
      nowMs: () => deps.clock.nowMs(), readEntries: input => deps.postRepo.list(input),
      get readWidgetRows() { return deps.entryRepo ? (input: { workspaceId: string }) => deps.entryRepo!.listByWorkspace(input, { type: 'widget' }) : undefined; },
      findMedia: input => findMediaByIdOrSlug({ deps: { mediaRepo: deps.mediaRepo }, input }),
      readRetiredSlugs: input => deps.mediaRepo.listRetiredSlugs(input),
      isGated: ({ entry }) => resolvePostMemberAccess({ raw: entry.memberAccessJson }).visibility !== "public",
    }); },
/** Route-local duplicate of `pages.ts`'s own `createMemberAccessResolver` — built per request from
 *  `deps`, never a module-level singleton, same "tests inject their own in-memory repos per
 *  composition" reason that file's own doc gives. */
    readEntitlement: async () => {
      const resolver = new DefaultMemberAccessResolver({ sessions: deps.memberSessionRepo, subscriptions: deps.memberSubscriptionRepo, tiers: deps.memberTierRepo });
      const context = await resolver.resolveContext({ workspaceId: deps.workspaceId,
        sessionToken: readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }), nowIso: new Date().toISOString() });
      return ({ entry }: { entry: { readonly memberAccessJson?: string | null } }) => resolver.decide({ access: resolvePostMemberAccess({ raw: entry.memberAccessJson }), context }).allowed;
    },
  };
}

/**
 * Reads and coerces the `:assetId`/`:transformSpec` route params to strings, matching Express's
 * always-string-or-undefined param shape. Isolated purely to keep the two nullish-coalescing
 * defaults out of the handler's own branch count (each `??` costs a cyclomatic-complexity point
 * just like a default-parameter assignment does) — no behavior beyond a straight string read.
 * {@link registerMediaOriginalVideoRoute} reads only `assetId` through it, so both routes share one fallback.
 */
function readRenditionRouteParams(req: Request): { assetId: string; transformSpec: string } {
  return { assetId: String(req.params.assetId ?? ""), transformSpec: String(req.params.transformSpec ?? "") };
}

function sendMediaRenditionResult({ deps, req, res }: { deps: MediaRenditionRouteDeps; req: Request; res: Response }, _optional = {}): Parameters<typeof mediaRenditionRoute>[0] {
  const response: Parameters<typeof mediaRenditionRoute>[0]['res'] = {
    status: code => { res.status(code); return response; }, set: (name, value) => { res.set(name, value); return response; },
    json: body => { res.json(body); }, end: () => { res.end(); }, send: bytes => { res.send(Buffer.from(bytes)); },
  };
  return { deps: {
    get workspaceId() { return deps.workspaceId; },
    get access() { return resolveMediaAccessDecision({ deps, req }).access; },
    readEntitlement: () => resolveMediaAccessDecision({ deps, req }).readEntitlement(),
    rendition: { get mediaRepo() { return deps.mediaRepo; }, get blobRepo() { return deps.assetBlobRepo; }, get renditionRepo() { return deps.assetRenditionRepo; },
      get transformRepo() { return deps.transformDefinitionRepo; }, get blobStore() { return deps.blobStore; }, get imageTransformer() { return deps.imageTransformer; },
      get clock() { return deps.clock; }, get idGen() { return deps.idGen; } },
    original: deps, get blobStore() { return deps.blobStore; }, resolveMediaRendition, sanitizeOriginalBytes, parseRangeHeader,
    hash: ({ identity, bytes }) => bytes === undefined ? createHash('sha256').update(identity).digest('hex') : createHash('sha256').update(identity).update(bytes).digest('hex'),
    ImageTransformUnavailableError, ImageSourceCorruptError,
    sendMediaOriginalTrashed: () => sendMediaOriginalTrashed({ res }), writeMediaOriginalReply: reply => writeMediaOriginalReply({ res, reply }),
  }, facts: { ...readRenditionRouteParams(req), ifNoneMatch: () => req.headers['if-none-match'], range: () => req.get('range') }, res: response };
}

export const registerMediaRenditionRoute: MediaRenditionRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/m/:assetId/:transformSpec/:filename", asyncRoute({ handler: async (req, res) => {
    await mediaRenditionRoute(sendMediaRenditionResult({ deps, req, res }));
  } }));
};

export const registerMediaOriginalVideoRoute: MediaRenditionRouteRegistrar = ({ app, deps }, _options = {}) => {
  // Both URL generations use the same gate, byte sniffing and response headers. The suffix is
  // for static-host MIME inference; it never selects the live response's Content-Type.
  app.get(["/m/:assetId/original", "/m/:assetId/original.:ext"], async (req, res) => {
    await mediaOriginalVideoRoute(sendMediaRenditionResult({ deps, req, res }));
  });
};
