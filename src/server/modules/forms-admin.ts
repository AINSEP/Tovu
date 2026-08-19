import { registerAdminFormsCreateRoute } from "../routes/admin/forms/create.js";
import { registerAdminFormsDeleteSubmissionRoute } from "../routes/admin/forms/delete-submission.js";
import type { FormsRouteDeps } from "../routes/admin/forms/deps.js";
import { registerAdminFormsGetRoute } from "../routes/admin/forms/get-by-id.js";
import { registerAdminFormsGetSubmissionRoute } from "../routes/admin/forms/get-submission.js";
import { registerAdminFormsListRoute } from "../routes/admin/forms/list.js";
import { registerAdminFormsListSubmissionsRoute } from "../routes/admin/forms/list-submissions.js";
import { registerAdminFormsUpdateRoute } from "../routes/admin/forms/update.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-041) — the `forms-admin` server module (SPEC-010 Forms, Tier-1
 * sample plugin's admin HTTP surface).
 *
 * Owns all 7 admin registrations (list/create/get-by-id/update/list-submissions/get-submission/
 * delete-submission) — moved here verbatim from `app.ts`'s `createApp()`, same registrar function
 * bodies, no behavior change, same relative order.
 *
 * Named distinctly from `src/server/modules/forms.ts` (SPEC-031, already existing), which owns
 * the unrelated Forms-to-webhook-notify-subscriber concern, not HTTP routes — mirrors how
 * `integrations.ts` vs `integrations-admin.ts` already split the identical shape in SPEC-034.
 */
export function createFormsAdminModule(deps: FormsRouteDeps): ServerModuleHandle {
  return {
    name: "forms-admin",
    registerRoutes: (app) => {
      registerAdminFormsListRoute(app, deps);
      registerAdminFormsCreateRoute(app, deps);
      registerAdminFormsGetRoute(app, deps);
      registerAdminFormsUpdateRoute(app, deps);
      registerAdminFormsListSubmissionsRoute(app, deps);
      registerAdminFormsGetSubmissionRoute(app, deps);
      registerAdminFormsDeleteSubmissionRoute(app, deps);
    },
  };
}
