import type { Express } from "express";

import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 (SPEC-041) — narrow `RouteDeps` slice for the `forms-admin` server module.
 *
 * Purpose:
 * The 7 forms admin routes (list/create/get-by-id/update/list-submissions/get-submission/
 * delete-submission) only ever read `workspaceId`/`authorize`/`clock`/`idGen`/`changeSets`/
 * `outbox` plus the 2 forms repo ports (`formDefinitionRepo`, `formSubmissionRepo`) — a genuine
 * narrowing (mirrors `routes/admin/taxonomy/deps.ts`'s identical rationale), not a
 * `RouteDeps`-widening extension. Determined by reading all 7 route files directly, including
 * their `write-service.ts` call sites (`create.ts`/`update.ts` pass `changeSets`/`outbox` through
 * to `createFormDefinition`/`updateFormDefinition`/`setFormDefinitionStatus`).
 *
 * Distinct from `src/server/modules/forms.ts` (SPEC-031's Forms-to-notify-subscriber module,
 * unrelated non-HTTP concern) — see that file's own header and `modules/forms-admin.ts`'s header
 * for the full disclosure.
 */
export type FormsRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "idGen" | "changeSets" | "outbox" | "formDefinitionRepo" | "formSubmissionRepo"
>;

export type FormsRouteRegistrar = (app: Express, deps: FormsRouteDeps) => void;
