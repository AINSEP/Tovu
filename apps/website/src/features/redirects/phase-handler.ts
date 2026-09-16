/**
 * @file `RedirectResolver` (read-path resolution) + `registerRedirectsPhaseHandlers`
 * (routing-chain adapter) — SPEC-009 REQ-09/10/18/19/20; ADR-PIPE-009 C-006/C-007.
 *
 * Purpose:
 * Owns the read-path open-redirect oracle call (C-013 in the implementation
 * outline) — the single highest-risk contract in this feature. Gathers
 * phase-eligible candidate rules from `RedirectRepoPort`'s three lookup
 * methods (`lookupExact`/`lookupLongestPrefix`/`listDynamic`), hands them to
 * `RedirectMatcher.match` for precedence/tie-break/interpolation, then
 * validates the FULLY-INTERPOLATED `location` via
 * `OriginRegistryPort.isAllowedRedirectTarget` in EVERY code path before ever
 * returning a `matched: true` outcome (INV-03), and then — for a destination that is same-origin
 * with the workspace's own verified origin, which the oracle allows by construction — the shared
 * reserved-path rule from `./reserved-destination.ts`'s `checkSameOriginDestination`. The second
 * half has to live here rather than only at the write chokepoint because interpolation happens on
 * THIS path: the stored `toTarget` is a template, and `Location` is what comes out of it.
 *
 * Oracle-call discipline (documented, load-bearing): `isAllowedRedirectTarget`
 * only accepts a fully-qualified, WHATWG-parseable candidate URL (see
 * `origin/origin.ts`'s `normalizeOriginCandidate` — a bare relative path like
 * `/new` fails to parse with no base and would otherwise always resolve to
 * "not allowed"). So a plain relative `location` is first resolved to an
 * absolute URL against the workspace's own verified canonical origin (making
 * the oracle call against a genuinely absolute, same-origin-by-construction
 * candidate) before being handed to the oracle — this satisfies "call the
 * oracle in every code path" literally while keeping ordinary same-site
 * redirects (the overwhelmingly common case) working. A `location` that
 * already looks absolute or protocol-relative (contains a scheme prefix or
 * starts with `//`) is passed to the oracle exactly as interpolated, since
 * resolving it against the canonical origin first would corrupt it. If the
 * workspace has no verified origin registered at all, this fails closed
 * (`{ matched: false }`) rather than guessing — matches `origin`'s own
 * fail-closed posture (`OriginNotVerifiedError`).
 *
 * Architectural role:
 * Feature logic (`RedirectPhaseHandlerResolver`, implements `RedirectResolver`)
 * + a thin composition-root registration function
 * (`registerRedirectsPhaseHandlers`) that adapts to/from `routing`'s
 * `RouteResolvePhaseHandler` shape. No Express/route code.
 */
import type { ClockPort, DomainEvent, IdGeneratorPort, OutboxPort } from "@jini-ai/cms/core";
import type { OriginRegistryPort, RedirectTargetContext, VerifiedOrigin } from "../../features/origin/index.js";
import { registerResolvePhase } from "../../platform/routing/index.js";
import type { RouteResolveContext, RouteResolvePhaseOutcome } from "../../platform/routing/index.js";

import type {
  RedirectHitEvent,
  RedirectMatcher,
  RedirectRepoPort,
  RedirectResolver,
} from "./ports.js";
import { isReferrerAliasLocation } from "./referrer-alias.js";
import { checkSameOriginDestination } from "./reserved-destination.js";
import type { RedirectRecord, RedirectRequest, RedirectResolution } from "./types.js";

/** The bounded dynamic (wildcard) set cap (behavior.spec.md §3/§4, OQ-01). */
const DYNAMIC_SET_LIMIT = 500;

/** A candidate `location` that already carries (or claims to carry) its own scheme/authority. */
function isPotentiallyCrossOrigin(location: string): boolean {
  return location.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(location);
}

function isDefaultPort(scheme: "https" | "http", port: number | undefined): boolean {
  if (port === undefined) return true;
  return (scheme === "https" && port === 443) || (scheme === "http" && port === 80);
}

function composeOriginUrl(origin: VerifiedOrigin): string {
  const authority = isDefaultPort(origin.scheme === "https" ? "https" : "http", origin.port)
    ? origin.host
    : `${origin.host}:${origin.port}`;
  return `${origin.scheme}://${authority}`;
}

/**
 * Resolve `location` to a candidate suitable for `isAllowedRedirectTarget`:
 * pass an already-absolute/protocol-relative location through unchanged;
 * resolve a relative location against the workspace's verified canonical
 * origin. Returns `null` if no verified origin exists and `location` is
 * relative (cannot even form a candidate to check — fails closed), and for
 * Express's `back` alias, which is served as the request's `Referer` rather than
 * as a path, so no candidate describes where it goes (see `./referrer-alias.ts`).
 */
