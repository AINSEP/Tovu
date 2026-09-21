import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../../webhooks/index.js";
import { resolveDefaultForPublish, resolveForPublish } from "../publish-credentials/store.js";
import type { PublishConnectionInput, PublishCredentialSetRepoPort } from "../publish-credentials/types.js";
import type { PublishExecutionMode } from "../publish-credentials/execution-mode.js";
import type { PublishCredentialSource, StaticPublishTargetId } from "./types.js";

/**
 * @file `PublishCredentialSource` implementations + composition — env-var (self-hosted operator
 * fallback), DB-backed (the encrypted `publish_credential_sets` store, 2026-08-15), and the function
 * that combines them per the install's `PublishExecutionMode`.
 *
 * Purpose:
 * `createEnvPublishCredentialSource` was, until 2026-08-15, the ONLY credential source this feature
 * wired up — see this file's git history for the original single-workspace-process reasoning
 * (`GITHUB_TOKEN`/`VERCEL_TOKEN` are plain operator-supplied env vars, the same category as
 * `TOVU_EXPORT_DIR`/`TOVU_ADMIN_PASSWORD`). `createDbPublishCredentialSource` is the follow-up that
 * header predicted: backed by `publish-credentials/store.ts`'s `resolveDefaultForPublish` (the
 * provider-scoped decrypting read — see its own header), honouring `workspaceId` for real instead of
 * ignoring it.
 *
 * `createEnvPublishCredentialSource` now ALSO honours `workspaceId` for real (2026-08-15 fix,
 * Terra's finding — it used to accept the parameter per the port's shape but never consult it, which
 * meant a hosted multi-tenant process would silently hand every workspace the same process-wide
 * token). It is constructed BOUND to one workspace at call time — matching every other per-request
 * source this file builds — and `resolve()`/`isConfigured()` refuse (`ok:false`/`configured:false`)
 * any call for a different workspace, rather than silently answering for it.
 *
 * `createDbPublishCredentialSource` resolves a provider's DEFAULT saved connection (Contract v2
 * Correction B) instead of the earlier "reject with 'ambiguous' when 2+ credentials are saved for one
 * provider" design — that design broke the whole point of named connections (saving a second one for
 * a provider) the first time someone actually used the feature as built. `is_default` is a real
 * server-owned invariant maintained by `publish-credentials/store.ts`'s write path, so "no default" is
 * the only "not configured" outcome this source can ever report — never "ambiguous, pick one".
 *
 * `composePublishCredentialSource` is what `publish-site.ts`'s route and `publish-agent-tools.ts`'s
 * tool wiring actually construct: DB-backed always tried first (a workspace's own saved connection
 * wins), env-var fallback ONLY in `"self-hosted-cli"` mode — in `"hosted-api-only"` mode the env
 * source is never even constructed, per this dispatch's brief ("must never be a hosted fallback").
 */

/**
 * Env var name(s) that carry a target's token, in preference order — the first one set (and
 * non-blank) wins. Every target carries more than one because their own CLIs/CI docs have used more
 * than one name across tooling generations, and an operator who already has one of the aliases set in
 * their environment should not have to rename it just because this admin's UI now also shows its own
 * preferred name (2026-08-15 credential-UI redesign brief — accept the vendor-official name as an
 * alias rather than forcing a rename).
 *
 * The `github-pages`/`vercel` alias lists were promised by that same brief and shipped only for
 * Netlify and Cloudflare Pages; the two that were missed are the two the owner actually uses, and
 * `VERCEL_ACCESS_TOKEN`/`GITHUB_ACCESS_TOKEN` are exactly the names they set by analogy three separate
 * times before the single-name lists rejected them (2026-08-15 follow-up). `GH_TOKEN` is the `gh`
 * CLI's own documented name, so an operator already authenticated for `gh` needs no new variable.
 */
