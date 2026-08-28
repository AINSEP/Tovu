import { AwsClient } from "aws4fetch";

import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../../webhooks/index.js";
import { resolveForPublish } from "../publish-credentials/store.js";
import type { PublishConnectionInput, PublishCredentialSetRepoPort } from "../publish-credentials/types.js";
import type { PublishCredentialSource, StaticPublishTargetId } from "./types.js";

/**
 * @file Verifies a static-publish credential against its REAL provider — the fix for "ready means a
 * row exists, not a working credential" (2026-08-16, live-publish finding: a saved GitHub token that
 * GitHub rejected outright with 401 still reported `ready: true`/`credentialsConfigured: true`).
 *
 * Purpose:
 * `PublishCredentialSource.isConfigured()` (`./types.ts`) only ever answers "does a row/env-var
 * exist" — deliberately, since it must never decrypt (see that interface's own header). This module
 * is the SECOND legitimate caller of `PublishCredentialSource.resolve()` (which DOES decrypt),
 * alongside a real publish attempt — never the agent-facing capabilities/preview tools
 * (`publish-agent-tools.ts`), which only ever read this module's CACHED, already-non-secret result.
 * See `ADS-memory/reports/2026-08-16-publish-correctness-findings.md`'s Defect B section for the
 * full design reasoning, including why this caches in-memory rather than adding a DB column/migration
 * (recommended trade-offs recorded there before this file was written).
 *
 * `verifyPublishCredential` resolves whichever credential a REAL publish would actually use (the
 * composed DB-first/env-fallback source — the same one `static-publish/credentials.ts`'s
 * `composePublishCredentialSource` builds), makes ONE lightweight, read-only, authenticated request
 * against that provider's own API, and caches only the outcome (`status`/`message`/`checkedAt`) —
 * never the credential itself, and never the provider's raw response body (mirrors
 * `connectors/composio-key-probe.ts`'s "never return the response body/error text" discipline, the
 * closest existing precedent in this codebase for "probe a stored credential against its real
 * provider" — see that file's own header for the full reasoning this module reuses).
 *
 * `PublishCredentialVerificationResult.status` is a closed THREE-way enum
 * (`"valid" | "invalid" | "unreachable"`), never a plain boolean — this is a hard requirement from
 * code review, not a style choice: `"unreachable"` (a network failure, timeout, or provider 5xx) must
 * never collapse into the same shape as `"invalid"` (the provider affirmatively rejected the
 * credential), because the two demand opposite guidance. A human told "unreachable" should try again
 * later; a human told "invalid" should replace the credential. Collapsing them would risk sending
 * someone to regenerate a perfectly good token over a transient network blip — the same class of
 * false-negative Defect A (this same finding session) was filed for, just at a different layer.
 *
 * Two providers' checkers now read ONE named field off their success response body — GitHub's
 * `login`, Vercel's `user.username` (2026-08-16, Defect 1: "the assistant has to guess the GitHub
 * owner" — a live publish went to `leonaburime/tovu-demo1`, a 404, because nothing in this feature
 * ever told the agent which account its own verified token belongs to, so it guessed one from the
 * human's email address instead). This is a deliberate, reviewed NARROWING of the rule above, not a
 * reversal of it: the reasoning is that this exact value is about to be interpolated into a PUBLIC
 * URL a real publish already prints (`https://<login>.github.io/<repo>/`), so withholding it from the
 * agent performing the publish protects nothing while forcing it to guess. `extractGitHubLogin`/
 * `extractVercelUsername` each read exactly the one named field off a parsed body and discard
 * everything else — not a general passthrough, and neither is reachable for `"invalid"`/
 * `"unreachable"` results (see {@link probe}'s own doc: the body is only ever touched after
 * `classifyProviderResponse` has already returned `ok: true`). GitHub's `login` and Vercel's
 * `user.username` are both public by construction — the exact strings each provider prints in its own
 * profile/project URLs — never `email`, `plan`, `billing`, or org/team membership, none of which this
 * module reads before or after this change. Netlify's `/api/v1/user` (checked against Netlify's own
 * published OpenAPI schema, 2026-08-16) has no field of this kind — only `email`/`full_name`, both
 * excluded by this same rule — so its checker still reads nothing back. Cloudflare's
 * `/user/tokens/verify` endpoint verifies a token without returning any account identity at all, and a
 * second request purely to obtain one is not "equally cheap" per this narrowing's own scope, so its
 * checker is unchanged too. S3-compatible has no login concept for a bucket-scoped access key.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic. `publish-agent-tools.ts`'s capabilities
 * handler reads `PublishCredentialVerificationCache.get()` directly (a plain in-memory lookup, no
 * decrypt, no network call) — it must NEVER call `verifyPublishCredential` itself. Only human-gated
 * callers (the admin credential-CRUD route) may call `verifyPublishCredential`.
 */

