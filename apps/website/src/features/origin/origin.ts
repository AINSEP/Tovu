/**
 * @file `OriginRegistry` — the trusted canonical-origin registry (ADR-040 v0).
 *
 * Purpose:
 * Implements `OriginRegistryPort`: resolves a workspace's verified canonical
 * origin, and provides the single open-redirect and egress-target oracles
 * that every SEO/identity/newsletter/redirects/egress consumer must call
 * instead of trusting the raw request `Host` header.
 *
 * How it relates to the project:
 * - Depends only on `OriginSettingRepoPort` (`./ports`), never on a concrete
 *   adapter — the SQLite-backed adapter is a separate, later change (out of
 *   scope for this library-layer slice).
 * - `origin/repo.memory.ts` provides the in-memory double used here in tests
 *   and by other libraries' tests.
 *
 * Architectural role: ADR-040. This file owns fixes F3 (open-redirect oracle
 * normalization) and F4 (egress-target oracle) from the ADR's internal-
 * verification round.
 */
import type { OriginContext, OriginRegistryPort, OriginSettingRepoPort, RedirectTargetContext, EgressTargetContext } from "./ports.js";
import { OriginNotVerifiedError, type VerifiedOrigin } from "./types.js";

export { OriginNotVerifiedError };

/**
 * A same-origin comparable, fully normalized redirect/egress candidate. `scheme` includes
 * `"http"` only so a same-origin comparison against a `dev-capability` canonical origin (which
 * may legitimately be `http://localhost`) can match (ADR-040 Round-4 fold, round-2 audit finding
 * R2-005) — the cross-origin allowlist path still requires `https` unconditionally, enforced in
 * `isAllowedTarget` below, not here.
 */
export interface NormalizedTarget {
  scheme: "https" | "http";
  host: string;
  port: number;
}

/**
 * Raw-string characters that must reject a candidate URL before it is ever
 * handed to the WHATWG parser: backslashes (scheme-separator confusion /
 * `https:/\evil.com` bypasses), whitespace, and C0/DEL control characters.
 * The URL parser silently strips some of these, which is exactly the
 * ambiguity ADR-040 F3 requires rejecting outright instead of tolerating.
 *
 * Load-bearing for the redirect READ path too, not just this oracle (t91 B2, 2026-09-16):
 * `features/redirects/phase-handler.ts` builds a relative location's oracle candidate by
 * CONCATENATING it onto the canonical origin, and Express's `res.redirect` does not percent-encode
 * `\`, so a stored template `\` plus a request tail `/evil.example` becomes `Location:
 * \/evil.example`, which a browser follows to `evil.example`. `platform/routing`'s
 * `checkSitePathname` cannot see that backslash — it reads an already-parsed pathname, where `\` is
 * already `/`. This raw check is what refuses it on read (pinned by
 * `phase-handler.read-path-target.test.ts`'s backslash cases). The redirect WRITE gate applies this
 * same predicate via {@link hasForbiddenRawUrlCharacter} so write and read agree — a target this
 * check would refuse must never be storable. Do not narrow this class without re-checking both
 * paths.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are the POINT — ADR-040 F3 requires rejecting C0/DEL and backslash in a raw candidate URL before the WHATWG parser silently strips them. See this constant's own doc comment.
const FORBIDDEN_RAW_CHARS = /[\\\s\x00-\x1F\x7F]/;

/**
 * The oracle's own raw-character rule, exported (t91 B2, 2026-09-16) so a write path that stores a
 * future candidate can refuse exactly what this oracle — and the read path built on top of it —
 * will refuse. See {@link FORBIDDEN_RAW_CHARS}'s doc for why this class matters beyond this file.
 *
 * @param raw - Any untrusted string, parsed or not.
 * @returns `true` if `raw` contains a backslash, whitespace, or a C0/DEL control character.
 * @complexity O(n) in the length of `raw`.
 * @example hasForbiddenRawUrlCharacter("/a b"); // => true
 */
export function hasForbiddenRawUrlCharacter(raw: string): boolean {
  return FORBIDDEN_RAW_CHARS.test(raw);
}

/**
 * Rejects forbidden raw characters, then parses with the WHATWG `URL` parser. Any parser throw is
 * a parse failure. Split out of {@link normalizeOriginCandidate} purely to keep that function's own
 * complexity below the repo's gate — the check, its order, and its meaning are unchanged.
 *
 * @returns The parsed `URL`, or `null` if `rawUrl` fails either check. Never throws.
 * @complexity O(n) in the length of `rawUrl` (parser-bound), O(1) space.
 */