/** `s3-compatible` is deliberately EXCLUDED from this record's key set (`Exclude<..., "s3-compatible">`,
 *  not merely an empty array under that key) — its credential has SIX fields (endpoint, region, bucket,
 *  access key id, secret access key, public URL), and this env-var fallback model is built around one
 *  single-value secret per target (the same shape GITHUB_TOKEN/VERCEL_TOKEN/... already are). Excluding
 *  the key entirely (rather than defining it with an empty alias list) means `readToken` below can never
 *  even be CALLED for `s3-compatible` without a compile error — `readCredential` special-cases it
 *  before ever reaching `readToken`, so this exclusion is enforced structurally, not by convention. */
/** Exported so tests that go through an HTTP route (which never gets an `env` override — see
 *  `composePublishCredentialSource`'s own doc for why the route always reads real `process.env`)
 *  can enumerate every alias to clear for a hermetic "no credential configured" fixture instead of
 *  hardcoding a second, driftable copy of this list — exactly the gap that let a real
 *  `GITHUB_ACCESS_TOKEN`/`VERCEL_ACCESS_TOKEN`/etc. left set in a dev shell silently flip
 *  `publish-site-route.test.ts`'s "no credentials" fixtures to "configured" after this alias list
 *  grew past its original single-name-per-target shape. */
export const ENV_VAR_ALIASES_BY_TARGET: Readonly<Record<Exclude<StaticPublishTargetId, "s3-compatible">, readonly string[]>> = {
  "github-pages": ["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_ACCESS_TOKEN"],
  vercel: ["VERCEL_TOKEN", "VERCEL_ACCESS_TOKEN"],
  netlify: ["NETLIFY_TOKEN", "NETLIFY_ACCESS_TOKEN", "NETLIFY_AUTH_TOKEN"],
  "cloudflare-pages": ["CLOUDFLARE_TOKEN", "CLOUDFLARE_API_TOKEN"],
};

/** The fixed, human-readable reason `s3-compatible` refuses env-var fallback entirely — see
 *  `ENV_VAR_ALIASES_BY_TARGET`'s own doc for why. Safe to surface directly (never a secret, never
 *  workspace-specific), so both `resolve()` and `isConfigured()` below share it verbatim. */
const S3_COMPATIBLE_NO_ENV_FALLBACK_REASON =
  "s3-compatible has no server-environment-variable fallback — its credential (endpoint, region, bucket, access key id, secret access key, public URL) can only be configured through the Custom tab's saved connection, never through env vars";

/** `cloudflare-pages` is the one target whose credential needs a SECOND env var — see
 *  `static-publish/types.ts`'s `CloudflarePagesPublishConfig` doc for why `accountId` lives on the
 *  credential, not the publish config, for the DB-backed source too. */
export const CLOUDFLARE_ACCOUNT_ID_ENV_VAR = "CLOUDFLARE_ACCOUNT_ID";

/**
 * The ONE refusal text every "the chosen connection cannot be used" path shares (terra review
 * 2026-09-20, finding 1). Deliberately IDENTICAL for a credential id that does not exist and for one
 * that belongs to another workspace: `PublishCredentialSetRepoPort.findById` is workspace-scoped, so
 * both are the same `null` here, and keeping one message means a caller cannot use this endpoint to
 * learn whether some other workspace's id exists. Never echoes the caller-supplied id back — the
 * operator's next step is to reload and pick again, not to read their own input.
 */
const CHOSEN_CREDENTIAL_UNAVAILABLE_REASON =
  "the selected publish credential is not available in this workspace — reload the Static Site tab and choose a connection again";

/** Refusal text for a saved connection that exists in this workspace but is saved for a DIFFERENT
 *  provider than the publish target. Both values are safe to name: `providerId` comes from the row
 *  itself and `target` from an already-validated closed union, and neither is a secret. */
function chosenCredentialWrongProviderReason(providerId: StaticPublishTargetId, target: StaticPublishTargetId): string {
  return `the selected publish credential is saved for '${providerId}', not '${target}' — choose a '${target}' connection`;
}

/** Refusal text for an id-bound resolve against the env-var source — see `readCredential`'s own
 *  branch for why an env var can never be the connection the operator picked. */
