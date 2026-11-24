import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { ToolInputError } from "@jini-ai/core";
import type { Express } from "express";
import {
  createPublishCredential,
  invalidatePublishCredentialCompatibility,
  deletePublishCredential,
  describeCredential,
  healAccountLabel,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  updatePublishCredential,
  type UpdatePublishCredentialInput,
} from "#src/features/deployments/publish-credentials/index";
import type { PublishCredentialSummary } from "@jini-ai/devops/deploy/site/publish-credentials/types";
import { createAccountLabelHealScheduler, idsNeedingAccountLabelHeal } from "@jini-ai/devops/deploy/site/publish-credentials/account-label-heal-scheduler";
import {
  canYieldAccountLabel,
  verifyPublishCredentialById,
  type PublishCredentialVerificationResult,
} from "#src/features/deployments/static-publish/index";
  type PublishCredentialSummary,
} from "#src/features/deployments/publish-credentials/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { asyncRoute } from "../../../../../platform/express/async-route.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * @file The Deployment panel's publish-credential LIST route, still hand-written (K1 STOP,
 * RT-K1-adm-system-11). The other four verbs (create, update, verify, delete) are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/system/publish-credentials/*`) mounted by
 * `runtime/composition/modules/system-credentials.ts`, which also calls this registrar first so the
 * registration order is unchanged. It stays because `publish-credentials-route.test.ts` pins that a
 * direct handler call with no principal REJECTS (the admin JSON ports answer a redacted 500 instead);
 * moving it needs that test changed, which a K1 move may not do. Jini ships no list spec until
 * that pin is revisited (review rv1123i held the unmounted one out of the published API).
 *
 * Registers `GET`/`POST` on the collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/publish/credentials`. This is deliberately a THIN
 * HTTP adapter over `publish-credentials/store.ts` — every validation, uniqueness, and default-slot
 * rule already lives there (see that file's own header); this route's only job is: check auth, shape
 * the request into `store.ts`'s input types, map its thrown errors to HTTP status codes, and return
 * `PublishCredentialSummary` — never the sealed connection, never a token, never `accountId`. That
 * "read model never carries a secret field" guarantee is enforced by `PublishCredentialSummary`'s own
 * shape (`types.ts`), not by anything this route does — there is no field here that COULD leak one.
 *
 * `system.publish`-gated on every verb, matching `publish-site.ts`'s reasoning for its own trigger/
 * status routes: a saved connection's `label`/`providerId`/`isDefault` is itself operationally
 * sensitive (which external accounts this workspace can publish to), so this gets the same
 * single-permission gate as the fact of a live publish, not the softer `system.read` the state-less
 * `/publish/preview` route uses.
 *
 * 2026-08-16 — this is now the ONE place `verifyPublishCredential` (`static-publish/verify.ts`) is
 * ever called from a human action, per that module's own "never agent-facing" contract: `POST`/`PUT`
 * verify the just-saved connection best-effort (awaited, included in the response — the "did what I
 * just typed work" moment) without gating the save itself on the outcome (a rejected credential can
 * still be saved and fixed later — this route only reports what it found, it does not decide the
 * save is invalid because the provider disagrees), and a new `POST .../:id/verify` lets a human
 * re-check a stale or never-verified result without re-saving. Both write ONLY the cached,
 * non-secret `{ok, message, checkedAt}` result — never anything that could leak a credential value.
 *
 * Also 2026-08-16 (migration `0044`): `verifyAfterSave` additionally heals `publish_credential_sets
 * .account_label` (`publish-credentials/store.ts`'s `healAccountLabel`) whenever a verify comes back
 * `"valid"` with an `accountLabel` — this is the ONE write path allowed to populate that column (see
 * `store.ts`'s own header for why `createPublishCredential`/`updatePublishCredential` deliberately do
 * not: this route is human-gated, `create`/`update` are not, sharing a write path with an agent-facing
 * s3-compatible credential save). This is what makes the fix for "verification lived in
 * `InMemoryPublishCredentialVerificationCache` only, so a routine server restart silently reverted a
 * working, previously-verified credential to no known account" durable: `deployment_get_static_publish
 * _capabilities` can now read a real DB column that survives a restart, instead of only ever reading a
 * process-memory cache that does not.
 *
 * Also 2026-08-16 (same night, second pass): `POST`/`PUT` above already heal a row's account label the
 * moment it is saved — but only if THAT verify attempt succeeds. A row whose first auto-verify failed
 * (provider unreachable at save time), or one saved before this wiring existed at all, stayed
 * `account_label: null` forever unless a human found and clicked the per-row `POST .../:id/verify`
 * action — the reported bug: the assistant's `deployment_get_static_publish_capabilities` tool had no
 * account to default a repository-backed publish's `owner` to, and correctly refused to guess one, but a
 * non-technical owner had no reason to know a "Verify" button existed to fix it. `GET` below now also
 * calls {@link accountLabelHealScheduler}`.triggerFor` after every list read, for any row this list
 * call itself found still `null` on a provider that can ever yield a label
 * (`idsNeedingAccountLabelHeal`, `static-publish/verify.ts`'s `canYieldAccountLabel`) — fire-and-forget,
 * never awaited, never able to affect this (or any) response. This is deliberately the ONLY new trigger
 * point: `static-publish/verify.ts`'s own header is categorical that only a human-gated caller may ever
 * invoke a provider probe, and `publish-agent-tools.ts`'s capabilities handler reads this same table
 * via `listPublishCredentials` directly — putting a probe inside that shared, decrypt-free read
 * function (or anywhere reachable from it) would put a live outbound request on the agent's own path,
 * which is exactly what that boundary exists to prevent. This GET handler is human-gated (the admin
 * Deployment → Static Site tab loading its own list) and reuses `verifyAfterSave` verbatim as the
 * scheduler's `heal` callback, so a self-heal shares the exact same probe/cache/DB-write behavior a
 * human clicking "Verify" already gets — nothing new is added to WHAT a heal does, only WHEN it can
 * additionally fire. See `@jini-ai/devops/deploy/site/publish-credentials/account-label-heal-scheduler`'s own header for the fire-and-forget/
 * in-flight-dedupe contract that keeps this off the hot path and safe under `62ca21c7`'s guard.
 *
 * See `CredentialsDeps` in `server/routes/route-deps/credentials-deps.ts` for why each route picks only its own repo.
 */

type ListDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "publishExecutionMode">;
const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/publish/credentials";

/**
 * The list's store-error answers — the same ladder the four spec routes map in Jini. History carried
 * over from when this ladder served all five verbs:
 *
 * Every error this route can produce, shaped once so each handler below stays a thin dispatch.
 * Mirrors `publish-site.ts`'s inline `{error}`/`{error, code, details}` shapes for the same
 * permission failure; the four typed store-error branches are new to this route and have no
 * precedent to match.
 *
 * 2026-08-16 — the untyped fallback used to be `throw err`, re-throwing out of the caller's own
 * `catch` block instead of responding. That is not a guard, it just moves the same unhandled
 * rejection one frame up: found live when `GET`/`DELETE` below had no `try`/`catch` at all (an
 * AST scan over every `app.<verb>()` handler in `src/server/routes/**` caught it), and the SAME
 * scan showed `POST`/`PUT`/`POST .../:id/verify` already had a `try { ... } catch (err) {
 * sendStoreError(res, err); }` shape that LOOKED guarded but was not — any error outside the four
 * typed ones above still escaped every one of those handlers too. Every caller below now gets a
 * real response for an error this function does not recognize, instead of a hung request.
 */
function sendStoreError({ res, err }: { res: import("express").Response; err: unknown }, _options = {}): void {
  if (err instanceof ToolInputError) { res.status(409).json({ error: "KEY_IN_USE", detail: err.message }); return; }
  const rows: [new (...args: never[]) => Error, number, string][] = [
    [PublishCredentialValidationError, 400, "VALIDATION"],
    [PublishCredentialDuplicateLabelError, 409, "DUPLICATE_LABEL"],
    [PublishCredentialNotFoundError, 404, "NOT_FOUND"],
    [PublishCredentialSecretStoreUnconfiguredError, 503, "SECRET_STORE_UNCONFIGURED"],
  ];
  const row = rows.find(([type]) => err instanceof type);
  if (row) { res.status(row[1]).json({ error: row[2], detail: (err as Error).message }); return; }
  sendAdminFailure({ res, error: err }, { operation: "routes/system/publish-credentials", code: "INTERNAL_ERROR" });
}

