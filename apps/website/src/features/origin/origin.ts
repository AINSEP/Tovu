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
 * adapter — the SQL adapters remain separate host-owned implementations.
 * - `origin/repo.memory.ts` provides the in-memory double used here in tests
 * and by other libraries' tests.
 *
 * Architectural role: ADR-040. The package owns fixes F3 (open-redirect oracle
 * normalization) and F4 (egress-target oracle) from the ADR's internal-
 * verification round.
 *
 * Generic implementation and rationale: Jini packages/http-kit/src/verified-origin/origin.ts.
 * This adapter translates Tovu repository and URL-call contracts.
 */
// Implementation: /Users/la/Programming/Jini/packages/http-kit/src/verified-origin/origin.ts
import {
  OriginRegistry as JiniOriginRegistry,
  hasForbiddenRawUrlCharacter as checkRawUrl,
  normalizeOriginCandidate as normalizeCandidate,
  isSameOrigin as compareOrigins,
  type NormalizedTarget,
  type VerifiedOrigin,
} from "@jini-ai/http-kit/verified-origin";
import type {
  OriginContext, OriginRegistryPort, OriginSettingRepoPort,
  RedirectTargetContext, EgressTargetContext,
} from "./ports.js";

export type { NormalizedTarget } from "@jini-ai/http-kit/verified-origin";
export { OriginNotVerifiedError } from "@jini-ai/http-kit/verified-origin";
export interface OriginRegistryDeps { repo: OriginSettingRepoPort; }

/**
 * A same-origin comparable, fully normalized redirect/egress candidate. `scheme` includes
 * `"http"` only so a same-origin comparison against a `dev-capability` canonical origin (which
 * may legitimately be `http://localhost`) can match (ADR-040 Round-4 fold, round-2 audit finding
 * R2-005) — the cross-origin allowlist path still requires `https` unconditionally, enforced in
 * the package's `isAllowedTarget`, not here.
 *
 * Rejects forbidden raw characters, then parses with the WHATWG `URL` parser. Any parser throw is
 * a parse failure. Split out of {@link normalizeOriginCandidate} purely to keep that function's own
 * complexity below the repo's gate — the check, its order, and its meaning are unchanged.
 *
 * @returns The parsed `URL`, or `null` if `rawUrl` fails either check. Never throws.
 * @complexity O(n) in the length of `rawUrl` (parser-bound), O(1) space.
 *
 * Narrows a parsed URL's protocol to the two schemes this oracle ever accepts, or `null`.
 *
 * Resolves the candidate's effective port: the explicit port if one was given, else the scheme's
 * default (443 for `https`, 80 for `http`).
 *
 * @returns The port, or `null` if it is not a positive integer.
 *
 * Trusted canonical-origin registry (ADR-040). The only implementation of
 * `OriginRegistryPort` in this v0 slice; a per-`siteId` host-mapped resolver
 * is the plausible rule-of-two second adapter (ADR-040 §5), not built yet.
 *
 * Shared same-origin-or-allowlist decision used by both oracles above.
 * Isolated as its own function so the two public methods stay a one-line
 * pass-through to the correct allowlist source.
 *
 * @complexity O(k) where k = allowlist size.
 *
 * These constraints describe the package implementation; Tovu supplies only the storage adapter.
 * Cross-origin allowlist targets are HTTPS-only (ADR-040 amendment 8 / R2-005); the HTTP
 * dev-capability exception applies only to same-origin comparisons, never to cross-origin targets.
 * Fail closed: an unverified origin, a repo error, or any unexpected exception is never allowed.
 */
export class OriginRegistry implements OriginRegistryPort {
  private readonly registry: JiniOriginRegistry;

  constructor({ repo }: OriginRegistryDeps) {
    this.registry = new JiniOriginRegistry({ repo: {
      findByWorkspaceId: ({ workspaceId }) => repo.findByWorkspaceId(workspaceId),
      findRedirectAllowlist: ({ workspaceId }) => repo.findRedirectAllowlist(workspaceId),
      findEgressAllowlist: ({ workspaceId }) => repo.findEgressAllowlist(workspaceId),
    } });
  }

  /**
   * Resolve the verified canonical origin for a workspace.
   *
   * @param context - workspace (and optionally site/locale) to resolve for.
   * `siteId` and `locale` are accepted for interface parity with ADR-039's
   * `RouteResolveContext` but are not yet used to select between multiple
   * origins in this v0 (single-origin-per-workspace) slice.
   * @returns the registered `VerifiedOrigin`.
   * @throws {OriginNotVerifiedError} if no origin is registered for the
   * workspace. Fails closed rather than guessing from the request host.
   * @complexity O(1) time/space (single repo lookup).
   */
  canonicalOrigin(context: OriginContext): Promise<VerifiedOrigin> {
    return this.registry.canonicalOrigin(context);
  }