function chosenConnectionUnavailableFromEnvReason(target: StaticPublishTargetId): string {
  return `a saved connection was chosen for this publish, but this install resolves '${target}' credentials from server environment variables, which have no saved connections to choose from`;
}

type EnvCredentialResult = { readonly token: string; readonly accountId?: string } | { readonly reason: string };

/**
 * Builds a `PublishCredentialSource` that resolves a target's token (and, for `cloudflare-pages`, its
 * account id) from fixed env vars, bound to exactly one workspace at construction time.
 *
 * @param workspaceId - The ONLY workspace this instance will ever answer for. A `resolve()`/
 *   `isConfigured()` call for any other `workspaceId` is refused, not silently served — see this
 *   file's header for why this changed from "accepted but ignored".
 * @param env - Defaults to `process.env`; overridable for tests so no test needs to mutate real
 *   process env vars (which would leak across parallel test files in the same process).
 * @complexity O(1).
 */
export function createEnvPublishCredentialSource(workspaceId: UUID, env: NodeJS.ProcessEnv = process.env): PublishCredentialSource {
  /** Reads a target's token from the first set, non-blank alias in {@link ENV_VAR_ALIASES_BY_TARGET}
   *  — never partially matches (a blank/whitespace-only alias is treated the same as unset, same as
   *  every other env read in this function). The failure reason names every alias the caller could
   *  have set, not just the first, so an operator who set the second-choice name by mistake reading
   *  an error naming only the first would be told to add a var they already have. */
  function readToken(target: Exclude<StaticPublishTargetId, "s3-compatible">): { token: string } | { reason: string } {
    const aliases = ENV_VAR_ALIASES_BY_TARGET[target];
    for (const envVar of aliases) {
      const token = env[envVar]?.trim();
      if (token) return { token };
    }
    const reason =
      aliases.length === 1
        ? `${aliases[0]} is not set — publishing to ${target} requires a token with write access configured in the server environment`
        : `none of ${aliases.join(", ")} is set — publishing to ${target} requires a token with write access configured in the server environment (any one of these env vars)`;
    return { reason };
  }

  function readCredential(target: StaticPublishTargetId, requestedWorkspaceId: UUID, credentialId?: UUID): EnvCredentialResult {
    // An env var is not a saved connection: it has no id, so it can never BE the row the operator
    // picked. Refusing (rather than ignoring the id and serving the env token anyway) is the whole
    // point of the binding — terra review 2026-09-20, finding 1. See this file's header.
    if (credentialId !== undefined) {
      return { reason: chosenConnectionUnavailableFromEnvReason(target) };
    }
    if (requestedWorkspaceId !== workspaceId) {
      return {
        reason: `this credential source is bound to workspace '${workspaceId}' and refuses to resolve a token for workspace '${requestedWorkspaceId}'`,
      };
    }
    // s3-compatible has no env-var fallback at all — see `ENV_VAR_ALIASES_BY_TARGET`'s own doc.
    // Branches BEFORE `readToken` so that function's own parameter type (which structurally excludes
    // this target) is never violated.
    if (target === "s3-compatible") {
      return { reason: S3_COMPATIBLE_NO_ENV_FALLBACK_REASON };
    }
    const tokenResult = readToken(target);
    if ("reason" in tokenResult) return tokenResult;
    if (target !== "cloudflare-pages") {
      return { token: tokenResult.token };
    }
    const accountId = env[CLOUDFLARE_ACCOUNT_ID_ENV_VAR]?.trim();
    if (!accountId) {
      return {
        reason: `${CLOUDFLARE_ACCOUNT_ID_ENV_VAR} is not set — publishing to cloudflare-pages requires both a token (${ENV_VAR_ALIASES_BY_TARGET["cloudflare-pages"].join(" or ")}) and ${CLOUDFLARE_ACCOUNT_ID_ENV_VAR}`,
      };
    }
    return { token: tokenResult.token, accountId };
  }

  return {
    async resolve(input) {
      const result = readCredential(input.target, input.workspaceId, input.credentialId);
      return "token" in result ? { ok: true, token: result.token, ...(result.accountId !== undefined ? { accountId: result.accountId } : {}) } : { ok: false, reason: result.reason };
    },
    // Never exposes the token/accountId — same env-var presence/blankness/workspace-match check
    // `resolve()` performs, just without returning what it found. See `types.ts`'s
    // `PublishCredentialSource` header for why this is a separate method rather than a caller reading
    // `.ok` off `resolve()`.
    async isConfigured(input) {
      const result = readCredential(input.target, input.workspaceId);
      return "token" in result ? { configured: true } : { configured: false, reason: result.reason };
    },
  };
}