/** One bounded probe per provider. Short because a human is waiting on a form submit or an explicit
 *  "Verify" click, not a background job — same reasoning and same order of magnitude
 *  `composio-key-probe.ts`'s `PROBE_TIMEOUT_MS` documents for its own single-shot check. */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * One provider check's raw outcome, before this module turns it into a human-facing message.
 * Mirrors `composio-key-probe.ts`'s `ComposioKeyProbeResult` shape exactly (`"rejected"` — the
 * provider answered and refused the credential, actionable by the human — vs `"unreachable"` — a
 * transport failure, timeout, or unexpected status that says nothing about whether the credential
 * itself is good), extended with the optional HTTP status so the human-facing message can be
 * specific ("HTTP 401") without this module needing to re-derive it from a discarded response.
 */
type ProviderCredentialCheckResult =
  | { readonly ok: true; readonly accountLabel?: string }
  | { readonly ok: false; readonly reason: "rejected" | "unreachable"; readonly statusCode?: number };

/** Shared "did the provider authenticate this request" classifier — every checker below ends with
 *  this same three-way read of a `Response` it must not otherwise inspect (no body read, matching
 *  `composio-key-probe.ts`'s "response body discarded entirely" discipline: an authenticated
 *  provider's error body can carry request/account detail that has no business in a cached,
 *  potentially agent-visible message). Never reads the body on EITHER branch — {@link probe} is the
 *  one place a success body is ever opened, and only for the two providers with a reviewed field to
 *  read (see this file's header). */
function classifyProviderResponse(resp: Response): { readonly ok: true } | { readonly ok: false; readonly reason: "rejected" | "unreachable"; readonly statusCode?: number } {
  if (resp.ok) return { ok: true };
  if (resp.status === 401 || resp.status === 403) return { ok: false, reason: "rejected", statusCode: resp.status };
  return { ok: false, reason: "unreachable", statusCode: resp.status };
}

/** GitHub's `/user` always carries `login` for a valid token (checked field, not assumed) — public by
 *  construction, the exact string GitHub itself prints in every profile/repo URL. Never `email`,
 *  `plan`, or org/team membership, none of which this function reads.
 *
 *  Exported (2026-08-16) for `features/source-control/store.ts`'s own inline account-label probe to
 *  reuse verbatim rather than re-declaring an identical extractor: a source-control `"github"`
 *  connection's token hits the exact same `/user` endpoint and the exact same reviewed `login` field
 *  this function already reads for a github-pages PUBLISH credential — see that file's own doc comment
 *  for why its probe lives in `store.ts` rather than here (no shared "never agent-facing" boundary to
 *  protect on that side, and no existing verify concept to extend). */
export function extractGitHubLogin(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const login = (body as Record<string, unknown>).login;
  return typeof login === "string" && login !== "" ? login : undefined;
}

/** Vercel's `/v2/user` nests the account under `user` and requires `username` on BOTH response
 *  shapes its own OpenAPI schema declares (the full shape and the token-scope-limited "limited"
 *  shape; checked 2026-08-16) — public by construction, the exact string Vercel uses in
 *  `vercel.com/<username>` URLs. Never `email`, `billing`, or `defaultTeamId`, none of which this
 *  function reads. */
function extractVercelUsername(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const user = (body as Record<string, unknown>).user;
  if (typeof user !== "object" || user === null) return undefined;
  const username = (user as Record<string, unknown>).username;
  return typeof username === "string" && username !== "" ? username : undefined;
}

/**
 * Providers whose success response carries a reviewed account-identity field this module knows how to
 * extract — see {@link extractGitHubLogin}/`extractVercelUsername` above and this file's own header
 * ("Two providers' checkers now read ONE named field…") for exactly which field, and why Netlify/
 * Cloudflare Pages/S3-compatible do not. MUST be kept in sync with {@link checkProviderCredential}'s
 * own per-provider extractor wiring below BY HAND — a provider belongs here iff its branch there
 * actually passes an `extractAccountLabel` argument to {@link probe}. Not derived structurally from
 * that dispatch chain on purpose: doing so would mean restructuring `checkProviderCredential` into a
 * data-driven table, and this pass's own scope is additive-only (an export, not a change to the
 * tested, reviewed verification path itself) — see this export's addition history for the "why not
 * refactor" call.
 *
 * Exported (2026-08-16) so a caller deciding whether an unhealed row is even WORTH probing
 * (`publish-credentials/account-label-heal-scheduler.ts`'s background backfill for pre-existing
 * `account_label: null` rows) can skip a provider that can never produce a label, instead of
 * re-deriving or duplicating this set.
 */
const PROVIDERS_WITH_ACCOUNT_LABEL: ReadonlySet<StaticPublishTargetId> = new Set<StaticPublishTargetId>(["github-pages", "vercel"]);