  /**
   * The single open-redirect oracle (ADR-040 F3). See `normalizeOriginCandidate`
   * for the rejection pipeline. Same-origin targets are always allowed;
   * cross-origin targets are allowed only via the workspace's exact-host
   * redirect allowlist.
   *
   * @param context - workspace (and optionally site/originKey) the redirect is
   * scoped to. `originKey` is accepted for `RouteResolveContext` parity
   * (ADR-040 F5) but is not yet consumed — v0 has one origin per workspace.
   * @param url - untrusted candidate redirect target.
   * @returns `true` only if `url` is a verified same-origin or allowlisted
   * cross-origin `https` target. Fails closed (`false`) on any parse
   * failure, ambiguity, or unexpected error — never throws.
   * @complexity O(k) where k = allowlist size (single Set lookup after
   * normalization), O(k) space for the allowlist Set.
   */
  isAllowedRedirectTarget(context: RedirectTargetContext, url: string): Promise<boolean> {
    return this.registry.isAllowedRedirectTarget({ context, url });
  }

  /**
   * The single third-party egress-target oracle (ADR-040 F4), backed by a
   * distinct per-workspace egress-destination allowlist. Same normalization
   * pipeline and fail-closed posture as `isAllowedRedirectTarget`.
   *
   * @param context - workspace (and optionally site) the egress call is scoped to.
   * @param url - untrusted candidate egress destination.
   * @returns `true` only if `url` is a verified same-origin or allowlisted
   * `https` target. Fails closed (`false`) on any parse failure, ambiguity,
   * or unexpected error — never throws.
   * @complexity O(k) where k = allowlist size, O(k) space.
   */
  isAllowedEgressTarget(context: EgressTargetContext, url: string): Promise<boolean> {
    return this.registry.isAllowedEgressTarget({ context, url });
  }
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
 *
 * The oracle's own raw-character rule, exported (t91 B2, 2026-09-16) so a write path that stores a
 * future candidate can refuse exactly what this oracle — and the read path built on top of it —
 * will refuse. See the package's `FORBIDDEN_RAW_CHARS`'s doc for why this class matters beyond this file.
 *
 * @param raw - The untrusted string exactly as received, BEFORE any `new URL()` parse. A parsed and
 * re-serialized URL can never fail this check (the parser already percent-encoded whitespace and
 * turned `\` into `/`), so running it on `url.href` checks nothing.
 * @returns `true` if `raw` contains a backslash, whitespace, or a C0/DEL control character.
 * @complexity O(n) in the length of `raw`.
 * @example hasForbiddenRawUrlCharacter("/a b"); // => true
 *
 * Generic predicate: Jini packages/http-kit/src/verified-origin/origin.ts; passes { raw }.
 */
export function hasForbiddenRawUrlCharacter(raw: string): boolean {
  return checkRawUrl({ raw });
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
 *
 * Generic normalization: Jini packages/http-kit/src/verified-origin/origin.ts; passes { rawUrl }.
 */
export function normalizeOriginCandidate(rawUrl: string): NormalizedTarget | null {
  return normalizeCandidate({ rawUrl });
}

/**
 * THE same-origin rule: scheme equal, host equal after lower-casing and stripping one trailing dot,
 * effective port equal. Exported (t91 B1, 2026-09-16) so a caller deciding "is this candidate on
 * the workspace's own origin" never falls back to a URL-string `origin` comparison —
 * `new URL("https://site./x").origin` is `"https://site."`, a distinct string from
 * `"https://site"`, yet a request to either reaches the same server (browsers do keep them as
 * separate origins for cookies and scripting, which is exactly why a string comparison misses it).
 * The redirect oracle (the package's `isAllowedTarget`) and `features/redirects/reserved-destination.ts`'s
 * `checkSameOriginDestination` both call this exact function so "same origin" can never mean two
 * different things for the same candidate.
 *
 * PRECONDITION: `target` came from {@link normalizeOriginCandidate}. Only `canonical` is normalized
 * here; `target.host` is compared as given, so a hand-built `{ host: "Site." }` answers `false`.
 *
 * @param target - A candidate already normalized by `normalizeOriginCandidate`.
 * @param canonical - The workspace's verified origin, normalized here.
 * @complexity O(1).
 *
 * Generic comparison: Jini packages/http-kit/src/verified-origin/origin.ts; passes { target, canonical }.
 */
export function isSameOrigin(target: NormalizedTarget, canonical: VerifiedOrigin): boolean {
  return compareOrigins({ target, canonical });
}
