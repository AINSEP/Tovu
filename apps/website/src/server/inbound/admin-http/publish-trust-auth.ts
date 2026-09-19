import type { NextFunction, Request, Response } from "express";

import {
  grantAllowsCapability,
  isGrantActive,
  isPublishTrustRoute,
  type PublishingCapability,
} from "#src/features/publish-trust/grant";
import { findGrantForSource, type PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { publishPrincipalIdFor } from "#src/features/publish-trust/keys";
import { verifyPublishSession } from "#src/features/publish-trust/session";
import type { GatewayDeps } from "#src/contracts/core/gated-mutations/gateway";
import type { KeyringPort } from "#src/features/webhooks/index";

/**
 * @file Zero-setup publishing auth — the destination-side gate.
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * `requirePublishTrust` mounts on `/api/admin` AHEAD of `dev-auth.ts`'s `requireAdminSession` and
 * resolves one extra credential type: a publishing session token minted by `session.ts` after a
 * source proved possession through `challenge.ts`.
 *
 * ## What makes this not an admin credential
 *
 * Three independent narrowings, each of which alone would be enough to stop a stolen publishing
 * token reaching `POST /posts`:
 *
 * 1. **Route set.** The credential resolves only on a `method + path` pair `grant.ts`'s
 *    `PUBLISH_TRUST_ROUTES` names. That list is owned by this codebase, never by a grant or a
 *    token, so a route added tomorrow is absent from it and therefore unreachable by default. A
 *    valid token presented anywhere else is refused outright rather than passed along — see
 *    {@link requirePublishTrust}.
 * 2. **Authority source.** Authorization for such a request is answered from the grant's
 *    capability set ALONE, by {@link publishTrustAuthorizeFor}, and never from RBAC. The token's
 *    principal is not a row in `principals`, so it has no roles, no policies and no inherited
 *    permissions — there is nothing for it to escalate into.
 * 3. **Capability set.** `PUBLISHING_CAPABILITIES` is a closed allowlist that does not contain
 *    `content.write` (and `grant.ts` refuses a grant naming it *at parse*), so no grant can
 *    express the permission an ordinary content mutation checks.
 *
 * ## Why the grant is re-read on every request
 *
 * The token already carries its capabilities, authenticated by the MAC, so re-reading the grant is
 * not needed to trust them. It is done anyway, and the result INTERSECTED with the token's, so
 * dropping the grant from the destination's config revokes publishing immediately rather than at
 * the end of the current session's lifetime. Revocation that takes effect now is worth one
 * in-memory read per request.
 */

/** What a resolved publishing credential may do on this request. Attached to `res.locals` and read
 *  back by {@link getPublishTrustContext}; never reconstructed from the request by a route. */
export interface PublishTrustContext {
  /** Stable identity of the SOURCE install. Survives its key rotation by construction. */
  readonly sourceInstallationId: string;
  /** Token capabilities INTERSECTED with the grant's, so a revoked grant narrows in real time. */
  readonly capabilities: readonly PublishingCapability[];
  /** Entity types the grant permits. Empty means none — never "all" (`grant.ts`). */
  readonly entityTypes: readonly string[];
  /** Rotation generation the source signed under. Audit metadata, never identity. */
  readonly generation: number;
}

/** Where the destination's provisioned grants come from.
 *
 *  A narrow seam rather than a direct read of `TOVU_PUBLISH_TRUST`, so `provisioning.ts` owns the
 *  precedence rule and every parse and this file owns only the gate. A resolution in any state but
 *  `configured` carries no grants, so a fresh install that has never provisioned — the ordinary
 *  empty state — closes this gate completely rather than erroring. */
export type PublishTrustGrantSource = () => Promise<PublishTrustResolution>;

/** Everything the gate needs. `targetInstallationId` is this install's OWN derived id — the
 *  audience every token must name — resolved once at composition rather than per request. */
export interface PublishTrustAuthDeps {
  readonly keyring: KeyringPort;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly targetInstallationId: Promise<string>;
  readonly grants: PublishTrustGrantSource;
}

/** `Bearer <token>` / `ApiKey <token>`, matching `dev-auth.ts`'s own spelling so the two gates read
 *  the same header the same way. The captured group is a live credential and is never logged. */
const AUTHORIZATION_PATTERN = /^(?:Bearer|ApiKey)[ \t]+(\S+)$/i;

/** The flat 401 this gate sends. Identical in every rejection case on purpose: "expired token",
 *  "wrong audience" and "revoked grant" must not be distinguishable to a caller. */
const UNAUTHENTICATED_BODY = { error: "unauthenticated", code: "UNAUTHENTICATED" } as const;

/** @complexity O(1). */
function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = AUTHORIZATION_PATTERN.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Read the publishing context `requirePublishTrust` attached, or `null` on any other request.
 *
 * Returns `null` rather than throwing, unlike `dev-auth.ts`'s `getAuthedPrincipal`: every admin
 * request passes through this gate and MOST of them legitimately have no publishing context, so
 * absence is the normal case here rather than a wiring bug.
 *
 * @complexity O(1).
 */
export function getPublishTrustContext(res: Response): PublishTrustContext | null {
  return (res.locals.publishTrust as PublishTrustContext | undefined) ?? null;
}

/** The narrowest shape both authorization sinks share: `authorize-guard.ts`'s `authorizeOrRespond`
 *  and `gated-mutations`' `AuthorizeFn`. Declared by what it READS (a permission name), so it
 *  substitutes for either without this file depending on both. */
export type PublishTrustAuthorize = (params: {
  permission: string;
}) => Promise<{ allowed: boolean; reason: string }>;

/**
 * The authorization answer for a publishing credential: its grant's capabilities, and nothing else.
 *
 * Every permission outside the granted set is denied, INCLUDING the per-content-type permissions
 * (`content.write` and friends) that `authorize()` would otherwise evaluate against RBAC. That is
 * the point: a publishing token must not be able to borrow a human's permissions, and the closed
 * capability set is the only authority it has. A denial names the permission rather than the
 * principal, because the principal is an installation and means nothing to a reader of the log.
 *
 * @complexity O(n) in the granted capability count (at most 2).
 */
export function publishTrustAuthorizeFor(context: PublishTrustContext): PublishTrustAuthorize {
  return async (params) => {
    const allowed = context.capabilities.includes(params.permission as PublishingCapability);
    return {
      allowed,
      reason: allowed
        ? "granted by the publishing grant"
        : `'${params.permission}' is outside this publishing grant`,
    };
  };
}

/**
 * Express middleware factory: resolve a publishing session token, or leave the request untouched.
 *
 * Three outcomes, and the difference between them is load-bearing:
 *
 * - **No token, or a token this gate cannot verify** → `next()` with nothing attached. The request
 *   continues to `requireAdminSession`, which tries the cookie and then the API-key path exactly as
 *   before. This is why an unverifiable token is NOT a 401 here: an ordinary API key is presented
 *   in the very same header, and failing closed on it would break every existing peer push.
 * - **A verified token on a route outside {@link isPublishTrustRoute}** → 401, immediately. It does
 *   NOT fall through: a publishing credential must never be ambient on a request it cannot
 *   authorize, and letting it continue would leave the outcome to whatever else happened to be on
 *   the request (a colleague's cookie on a shared browser, say).
 * - **A verified token on a publish-trust route, matching an active grant** → the context and a
 *   synthetic principal are attached, and `requireAdminSession` steps aside.
 *
 * Nothing here throws on malformed input: `verifyPublishSession` is fail-closed by contract, and a
 * 500 where a 401 belongs would be an oracle for whether a token parsed.
 *
 * @complexity O(1) per request — one header parse, one HKDF, one HMAC, one grant read.
 */
export function requirePublishTrust(deps: PublishTrustAuthDeps) {
  return async function requirePublishTrustMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const token = readBearer(req);
    if (!token) {
      next();
      return;
    }

    const targetInstallationId = await deps.targetInstallationId;
    const verified = await verifyPublishSession(
      { keyring: deps.keyring, workspaceId: deps.workspaceId, clock: deps.clock },
      { token, expectedAudience: targetInstallationId }
    );
    if (!verified.ok) {
      next();
      return;
    }

    // `req.originalUrl` and not `req.url`: inside an `app.use("/api/admin", ...)` mount Express has
    // already stripped the prefix from `req.url`, and `PUBLISH_TRUST_ROUTES` holds full paths.
    if (!isPublishTrustRoute(req.method, req.originalUrl)) {
      res.status(401).json(UNAUTHENTICATED_BODY);
      return;
    }

    // Looked up by the source the TOKEN names, so an install that holds grants for several
    // publishers answers each one from its own grant and never from a neighbour's.
    const grant = findGrantForSource(await deps.grants(), verified.payload.sourceInstallationId);
    if (!grant || !isGrantActive(grant, deps.clock.nowIso())) {
      res.status(401).json(UNAUTHENTICATED_BODY);
      return;
    }

    // Intersection, not the token's own list — see this file's "Why the grant is re-read" note.
    const capabilities = verified.payload.capabilities.filter((capability) =>
      grantAllowsCapability(grant, capability)
    );
    if (capabilities.length === 0) {
      res.status(401).json(UNAUTHENTICATED_BODY);
      return;
    }

    const context: PublishTrustContext = {
      sourceInstallationId: verified.payload.sourceInstallationId,
      capabilities,
      entityTypes: grant.entityTypes,
      generation: verified.payload.generation,
    };

    // A synthetic principal, NOT a row in `principals`. Route handlers read `getAuthedPrincipal(res)`
    // for an id to record, and this supplies a stable derived one (`pub:<sourceInstallationId>`)
    // that survives key rotation. It deliberately resolves to nothing in RBAC: `authorize()` cannot
    // find it, so a call site that forgets the capability attenuation fails CLOSED rather than
    // inheriting somebody's permissions. `kind: "system"` is the identity library's nearest honest
    // member — the actor is neither a human, an assistant, nor an issued API key.
    res.locals.principal = {
      id: publishPrincipalIdFor(context.sourceInstallationId),
      workspaceId: deps.workspaceId,
      kind: "system",
      displayName: `publishing installation ${context.sourceInstallationId}`,
      status: "active",
      createdAt: deps.clock.nowIso(),
    };
    res.locals.authCredentialKind = "publish_key";
    res.locals.publishTrust = context;
    next();
  };
}

/**
 * The same attenuation for the gated-mutation ceremony, whose `authorize` lives on a deps bag
 * rather than being passed per call.
 *
 * Returns the ORIGINAL bag untouched when this request carries no publishing credential, so a
 * human's import ceremony is bit-for-bit what it was. When it does, the returned bag's `authorize`
 * answers from the grant alone — `gateway.plan()`/`confirm()`/`execute()` each re-authorize
 * internally, and every one of those re-checks has to land on the attenuated function, which is why
 * this replaces the bag rather than pre-checking at the route.
 *
 * @complexity O(1) — one object spread.
 */
export function withPublishTrustAuthorize(res: Response, deps: GatewayDeps): GatewayDeps {
  const context = getPublishTrustContext(res);
  if (!context) return deps;
  return { ...deps, authorize: publishTrustAuthorizeFor(context) };
}