type VerifyAfterSave = (input: { id: string }) => Promise<PublishCredentialVerificationResult | undefined>;
type CredentialsContext = {
  deps: AdminPublishCredentialsDeps;
  readDeps: { sealer: AdminPublishCredentialsDeps["siteAssistantSecretSealer"]; repo: AdminPublishCredentialsDeps["vendorCredentialSetRepo"]; loadDeployTargets: AdminPublishCredentialsDeps["loadDeployTargets"] };
  writeDeps: Parameters<typeof createPublishCredential>[0];
  verifyAfterSave: VerifyAfterSave;
  triggerAccountLabelHeal: (credentials: readonly PublishCredentialSummary[]) => Promise<void>;
  rejectUnlessAuthorized: (req: Request, res: Response) => Promise<boolean>;
};

/** Verifies ONE specific row (the one this route just touched) against its real provider. The
 *  PROVIDER-PROBE layer never throws — `verify.ts`'s per-provider checkers fold every network
 *  failure into `"unreachable"` rather than throwing (see that file's own header), so a transient
 *  network blip can never turn a successful save into a 500. That guarantee does NOT extend to the
 *  DECRYPT step underneath it: `verifyPublishCredentialById` calls `resolveForPublish`
 *  (`publish-credentials/store.ts`), which throws `PublishCredentialSecretStoreUnconfiguredError`
 *  when the stored secret cannot be decrypted (a missing site key, or a tampered/corrupt row)
 *  — the SAME "surface, don't swallow" contract that module documents for itself. Every caller of
 *  this function below MUST run through a `try`/`catch` that maps the result via `sendStoreError`.
 *
 *  Found live (2026-08-16): this was NOT true for `POST .../:id/verify` below until this fix — it
 *  had no try/catch at all, so a missing site key took down the WHOLE server process (Express 4
 *  does not catch an async handler's own rejection, and nothing else in `src/` was catching it at
 *  the process level either), not just that one request. An earlier version of THIS comment
 *  claimed `verifyAfterSave` "never throws" without qualifying which layer that applied to — do
 *  not repeat that mistake; the provider-probe layer's guarantee and the decrypt layer's contract
 *  are two different things.
 *
 *  Returns `null` only if the row vanished between the write this handler just performed and this
 *  call — treated the same as "nothing to report" by every caller below, never surfaced as an
 *  error for what was otherwise a successful save.
 *
 *  Also heals `account_label` (`store.ts`'s `healAccountLabel`) whenever the result carries one —
 *  see this file's own header. Deliberately checked via `result.accountLabel !== undefined` rather
 *  than truthiness: an empty string is not a real account login/username (`verify.ts`'s own
 *  extractors never produce one — see their doc comments), but the distinction is cheap to keep
 *  exact rather than relying on that invariant holding forever. The heal is fire-and-forget from
 *  this function's own caller's point of view (awaited here, but its failure must not turn a
 *  successful verify into a failed response) — a targeted single-column write against a row this
 *  same request just confirmed exists has no realistic failure mode short of the DB itself being
 *  down, at which point the save/verify response the caller already has is still honest. */
