/**
 * @file Resolution logic for the Tovu `routing` Tier-2 library (ADR-039 v0).
 *
 * Purpose:
 * Implements the inverse resolver (`urlFor`/`isActive`) Menus (ADR-029) and
 * SEO (ADR-032) consume, the forward resolution pipeline registration seam
 * Redirects (ADR-033) will consume, the named-route registry backing `route`
 * targets, and the `SlugChangeCapture` registration slot (ADR-039 §4).
 *
 * How it relates to the project:
 * - `routing/types.ts` supplies the `RouteTarget` vocabulary and result shapes.
 * - `routing/ports.ts` supplies `RouteResolverDeps` (reuses `PostRepoPort`).
 * - Only `post` is a real implemented content type today, so `entryRef`
 *   resolution goes through `PostRepoPort` directly; `termRef` is a documented
 *   stub (taxonomy doesn't exist yet — ADR-029 Round-3 fold item 1).
 *
 * Architectural role:
 * Core-owned Tier-2 library code. No Drizzle/SQLite adapter and no HTTP
 * wiring live here (that is out of scope for this v0 build) — this file is
 * pure resolution logic over injected ports and in-module registries.
 */
import type { PostRecord } from "../features/post/post";

import type { RouteResolverDeps } from "./ports";
import type {
  EntryRefTarget,
  RouteRefTarget,
  RouteResolveContext,
  RouteResolvePhaseHandler,
  RouteResolvePhaseName,
  RouteResolvePhaseOutcome,
  RouteResolveResult,
  RouteTarget,
  RouteUrl,
  SlugChangeCapture,
  TermRefTarget,
  UrlTarget,
} from "./types";

/** Raised when a `RouteTarget` carries a discriminant this library does not recognize. */
export class RouteResolutionError extends Error {}

// ---------------------------------------------------------------------------
// Named-route registry (backs `route` targets — ADR-039 §3)
// ---------------------------------------------------------------------------

const DEFAULT_NAMED_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["home", "/"],
  ["search", "/search"],
];

const namedRoutes = new Map<string, string>(DEFAULT_NAMED_ROUTES);

export interface RegisterNamedRouteInput {
  readonly name: string;
  readonly path: string;
}

/**
 * Register (or overwrite) a named core route. Core-owned registration, not an
 * open plugin hook — matches ADR-039 §1's treatment of the forward pipeline.
 *
 * @complexity O(1) time/space.
 */
export function registerNamedRoute(input: RegisterNamedRouteInput): void {
  namedRoutes.set(input.name, input.path);
}

/**
 * Look up a named route's fixed path.
 *
 * @returns the registered path, or `null` if `name` has no registration
 * (mirrors the library-wide "unavailable → null" contract).
 * @complexity O(1) time/space.
 */
export function getNamedRoute(name: string): string | null {
  return namedRoutes.get(name) ?? null;
}

// ---------------------------------------------------------------------------
// Path normalization + canonical URL composition
// ---------------------------------------------------------------------------

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value) || value.startsWith("//");
}

/**
 * Normalize a request/target path: strip query/hash, force a leading slash,
 * and drop a trailing slash (except for the root path itself).
 *
 * @complexity O(n) in path length.
 */
