import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express } from "express";

import { ENTRY_LIFECYCLE_OPS, parseEntryLifecycleOp } from "@jini-ai/cms/entries";
import { processOutbox } from "#src/contracts/core/events/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentTypesRouteDeps } from "../content-types/deps.js";
import { entriesDeps, entryWriteErrorStatus } from "@jini-ai/cms/entries";

/**
 * @file design-spec.md §1.5/§1.9 — `POST /api/admin/v1/entries/:id/lifecycle` (Publish/Unpublish,
 * REQ-28). Gated by `admin.collections.manage`.
 *
 * ADR-042 closed-union-dispatch: `op` is narrowed to {@link
 * import("../../../../../features/entries/lifecycle-dispatch").EntryLifecycleOp} before lookup —
 * mirrors `inbound/admin-http/routes/content-types/lifecycle.ts`'s identical shape.
 */
export function registerAdminEntryLifecycleRoute({ app, deps }: { app: Express; deps: ContentTypesRouteDeps }, _optional: Record<string, never> = {}): void {
  app.post("/api/admin/v1/entries/:id/lifecycle", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.collections.manage", workspaceId: deps.workspaceId, entityType: "entry" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const body = req.body ?? {};
      const op = parseEntryLifecycleOp({ op: body.op });
      if (!op) {
        res.status(400).json({ error: "'op' must be one of 'publish', 'unpublish'", code: "VALIDATION_ERROR" });
        return;
      }
      if (typeof body.expectedVersion !== "number") {
        res.status(400).json({ error: "'expectedVersion' (number) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const handler = ENTRY_LIFECYCLE_OPS[op];
      const result = await handler({
        deps: entriesDeps(deps),
        input: {
          actorId: principal.id,
          workspaceId: deps.workspaceId,
          id: String(req.params.id),
          expectedVersion: body.expectedVersion,
        },
      });

      if (!result.ok) {
        const { status, code } = entryWriteErrorStatus({ error: result.error });
        if (status === 500) { sendAdminFailure({ res, error: result.error }, { code }); return; }
        res.status(status).json({ error: result.error.message, code });
        return;
      }

      // 2026-09-03 outbox-drain audit fix — drains the outbox so `publishEntry`/`unpublishEntry`'s
      // `entry.published`/`entry.unpublished` event reaches `bus.subscribe`d consumers before the
      // response rather than on the background drainer's next pass (`serving-app.ts`; mirrors
      // `posts/update.ts`'s identical inline `processOutbox` call).
      await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

      res.json(result.value);
    } catch (err) {
      sendAdminFailure({ res, error: err }, { operation: "routes/entries/lifecycle", code: "INTERNAL_ERROR" });
    }
  });
}
