import type { Express, Request, Response } from "express";

import {
  createAccountLabelHealScheduler,
  createPublishCredential,
  deletePublishCredential,
  describeCredential,
  healAccountLabel,
  idsNeedingAccountLabelHeal,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  updatePublishCredential,
  type PublishCredentialSummary,
} from "#src/features/deployments/publish-credentials/index";
import {
  canYieldAccountLabel,
  verifyPublishCredentialById,
  type PublishCredentialVerificationResult,
} from "#src/features/deployments/static-publish/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Static Site tab's credential CRUD backend.
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
 * account to default a github-pages publish's `owner` to, and correctly refused to guess one, but a
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
 * additionally fire. See `account-label-heal-scheduler.ts`'s own header for the fire-and-forget/
 * in-flight-dedupe contract that keeps this off the hot path and safe under `62ca21c7`'s guard.
 *
 * 2026-08-18 (`RouteDeps` decomposition Slice 3): was a bare `RouteDeps` alias; narrowed to a `Pick`
 * naming exactly the 9 fields `registerAdminPublishCredentialsRoutes`/`verifyAfterSave` read below
 * (confirmed by reading every `deps.*` access in this file, not guessed) — `publishCredentialSetRepo`
 * (now part of `routes/types.ts`'s `CredentialsDeps` group) plus the two shared ADR-058 sealing
 * fields, `clock`/`idGen`, `workspaceId`/`authorize`, and this route's own two extra reads
 * (`publishExecutionMode`, `publishCredentialVerificationCache` — neither is part of
 * `CredentialsDeps`, both stay declared directly on `RouteDeps`). Not composed from `CredentialsDeps`
 * directly: this route only ever touches its OWN repo, and pulling in the whole 10-field group would
 * add the other 9 credential repos (custom/source-control/vendor/media-provider/... ) this file never
 * reads — the same "would widen, not narrow" reasoning `routes/types.ts`'s own `CredentialsDeps` doc
 * gives for why `MediaProviderRouteDeps`/`ExternalMcpRouteDeps` were left alone instead of composing
 * the group.
 */
export type AdminPublishCredentialsDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "publishCredentialSetRepo"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
  | "publishExecutionMode"
  | "publishCredentialVerificationCache"
>;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/publish/credentials";

/** One repo `GET .../:id/repos` (below) can offer the picker replacing the free-text GitHub
 *  owner/repo fields on the Deployment → Static Site tab — see `development/e2e/
 *  live-publish-e2e.spec.ts`, the regression guard for the original bug this picker fixes (an
 *  invented account name reaching a real publish). Response shape mirrors what GitHub's own
 *  `GET /user/repos` reports per repo, narrowed to exactly what the UI needs. */
export interface GitHubRepoSummary {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

/** `status` mirrors {@link PublishCredentialVerificationResult}'s own closed three-way enum and the
 *  same reasoning for why it exists (`static-publish/verify.ts`'s header): `"unreachable"` (network/
 *  timeout/provider 5xx) and `"invalid"` (the provider affirmatively rejected the token) demand
 *  opposite operator guidance and must never collapse into each other. `repos`/`truncated` are only
 *  meaningful when `status === "valid"`. */
export interface ListGitHubReposResult {
  readonly status: "valid" | "invalid" | "unreachable";
  readonly message?: string;
  readonly repos: readonly GitHubRepoSummary[];
  /** `true` when the account has more repos than the one page this probe fetches (`per_page=100`,
   *  unpaginated) — the UI must not report a truncated list as complete, so a caller that ignores
   *  this field would silently hide repos rather than just being slow to show them. */
  readonly truncated: boolean;
}

/** Every error this route can produce, shaped once so each handler below stays a thin dispatch.
 *  Mirrors `publish-site.ts`'s inline `{error}`/`{error, code, details}` shapes for the same
 *  permission failure; the four typed store-error branches are new to this route and have no
 *  precedent to match.
 *
 *  2026-08-16 — the untyped fallback used to be `throw err`, re-throwing out of the caller's own
 *  `catch` block instead of responding. That is not a guard, it just moves the same unhandled
 *  rejection one frame up: found live when `GET`/`DELETE` below had no `try`/`catch` at all (an
 *  AST scan over every `app.<verb>()` handler in `src/server/routes/**` caught it), and the SAME
 *  scan showed `POST`/`PUT`/`POST .../:id/verify` already had a `try { ... } catch (err) {
 *  sendStoreError(res, err); }` shape that LOOKED guarded but was not — any error outside the four
 *  typed ones above still escaped every one of those handlers too. Every caller below now gets a
 *  real response for an error this function does not recognize, instead of a hung request. */
function sendStoreError(res: Response, err: unknown): void {
  if (err instanceof PublishCredentialValidationError) {
    res.status(400).json({ error: "VALIDATION", detail: err.message });
    return;
  }
  if (err instanceof PublishCredentialDuplicateLabelError) {
    res.status(409).json({ error: "DUPLICATE_LABEL", detail: err.message });
    return;
  }
  if (err instanceof PublishCredentialNotFoundError) {
    res.status(404).json({ error: "NOT_FOUND", detail: err.message });
    return;
  }
  if (err instanceof PublishCredentialSecretStoreUnconfiguredError) {
    res.status(503).json({ error: "SECRET_STORE_UNCONFIGURED", detail: err.message });
    return;
  }
  console.error("[publish-credentials] unexpected error", err);
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

export function registerAdminPublishCredentialsRoutes(app: Express, deps: AdminPublishCredentialsDeps): void {
  const readDeps = { repo: deps.publishCredentialSetRepo };
  const writeDeps = {
    repo: deps.publishCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };
  /** Verifies ONE specific row (the one this route just touched) against its real provider. The
   *  PROVIDER-PROBE layer never throws — `verify.ts`'s per-provider checkers fold every network
   *  failure into `"unreachable"` rather than throwing (see that file's own header), so a transient
   *  network blip can never turn a successful save into a 500. That guarantee does NOT extend to the
   *  DECRYPT step underneath it: `verifyPublishCredentialById` calls `resolveForPublish`
   *  (`publish-credentials/store.ts`), which throws `PublishCredentialSecretStoreUnconfiguredError`
   *  when the stored secret cannot be decrypted (a missing master secret, or a tampered/corrupt row)
   *  — the SAME "surface, don't swallow" contract that module documents for itself. Every caller of
   *  this function below MUST run through a `try`/`catch` that maps the result via `sendStoreError`.
   *
   *  Found live (2026-08-16): this was NOT true for `POST .../:id/verify` below until this fix — it
   *  had no try/catch at all, so a missing root key took down the WHOLE server process (Express 4
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
   *  than truthiness: an empty string is not a real GitHub login/Vercel username (`verify.ts`'s own
   *  extractors never produce one — see their doc comments), but the distinction is cheap to keep
   *  exact rather than relying on that invariant holding forever. The heal is fire-and-forget from
   *  this function's own caller's point of view (awaited here, but its failure must not turn a
   *  successful verify into a failed response) — a targeted single-column write against a row this
   *  same request just confirmed exists has no realistic failure mode short of the DB itself being
   *  down, at which point the save/verify response the caller already has is still honest. */
  async function verifyAfterSave(id: string): Promise<PublishCredentialVerificationResult | undefined> {
    const result = await verifyPublishCredentialById(
      { repo: deps.publishCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, cache: deps.publishCredentialVerificationCache, clock: deps.clock },
      { workspaceId: deps.workspaceId, id }
    );
    if (result?.accountLabel !== undefined) {
      await healAccountLabel({ repo: deps.publishCredentialSetRepo }, { workspaceId: deps.workspaceId, id, accountLabel: result.accountLabel });
    }
    return result ?? undefined;
  }

  /** Built ONCE per route registration, like `verifyAfterSave` itself — its in-flight dedupe only
   *  works if it survives between requests. `heal` is `verifyAfterSave` verbatim: a background self-
   *  heal does exactly what a human clicking "Verify" already does, through the same function, never a
   *  parallel code path that could drift from it. See this file's own header ("second pass") and
   *  `account-label-heal-scheduler.ts`'s header for the full reasoning. */
  const accountLabelHealScheduler = createAccountLabelHealScheduler({ heal: verifyAfterSave });

  /**
   * TEMPORARY STUB (2026-08-17) — `GET .../:id/repos` below is the thin HTTP adapter half of the
   * GitHub repo-list endpoint `source-control-ui` requested to back its picker (replacing the
   * free-text owner/repo fields). The actual "decrypt this row's token, call GitHub's
   * `GET /user/repos?affiliation=owner,organization_member&sort=updated&per_page=100`, map to
   * `GitHubRepoSummary[]`" work is `routedeps-vendor`'s (per team-lead's split), expected to land as
   * a real export from `src/features/deployments/static-publish/**` (mirroring
   * `verifyPublishCredentialById`'s own resolve-then-probe shape one file up: same `resolveForPublish`
   * decrypt step, same "`null` means no such row" contract, same "never throw for a network failure —
   * fold it into `status: 'unreachable'`/`'invalid'`" contract `computeVerificationResult` already
   * follows).
   *
   * DELETE this function and replace it with a real import (`import { listGitHubReposByCredentialId }
   * from "#src/features/deployments/static-publish/index";`) the moment that lands — the route below
   * is already written against exactly this name and signature so the swap is a one-line change.
   * Until then this throws unconditionally, which proves only that THIS route's error-handling guard
   * is real (same `route-async-guards.test.ts` RED-first pattern every other handler in this file
   * follows) — never that repo listing itself works.
   */
  async function listGitHubReposByCredentialId(id: string): Promise<ListGitHubReposResult | null> {
    void id;
    throw new Error(
      "listGitHubReposByCredentialId is not implemented yet — pending routedeps-vendor's probe function in src/features/deployments/static-publish/**"
    );
  }

  /** Shared workspace-path-param + `system.publish` authorization check every verb below performs
   *  first — same two-step `publish-site.ts` already repeats per-route; extracted here since this
   *  file has four verbs instead of that file's two. Returns `true` and has already written the
   *  response iff the caller should stop. */
  async function rejectUnlessAuthorized(req: Request, res: Response): Promise<boolean> {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return true;
    }
    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.publish",
      workspaceId: deps.workspaceId,
      entityType: "site-publish",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.publish' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.publish", reason: authResult.reason },
      });
      return true;
    }
    return false;
  }

  app.get(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    try {
      const credentials: PublishCredentialSummary[] = await listPublishCredentials(readDeps, { workspaceId: deps.workspaceId });
      res.status(200).json({ credentials, executionMode: deps.publishExecutionMode });
      // Fires AFTER the response is already sent, and only for rows THIS call itself found still
      // `null` — never awaited, never able to change or delay what the caller above just received.
      // `accountLabelHealScheduler.triggerFor` is documented to never throw or reject, even if `heal`
      // misbehaves (`account-label-heal-scheduler.ts`'s own tests cover that directly) — see this
      // file's header for why this is the one new trigger point and why it must stay exactly this
      // narrow.
      accountLabelHealScheduler.triggerFor(idsNeedingAccountLabelHeal(credentials, canYieldAccountLabel));
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.post(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await createPublishCredential(writeDeps, {
        workspaceId: deps.workspaceId,
        label: body.label,
        connection: body.connection,
        isDefault: body.isDefault,
      });
      // Only when `connection` was actually supplied — matches `updatePublishCredential`'s own
      // "connection omitted => nothing changed to verify" reasoning below. `createPublishCredential`
      // always requires a connection, so this is always true here; kept as an explicit check (rather
      // than an unconditional call) so both handlers read the same way.
      const verification = body.connection !== undefined ? await verifyAfterSave(credential.id) : undefined;
      res.status(201).json({ credential, ...(verification ? { verification } : {}) });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.put(`${BASE_PATH}/:id`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await updatePublishCredential(writeDeps, {
        workspaceId: deps.workspaceId,
        id: req.params.id,
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.connection !== undefined ? { connection: body.connection } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      });
      // A label-only/isDefault-only rename verifies nothing new — the connection (and therefore
      // whatever a previous verification already found) is unchanged, so re-checking here would
      // just repeat the same network call for no new information.
      const verification = body.connection !== undefined ? await verifyAfterSave(credential.id) : undefined;
      res.status(200).json({ credential, ...(verification ? { verification } : {}) });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.post(`${BASE_PATH}/:id/verify`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    try {
      const existing = await describeCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
      if (!existing) {
        res.status(404).json({ error: "NOT_FOUND", detail: `no publish credential '${req.params.id}' in this workspace` });
        return;
      }
      const verification = await verifyAfterSave(existing.id);
      res.status(200).json({ verification });
    } catch (err) {
      // `describeCredential` itself never decrypts (this file's own header) and cannot land here —
      // this catch exists for `verifyAfterSave`'s decrypt step (see that function's own doc above:
      // it is NOT covered by the provider-probe layer's "never throws" guarantee). Mirrors the
      // `POST`/`PUT` handlers' identical `try { ... } catch (err) { sendStoreError(res, err); }`
      // shape just below/above — this route was the one place that pattern was missing.
      sendStoreError(res, err);
    }
  });

  /**
   * `GET .../:id/repos` — lists the GitHub repos reachable by ONE saved `github-pages` credential's
   * token, backing `source-control-ui`'s searchable owner/repo picker. `system.publish`-gated like
   * every other verb in this file (a saved connection's reachable-repo list is at least as sensitive
   * as the fact of the connection itself).
   *
   * Only meaningful for `providerId === "github-pages"` — 400 for any other provider, checked via
   * `describeCredential`'s already-non-secret read model (no decrypt needed to reject early). This
   * is deliberately the `publish_credential_sets` table's own `providerId`, never
   * `source_control_credential_sets`' `"github"` row — the two are different rows in different
   * tables by current design, and this endpoint does not reach across that boundary.
   *
   * Always 200 with `{status, repos, truncated}` embedded, same as `POST .../:id/verify`'s
   * `{verification}` shape: "the check ran, here's what it found" rather than mapping
   * `"invalid"`/`"unreachable"` to a non-2xx status.
   *
   * Decrypts a token and makes an outbound request — the same shape that produced the original
   * process-killing bug this file's `sendStoreError` doc already tells that story for. Guarded the
   * same way: `try`/`catch` around the one awaited call that can throw
   * (`listGitHubReposByCredentialId`'s decrypt step), mapped through `sendStoreError`. See
   * `route-async-guards.test.ts` for the RED-first proof pattern this follows.
   */
  app.get(`${BASE_PATH}/:id/repos`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    try {
      const existing = await describeCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
      if (!existing) {
        res.status(404).json({ error: "NOT_FOUND", detail: `no publish credential '${req.params.id}' in this workspace` });
        return;
      }
      if (existing.providerId !== "github-pages") {
        res.status(400).json({
          error: `repo listing is only available for a 'github-pages' credential, not '${existing.providerId}'`,
          code: "UNSUPPORTED_PROVIDER",
        });
        return;
      }
      const result = await listGitHubReposByCredentialId(existing.id);
      if (!result) {
        // Row vanished between the `describeCredential` read above and the resolve step inside
        // `listGitHubReposByCredentialId` — the same race `verifyAfterSave`'s own 404 fallback
        // tolerates, not an error.
        res.status(404).json({ error: "NOT_FOUND", detail: `no publish credential '${req.params.id}' in this workspace` });
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.delete(`${BASE_PATH}/:id`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    try {
      // Idempotent — `deletePublishCredential`/`PublishCredentialSetRepoPort.delete` are both no-ops
      // (not errors) for a missing row, matching this route's own documented 204-always contract.
      // A THROWN error here is a different case (e.g. the repo itself is unreachable) — not the
      // idempotent-missing-row path above, so it still needs a response, not a silent no-op.
      await deletePublishCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
      res.status(204).end();
    } catch (err) {
      sendStoreError(res, err);
    }
  });
}
