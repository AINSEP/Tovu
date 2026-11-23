import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { ToolInputError } from "@jini-ai/core";
import type { Express } from "express";
import {
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
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
 * moving it needs that test changed, which a K1 move may not do. A Jini spec
 * (`publish-credentials/list`) is ready for when that pin is revisited.
 *
 * `system.publish`-gated (entity type `site-publish`, no `entityId`), `authorizeDirectOrRespond`.
 */

type ListDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "publishExecutionMode">;
const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/publish/credentials";

/** The list's store-error answers — the same ladder the four spec routes map in Jini. */
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

/** `GET` the credentials + execution mode, then fire the account-label heal after the response. */
export function registerAdminPublishCredentialsListRoute(
  { app, deps, readDeps, triggerAccountLabelHeal }: {
    app: Express; deps: ListDeps; readDeps: Parameters<typeof listPublishCredentials>[0];
    triggerAccountLabelHeal: (credentials: readonly PublishCredentialSummary[]) => Promise<void>;
  },
  _optional: Record<string, never> = {},
): void {
  app.get(BASE_PATH, asyncRoute({ handler: async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;
    const principal = getAuthedPrincipal(res);
    const params = { principalId: principal.id, permission: "system.publish", workspaceId: deps.workspaceId, entityType: "site-publish" };
    if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;
    try {
      const credentials: PublishCredentialSummary[] = await listPublishCredentials(readDeps, { workspaceId: deps.workspaceId });
      res.status(200).json({ credentials, executionMode: deps.publishExecutionMode });
      // Fires AFTER the response is already sent, and only for rows THIS call itself found still
      // `null` — never awaited, never able to change or delay what the caller above just received.
      // `accountLabelHealScheduler.triggerFor` is documented to never throw or reject, even if `heal`
      // misbehaves (`account-label-heal-scheduler.ts`'s own tests cover that directly).
      void triggerAccountLabelHeal(credentials);
    } catch (err) {
      sendStoreError({ res, err });
    }
  } }));
}