/** @complexity O(1) — one Set membership check. */
export function canYieldAccountLabel(target: StaticPublishTargetId): boolean {
  return PROVIDERS_WITH_ACCOUNT_LABEL.has(target);
}

/**
 * Runs one bounded, injectable-`fetchFn` request and folds a network-layer failure (DNS, TLS,
 * timeout, connection reset) into the same `"unreachable"` bucket a bad-but-answered response
 * would produce — never throws, matching every checker's own "never throws" contract below.
 *
 * @param extractAccountLabel - When supplied AND the response classifies as `ok`, the ONE place this
 *   module opens a success body: parses it as JSON and runs this extractor over it. Best-effort only
 *   — a body that fails to parse, or does not carry the expected field, degrades to no account label
 *   rather than failing the whole verification (a provider's exact success-body shape is not this
 *   module's contract to enforce). Omitted entirely for a provider with no reviewed field to read
 *   (Netlify, Cloudflare Pages — see this file's header), so those checkers never open the body at
 *   all, matching the pre-2026-08-16 behavior exactly.
 */
async function probe(fetchFn: typeof fetch, url: string, init: RequestInit, extractAccountLabel?: (body: unknown) => string | undefined): Promise<ProviderCredentialCheckResult> {
  let resp: Response;
  try {
    resp = await fetchFn(url, { ...init, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  const classified = classifyProviderResponse(resp);
  if (!classified.ok || extractAccountLabel === undefined) return classified;
  try {
    const body: unknown = await resp.json();
    return { ok: true, accountLabel: extractAccountLabel(body) };
  } catch {
    return { ok: true };
  }
}

/** `GET /user` — the same "cheapest authenticated read" reasoning `composio-key-probe.ts`'s
 *  `PROBE_PATH` doc gives for its own choice; GitHub's `/user` is its own documented "who am I"
 *  endpoint and returns 401 for a bad/revoked token, exactly the shape the live-reported bug needs
 *  distinguished from "unreachable". */
async function verifyGitHubPagesCredential(fetchFn: typeof fetch, token: string): Promise<ProviderCredentialCheckResult> {
  return probe(fetchFn, "https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }, extractGitHubLogin);
}

async function verifyVercelCredential(fetchFn: typeof fetch, token: string): Promise<ProviderCredentialCheckResult> {
  return probe(fetchFn, "https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${token}` } }, extractVercelUsername);
}

async function verifyNetlifyCredential(fetchFn: typeof fetch, token: string): Promise<ProviderCredentialCheckResult> {
  // No extractor: Netlify's own OpenAPI schema for this endpoint (checked 2026-08-16) carries no
  // public handle/slug field — only `email`/`full_name`, both excluded by this file's own privacy
  // rule — so there is nothing safe here to read.
  return probe(fetchFn, "https://api.netlify.com/api/v1/user", { headers: { Authorization: `Bearer ${token}` } });
}

/** Cloudflare's own purpose-built token-verify endpoint (`/user/tokens/verify`) rather than a generic
 *  `/user` read — chosen because it is documented to work for a scoped API token specifically (the
 *  credential type this form actually collects), where a broader `/user` read can require account-
 *  level scopes a narrowly-scoped Pages token may not carry, which would misreport a perfectly good
 *  token as "rejected". */
async function verifyCloudflarePagesCredential(fetchFn: typeof fetch, token: string): Promise<ProviderCredentialCheckResult> {
  return probe(fetchFn, "https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: { Authorization: `Bearer ${token}` } });
}

/**
 * SigV4-signed `HEAD` on the bucket root (`HeadBucket`, the standard S3-API bucket-access check) —
 * signed via `aws4fetch`'s `AwsClient`, the SAME dependency `static-publish/s3-compatible-target.ts`
 * already uses for real uploads (no new dependency). Uses `client.sign()` rather than `client.fetch()`
 * so the actual network call still goes through this module's own injectable `fetchFn` — `AwsClient`
 * has no `fetchFn` injection point of its own (verified: `aws4fetch`'s type declarations expose no
 * such option), so signing and fetching are deliberately split here to keep this checker as testable
 * as its four siblings.
 *
 * `deriveS3Endpoint` below is a deliberate small duplicate of `s3-compatible-target.ts`'s own
 * (unexported) `deriveEndpoint` helper of the same shape — that file has exactly one real consumer
 * today (a real publish) and this is a second, structurally distinct one (a HEAD probe, not a signed
 * PUT); mirroring three lines here reads more honestly than exporting a helper across a module
 * boundary neither file otherwise needs, the same "no second consumer yet" reasoning this codebase's
 * own package-boundary decisions already apply elsewhere.
 */
function deriveS3Endpoint(region: string): string {
  return `https://s3.${region}.amazonaws.com`;
}

async function verifyS3CompatibleCredential(
  fetchFn: typeof fetch,
  credential: { accessKeyId: string; secretAccessKey: string; bucket: string; region: string; endpoint?: string }
): Promise<ProviderCredentialCheckResult> {
  const client = new AwsClient({ accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey, service: "s3", region: credential.region });
  const host = (credential.endpoint?.trim() ? credential.endpoint : deriveS3Endpoint(credential.region)).replace(/\/+$/, "");
  const url = `${host}/${encodeURIComponent(credential.bucket)}`;

  let signed: Request;
  try {
    signed = await client.sign(url, { method: "HEAD", signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
  } catch {
    // Signing itself only fails on a malformed input (never a network call) — folded into the same
    // "could not verify" bucket a transport failure would produce, since neither says anything about
    // whether the access key/secret pair itself is good.
    return { ok: false, reason: "unreachable" };
  }

  let resp: Response;
  try {
    resp = await fetchFn(signed);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  return classifyProviderResponse(resp);
}

/** Dispatches to the matching per-provider checker above. `credential` is exactly
 *  `PublishCredentialSource['resolve']`'s own `ok: true` success shape (`./types.ts`) — this
 *  function never re-derives or re-validates those fields, since `resolve()` already guarantees them
 *  for a given `target` (e.g. `s3-compatible` always carries `accessKeyId`/`bucket`/`region`). */
async function checkProviderCredential(
  fetchFn: typeof fetch,
  target: StaticPublishTargetId,
  credential: { readonly token: string; readonly accessKeyId?: string; readonly bucket?: string; readonly region?: string; readonly endpoint?: string }
): Promise<ProviderCredentialCheckResult> {
  if (target === "github-pages") return verifyGitHubPagesCredential(fetchFn, credential.token);
  if (target === "vercel") return verifyVercelCredential(fetchFn, credential.token);
  if (target === "netlify") return verifyNetlifyCredential(fetchFn, credential.token);
  if (target === "cloudflare-pages") return verifyCloudflarePagesCredential(fetchFn, credential.token);
  // target === "s3-compatible" — `resolve()`'s own contract guarantees these three fields for this
  // target (`static-publish/types.ts`'s `PublishCredentialSource.resolve()` doc); `token` carries
  // `secretAccessKey` for this target specifically, per that same doc.
  return verifyS3CompatibleCredential(fetchFn, {
    accessKeyId: credential.accessKeyId ?? "",
    secretAccessKey: credential.token,
    bucket: credential.bucket ?? "",
    region: credential.region ?? "",
    ...(credential.endpoint !== undefined ? { endpoint: credential.endpoint } : {}),
  });
}

/** The 3 providers with a name that isn't just their target id capitalized — every other target
 *  (`vercel`, `netlify`) falls through to the capitalized-id default in {@link providerLabel}. */
const PROVIDER_DISPLAY_LABELS: Partial<Record<StaticPublishTargetId, string>> = {
  "github-pages": "GitHub",
  "cloudflare-pages": "Cloudflare",
  "s3-compatible": "the storage provider",
};

function providerLabel(target: StaticPublishTargetId): string {
  return PROVIDER_DISPLAY_LABELS[target] ?? target[0]!.toUpperCase() + target.slice(1);
}

/** The optional `(HTTP <code>)` suffix shared by both failure messages in {@link buildVerificationMessage}. */
function statusCodeSuffix(statusCode: number | undefined): string {
  return statusCode ? ` (HTTP ${statusCode})` : "";
}

/** Human-facing text for one check outcome — built centrally (not per-checker) so every provider's
 *  wording stays consistent, and so no checker needs to know how its own result will be phrased.
 *  Never includes the credential, a raw response body, or any request/account detail beyond a bare
 *  HTTP status — see this file's header for why that boundary matters even for a CACHED result. */
function buildVerificationMessage(target: StaticPublishTargetId, check: ProviderCredentialCheckResult): string {
  const label = providerLabel(target);
  if (check.ok) return `${label} accepted this credential.`;
  if (check.reason === "rejected") {
    return `${label} rejected this credential${statusCodeSuffix(check.statusCode)} — it is invalid, expired, or missing the required permissions.`;
  }
  return `Could not reach ${label} to verify this credential${statusCodeSuffix(check.statusCode)} — this does not necessarily mean the credential is bad.`;
}

/** One cached verification outcome. Never carries the credential, its ciphertext, or any raw
 *  provider response — see this file's header. `status` is the enforced three-way boundary contract
 *  (never a boolean) — `"unreachable"` must stay distinguishable from `"invalid"` at every layer that
 *  reads this, all the way out to the agent-facing capabilities tool. */
export interface PublishCredentialVerificationResult {
  readonly status: "valid" | "invalid" | "unreachable";
  readonly message: string;
  readonly checkedAt: string;
  /** The verified account's public login/username — GitHub `login`, Vercel `username` — present only
   *  on a `"valid"` result for a provider whose success response carries one (see this file's header
   *  for exactly which, and why). Never an email, plan, or org — the ONE field this module's
   *  otherwise-total "never reads the response body" rule makes a deliberate, scoped exception for.
   *  `publish-agent-tools.ts`'s capabilities handler surfaces this so the agent can default a
   *  github-pages publish's `owner` to it instead of guessing (2026-08-16, Defect 1). */
  readonly accountLabel?: string;
}

/**
 * Read/write surface for cached verification results, keyed by `(workspaceId, target)` — the SAME
 * granularity `PublishCredentialSource.isConfigured()` already uses, deliberately NOT by credential
 * row id (see this feature's design doc for why: it unifies the DB-backed and env-var-fallback
 * paths under one mechanism, since an env-sourced credential has no row to key by id but does have a
 * `target`). `publish-agent-tools.ts`'s capabilities handler only ever calls {@link get} — never
 * {@link set}, which only {@link verifyPublishCredential} (and its human-gated callers) may reach.
 */
export interface PublishCredentialVerificationCache {
  get(input: { workspaceId: UUID; target: StaticPublishTargetId }): PublishCredentialVerificationResult | undefined;
  set(input: { workspaceId: UUID; target: StaticPublishTargetId }, result: PublishCredentialVerificationResult): void;
  /** Clears a cached result — called when `resolve()` reports no credential at all, so a STALE
   *  verification from a since-deleted/replaced credential can never keep reporting `ready: true`
   *  for a target that currently has nothing configured. */
  delete(input: { workspaceId: UUID; target: StaticPublishTargetId }): void;
}

/**
 * The real, in-process implementation — a plain `Map`, no TTL/expiry (see this feature's design doc
 * for why: an auto-expiring cache would make `ready` flip back to `false` from time alone, which
 * reads as flakiness; `checkedAt` lets a caller judge staleness itself instead). Lost on process
 * restart — an accepted trade-off, see the same doc.
 *
 * @complexity O(1) per operation — a single `Map` key lookup/write.
 * @overallScore 100
 */
export class InMemoryPublishCredentialVerificationCache implements PublishCredentialVerificationCache {
  private readonly entries = new Map<string, PublishCredentialVerificationResult>();

  private static key(input: { workspaceId: UUID; target: StaticPublishTargetId }): string {
    return `${input.workspaceId}::${input.target}`;
  }

  get(input: { workspaceId: UUID; target: StaticPublishTargetId }): PublishCredentialVerificationResult | undefined {
    return this.entries.get(InMemoryPublishCredentialVerificationCache.key(input));
  }

  set(input: { workspaceId: UUID; target: StaticPublishTargetId }, result: PublishCredentialVerificationResult): void {
    this.entries.set(InMemoryPublishCredentialVerificationCache.key(input), result);
  }

  delete(input: { workspaceId: UUID; target: StaticPublishTargetId }): void {
    this.entries.delete(InMemoryPublishCredentialVerificationCache.key(input));
  }
}

/** Shared tail of both entry points below: runs the provider check and stamps `checkedAt` — kept as
 *  one function so a THIRD entry point can never accidentally build this result shape differently. */
async function computeVerificationResult(
  fetchFn: typeof fetch,
  target: StaticPublishTargetId,
  credential: { readonly token: string; readonly accessKeyId?: string; readonly bucket?: string; readonly region?: string; readonly endpoint?: string },
  clock: { nowIso(): string }
): Promise<PublishCredentialVerificationResult> {
  const check = await checkProviderCredential(fetchFn, target, credential);
  const status = check.ok ? "valid" : check.reason === "rejected" ? "invalid" : "unreachable";
  return {
    status,
    message: buildVerificationMessage(target, check),
    checkedAt: clock.nowIso(),
    ...(check.ok && check.accountLabel !== undefined ? { accountLabel: check.accountLabel } : {}),
  };
}

/** Maps a decrypted `PublishConnectionInput` (`publish-credentials/types.ts`) to the plain shape
 *  {@link computeVerificationResult} needs — the s3-compatible branch reuses the SAME "`token` field
 *  carries `secretAccessKey`" convention `static-publish/credentials.ts`'s
 *  `createDbPublishCredentialSource.resolve()` already establishes for the identical reason (see that
 *  function's own doc comment), so both resolution paths hand this module the exact same shape. */
function toCheckableCredential(connection: PublishConnectionInput): { token: string; accessKeyId?: string; bucket?: string; region?: string; endpoint?: string } {
  if (connection.providerId === "s3-compatible") {
    return {
      token: connection.secretAccessKey,
      accessKeyId: connection.accessKeyId,
      bucket: connection.bucket,
      region: connection.region,
      ...(connection.endpoint !== undefined ? { endpoint: connection.endpoint } : {}),
    };
  }
  return { token: connection.token };
}

export interface VerifyPublishCredentialDeps {
  /** The COMPOSED source (DB-first, env-fallback) — the same one a real publish resolves against, so
   *  this verifies whichever credential would actually be used. Decrypts; see this file's header for
   *  why only THIS module and a real publish may call its `resolve()`. */
  readonly credentialSource: PublishCredentialSource;
  readonly cache: PublishCredentialVerificationCache;
  readonly clock: { nowIso(): string };
  /** Injected by tests; defaults to global `fetch`. Never the DB-scoped `fetchFn` itself. */
  readonly fetchFn?: typeof fetch;
}

/**
 * Resolves whichever credential a real publish to `input.target` would use, makes one bounded,
 * read-only authenticated request against that provider, and caches the outcome under `(workspaceId,
 * target)` — this is what `deployment_get_static_publish_capabilities`'s `ready`/`verified` fields
 * read. The ONE non-test caller of this module allowed to trigger it is a human action (the admin
 * credential-CRUD route, after a save, or via an explicit "Verify" trigger) — never an agent tool.
 *
 * @returns The freshly-computed result (also now cached). `null` when no credential is configured at
 *   all — clears any stale cached entry and makes NO network call, matching
 *   {@link verifyPublishCredentialById}'s own "nothing to verify" contract for a missing row.
 *   Deliberately not folded into `status: "invalid"`/`"unreachable"`: neither word honestly describes
 *   "there was nothing here to check" (see this file's header on why the three real states must stay
 *   distinct from each other — the same discipline extends to not inventing a fourth, misleading one
 *   for this case).
 * @complexity O(1) — one `resolve()` call (one repo read plus, for a DB-backed credential, one
 *   decrypt) plus one bounded outbound HTTP request.
 * @overallScore 100
 */
export async function verifyPublishCredential(
  deps: VerifyPublishCredentialDeps,
  input: { workspaceId: UUID; target: StaticPublishTargetId }
): Promise<PublishCredentialVerificationResult | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const resolved = await deps.credentialSource.resolve(input);
  if (!resolved.ok) {
    deps.cache.delete(input);
    return null;
  }

  const result = await computeVerificationResult(fetchFn, input.target, resolved, deps.clock);
  deps.cache.set(input, result);
  return result;
}

export interface VerifyPublishCredentialByIdDeps {
  readonly repo: PublishCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly cache: PublishCredentialVerificationCache;
  readonly clock: { nowIso(): string };
  readonly fetchFn?: typeof fetch;
}

/**
 * Verifies ONE specific saved connection by id — what the admin's per-row "Verify" action and the
 * post-save check both actually mean ("check the thing I just clicked/saved"), distinct from
 * {@link verifyPublishCredential}'s "check whichever credential is currently active for this target"
 * (which always resolves the group's DEFAULT — Contract v2 Correction B — regardless of which row a
 * caller has in mind).
 *
 * Only updates the `(workspaceId, target)` cache — the one `deployment_get_static_publish_
 * capabilities` reads — when `id` IS its provider's current default. A non-default row's result is
 * still computed and returned (so the human sees an honest answer for the row they actually asked
 * about), but never overwrites the `ready` signal for a DIFFERENT, unrelated row sharing the same
 * provider — verifying a second, non-default GitHub Pages connection must never make an unrelated
 * default connection's `ready` state flip based on the wrong row's outcome.
 *
 * @returns `null` if no row exists for `(workspaceId, id)` — the caller (the admin route) is
 *   expected to have already checked existence and map this to its own 404, matching
 *   `resolveForPublish`'s own "no such row is `null`, not thrown" contract.
 * @complexity O(1) — two independent repo reads (`findById` for the `isDefault` flag,
 *   `resolveForPublish` for the decrypt) run concurrently, plus one bounded outbound HTTP request.
 * @overallScore 100
 */
export async function verifyPublishCredentialById(
  deps: VerifyPublishCredentialByIdDeps,
  input: { workspaceId: UUID; id: UUID }
): Promise<PublishCredentialVerificationResult | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const [record, resolved] = await Promise.all([deps.repo.findById(input), resolveForPublish({ repo: deps.repo, sealer: deps.sealer }, input)]);
  if (!record || !resolved) return null;

  const result = await computeVerificationResult(fetchFn, resolved.providerId, toCheckableCredential(resolved.connection), deps.clock);
  if (record.isDefault) {
    deps.cache.set({ workspaceId: input.workspaceId, target: resolved.providerId }, result);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GitHub repo-list probe — the account-label probe's natural sibling: `extractGitHubLogin` answers
// "who does this token belong to" against `GET /user`; this answers "what repos can this token see"
// against `GET /user/repos`, for the SAME resolve-then-probe shape `verifyPublishCredentialById`
// already uses (2026-08-16, added for `source-control-ui`'s GitHub owner/repo picker — see
// `server/routes/admin/system/publish-credentials.ts`'s own `GET .../:id/repos` route, which this
// function backs). Purpose: the picker replaces two free-text `GITHUB OWNER OR ORG`/`REPOSITORY`
// inputs — the exact guess-prone shape `development/e2e/live-publish-e2e.spec.ts`'s assertion #2
// exists to guard against (the original production bug was an invented account name) — with a
// dropdown built from the credential's own real, reachable repos.
// ---------------------------------------------------------------------------

/** One repository this credential's token can see — the closed, minimal projection the picker needs.
 *  Never any other field GitHub's response carries (no `html_url`, no `description`, no `topics`,
 *  none of which the picker asked for and none of which this module has reviewed for safety to
 *  surface to an agent-adjacent UI). */
export interface GitHubRepoSummary {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

/** Same three-way status this file's own `PublishCredentialVerificationResult` already enforces (see
 *  that interface's own doc for why `"unreachable"` must never collapse into `"invalid"`) — this
 *  probe reuses the identical `classifyProviderResponse` this file's other checkers already share,
 *  so the two enums stay meaningfully the same thing, not merely the same shape. */
export interface ListGitHubReposResult {
  readonly status: "valid" | "invalid" | "unreachable";
  /** Present only for `"invalid"`/`"unreachable"` — a `"valid"` result needs no explanation, matching
   *  this field's own optionality (contrast `PublishCredentialVerificationResult.message`, always
   *  present, since that type's caller always renders a status line regardless of outcome). */
  readonly message?: string;
  readonly repos: readonly GitHubRepoSummary[];
  /** `true` iff there is real evidence this account has more repos than the one page fetched (a
   *  `Link: rel="next"` header, or — defensively, in case a proxy/cache ever strips that header —
   *  the page came back exactly full). Reporting this honestly is the whole point: a silently
   *  truncated 100-repo page presented as complete is the same class of defect as the invented
   *  account name this picker exists to replace (team brief, verbatim). */
  readonly truncated: boolean;
}

/** One page, 100 repos, owner + org-member affiliation, most-recently-updated first — matches the
 *  agreed contract with `route-quality`'s admin route adapter exactly. */
const GITHUB_REPOS_PER_PAGE = 100;
const GITHUB_REPOS_URL = `https://api.github.com/user/repos?affiliation=owner,organization_member&sort=updated&per_page=${GITHUB_REPOS_PER_PAGE}`;

/** Best-effort per-entry extraction, matching this file's own "never trust an unreviewed response
 *  shape blindly" discipline (see {@link probe}'s own `extractAccountLabel` doc): a malformed or
 *  unexpectedly-shaped entry is DROPPED, never allowed to crash the whole listing or smuggle an
 *  unreviewed field through. GitHub's REST API has documented `name`/`full_name`/`owner.login`/
 *  `private`/`default_branch` fields on every repo object; this only reads those five.
 *
 * @complexity O(1) per entry.
 */
/** Resolves the nested `owner.login` field, or `undefined` if `owner` isn't itself an object. */
function readGitHubRepoOwnerLogin(value: Record<string, unknown>): unknown {
  const owner = value.owner;
  if (typeof owner !== "object" || owner === null) return undefined;
  return (owner as Record<string, unknown>).login;
}

/** Narrows the five raw fields to {@link GitHubRepoSummary}'s exact shape, or `undefined` if any of
 *  them doesn't match GitHub's documented type — split out of {@link extractGitHubRepoSummary} so
 *  that function only needs to unwrap the raw object and resolve the nested owner login. */
function buildGitHubRepoSummary(
  name: unknown,
  fullName: unknown,
  owner: unknown,
  isPrivate: unknown,
  defaultBranch: unknown
): GitHubRepoSummary | undefined {
  if (typeof name !== "string" || typeof fullName !== "string" || typeof owner !== "string" || typeof isPrivate !== "boolean" || typeof defaultBranch !== "string") {
    return undefined;
  }
  return { owner, name, fullName, private: isPrivate, defaultBranch };
}

function extractGitHubRepoSummary(raw: unknown): GitHubRepoSummary | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  return buildGitHubRepoSummary(value.name, value.full_name, readGitHubRepoOwnerLogin(value), value.private, value.default_branch);
}

/** `true` iff GitHub's own pagination `Link` header names a `rel="next"` page — the authoritative
 *  signal, checked first. Falls back to "the page came back exactly full" only when that header is
 *  absent, so a stripped/rewritten header (a caching proxy, a test double) cannot silently downgrade
 *  a truncated result to `truncated: false` — {@link ListGitHubReposResult.truncated}'s own doc
 *  explains why under-reporting this is the worse failure mode.
 *
 * @complexity O(1) — one header read, one regex test.
 */
function hasMoreGitHubRepoPages(resp: Response, fetchedCount: number): boolean {
  const link = resp.headers.get("link");
  if (link !== null) return /rel="next"/.test(link);
  return fetchedCount >= GITHUB_REPOS_PER_PAGE;
}

/** The bounded, injectable-`fetchFn` GitHub request itself — mirrors {@link probe}'s own
 *  never-throws contract (a network failure folds into `"unreachable"`) but cannot reuse that
 *  function directly: `probe` reads at most ONE named field out of a JSON *object*, and this needs
 *  the whole repo *array* plus a response header, two things `probe`'s own signature has no seam
 *  for.
 *
 * @complexity One bounded HTTP request, O(n) over the returned page mapping each entry through
 *   {@link extractGitHubRepoSummary}.
 */
async function fetchGitHubRepos(fetchFn: typeof fetch, token: string): Promise<ListGitHubReposResult> {
  let resp: Response;
  try {
    resp = await fetchFn(GITHUB_REPOS_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch {
    return { status: "unreachable", repos: [], truncated: false };
  }

  const classified = classifyProviderResponse(resp);
  if (!classified.ok) {
    return {
      status: classified.reason === "rejected" ? "invalid" : "unreachable",
      message: buildVerificationMessage("github-pages", classified),
      repos: [],
      truncated: false,
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    // An authenticated 2xx with an unparseable body says nothing about the credential itself — same
    // "this module's own contract to enforce stops at HTTP status" posture `probe`'s own doc states.
    return { status: "unreachable", message: "GitHub's response could not be read.", repos: [], truncated: false };
  }
  const rawRepos = Array.isArray(body) ? body : [];
  const repos = rawRepos.map(extractGitHubRepoSummary).filter((repo): repo is GitHubRepoSummary => repo !== undefined);

  return { status: "valid", repos, truncated: hasMoreGitHubRepoPages(resp, rawRepos.length) };
}

export interface ListGitHubReposByCredentialIdDeps {
  readonly repo: PublishCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  /** Injected by tests; defaults to global `fetch`. */
  readonly fetchFn?: typeof fetch;
}

/**
 * Lists every repository (owner + org-member affiliation) reachable by ONE specific saved
 * `github-pages` credential's token — what `server/routes/admin/system/publish-credentials.ts`'s
 * `GET .../:id/repos` route actually means. Same resolve-then-probe shape
 * {@link verifyPublishCredentialById} already uses, deliberately not reusing that function itself:
 * this never writes to {@link PublishCredentialVerificationCache} (a repo listing is not a
 * verification outcome — the two must not be conflated, and a route that only wants a repo list
 * should not have a side effect on `ready`/`verified` state as an accident of implementation reuse).
 *
 * The caller (`route-quality`'s route) is expected to have already confirmed `providerId ===
 * "github-pages"` via `describeCredential` before ever calling this — so `resolved.connection` here
 * is always a `GitHubPagesConnectionInput`. Checked with a thrown error rather than a null/silent
 * skip: a caller reaching this function with the wrong provider is a wiring bug in ITS OWN pre-check,
 * not a "not found" or "not configured" outcome this function's own return type should have to
 * express.
 *
 * @returns `null` if no row exists for `(workspaceId, id)` — matches `resolveForPublish`'s own "no
 *   such row is `null`, not thrown" contract, same as {@link verifyPublishCredentialById}.
 * @throws {@link PublishCredentialSecretStoreUnconfiguredError} A genuine decrypt failure — left to
 *   throw uncaught, exactly like {@link resolveForPublish}'s own documented contract; the caller's
 *   route-level `try`/`catch` maps this the same way it already does for every other credential read.
 * @complexity O(1) repo reads/decrypt plus one bounded outbound HTTP request, O(n) over the returned
 *   page.
 */
export async function listGitHubReposByCredentialId(
  deps: ListGitHubReposByCredentialIdDeps,
  input: { workspaceId: UUID; id: UUID }
): Promise<ListGitHubReposResult | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const resolved = await resolveForPublish({ repo: deps.repo, sealer: deps.sealer }, input);
  if (!resolved) return null;

  // Narrows on `connection.providerId` (the discriminant `PublishConnectionInput`'s own variants key
  // on), not the record's top-level `providerId` field above it — the two always agree by the write
  // path's own invariant, but only the former is what TypeScript can actually narrow `resolved.
  // connection` on to reach `.token` below.
  if (resolved.connection.providerId !== "github-pages") {
    throw new Error(`listGitHubReposByCredentialId: credential '${input.id}' is a '${resolved.connection.providerId}' connection, not 'github-pages' — the caller must check this first.`);
  }

  return fetchGitHubRepos(fetchFn, resolved.connection.token);
}