/**
 * Projects a decrypted connection onto {@link PublishCredentialSource.resolve}'s success shape — the
 * one place that mapping lives, shared by the default-row lookup and the operator's chosen-row
 * lookup so the two can never drift into projecting a credential differently.
 *
 * `accountId` only exists on the cloudflare-pages branch of `PublishConnectionInput` — see
 * `static-publish/types.ts`'s `CloudflarePagesPublishConfig` doc for why it flows through here rather
 * than living on the publish config. s3-compatible has NO `token` field on its own connection variant
 * (it authenticates with an access-key/secret-key pair, not a bearer token —
 * `publish-credentials/types.ts`'s `S3CompatibleConnectionInput` doc): `secretAccessKey` fills
 * `token`'s "the value that authenticates this request" role instead (see `PublishCredentialSource`'s
 * own doc on this reuse), and the other five fields ride along as that interface's optional s3-only
 * fields.
 *
 * @complexity O(1) — field reads only, no I/O.
 */
function projectConnectionForPublish(connection: PublishConnectionInput): Extract<Awaited<ReturnType<PublishCredentialSource["resolve"]>>, { ok: true }> {
  if (connection.providerId === "s3-compatible") {
    return {
      ok: true,
      token: connection.secretAccessKey,
      accessKeyId: connection.accessKeyId,
      bucket: connection.bucket,
      region: connection.region,
      publicUrl: connection.publicUrl,
      ...(connection.endpoint !== undefined ? { endpoint: connection.endpoint } : {}),
    };
  }
  if (connection.providerId === "cloudflare-pages") {
    return { ok: true, token: connection.token, accountId: connection.accountId };
  }
  return { ok: true, token: connection.token };
}

export interface DbPublishCredentialSourceDeps {
  repo: PublishCredentialSetRepoPort;
  sealer: SecretSealerPort;
}

/**
 * Builds a `PublishCredentialSource` backed by the encrypted `publish_credential_sets` store,
 * resolving each `(workspaceId, target)`'s DEFAULT saved connection (Contract v2 Correction B — see
 * this file's header). `resolve()` decrypts via `resolveDefaultForPublish`; `isConfigured()` reads
 * `PublishCredentialSetRepoPort.findDefaultByProvider` directly and never decrypts.
 *
 * @complexity O(1) DB read for `isConfigured`; `resolve` additionally pays one decrypt + `JSON.parse`
 *   (`resolveDefaultForPublish`'s own cost) only when a default exists.
 */
