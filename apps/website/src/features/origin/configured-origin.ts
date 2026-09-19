import { hasForbiddenRawUrlCharacter } from "./origin.js";
import { createVerifiedOrigin, type VerifiedOrigin } from "./types.js";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import type { ISODateTime } from "@jini-ai/cms/core";

/**
 * @file `resolveConfiguredOrigin` — the operator-declared public origin (2026-09-18; design note:
 * `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`).
 *
 * Purpose:
 * ADR-040 §2 makes "a verified workspace setting" the source of truth for a workspace's canonical
 * origin and forbids the request host — but it left the *verification mechanism* explicitly open
 * ("Origin verification mechanism (reachability vs DNS/ownership proof) — v0.1"), so until this
 * file there was NO way to register a real public origin at all: `origin_settings`' only writer was
 * the hardcoded `localhost:3000` dev seed. That is why production's `sitemap.xml` emitted
 * `http://localhost:3000/...` (fixed defensively in `d21d6e7ac`, which made those URLs relative
 * rather than wrong — safe, but the sitemap protocol wants absolute).
 *
 * This file closes that gap with the trust root that is actually available: the process
 * environment. `TOVU_PUBLIC_URL` is the SAME operator-configured "this deployment's public origin"
 * convention `routes/oauth/public-origin.ts`, `assistant/external-mcp-oauth.ts`, and
 * `assistant/admin-screen-link-tool.ts` already read, reused rather than duplicated into a second
 * variable — ADR-040's own Context names "duplicated settings drift" as a fracture it exists to
 * close. Whoever can set this deployment's environment (on Fly: `fly secrets set` / `fly.toml`)
 * can already deploy arbitrary code, so this grants no new authority. It is NOT a reachability or
 * ownership proof, and does not claim to be: `verifiedAt` means "declared and accepted at this
 * boot", exactly what it already means for the dev-capability seed.
 *
 * SECURITY — do not "helpfully" deduplicate this against
 * `server/inbound/public-http/routes/oauth/public-origin.ts`'s `resolvePublicOrigin(req)`. That
 * function prefers `TOVU_PUBLIC_URL` but FALLS BACK to `req.get("host")` plus `X-Forwarded-Proto`.
 * Its own doc reasons that blast radius down to a self-inflicted broken OAuth redirect. Routing a
 * request-derived host into THIS registry instead would durably poison the canonical origin for
 * every sitemap entry, canonical tag, magic link, unsubscribe link, redirect verdict, and egress
 * check — a persistent host-header injection, and the exact thing ADR-040 §2 and amendment 7
 * forbid. Nothing here imports `express`; the only input is an env record read at boot.
 */

/**
 * Hosts that provably mean "this machine" and can therefore never be a public canonical origin.
 * `*.localhost` and the whole `127.0.0.0/8` block are handled in {@link isLoopbackHost}.
 *
 * Load-bearing for reuse of `TOVU_PUBLIC_URL`: this repo's own `.env` carries
 * `TOVU_PUBLIC_URL=https://localhost:3000`. Without this refusal, local dev would silently flip
 * from a `dev-capability` origin to a `workspace-setting` one, overriding `deriveDevScheme`'s TLS
 * derivation (`server/runtime/boot/dev-tls.ts`) and re-opening the 2026-09-05 audit bug where a
 * hardcoded `https` shipped `https://` links from a server answering only on `http://`. Refusing
 * loopback here is what makes one shared env var safe for both environments.
 *
 * RFC1918 private ranges are deliberately NOT refused: an intranet deployment may legitimately have
 * a private canonical host, and refusing it would be an unasked policy call. Loopback is different
 * — it is not reachable by anyone else, by definition.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "[::1]", "::", "[::]"]);

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** @complexity O(1). */
function isLoopbackHost(host: string): boolean {
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  return LOOPBACK_IPV4.test(host);
}

/** Lower-cases and strips a single trailing dot, matching `origin.ts`'s own host normalization so
 *  "same host" can never mean two different things across this library. @complexity O(n). */
