import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../../webhooks/index.js";
import { createDeployHostKit, DEPLOY_FETCH_TIMEOUTS } from "../deploy-targets/host-kit.js";
import type { DeployCredentialCheck, DeployHostKit, DeployTargetCredential, DeployTargetRegistry } from "../deploy-targets/types.js";
import { resolveForPublish } from "../publish-credentials/store.js";
import type { VendorCredentialSetRepoPort } from "../../vendor-credentials/types.js";
import { projectConnectionForPublish, toDeployTargetCredential } from "./credentials.js";
import type { PublishCredentialSource, StaticPublishTargetId } from "./types.js";

/**
 * @file Verifies a static-publish credential against its REAL host — the fix for "ready means a
 * row exists, not a working credential" (2026-08-16, live-publish finding: a saved token the host
 * rejected outright with 401 still reported `ready: true`/`credentialsConfigured: true`).
 *
 * Purpose:
 * `PublishCredentialSource.isConfigured()` (`./types.ts`) only ever answers "does a row/env-var
 * exist" — deliberately, since it must never decrypt (see that interface's own header). This module
 * is the SECOND legitimate caller of `PublishCredentialSource.resolve()` (which DOES decrypt),
 * alongside a real publish attempt — never the agent-facing capabilities/preview tools
 * (`publish-agent-tools.ts`), which only ever read this module's CACHED, already-non-secret result.
 * See `ADS-memory/reports/2026-08-16-publish-correctness-findings.md`'s Defect B section for the
 * full design reasoning, including why this caches in-memory rather than adding a DB column/migration.
 *
 * The request itself belongs to the host: each deploy module (shipped in the `deploy` Agent Plugin,
 * loaded through the workspace's deploy registry) exports `verifyCredential`, which makes ONE
 * lightweight, read-only, authenticated request against its own API and returns a
 * {@link DeployCredentialCheck}. This module resolves whichever credential a REAL publish would use,
 * hands it to that check, and caches only the outcome (`status`/`message`/`checkedAt`, plus a public
 * `accountLabel`) — never the credential itself, and never the host's raw response body.
 *
 * `PublishCredentialVerificationResult.status` is a closed THREE-way enum
 * (`"valid" | "invalid" | "unreachable"`), never a plain boolean — a hard requirement from code
 * review: `"unreachable"` (a network failure, timeout, or host 5xx) must never collapse into the same
 * shape as `"invalid"` (the host affirmatively rejected the credential), because the two demand
 * opposite guidance: try again later vs. replace the credential.
 *
 * `accountLabel` (2026-08-16, Defect 1: "the assistant has to guess the owner") is the ONE body field
 * a check may read back, and only a host whose descriptor sets `yieldsAccountLabel`: the account's
 * public handle, which a real publish is about to print in a public URL anyway. Never an email,
 * plan, billing or org membership.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic. `publish-agent-tools.ts`'s capabilities
 * handler reads `PublishCredentialVerificationCache.get()` directly (a plain in-memory lookup, no
 * decrypt, no network call) — it must NEVER call `verifyPublishCredential` itself. Only human-gated
 * callers (the admin credential-CRUD route) may call `verifyPublishCredential`.
 */

/** One bounded probe per host. Short because a human is waiting on a form submit or an explicit
 *  "Verify" click, not a background job. Handed to modules as their kit's `QUICK` timeout. */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Whether a saved credential for `target` can ever produce an `accountLabel`, per the host's declared
 * `yieldsAccountLabel`. Lets `publish-credentials/account-label-heal-scheduler.ts`'s background
 * backfill skip a host that never can, instead of probing it on every list.
 *
 * @complexity O(1) — one registry lookup.
 */
export function canYieldAccountLabel(registry: DeployTargetRegistry, target: StaticPublishTargetId): boolean {
  return registry.get(target)?.descriptor.credential?.yieldsAccountLabel === true;
}