function buildVerifyAfterSave({ deps }: { deps: AdminPublishCredentialsDeps }): VerifyAfterSave {
  return async function verifyAfterSave({ id }: { id: string }, _optional = {}): Promise<PublishCredentialVerificationResult | undefined> {
    const result = await verifyPublishCredentialById(
      {
        repo: deps.vendorCredentialSetRepo,
        sealer: deps.siteAssistantSecretSealer,
        cache: deps.publishCredentialVerificationCache,
        clock: deps.clock,
        loadDeployTargets: deps.loadDeployTargets,
        observability: deps.observability,
      },
      { workspaceId: deps.workspaceId, id }
    );
    if (result?.accountLabel !== undefined) {
      await healAccountLabel({ repo: deps.vendorCredentialSetRepo }, { workspaceId: deps.workspaceId, id, accountLabel: result.accountLabel });
    }
    return result ?? undefined;
  };
}

/** Hands the scheduler every listed row still missing an account label whose host can produce one
 *  (the host's declared `yieldsAccountLabel`). Runs after the response is sent, so a registry load
 *  failure is logged and swallowed: it must never reach the request that triggered it. */
function buildTriggerAccountLabelHeal({ deps, verifyAfterSave }: { deps: AdminPublishCredentialsDeps; verifyAfterSave: VerifyAfterSave }): (credentials: readonly PublishCredentialSummary[]) => Promise<void> {
  /** Built ONCE per route registration, like `verifyAfterSave` itself — its in-flight dedupe only
   *  works if it survives between requests. `heal` is `verifyAfterSave` verbatim: a background self-
   *  heal does exactly what a human clicking "Verify" already does, through the same function, never a
   *  parallel code path that could drift from it. See this file's own header ("second pass") and
   *  the `@jini-ai/devops` heal scheduler's header for the full reasoning. `onHealError` is this
   *  route's own fallback logging (same `[publish-credentials]` prefix and `console.error(message,
   *  err)` shape as the deploy-target load failure below), so a background heal failure shows up in
   *  the same place an unexpected route error already does; the scheduler itself never logs. */
  const accountLabelHealScheduler = createAccountLabelHealScheduler({
    heal: verifyAfterSave,
    onHealError: ({ id, err }) => console.error(`[publish-credentials] background account-label heal failed for '${id}'`, err),
  });
  return async function triggerAccountLabelHeal(credentials) {
    try {
      const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
      accountLabelHealScheduler.triggerFor(idsNeedingAccountLabelHeal({ credentials, canYieldAccountLabel: (providerId) => canYieldAccountLabel({ registry, target: providerId }) }));
    } catch (err) {
      console.error("[publish-credentials] account-label heal skipped: deploy targets could not be loaded", err);
    }
  };
}

/** Shared workspace-path-param + `system.publish` authorization check every verb below performs
 *  first — same two-step `publish-site.ts` already repeats per-route; extracted here since this
 *  file has four verbs instead of that file's two. Returns `true` and has already written the
 *  response iff the caller should stop. */
function buildRejectUnlessAuthorized({ deps }: { deps: AdminPublishCredentialsDeps }): (req: Request, res: Response) => Promise<boolean> {
  return async function rejectUnlessAuthorized(req, res) {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return true;
    const principal = getAuthedPrincipal(res);
    const params = { principalId: principal.id, permission: "system.publish", workspaceId: deps.workspaceId, entityType: "site-publish" };
    if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;
    try {
      const credentials: PublishCredentialSummary[] = await listPublishCredentials(readDeps, { workspaceId: deps.workspaceId });
      res.status(200).json({ credentials, executionMode: deps.publishExecutionMode });
      // Fires AFTER the response is already sent, and only for rows THIS call itself found still
      // `null` — never awaited, never able to change or delay what the caller above just received.
      // `accountLabelHealScheduler.triggerFor` is documented to never throw or reject, even if `heal`
      // misbehaves (the `@jini-ai/devops` heal scheduler's own tests cover that directly) — see this
      // file's header for why this is the one new trigger point and why it must stay exactly this
      // narrow.
      void triggerAccountLabelHeal(credentials);
    } catch (err) {
      sendStoreError({ res, err });
    }
  } }));
}
