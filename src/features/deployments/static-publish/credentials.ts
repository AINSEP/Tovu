import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../../../integrations/ports";
import { resolveDefaultForPublish } from "../publish-credentials/store";
import type { PublishCredentialSetRepoPort } from "../publish-credentials/types";
import type { PublishExecutionMode } from "../publish-credentials/execution-mode";
import type { PublishCredentialSource, StaticPublishTargetId } from "./types";

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

const ENV_VAR_BY_TARGET: Readonly<Record<StaticPublishTargetId, string>> = {
  "github-pages": "GITHUB_TOKEN",
  vercel: "VERCEL_TOKEN",
  netlify: "NETLIFY_TOKEN",
  "cloudflare-pages": "CLOUDFLARE_API_TOKEN",
};

/** `cloudflare-pages` is the one target whose credential needs a SECOND env var — see
 *  `static-publish/types.ts`'s `CloudflarePagesPublishConfig` doc for why `accountId` lives on the
 *  credential, not the publish config, for the DB-backed source too. */
const CLOUDFLARE_ACCOUNT_ID_ENV_VAR = "CLOUDFLARE_ACCOUNT_ID";

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
  function readCredential(target: StaticPublishTargetId, requestedWorkspaceId: UUID): EnvCredentialResult {
    if (requestedWorkspaceId !== workspaceId) {
      return {
        reason: `this credential source is bound to workspace '${workspaceId}' and refuses to resolve a token for workspace '${requestedWorkspaceId}'`,
      };
    }
    const envVar = ENV_VAR_BY_TARGET[target];
    const token = env[envVar]?.trim();
    if (!token) {
      return { reason: `${envVar} is not set — publishing to ${target} requires a token with write access configured in the server environment` };
    }
    if (target !== "cloudflare-pages") {
      return { token };
    }
    const accountId = env[CLOUDFLARE_ACCOUNT_ID_ENV_VAR]?.trim();
    if (!accountId) {
      return {
        reason: `${CLOUDFLARE_ACCOUNT_ID_ENV_VAR} is not set — publishing to cloudflare-pages requires both ${envVar} and ${CLOUDFLARE_ACCOUNT_ID_ENV_VAR}`,
      };
    }
    return { token, accountId };
  }

  return {
    async resolve(input) {
      const result = readCredential(input.target, input.workspaceId);
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

  return {
    async resolve(input) {
      const resolved = await resolveDefaultForPublish(deps, { workspaceId: input.workspaceId, providerId: input.target });
      if (!resolved) {
        return { ok: false, reason: notConfiguredReason(input.target) };
      }
      // `accountId` only exists on the cloudflare-pages branch of `PublishConnectionInput` — see
      // `static-publish/types.ts`'s `CloudflarePagesPublishConfig` doc for why it flows through here
      // rather than living on the publish config.
      const accountId = resolved.connection.providerId === "cloudflare-pages" ? resolved.connection.accountId : undefined;
      return { ok: true, token: resolved.connection.token, ...(accountId !== undefined ? { accountId } : {}) };
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
      return envSource.resolve(req);
    },
    async isConfigured(req) {
      const fromDb = await dbSource.isConfigured(req);
      if (fromDb.configured) return fromDb;
      return envSource.isConfigured(req);
    },
  };
}
