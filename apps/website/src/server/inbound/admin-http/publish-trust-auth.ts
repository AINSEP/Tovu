import type { NextFunction, Request, Response } from "express";

import {
  grantAllowsCapability,
  isPublishTrustRoute,
  type PublishingCapability,
} from "#src/features/publish-trust/grant";
import { findGrantForSource, type PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { admitPublish, type RevocationRead } from "#src/features/publish-trust/revocations";
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
 * ## Why both stores are re-read on every request
 *
 * The token already carries its capabilities, authenticated by the MAC, so re-reading the grant is
 * not needed to trust them. It is done anyway, and the result INTERSECTED with the token's, so
 * dropping the grant from the destination's config revokes publishing immediately rather than at
 * the end of the current session's lifetime. Revocation that takes effect now is worth one
 * in-memory read per request.
 *
 * The DENY store (`revocations.ts`) is read here for the same reason and a sharper one: it is
 * written by this very process while requests are being admitted against it, so caching it would
 * mean the owner's disconnect took effect at the next restart rather than at the next request —
 * which is the entire property that store exists to provide. It costs one small file read per
 * publishing request, and only on requests that already carry a verified publishing token.
 *
 * Which store wins is NOT decided here. Both are handed to `revocations.ts`'s `admitPublish`,
 * which owns the rule that deny outranks grant and refuses before it looks at the grant at all.
 * Splitting that ordering across two files is how it drifts.
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

/** Where the destination's DISCONNECTED computers come from.
 *
 *  Read-only on purpose: the gate is given `list` alone and never the `PublishTrustRevocationPort`
 *  that can also `revoke` and `restore`, so no request path can write to the store it is judged
 *  against. An unreadable store must arrive here as `{ ok: false }` rather than as a thrown error —
 *  a throw on this path is a 500 where a 401 belongs, and `admitPublish` reads the failure as
 *  "refuse everyone", which is the safe direction for a list whose job is to say no. */
export type PublishTrustRevocationSource = () => Promise<RevocationRead>;

/** Everything the gate needs. `targetInstallationId` is this install's OWN derived id — the
 *  audience every token must name — resolved once at composition rather than per request. */
export interface PublishTrustAuthDeps {
  readonly keyring: KeyringPort;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly targetInstallationId: Promise<string>;
  readonly grants: PublishTrustGrantSource;
  readonly revocations: PublishTrustRevocationSource;
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

/** The site name `admitPublish`'s refusal sentences read back to a person.
 *
 *  A placeholder here, and deliberately so: this gate answers EVERY refusal with the same flat 401
 *  ({@link UNAUTHENTICATED_BODY}), because "disconnected", "expired" and "never connected" must not
 *  be distinguishable to a caller who is holding a token. So no sentence `admitPublish` builds is
 *  ever rendered on this path; they exist for the source-side and admin surfaces, which know the
 *  real site name and are talking to someone entitled to the difference. */
const REFUSAL_SITE_LABEL = "this site";

/**
 * The public key the token's generation currently stands for, or `""` when the grant no longer
 * names that generation.
 *
 * A session token carries its GENERATION and never a key — `session.ts` keeps key material out of
 * the credential on purpose — while `admitPublish` asks about a key. The grant is the only place
 * the destination holds one, so the generation is resolved against it.
 *
 * `""` is a safe "no key": `grant.ts` requires every `publicKeyB64u` to be a non-empty string, so an
 * empty value can never equal a provisioned key and `admitPublish` refuses it as `superseded-key` —
 * the state a rotation that bumped the generation leaves an already-minted token in.
 *
 * What this does NOT re-prove: when the grant does name the generation, the key matches by
 * construction, because the key came from the grant. Possession of the matching private half was
 * proved once, at mint, against this same grant (`challenge.ts`); the question still worth asking
 * per request is whether the grant names that generation at all.
 *
 * @complexity O(n) in the grant's key count, bounded at 4 by `grant.ts`.
 */
function acceptedKeyFor(
  resolution: PublishTrustResolution,
  sourceInstallationId: string,
  generation: number
): string {
  const grant = findGrantForSource(resolution, sourceInstallationId);
  return grant?.publicKeys.find((key) => key.generation === generation)?.publicKeyB64u ?? "";
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
 * - **A verified token on a publish-trust route, admitted by {@link admitPublish}** → the context
 *   and a synthetic principal are attached, and `requireAdminSession` steps aside. A token the
 *   owner has since disconnected is refused here, one request after the click — the token itself
 *   stays cryptographically valid, and that is exactly why the check cannot live at mint.
 *
 * Nothing here throws on malformed input: `verifyPublishSession` is fail-closed by contract, and a
 * 500 where a 401 belongs would be an oracle for whether a token parsed.
 *
 * @complexity O(1) per request — one header parse, one HKDF, one HMAC, one in-memory grant read,
 *   and one small file read for the deny store. Only requests carrying a parseable bearer token
 *   reach the HKDF; only those carrying a VERIFIED publishing token reach the two store reads.
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

    // Both stores, then ONE question. Everything is looked up by the source the TOKEN names, so an
    // install that holds grants for several publishers answers each one from its own grant and
    // never from a neighbour's.
    //
    // Neither read throws: the grant resolver reports a failure as an `invalid` resolution, and the
    // revocation source reports an unreadable file as `ok: false`. Both arrive at `admitPublish` as
    // "no", so a broken store is a 401 here and never a 500 — a 500 would be an oracle for whether
    // a token parsed, and for the deny store it would also be a bypass if it were caught wrongly.
    //
    // The two reads happen before the decision, but they do not MAKE it: `admitPublish` refuses a
    // disconnected computer before it consults the grant at all, which is what keeps "disconnect
    // works even while the grant config is broken" true. Resolving the grant early is inert.
    const revocations = await deps.revocations();
    const resolution = await deps.grants();

    const admission = admitPublish({
      resolution,
      revocations: revocations.ok ? revocations.revocations : null,
      sourceInstallationId: verified.payload.sourceInstallationId,
      publicKeyB64u: acceptedKeyFor(
        resolution,
        verified.payload.sourceInstallationId,
        verified.payload.generation
      ),
      siteLabel: REFUSAL_SITE_LABEL,
      nowIso: deps.clock.nowIso(),
    });
    if (!admission.allowed) {
      res.status(401).json(UNAUTHENTICATED_BODY);
      return;
    }
    const grant = admission.grant;

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

/**
 * The same attenuation for the APPLY bag — the one `publish-content`'s registered types authorize
 * their own writes against.
 *
 * ## Why this exists, and why it is not a hole in the closed capability set
 *
 * The gated ceremony's own `authorize` ({@link publishTrustAuthorizeFor}) deliberately denies
 * `content.write`, because a publishing token must never be able to borrow a human's content
 * permissions on an ordinary route. But the import's apply loop hands each entity to its type's own
 * `apply()`, which runs `executeCommand` with that type's OWN write permission
 * (`PublishContentHandler.permission` — `content.write` for post/page). With no attenuation there,
 * a publish executes against RBAC as `pub:<installation>`, which resolves to nothing, and the whole
 * ceremony fails at execute with `principal_disabled`. That is what "publishing does not work"
 * looked like before this function existed: plan and confirm succeeded, and execute 500'd.
 *
 * So the grant has to be able to answer that question, and this is the narrowest form that can:
 *
 * - It answers ONLY for a permission that some REGISTERED publish-content type declares. The set is
 *   owned by this codebase and computed from the registry per request; a grant cannot name a
 *   permission, and an unregistered permission is denied here exactly as before.
 * - It answers YES only for a type whose `entityType` the grant itself names, so a grant limited to
 *   `post` cannot write `media` even though both declare `content.write`. The permission alone is
 *   too coarse to express that; pairing it with the entity type is what makes it exact. The entity
 *   type is taken from the CALLER (`executeCommand`'s `mutation.entityType`) and checked against
 *   the registry, never inferred from the permission — inferring it is what made this claim false
 *   until 2026-09-20 (see the `authorize` closure below).
 * - It requires `publish_content.apply`. A read-only grant authorizes no write.
 *
 * The blast radius is bounded twice over independently of this function: the token only resolves at
 * all on a `PUBLISH_TRUST_ROUTES` path, and the entities that reach the apply loop can only be ones
 * already admitted by the bundle door's own `entityTypes` check.
 *
 * @param typePermissions - `entityType -> permission`, from the registered contributors. Keyed by
 * entity type because that is what is unique per contributor; see `registeredTypePermissions`.
 * @returns The ORIGINAL bag untouched when this request carries no publishing credential.
 * @complexity O(1) per authorize call — one map lookup and one array scan of at most 2 entries.
 */
export function withPublishTrustContentAuthorize<
  TAuthorize extends (params: never) => Promise<{ allowed: boolean; reason: string }>,
  T extends { authorize?: TAuthorize },
>(res: Response, deps: T, typePermissions: ReadonlyMap<string, string>): T {
  const context = getPublishTrustContext(res);
  if (!context) return deps;

  const granted = publishTrustAuthorizeFor(context);
  const authorize = async (params: {
    permission: string;
    entityType?: string;
  }): Promise<{ allowed: boolean; reason: string }> => {
    // The entity type comes from the CALLER — `executeCommand` always passes `mutation.entityType`,
    // and each contributor's `apply()` states its own (`post`, `page`, `media`). It is not derived
    // from the permission, because `content.write` is declared by all three and so cannot identify
    // one (sol review 2026-09-20, Medium finding 6). A caller that states no entity type, or one
    // this instance has no registered handler for, or one whose registered permission is not the
    // one being asked for, is not answered here at all: it falls through to `granted`, which denies
    // `content.write`. Fail-closed, and unchanged for every non-publish-content caller.
    const entityType = params.entityType;
    if (entityType === undefined) return granted(params);
    if (typePermissions.get(entityType) !== params.permission) return granted(params);

    const allowed =
      context.capabilities.includes("publish_content.apply") && context.entityTypes.includes(entityType);
    return {
      allowed,
      reason: allowed
        ? `granted by the publishing grant for '${entityType}'`
        : `this publishing grant does not cover '${entityType}'`,
    };
  };

  // The cast is to the CALLER's own authorize signature, which this function deliberately does not
  // depend on: it reads `permission` and nothing else, so it substitutes safely for any authorize
  // whose parameter object carries one. `PublishTrustAuthorize`'s own doc records the same reasoning
  // for the same reason.
  return { ...deps, authorize: authorize as unknown as TAuthorize };
}