async function toOracleCandidate(
  ctx: RedirectTargetContext,
  location: string,
  originRegistry: OriginRegistryPort
): Promise<string | null> {
  if (isReferrerAliasLocation(location)) return null;
  if (isPotentiallyCrossOrigin(location)) return location;
  try {
    const canonical = await originRegistry.canonicalOrigin(ctx);
    const path = location.startsWith("/") ? location : `/${location}`;
    return `${composeOriginUrl(canonical)}${path}`;
  } catch {
    return null;
  }
}

export interface RedirectPhaseHandlerDeps {
  repo: RedirectRepoPort;
  matcher: RedirectMatcher;
  originRegistry: OriginRegistryPort;
  /**
   * Hit-recording deps (W-008) — OPTIONAL so unit tests exercising the
   * oracle gate alone (T006) don't need to stub them. When present, a
   * successful resolution enqueues a `redirect.hit` outbox event,
   * fire-and-forget (never awaited before the outcome is returned, never
   * allowed to affect the resolution — REQ-21/AC-26).
   */
  hits?: { outbox: OutboxPort; clock: ClockPort; idGen: IdGeneratorPort };
}

/**
 * `RedirectResolver` implementation — the resolution entry point the routing-
 * chain adapter (`registerRedirectsPhaseHandlers`) calls per phase.
 */
export class RedirectPhaseHandlerResolver implements RedirectResolver {
  constructor(private readonly deps: RedirectPhaseHandlerDeps) {}

  /**
   * @complexity O(1) exact/prefix (index-backed) + O(k) dynamic scan, k =
   * the capped dynamic-set size (500).
   */
  async resolve(request: RedirectRequest): Promise<RedirectResolution> {
    const includeOverrideOnly = request.phase === "pre_content";
    const lookupBase = { workspaceId: request.workspaceId, includeOverrideOnly };

    const [exact, prefix, dynamic] = await Promise.all([
      this.deps.repo.lookupExact({ ...lookupBase, path: request.path }),
      this.deps.repo.lookupLongestPrefix({ ...lookupBase, path: request.path }),
      this.deps.repo.listDynamic({ ...lookupBase, limit: DYNAMIC_SET_LIMIT }),
    ]);

    const candidates: RedirectRecord[] = [exact, prefix, ...dynamic].filter(
      (r): r is RedirectRecord => r !== null
    );
    if (candidates.length === 0) return { matched: false };

    const resolution = this.deps.matcher.match({ request, rules: candidates });
    if (!resolution.matched) return { matched: false };

    // INV-03: the read-path open-redirect oracle gate — MUST run in every
    // code path before ever returning a matched:true outcome.
    const ctx: RedirectTargetContext = { workspaceId: request.workspaceId };
    const oracleCandidate = await toOracleCandidate(ctx, resolution.location, this.deps.originRegistry);
    if (oracleCandidate === null) return { matched: false };

    const allowed = await this.deps.originRegistry.isAllowedRedirectTarget(ctx, oracleCandidate);
    if (!allowed) {
      // T050 (Polish) adds a warn-level log line here (normalized host only,
      // never the full raw candidate) — named but not yet implemented.
      return { matched: false };
    }

    // The oracle answers "is that HOST allowed", which a same-origin destination passes by
    // construction — including `/admin` and `/api`. See `checkSameOriginDestination`.
    if (await this.landsOnReservedSurface(ctx, oracleCandidate)) return { matched: false };

    this.recordHitFireAndForget(request.workspaceId, resolution.redirectId);
    return resolution;
  }

  /**
   * Second half of the read-path target gate: the oracle's host verdict, then this pathname
   * verdict for a destination that is same-origin with the workspace's verified origin.
   *
   * @returns `true` when the redirect must not be served. Fails closed when no verified origin
   * exists — the same posture `toOracleCandidate` already takes for a relative location.
   * @complexity One `canonicalOrigin` lookup plus O(n) in the candidate length.
   */
  private async landsOnReservedSurface(ctx: RedirectTargetContext, oracleCandidate: string): Promise<boolean> {
    try {
      const canonical = await this.deps.originRegistry.canonicalOrigin(ctx);
      return checkSameOriginDestination(oracleCandidate, canonical).kind !== "ok";
    } catch {
      return true;
    }
  }

