import { createRenditionAccess } from "@jini-ai/cms/media/site/rendition-access";
import { createPublicMediaHandlers } from "@jini-ai/cms/public-http/routes/site/media-rendition";
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

const sendMediaRenditionResult = ({ deps }: { deps: MediaRenditionRouteDeps }, _optional = {}) => createPublicMediaHandlers({
  deps: {
    get workspaceId() { return deps.workspaceId; },
    rendition: { get mediaRepo() { return deps.mediaRepo; }, get blobRepo() { return deps.assetBlobRepo; }, get renditionRepo() { return deps.assetRenditionRepo; },
      get transformRepo() { return deps.transformDefinitionRepo; }, get blobStore() { return deps.blobStore; }, get imageTransformer() { return deps.imageTransformer; },
      get clock() { return deps.clock; }, get idGen() { return deps.idGen; }, createHash },
    original: deps, get blobStore() { return deps.blobStore; }, resolveMediaRendition, sanitizeOriginalBytes, parseRangeHeader,
    hash: ({ identity, bytes }) => bytes === undefined ? createHash('sha256').update(identity).digest('hex') : createHash('sha256').update(identity).update(bytes).digest('hex'),
    ImageTransformUnavailableError, ImageSourceCorruptError,
  },
  accessDeps: {
    get workspaceId() { return deps.workspaceId; },
    get cache() { return deps.mediaAccessEvidence.getCache({ postRepo: deps.postRepo, entryRepo: deps.entryRepo }); },
    nowMs: () => deps.clock.nowMs(), readEntries: input => deps.postRepo.list(input),
    get readWidgetRows() { return deps.entryRepo ? (input: { workspaceId: string }) => deps.entryRepo!.listByWorkspace(input, { type: 'widget' }) : undefined; },
    findMedia: input => findMediaByIdOrSlug({ deps: { mediaRepo: deps.mediaRepo }, input }), readRetiredSlugs: input => deps.mediaRepo.listRetiredSlugs(input),
    isGated: ({ entry }) => resolvePostMemberAccess({ raw: entry.memberAccessJson }).visibility !== "public",
  },
  createRenditionAccess,
  createMemberAccessResolver: () => new DefaultMemberAccessResolver({ sessions: deps.memberSessionRepo, subscriptions: deps.memberSubscriptionRepo, tiers: deps.memberTierRepo }),
  readSessionToken: ({ request }: { request: Request }) => readRequestCookie({ request, name: MEMBER_SESSION_COOKIE }), nowIso: () => new Date().toISOString(), resolvePostMemberAccess,
  writer: {
    status: ({ response, code }: { response: Response; code: number }) => void response.status(code),
    set: ({ response, name, value }) => void response.set(name, value), json: ({ response, body }) => void response.json(body),
    end: ({ response }) => void response.end(), send: ({ response, bytes }) => void response.send(Buffer.from(bytes)),
  },
  sendMediaOriginalTrashed: ({ response }) => sendMediaOriginalTrashed({ res: response }), writeMediaOriginalReply: ({ response, reply }) => writeMediaOriginalReply({ res: response, reply }),
});

export const registerMediaRenditionRoute: MediaRenditionRouteRegistrar = ({ app, deps }, _options = {}) =>
  (({ rendition }) => void app.get(rendition.path, asyncRoute({ handler: (req, res) => rendition.handle({ request: req, response: res, params: req.params,
    ifNoneMatch: () => req.headers['if-none-match'], range: () => req.get('range') }) })))(sendMediaRenditionResult({ deps }));

// Both URL generations use the same gate, byte sniffing and response headers. The suffix is
// for static-host MIME inference; it never selects the live response's Content-Type.
export const registerMediaOriginalVideoRoute: MediaRenditionRouteRegistrar = ({ app, deps }, _options = {}) =>
  (({ original }) => void app.get(original.path, (req, res) => original.handle({ request: req, response: res, params: req.params,
    ifNoneMatch: () => req.headers['if-none-match'], range: () => req.get('range') })))(sendMediaRenditionResult({ deps }));