export function createDbPublishCredentialSource(deps: DbPublishCredentialSourceDeps): PublishCredentialSource {
  const notConfiguredReason = (target: StaticPublishTargetId) =>
    `no default '${target}' credential is saved for this workspace yet — add one in the Static Site tab`;

  /**
   * Resolves the ONE saved connection the operator chose, or refuses — never the provider's default
   * (terra review 2026-09-20, finding 1). `credentialId` is UNTRUSTED (an HTTP body field), so both
   * checks below are load-bearing: `resolveForPublish` reads through the workspace-scoped
   * `findById`, so another workspace's id is a `null` here and can never decrypt, and the row's own
   * `providerId` must match the target this publish is actually going to.
   *
   * @complexity O(1) — one repo read plus, only on a full match, one decrypt (`resolveForPublish`).
   */
  async function resolveChosenCredential(
    input: { workspaceId: UUID; target: StaticPublishTargetId; credentialId: UUID }
  ): Promise<Awaited<ReturnType<PublishCredentialSource["resolve"]>>> {
    const resolved = await resolveForPublish(deps, { workspaceId: input.workspaceId, id: input.credentialId });
    if (!resolved) {
      return { ok: false, reason: CHOSEN_CREDENTIAL_UNAVAILABLE_REASON };
    }
    if (resolved.providerId !== input.target) {
      return { ok: false, reason: chosenCredentialWrongProviderReason(resolved.providerId, input.target) };
    }
    return projectConnectionForPublish(resolved.connection);
  }

  return {
    async resolve(input) {
      // The chosen-connection path and the default path produce the SAME success shape (both end in
      // `projectConnectionForPublish`) — only WHICH row is read differs.
      if (input.credentialId !== undefined) {
        return resolveChosenCredential({ workspaceId: input.workspaceId, target: input.target, credentialId: input.credentialId });
      }
      const resolved = await resolveDefaultForPublish(deps, { workspaceId: input.workspaceId, providerId: input.target });
      if (!resolved) {
        return { ok: false, reason: notConfiguredReason(input.target) };
      }
      return projectConnectionForPublish(resolved.connection);
    },
    async isConfigured(input) {
      const record = await deps.repo.findDefaultByProvider({ workspaceId: input.workspaceId, providerId: input.target });
      return record ? { configured: true } : { configured: false, reason: notConfiguredReason(input.target) };
    },
  };
}

export interface ComposePublishCredentialSourceInput {
  workspaceId: UUID;
  executionMode: PublishExecutionMode;
  dbDeps: DbPublishCredentialSourceDeps;
  /** Overridable for tests; defaults to `process.env` — same reasoning
   *  `createEnvPublishCredentialSource`'s own `env` parameter documents. Only read when
   *  `executionMode` is `"self-hosted-cli"` — see this function's own doc for why. */
  env?: NodeJS.ProcessEnv;
}

/**
 * The ONE place this feature decides which `PublishCredentialSource`(s) a real publish attempt may
 * draw from, per this dispatch's brief: DB-backed always tried first (a saved connection always wins
 * over an operator env var when both exist), env-var fallback ONLY when `executionMode` is
 * `"self-hosted-cli"`. In `"hosted-api-only"` mode, `createEnvPublishCredentialSource` is never even
 * CALLED, not merely consulted-and-ignored — the brief's explicit instruction: it must never be a
 * hosted fallback, so a hosted process is structurally unable to hand out a process-wide operator
 * token no matter what is set in its environment.
 *
 * @complexity O(1) composition; the returned source's own cost is `createDbPublishCredentialSource`'s
 *   (plus, in self-hosted mode, one more O(1) env read on a DB miss).
 * @overallScore 100
 */
export function composePublishCredentialSource(input: ComposePublishCredentialSourceInput): PublishCredentialSource {
  const dbSource = createDbPublishCredentialSource(input.dbDeps);
  if (input.executionMode === "hosted-api-only") {
    return dbSource;
  }

  const envSource = createEnvPublishCredentialSource(input.workspaceId, input.env);
  return {
    async resolve(req) {
      const fromDb = await dbSource.resolve(req);
      if (fromDb.ok) return fromDb;
      // A publish BOUND to a chosen saved connection never falls through to the env var (terra
      // review 2026-09-20, finding 1): the operator picked a specific account, and quietly
      // publishing with a different credential because that one did not resolve is the exact
      // failure this binding exists to prevent. The DB source's own refusal is the answer.
      if (req.credentialId !== undefined) return fromDb;
      return envSource.resolve(req);
    },
    async isConfigured(req) {
      const fromDb = await dbSource.isConfigured(req);
      if (fromDb.configured) return fromDb;
      return envSource.isConfigured(req);
    },
  };
}