  /**
   * W-008: enqueue a `redirect.hit` event, fire-and-forget. MUST NOT be
   * awaited before the redirect response is sent, and MUST NOT let an
   * enqueue failure affect the resolution outcome (REQ-21/AC-26).
   */
  private recordHitFireAndForget(workspaceId: string, redirectId: string): void {
    if (!this.deps.hits) return;
    const { outbox, clock, idGen } = this.deps.hits;
    const event: RedirectHitEvent = {
      id: idGen.newId(),
      name: "redirect.hit",
      occurredAt: clock.nowIso(),
      aggregateId: redirectId,
      workspaceId,
      payload: { workspaceId, redirectId, at: clock.nowIso() },
    };
    // See redirects.ts's `enqueueMutatedEvent` comment for why this cast is needed (a named
    // interface payload isn't auto-assignable to DomainEvent's default Record<string,unknown>).
    void outbox.enqueue(event as unknown as DomainEvent).catch(() => {
      // Best-effort — a dropped hit-count enqueue never affects the redirect response (INV-06).
    });
  }
}

export interface RegisterRedirectsPhaseHandlersDeps {
  resolver: RedirectResolver;
}

/**
 * The identity every Redirects registration claims in `routing`'s phase registry
 * (`RegisterResolvePhaseOptions.owner`). One module-private token, shared by every
 * call: there is exactly ONE live Redirects registration per process — whichever
 * composition root registered most recently.
 *
 * That is the policy half of the lifecycle fix `registerResolvePhase`'s own doc
 * describes. `registerRedirectsPhaseHandlers` runs once per composition root, and a
 * process can run more than one of those — an integration test composes one per
 * site it boots. Loading `composition/app.ts` itself registers nothing (removed
 * 2026-09-16, t91 F4.1; `app-module-load-registers-no-phase-handler.test.ts` pins
 * it), so the only way a process gets a second composition is an explicit
 * `createRouteDeps()`/`createSqliteRouteDeps()` call. Each registration closes over
 * that composition's own `RedirectRepoPort`, so under the old append-only registry
 * the superseded ones stayed on the live request path: harmless while the orphan was
 * an `InMemoryRedirectRepo` (empty, so it returned `null` and yielded to the real
 * registration queued behind it), a 500 on every phase-running route once it was a
 * `SqliteRedirectRepo` whose site database had since closed. Owning the slot makes
 * W-004's "call exactly once" structural rather than a comment asking nicely.
 */
const REDIRECTS_PHASE_OWNER: unique symbol = Symbol("redirects.phase-handlers");

/**
 * Composition-root wiring entry — registers the two `RouteResolvePhaseHandler`
 * adapters into `routing`'s registry, superseding any previous composition's
 * (see {@link REDIRECTS_PHASE_OWNER}).
 *
 * @returns a disposer that removes exactly THIS registration (both phases) — not
 * "whatever Redirects registration happens to be live". It composes `registerResolvePhase`'s
 * own per-call disposers, each of which is a no-op once an owner-scoped re-registration has
 * already superseded it. That identity-scoping is load-bearing: a stale composition's disposer
 * called AFTER a newer one has registered (site A torn down after site B booted) must decline
 * to remove B's redirects, not revoke them via the shared owner symbol (t91 F4.2 Part A,
 * 2026-09-16 — see `phase-handler.disposer-scope.test.ts`).
 * @complexity O(1) amortized; O(n) in each phase's existing registrations for the
 * supersede scan.
 */
export function registerRedirectsPhaseHandlers(deps: RegisterRedirectsPhaseHandlersDeps): () => void {
  const { resolver } = deps;

  const preContentHandler = async (
    path: string,
    ctx: RouteResolveContext
  ): Promise<RouteResolvePhaseOutcome | null> => {
    const resolution = await resolver.resolve({ workspaceId: ctx.workspaceId, path, phase: "pre_content" });
    return toOutcome(resolution);
  };

  const postContentHandler = async (
    path: string,
    ctx: RouteResolveContext
  ): Promise<RouteResolvePhaseOutcome | null> => {
    const resolution = await resolver.resolve({ workspaceId: ctx.workspaceId, path, phase: "post_content" });
    return toOutcome(resolution);
  };

  // onError: "skip" (t91 F4.3 — routing.ts's default changed to "fail"): a redirect lookup
  // failure can only DECLINE to redirect (INV-03, toOutcome above never fabricates one), so one
  // broken rule store must not 500 every page on the site the way a guard-type handler should.
  const disposePreContent = registerResolvePhase("pre_content", preContentHandler, {
    owner: REDIRECTS_PHASE_OWNER,
    onError: "skip",
  });
  const disposePostContent = registerResolvePhase("post_content", postContentHandler, {
    owner: REDIRECTS_PHASE_OWNER,
    onError: "skip",
  });
  return () => {
    disposePreContent();
    disposePostContent();
  };
}

function toOutcome(resolution: RedirectResolution): RouteResolvePhaseOutcome | null {
  if (!resolution.matched) return null;
  return { kind: "redirect", location: resolution.location, statusCode: resolution.statusCode };
}