function normalizeHost(hostname: string): string {
  const lowered = hostname.toLowerCase();
  return lowered.endsWith(".") ? lowered.slice(0, -1) : lowered;
}

/**
 * Rejects the raw string's forbidden characters BEFORE the WHATWG parser can normalize them away
 * (a backslash becomes a slash, whitespace is stripped) — the same predicate and the same reason as
 * ADR-040 amendment 8's redirect oracle, imported rather than re-derived.
 *
 * @returns The parsed URL, or `null` if the value is unusable. Never throws.
 * @complexity O(n) in the length of `raw` (parser-bound).
 */
function parseConfiguredUrl(raw: string): URL | null {
  if (hasForbiddenRawUrlCharacter(raw)) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * The refusal pipeline, as one decision function.
 *
 * Split out of {@link resolveConfiguredOrigin} so each refusal is a single readable branch and the
 * caller stays a flat read -> parse -> validate -> build sequence.
 *
 * @returns The operator-facing refusal reason, or `null` when `url` names a usable public origin.
 * @complexity O(n) in the host length.
 */
function refusalReason(url: URL): string | null {
  // ADR-040 Round-3 fold amendment 1: `scheme: "http"` is legal only for `source:
  // "dev-capability"`, and `createVerifiedOrigin` THROWS on the combination. Refusing here is what
  // keeps that throw off the boot path.
  if (url.protocol !== "https:") return "its scheme must be https";
  if (url.username !== "" || url.password !== "") return "it carries a userinfo component";
  if (url.search !== "" || url.hash !== "") return "it carries a query string or fragment";

  const host = normalizeHost(url.hostname);
  if (host === "") return "its host is empty";
  if (isLoopbackHost(host)) return `'${host}' is a loopback host, not a public origin`;
  return null;
}

/**
 * Builds the `VerifiedOrigin` for an already-validated URL.
 *
 * `port` and `basePath` keys are added CONDITIONALLY, never as `?? undefined`: an object literal
 * with an explicit `undefined`-valued key is not `deepStrictEqual` to one that never had the key,
 * and both fields are genuinely optional — the same strictness `origin-repo.sqlite.ts`'s
 * `toVerifiedOrigin` is built around.
 *
 * @complexity O(1).
 */
function buildConfiguredOrigin(url: URL, now: ISODateTime): VerifiedOrigin {
  const candidate: VerifiedOrigin = {
    scheme: "https",
    host: normalizeHost(url.hostname),
    verifiedAt: now,
    source: "workspace-setting",
  };
  if (url.port !== "") candidate.port = Number(url.port);
  const basePath = url.pathname.replace(/\/+$/, "");
  if (basePath !== "") candidate.basePath = basePath;
  return createVerifiedOrigin(candidate);
}

export interface ConfiguredOriginOptions {
  /** Defaults to the real `process.env`. Injectable so the refusal pipeline is unit-testable
   *  without mutating the process. */
  env?: Record<string, string | undefined>;
  /** Defaults to `console.warn`. Every refusal emits exactly one line naming the reason, so a
   *  misconfigured deploy is diagnosable from the boot log instead of silently serving relative
   *  URLs. The value logged is a public URL by definition, never a credential. */
  warn?: (message: string) => void;
}

/**
 * Resolves this deployment's operator-declared public origin from `TOVU_PUBLIC_URL`.
 *
 * Refuses, with one warning and no registration: a value that is unset or blank (the normal
 * local-dev case — no warning for that one), unparseable, carries a backslash/whitespace/control
 * character, is not `https`, carries userinfo, carries a query string or fragment, has an empty
 * host, or names a loopback host.
 *
 * @param required.now - ISO timestamp stamped as `verifiedAt`; supply the composition root's clock
 * rather than reading the wall clock here, so a boot's origin row and its other rows agree.
 * @returns A `workspace-setting` `VerifiedOrigin`, or `undefined` when nothing usable is
 * configured. NEVER throws — a malformed env var must not take the boot down, and `undefined` has
 * a well-defined meaning downstream (ADR-040 §2's fail-closed "no verified origin").
 * @complexity O(n) in the configured value's length.
 */
export function resolveConfiguredOrigin(
  required: { now: ISODateTime },
  optional: ConfiguredOriginOptions = {}
): VerifiedOrigin | undefined {
  const env = optional.env ?? process.env;
  const warn = optional.warn ?? ((message: string) => console.warn(message));

  const raw = env.TOVU_PUBLIC_URL?.trim();
  if (!raw) return undefined;

  const refuse = (reason: string): undefined => {
    warn(
      `TOVU_PUBLIC_URL is set but was refused as this deployment's public origin (${reason}); ` +
        `no origin was registered from it. Value: ${raw}`
    );
    return undefined;
  };

  const url = parseConfiguredUrl(raw);
  if (!url) return refuse("it is not a parseable URL");

  const reason = refusalReason(url);
  if (reason) return refuse(reason);

  return buildConfiguredOrigin(url, required.now);
}

/**
 * What the composition root should do about the origin registry on this boot.
 *
 * - `configured` — register {@link OriginBootPlan.origin} as the workspace's public origin.
 * - `dev-seed` — call `seedDevCapabilityOrigin` exactly as before (localhost, `deriveDevScheme`).
 * - `none` — write nothing at all.
 */
export type OriginBootPlan =
  | { kind: "configured"; origin: VerifiedOrigin }
  | { kind: "dev-seed" }
  | { kind: "none" };

const NO_CONFIG_IN_PRODUCTION_WARNING =
  "No public origin is configured for this production deployment: TOVU_PUBLIC_URL is unset or was " +
  "refused, and the localhost dev-capability seed is never written in production runtime mode. " +
  "Public URLs (sitemap.xml, canonical, og:url, newsletter and magic links) stay relative or " +
  "unavailable until TOVU_PUBLIC_URL names this deployment's origin.";

/**
 * Decides the boot's origin-registry action. Pure decision, no I/O — the composition root owns the
 * effect, so this whole three-way policy is assertable without opening a database.
 *
 * Why `dev-seed` is refused in production, which is the load-bearing part: the unconditional
 * `seedDevCapabilityOrigin` call is what durably wrote `http://localhost:3000` into production's
 * `content.db` on Fly's first boot, and its find-or-create contract makes that row immortal. ADR-040
 * §2 is explicit that "an unverified/absent origin fails closed" — so on a production boot with no
 * configured origin the correct action is to write NOTHING, not to invent a localhost origin. That
 * is a disclosed behavior change for a fresh production database (newsletter's launch gate blocks
 * real-recipient sends; redirect cross-origin verdicts and site-evidence self-fetch fail closed),
 * and it replaces behavior that was already broken — it was mailing `http://localhost:3000`
 * unsubscribe links to real subscribers.
 *
 * `d21d6e7ac`'s read-side degradation in `features/seo/absolute-url.ts` stays as defense in depth:
 * this function prevents NEW poisoned rows, but only `registerConfiguredOrigin` can correct the one
 * production already has, and that needs `TOVU_PUBLIC_URL` to actually be set.
 *
 * @param optional.mode - Defaults to `resolveRuntimeMode`; injectable for tests, the same
 * convention `features/seo/absolute-url.ts`'s `resolveWorkspaceOrigin` uses.
 * @complexity O(n) in the configured value's length.
 */
export function planOriginBoot(
  required: { now: ISODateTime },
  optional: ConfiguredOriginOptions & { mode?: () => RuntimeMode } = {}
): OriginBootPlan {
  const origin = resolveConfiguredOrigin(required, optional);
  if (origin) return { kind: "configured", origin };

  const mode = optional.mode ?? resolveRuntimeMode;
  if (mode() !== "production") return { kind: "dev-seed" };

  const warn = optional.warn ?? ((message: string) => console.warn(message));
  warn(NO_CONFIG_IN_PRODUCTION_WARNING);
  return { kind: "none" };
}