/** The optional `(HTTP <code>)` suffix shared by both failure messages in {@link buildVerificationMessage}. */
function statusCodeSuffix(statusCode: number | undefined): string {
  return statusCode ? ` (HTTP ${statusCode})` : "";
}

/** Human-facing text for one check outcome — built centrally (not per module) so every host's
 *  wording stays consistent. Never includes the credential, a raw response body, or any
 *  request/account detail beyond a bare HTTP status. */
function buildVerificationMessage(label: string, check: DeployCredentialCheck): string {
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

/** What {@link computeVerificationResult} needs to run one host's check. */
interface VerificationContext {
  readonly registry: DeployTargetRegistry;
  readonly kit: DeployHostKit;
  readonly clock: { nowIso(): string };
}

/** The kit a check runs with: `fetchFn` (tests) and a `QUICK` timeout sized for a waiting human. */
function verificationKit(deps: { readonly fetchFn?: typeof fetch; readonly hostKit?: DeployHostKit }): DeployHostKit {
  return deps.hostKit ?? createDeployHostKit({ ...(deps.fetchFn !== undefined ? { fetchFn: deps.fetchFn } : {}), timeouts: { ...DEPLOY_FETCH_TIMEOUTS, QUICK: VERIFY_TIMEOUT_MS } });
}

function noCheckReason(target: StaticPublishTargetId): string {
  return `no turned-on deploy plugin can check '${target}' credentials`;
}

/** An `unreachable` result for a credential nothing here could check (no module, no check, or a saved
 *  row missing its token field): not `invalid`, since no host said so. */
function cannotVerify(reason: string, clock: { nowIso(): string }): PublishCredentialVerificationResult {
  return { status: "unreachable", message: `Could not verify this credential: ${reason}.`, checkedAt: clock.nowIso() };
}

/**
 * Shared tail of both entry points below: runs the host's own check and stamps `checkedAt` — kept as
 * one function so a THIRD entry point can never build this result shape differently. A target with
 * no loaded module (its plugin is off or missing) or a module with no `verifyCredential` is
 * `unreachable` with a hint, since nothing here can say whether the credential is good. A check that
 * throws is `unreachable` too: a check never propagates an error.
 *
 * @complexity O(1) — one registry lookup plus the module's one bounded request.
 */
async function computeVerificationResult(
  context: VerificationContext,
  target: StaticPublishTargetId,
  credential: DeployTargetCredential
): Promise<PublishCredentialVerificationResult> {
  const loaded = context.registry.get(target);
  if (loaded?.module.verifyCredential === undefined) return cannotVerify(noCheckReason(target), context.clock);
  let check: DeployCredentialCheck;
  try {
    check = await loaded.module.verifyCredential({ credential, kit: context.kit });
  } catch {
    check = { ok: false, reason: "unreachable" };
  }
  const status = check.ok ? "valid" : check.reason === "rejected" ? "invalid" : "unreachable";
  return {
    status,
    message: buildVerificationMessage(loaded.descriptor.credential?.vendorLabel ?? loaded.descriptor.label, check),
    checkedAt: context.clock.nowIso(),
    ...(check.ok && check.accountLabel !== undefined ? { accountLabel: check.accountLabel } : {}),
  };
}

export interface VerifyPublishCredentialDeps {
  /** The COMPOSED source (DB-first, env-fallback) — the same one a real publish resolves against, so
   *  this verifies whichever credential would actually be used. Decrypts; see this file's header for
   *  why only THIS module and a real publish may call its `resolve()`. */
  readonly credentialSource: PublishCredentialSource;
  readonly cache: PublishCredentialVerificationCache;
  readonly clock: { nowIso(): string };
  /** This workspace's deploy registry: whose module checks the credential. */
  loadDeployTargets(workspaceId: string): Promise<DeployTargetRegistry>;
  /** Injected by tests; defaults to global `fetch`. Never the DB-scoped `fetchFn` itself. */
  readonly fetchFn?: typeof fetch;
  /** Replaces the whole kit (tests); `fetchFn` is ignored when set. */
  readonly hostKit?: DeployHostKit;
}

/**
 * Resolves whichever credential a real publish to `input.target` would use, has that host's module
 * check it with one bounded, read-only authenticated request, and caches the outcome under
 * `(workspaceId, target)` — this is what `deployment_get_static_publish_capabilities`'s
 * `ready`/`verified` fields read. The ONE non-test caller of this module allowed to trigger it is a
 * human action (the admin credential-CRUD route, after a save, or via an explicit "Verify" trigger)
 * — never an agent tool.
 *
 * @returns The freshly-computed result (also now cached). `null` when no credential is configured at
 *   all — clears any stale cached entry and makes NO network call, matching
 *   {@link verifyPublishCredentialById}'s own "nothing to verify" contract for a missing row.
 *   Deliberately not folded into `status: "invalid"`/`"unreachable"`: neither word honestly describes
 *   "there was nothing here to check".
 * @complexity O(1) — one `resolve()` call (one repo read plus, for a DB-backed credential, one
 *   decrypt), one registry load, plus one bounded outbound HTTP request.
 */
export async function verifyPublishCredential(
  deps: VerifyPublishCredentialDeps,
  input: { workspaceId: UUID; target: StaticPublishTargetId }
): Promise<PublishCredentialVerificationResult | null> {
  const resolved = await deps.credentialSource.resolve(input);
  if (!resolved.ok) {
    deps.cache.delete(input);
    return null;
  }

  const context = { registry: await deps.loadDeployTargets(input.workspaceId), kit: verificationKit(deps), clock: deps.clock };
  const result = await computeVerificationResult(context, input.target, toDeployTargetCredential(resolved));
  deps.cache.set(input, result);
  return result;
}

export interface VerifyPublishCredentialByIdDeps {
  /** `vendor_credential_sets`, where saved publish credentials live. */
  readonly repo: VendorCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly cache: PublishCredentialVerificationCache;
  readonly clock: { nowIso(): string };
  /** This workspace's deploy registry: which saved field is the token, and whose module checks it. */
  loadDeployTargets(workspaceId: string): Promise<DeployTargetRegistry>;
  readonly fetchFn?: typeof fetch;
  readonly hostKit?: DeployHostKit;
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
 * provider.
 *
 * The decrypted connection is projected through the host's declared credential spec, the same
 * projection a real publish uses (`credentials.ts`'s `projectConnectionForPublish`), so the check sees
 * exactly what the module's `create` would.
 *
 * @returns `null` if no row exists for `(workspaceId, id)` — the caller (the admin route) is
 *   expected to have already checked existence and map this to its own 404, matching
 *   `resolveForPublish`'s own "no such row is `null`, not thrown" contract.
 * @complexity O(1) — one decrypting read (`resolveForPublish`), one registry load, plus one bounded
 *   outbound HTTP request.
 */
export async function verifyPublishCredentialById(
  deps: VerifyPublishCredentialByIdDeps,
  input: { workspaceId: UUID; id: UUID }
): Promise<PublishCredentialVerificationResult | null> {
  const resolved = await resolveForPublish(deps, input);
  if (!resolved) return null;

  const context = { registry: await deps.loadDeployTargets(input.workspaceId), kit: verificationKit(deps), clock: deps.clock };
  const spec = context.registry.get(resolved.providerId)?.descriptor.credential;
  const projected = spec === undefined ? undefined : projectConnectionForPublish(resolved.connection, spec);
  const result = projected?.ok
    ? await computeVerificationResult(context, resolved.providerId, toDeployTargetCredential(projected))
    : cannotVerify(projected?.reason ?? noCheckReason(resolved.providerId), deps.clock);
  if (resolved.isDefault) {
    deps.cache.set({ workspaceId: input.workspaceId, target: resolved.providerId }, result);
  }
  return result;
}
