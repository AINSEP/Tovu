import { AwsClient } from "aws4fetch";

import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../../../integrations/ports";
import { resolveForPublish } from "../publish-credentials/store";
import type { PublishConnectionInput, PublishCredentialSetRepoPort } from "../publish-credentials/types";
import type { PublishCredentialSource, StaticPublishTargetId } from "./types";

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
 *  `plan`, or org/team membership, none of which this function reads. */
function extractGitHubLogin(body: unknown): string | undefined {
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

/** Human-facing text for one check outcome — built centrally (not per-checker) so every provider's
 *  wording stays consistent, and so no checker needs to know how its own result will be phrased.
 *  Never includes the credential, a raw response body, or any request/account detail beyond a bare
 *  HTTP status — see this file's header for why that boundary matters even for a CACHED result. */
function buildVerificationMessage(target: StaticPublishTargetId, check: ProviderCredentialCheckResult): string {
  const providerLabel = target === "github-pages" ? "GitHub" : target === "cloudflare-pages" ? "Cloudflare" : target === "s3-compatible" ? "the storage provider" : target[0]!.toUpperCase() + target.slice(1);
  if (check.ok) return `${providerLabel} accepted this credential.`;
  if (check.reason === "rejected") return `${providerLabel} rejected this credential${check.statusCode ? ` (HTTP ${check.statusCode})` : ""} — it is invalid, expired, or missing the required permissions.`;
  return `Could not reach ${providerLabel} to verify this credential${check.statusCode ? ` (HTTP ${check.statusCode})` : ""} — this does not necessarily mean the credential is bad.`;
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