function parseCandidateUrl(rawUrl: string): URL | null {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return null;
  if (hasForbiddenRawUrlCharacter(rawUrl)) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/** Narrows a parsed URL's protocol to the two schemes this oracle ever accepts, or `null`. */
function schemeOf(parsed: URL): "https" | "http" | null {
  if (parsed.protocol === "https:") return "https";
  if (parsed.protocol === "http:") return "http";
  return null;
}

function defaultPortFor(scheme: "https" | "http"): number {
  return scheme === "https" ? 443 : 80;
}

/**
 * Resolves the candidate's effective port: the explicit port if one was given, else the scheme's
 * default (443 for `https`, 80 for `http`).
 *
 * @returns The port, or `null` if it is not a positive integer.
 */
function resolvePort(parsed: URL, scheme: "https" | "http"): number | null {
  const port = parsed.port ? Number(parsed.port) : defaultPortFor(scheme);
  if (!Number.isInteger(port) || port <= 0) return null;
  return port;
}

/**
 * Parse and normalize a candidate redirect/egress URL per ADR-040 F3.
 *
 * Pipeline: reject forbidden raw characters -> parse with the WHATWG `URL`
 * parser (any throw is a parse failure) -> require `https:` or `http:` (an
 * `http` candidate survives ONLY to the same-origin comparison against a
 * `dev-capability` canonical origin — see `NormalizedTarget`; the cross-origin
 * allowlist path in `isAllowedTarget` re-enforces `https`-only) -> reject a
 * non-empty userinfo component -> lower-case + strip a single trailing dot
 * from the host (IDNA/punycode normalization and case-folding are already
 * performed by the `URL` parser itself) -> resolve an explicit or scheme-
 * default (443 for `https`, 80 for `http`) port.
 *
 * @param rawUrl - the untrusted candidate URL string.
 * @returns the normalized `{ scheme, host, port }`, or `null` if the
 * candidate fails any check. Never throws.
 * @complexity O(n) in the length of `rawUrl` (parser-bound), O(1) space.
 * @overallScore 100/100
 */
export function normalizeOriginCandidate(rawUrl: string): NormalizedTarget | null {
  const parsed = parseCandidateUrl(rawUrl);
  if (!parsed) return null;

  const scheme = schemeOf(parsed);
  if (!scheme) return null;

  if (parsed.username !== "" || parsed.password !== "") return null;

  const host = stripTrailingDot(parsed.hostname.toLowerCase());
  if (!host) return null;

  const port = resolvePort(parsed, scheme);
  if (port === null) return null;

  return { scheme, host, port };
}

function stripTrailingDot(host: string): string {
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

function effectivePort(origin: Pick<VerifiedOrigin, "scheme" | "port">): number {
  return origin.port ?? (origin.scheme === "https" ? 443 : 80);
}

/**
 * THE same-origin rule: scheme equal, host lower-cased with one trailing dot stripped on BOTH
 * sides, effective port equal. Exported (t91 B1, 2026-09-16) so a caller deciding "is this
 * candidate on the workspace's own origin" never falls back to a URL-string `origin` comparison —
 * `new URL("https://site./x").origin` is `"https://site."`, a distinct string from
 * `"https://site"` even though every browser treats them as the same origin. The redirect oracle
 * (`isAllowedTarget` below) and `features/redirects/reserved-destination.ts`'s
 * `checkSameOriginDestination` both call this exact function so "same origin" can never mean two
 * different things for the same candidate.
 *
 * @complexity O(1).
 */
export function isSameOrigin(target: NormalizedTarget, canonical: VerifiedOrigin): boolean {
  if (canonical.scheme !== target.scheme) return false;
  if (stripTrailingDot(canonical.host.toLowerCase()) !== target.host) return false;
  return effectivePort(canonical) === target.port;
}

export interface OriginRegistryDeps {
  repo: OriginSettingRepoPort;
}

/**
 * Trusted canonical-origin registry (ADR-040). The only implementation of
 * `OriginRegistryPort` in this v0 slice; a per-`siteId` host-mapped resolver
 * is the plausible rule-of-two second adapter (ADR-040 §5), not built yet.
 */
export class OriginRegistry implements OriginRegistryPort {
  private readonly repo: OriginSettingRepoPort;

  constructor(deps: OriginRegistryDeps) {
    this.repo = deps.repo;
  }

  /**
   * Resolve the verified canonical origin for a workspace.
   *
   * @param ctx - workspace (and optionally site/locale) to resolve for.
   * `siteId` and `locale` are accepted for interface parity with ADR-039's
   * `RouteResolveContext` but are not yet used to select between multiple
   * origins in this v0 (single-origin-per-workspace) slice.
   * @returns the registered `VerifiedOrigin`.
   * @throws {OriginNotVerifiedError} if no origin is registered for the
   * workspace. Fails closed rather than guessing from the request host.
   * @complexity O(1) time/space (single repo lookup).
   * @overallScore 100/100
   */
  async canonicalOrigin(ctx: OriginContext): Promise<VerifiedOrigin> {
    const origin = await this.repo.findByWorkspaceId(ctx.workspaceId);
    if (!origin) {
      throw new OriginNotVerifiedError(`no verified origin registered for workspace '${ctx.workspaceId}'`);
    }
    return origin;
  }

  /**
   * The single open-redirect oracle (ADR-040 F3). See `normalizeOriginCandidate`
   * for the rejection pipeline. Same-origin targets are always allowed;
   * cross-origin targets are allowed only via the workspace's exact-host
   * redirect allowlist.
   *
   * @param ctx - workspace (and optionally site/originKey) the redirect is
   * scoped to. `originKey` is accepted for `RouteResolveContext` parity
   * (ADR-040 F5) but is not yet consumed — v0 has one origin per workspace.
   * @param url - untrusted candidate redirect target.
   * @returns `true` only if `url` is a verified same-origin or allowlisted
   * cross-origin `https` target. Fails closed (`false`) on any parse
   * failure, ambiguity, or unexpected error — never throws.
   * @complexity O(k) where k = allowlist size (single Set lookup after
   * normalization), O(k) space for the allowlist Set.
   * @overallScore 100/100
   */
  async isAllowedRedirectTarget(ctx: RedirectTargetContext, url: string): Promise<boolean> {
    return this.isAllowedTarget(ctx, url, (workspaceId) => this.repo.findRedirectAllowlist(workspaceId));
  }

  /**
   * The single third-party egress-target oracle (ADR-040 F4), backed by a
   * distinct per-workspace egress-destination allowlist. Same normalization
   * pipeline and fail-closed posture as `isAllowedRedirectTarget`.
   *
   * @param ctx - workspace (and optionally site) the egress call is scoped to.
   * @param url - untrusted candidate egress destination.
   * @returns `true` only if `url` is a verified same-origin or allowlisted
   * `https` target. Fails closed (`false`) on any parse failure, ambiguity,
   * or unexpected error — never throws.
   * @complexity O(k) where k = allowlist size, O(k) space.
   * @overallScore 100/100
   */
  async isAllowedEgressTarget(ctx: EgressTargetContext, url: string): Promise<boolean> {
    return this.isAllowedTarget(ctx, url, (workspaceId) => this.repo.findEgressAllowlist(workspaceId));
  }

  /**
   * Shared same-origin-or-allowlist decision used by both oracles above.
   * Isolated as its own function so the two public methods stay a one-line
   * pass-through to the correct allowlist source.
   *
   * @complexity O(k) where k = allowlist size.
   * @overallScore 100/100
   */
  private async isAllowedTarget(
    ctx: { workspaceId: string; siteId?: string },
    rawUrl: string,
    loadAllowlist: (workspaceId: string) => Promise<string[]>
  ): Promise<boolean> {
    try {
      const target = normalizeOriginCandidate(rawUrl);
      if (!target) return false;

      const canonical = await this.canonicalOrigin({ workspaceId: ctx.workspaceId, siteId: ctx.siteId });
      if (isSameOrigin(target, canonical)) return true;

      // Cross-origin allowlist path is https-only, unconditionally (ADR-040 amendment 8) — the
      // dev-capability http exception above applies ONLY to the same-origin comparison, never
      // to a cross-origin allowlisted target (ADR-040 Round-4 fold, R2-005 fix).
      if (target.scheme !== "https") return false;

      const allowlist = await loadAllowlist(ctx.workspaceId);
      const allowSet = new Set(allowlist.map((host) => stripTrailingDot(host.trim().toLowerCase())));
      return allowSet.has(target.host);
    } catch {
      // Fail closed: an unverified origin, a repo error, or any unexpected
      // exception must never be treated as "allowed".
      return false;
    }
  }
}