function normalizePath(rawPath: string): string {
  const withoutQueryOrHash = rawPath.split(/[?#]/)[0] ?? "";
  const withLeadingSlash = withoutQueryOrHash.startsWith("/")
    ? withoutQueryOrHash
    : `/${withoutQueryOrHash}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

/**
 * Compose the `canonicalUrl` a resolved `path` implies.
 *
 * TODO(ADR-040): compose canonicalUrl from OriginRegistryPort.canonicalOrigin(ctx)
 * once `src/origin` exists, instead of `ctx.originOverride`. `src/origin` is
 * being built in parallel by another agent and does not exist yet, so this
 * library must not import it.
 *
 * @complexity O(1).
 */
function composeCanonicalUrl(path: string, ctx: RouteResolveContext): string {
  if (isAbsoluteUrl(path)) return path;
  const origin = ctx.originOverride?.replace(/\/$/, "");
  return origin ? `${origin}${path}` : path;
}

// ---------------------------------------------------------------------------
// Per-kind target resolvers (internal — dispatched by `urlFor`)
// ---------------------------------------------------------------------------

/** `published` is the only status that yields a live, linkable path (mirrors `getPublishedPostBySlug`). */
function isPublished(post: PostRecord): boolean {
  return post.status === "published";
}

async function resolveEntryRefTarget(
  deps: RouteResolverDeps,
  target: EntryRefTarget,
  ctx: RouteResolveContext
): Promise<RouteUrl | null> {
  const post = await deps.postRepo.findById({ workspaceId: ctx.workspaceId, id: target.entryId });
  if (!post || !isPublished(post)) return null;
  const path = `/${post.slug}`;
  return { path, canonicalUrl: composeCanonicalUrl(path, ctx) };
}

/**
 * Stub: taxonomy isn't implemented in this repo. ADR-029's Round-3 audit fold
 * promoted "term-link schema" from an Open item to a Wave-1 acceptance
 * blocker — ADR-022 §5's `entry_refs` covers entry-to-entry references only,
 * with no term-target schema yet (content-lib sign-off on a typed `term_refs`
 * index, or an accepted `entry_refs` extension for term targets, is owed).
 * Always resolves `null` until that schema lands.
 */
function resolveTermRefTarget(_target: TermRefTarget, _ctx: RouteResolveContext): RouteUrl | null {
  return null;
}

const UNSAFE_URL_SCHEMES = ["javascript:", "data:"] as const;

/**
 * @complexity O(1) (bounded scheme-prefix check).
 */
function resolveUrlTarget(target: UrlTarget, ctx: RouteResolveContext): RouteUrl | null {
  const href = target.href.trim();
  const lowered = href.toLowerCase();
  if (UNSAFE_URL_SCHEMES.some((scheme) => lowered.startsWith(scheme))) {
    return null;
  }
  return { path: href, canonicalUrl: composeCanonicalUrl(href, ctx) };
}

function resolveRouteRefTarget(target: RouteRefTarget, ctx: RouteResolveContext): RouteUrl | null {
  const path = getNamedRoute(target.route);
  if (path === null) return null;
  return { path, canonicalUrl: composeCanonicalUrl(path, ctx) };
}

// ---------------------------------------------------------------------------
// Inverse resolver — `urlFor` / `isActive` (ADR-039 §2, Round-2 amendment 4)
// ---------------------------------------------------------------------------

export interface UrlForRequired {
  deps: RouteResolverDeps;
  target: RouteTarget;
  ctx: RouteResolveContext;
}

export interface UrlForOptional {}

/**
 * Resolve a `RouteTarget` to its concrete path + canonical URL.
 *
 * Purpose: the one inverse-resolution entrypoint Menus and SEO depend on.
 * Deviates from ADR-039 §2's 2-arg pseudocode (`urlFor(target, ctx)`) by
 * taking a required-object first parameter carrying `deps` — `entryRef`
 * resolution needs an async `PostRepoPort` call, so `urlFor` must be async and
 * (per this repo's house style) DI'd rather than reaching for a singleton.
 * The semantic contract (target + workspace-scoped ctx → `RouteUrl | null`) is
 * unchanged.
 *
 * @returns `null` when the target is unavailable (not found, unpublished,
 * unresolvable taxonomy term, unsafe URL scheme, or unregistered route name) —
 * never throws for those cases, so callers can treat "no link" uniformly.
 * @throws {RouteResolutionError} only if `target.kind` is not one of the four
 * known discriminants (defensive; unreachable through the typed union).
 * @complexity O(1) plus the cost of one repo call for `entryRef` targets.
 */
export async function urlFor(
  required: UrlForRequired,
  _optional: UrlForOptional = {}
): Promise<RouteUrl | null> {
  const { deps, target, ctx } = required;
  switch (target.kind) {
    case "entryRef":
      return resolveEntryRefTarget(deps, target, ctx);
    case "termRef":
      return resolveTermRefTarget(target, ctx);
    case "url":
      return resolveUrlTarget(target, ctx);
    case "route":
      return resolveRouteRefTarget(target, ctx);
    default: {
      const unreachable: never = target;
      throw new RouteResolutionError(
        `unrecognized route target kind: ${JSON.stringify(unreachable)}`
      );
    }
  }
}

export interface IsActiveRequired {
  deps: RouteResolverDeps;
  target: RouteTarget;
  currentPath: string;
  ctx: RouteResolveContext;
}

export interface IsActiveOptional {}

/**
 * Whether `target` resolves to `currentPath` — the active-state Menus needs
 * for nav highlighting.
 *
 * v0 does exact-path matching only, after normalization. Ancestor/prefix
 * semantics for nested menu highlighting (is `/blog` active on `/blog/post`?)
 * are explicitly deferred to v0.1 (ADR-039 "Open" item 3) since they also
 * need the `urlFor → null` caller-render contract (hide vs. render inert)
 * pinned first.
 *
 * @returns `false` when the target is unavailable (delegates to `urlFor`).
 * @complexity Same as `urlFor` plus O(n) path normalization.
 */
export async function isActive(
  required: IsActiveRequired,
  _optional: IsActiveOptional = {}
): Promise<boolean> {
  const resolved = await urlFor({ deps: required.deps, target: required.target, ctx: required.ctx });
  if (!resolved) return false;
  return normalizePath(resolved.path) === normalizePath(required.currentPath);
}

// ---------------------------------------------------------------------------
// Forward resolution pipeline (ADR-039 §1) — registration seam for Redirects
// ---------------------------------------------------------------------------

type PhaseRegistry = Record<RouteResolvePhaseName, RouteResolvePhaseHandler[]>;

const phaseRegistry: PhaseRegistry = {
  pre_content: [],
  post_content: [],
};

/**
 * Register a resolver into an ordered, core-owned pipeline phase
 * (`normalize → pre_content → content-resolve → post_content → 404`,
 * ADR-039 §1). Not an open ADR-009 plugin hook in v1 — this is the seam
 * Redirects (ADR-033) will register into once it exists; no real rules are
 * registered by this library itself.
 *
 * Resolvers within a phase run in registration order; the first non-`null`
 * outcome short-circuits the remaining resolvers in that phase and the rest
 * of the pipeline. Per ADR-039 Round-2 amendment 5, a `pre_content` resolver
 * must only ever return a redirect/gone decision with an audited rule — it
 * must never fabricate a `not_found` for a path that live content could still
 * resolve. This library does not enforce that invariant (no rules exist yet
 * to violate it); it is a contract note for the future Redirects implementer.
 *
 * @complexity O(1) registration; O(1) additional space per registered handler.
 */
export function registerResolvePhase(
  phase: RouteResolvePhaseName,
  resolver: RouteResolvePhaseHandler
): void {
  phaseRegistry[phase].push(resolver);
}

async function runPhase(
  phase: RouteResolvePhaseName,
  path: string,
  ctx: RouteResolveContext
): Promise<RouteResolvePhaseOutcome | null> {
  for (const handler of phaseRegistry[phase]) {
    const outcome = await handler(path, ctx);
    if (outcome) return outcome;
  }
  return null;
}

export interface ResolveInput {
  path: string;
  ctx: RouteResolveContext;
}

export interface ResolveRequired {
  input: ResolveInput;
}

export interface ResolveOptional {}

/**
 * Run the forward resolution pipeline for an inbound request path.
 *
 * v0 behavior: normalize the path, run `pre_content` resolvers, then (with no
 * `content-resolve` step wired here — that is fixed core content lookup, out
 * of scope for this library) run `post_content` resolvers. Falls through to
 * `{ matched: false }` (404) if nothing resolves. This is a registration seam
 * for Redirects, not full pipeline behavior — no real rules exist yet.
 *
 * @complexity O(h) where h is the total number of registered phase handlers
 * that run before a match (or all of them, on a full miss); each handler's own
 * cost is opaque to this function.
 */
export async function resolve(
  required: ResolveRequired,
  _optional: ResolveOptional = {}
): Promise<RouteResolveResult> {
  const path = normalizePath(required.input.path);
  const ctx = required.input.ctx;

  const preOutcome = await runPhase("pre_content", path, ctx);
  if (preOutcome) return { matched: true, phase: "pre_content", outcome: preOutcome };

  // content-resolve: fixed core content lookup, not a registered phase of this
  // library in v0 — intentionally a no-op here (see file header).

  const postOutcome = await runPhase("post_content", path, ctx);
  if (postOutcome) return { matched: true, phase: "post_content", outcome: postOutcome };

  return { matched: false };
}

// ---------------------------------------------------------------------------
// SlugChangeCapture slot (ADR-039 §4)
// ---------------------------------------------------------------------------

let boundSlugChangeCapture: SlugChangeCapture | undefined;

/**
 * Bind the single `SlugChangeCapture` implementation the content write
 * chokepoint calls inside a rename transaction. Per ADR-039 Round-2
 * amendment 1, no slot implementation may be plugin-supplied — this function
 * has no plugin-facing registration path today, only a core composition-root
 * call site.
 *
 * Fail-closed nuance (Round-2 amendment 3), NOT enforced here: an absent
 * binding is only a safe no-op before Redirects is installed, or while
 * slug-preservation is disabled for the workspace. Once link-preservation is
 * enabled, a slug-changing rename with no bound capture MUST fail
 * `LINK_PRESERVATION_UNAVAILABLE` rather than silently skip the redirect —
 * that check belongs to the content write chokepoint (which knows whether
 * preservation is enabled) and to Redirects (neither exists in this repo
 * yet). This library only exposes the registration slot itself.
 */
export function registerSlugChangeCapture(impl: SlugChangeCapture): void {
  boundSlugChangeCapture = impl;
}

/** The currently bound `SlugChangeCapture`, or `undefined` if none is bound. */
export function getSlugChangeCapture(): SlugChangeCapture | undefined {
  return boundSlugChangeCapture;
}

// ---------------------------------------------------------------------------
// Test-only registry resets (deep-imported directly by this library's own
// tests; deliberately NOT exported from index.ts's public barrel)
// ---------------------------------------------------------------------------

/** Restore all module-level registries to their v0 defaults. Test use only. */
export function resetRoutingRegistrationsForTests(): void {
  namedRoutes.clear();
  for (const [name, path] of DEFAULT_NAMED_ROUTES) namedRoutes.set(name, path);
  phaseRegistry.pre_content = [];
  phaseRegistry.post_content = [];
  boundSlugChangeCapture = undefined;
}
