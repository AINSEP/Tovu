import { formsGetRoute } from "@jini-ai/cms/admin-http/routes/forms/get-by-id";
import { formsGetSubmissionRoute } from "@jini-ai/cms/admin-http/routes/forms/get-submission";
import { formsListRoute } from "@jini-ai/cms/admin-http/routes/forms/list";
import { formsListSubmissionsRoute } from "@jini-ai/cms/admin-http/routes/forms/list-submissions";
import { FormsPullFailedError, formsPullSubmissionsRoute, type FormsPullSubmissionsInput, type FormsPullSubmissionsRouteDeps } from "@jini-ai/cms/admin-http/routes/forms/pull-submissions";
import type { FormSubmissionsPullResult } from "@jini-ai/cms/forms/site/import-remote-submissions";
import { formsProvidersRoute } from "@jini-ai/cms/admin-http/routes/forms/providers";
import { formsUpdateRoute } from "@jini-ai/cms/admin-http/routes/forms/update";
import { setFormDefinitionStatus, updateFormDefinition, type FormWriteServiceDeps } from "#src/features/forms/index";
import { mountJsonRoute, type JsonRoutePorts } from "@jini-ai/http-kit";
import { createAdminJsonRoutePorts, mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { registerAdminFormsAuthoringRoute } from "#src/server/inbound/admin-http/routes/forms/authoring";
import { registerAdminFormsCreateRoute } from "#src/server/inbound/admin-http/routes/forms/create";
import { registerAdminFormsDeleteSubmissionRoute } from "#src/server/inbound/admin-http/routes/forms/delete-submission";
import type { FormsRouteDeps, FormsRouteRegistrar } from "#src/server/inbound/admin-http/routes/forms/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-041) — the `forms-admin` server module (SPEC-010 Forms, Tier-1
 * sample plugin's admin HTTP surface).
 *
 * Owns the admin registrations (list/create/get-by-id/update/authoring/list-submissions/get-submission/
 * delete-submission, and pull-submissions for form destinations) — moved here verbatim from `app.ts`'s `createApp()`, same registrar function
 * bodies, no behavior change, same relative order. Seven of them are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/forms/*`) mounted behind the admin ports; `create`, `authoring`
 * and `delete-submission` are still hand-written Express routes.
 *
 * Named distinctly from `src/server/modules/forms.ts` (SPEC-031, already existing), which owns
 * the unrelated Forms-to-webhook-notify-subscriber concern, not HTTP routes — mirrors how
 * `integrations.ts` vs `integrations-admin.ts` already split the identical shape in SPEC-034.
 */

/** The two port fields every forms mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function formsPortDeps({ deps }: { deps: FormsRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** These routes never consulted the publishing-credential override (`authorizeDirectOrRespond`,
 *  or `deps.authorize` read directly). */
const directMountOptions = (operation: string) => ({ authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } });

/** The write-service deps the update route's host write functions bind, built per call as the
 *  hand-written route built them per request. */
function formWriteDeps({ deps }: { deps: FormsRouteDeps }, _options: Record<string, never> = {}): FormWriteServiceDeps {
  return {
    executeCommand: deps.executeCommand,
    repo: deps.formDefinitionRepo,
    formCollectionProviders: deps.formCollectionProviders,
    clock: deps.clock,
    idGen: deps.idGen,
    changeSets: deps.changeSets,
    outbox: deps.outbox,
    authorize: deps.authorize,
  };
}

export const registerAdminFormsListRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: formsListRoute, deps: { ...formsPortDeps({ deps }), formDefinitionRepo: deps.formDefinitionRepo } }, directMountOptions("routes/forms/list"));
};

/** Reads `deps.authorize`'s decision itself (its own 403 copy), never the publishing-credential override. */
export const registerAdminFormsProvidersRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: formsProvidersRoute, deps: { ...formsPortDeps({ deps }), formCollectionProviders: deps.formCollectionProviders } }, directMountOptions("routes/forms/_providers"));
};

export const registerAdminFormsGetRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: formsGetRoute, deps: { ...formsPortDeps({ deps }), formDefinitionRepo: deps.formDefinitionRepo } }, directMountOptions("routes/forms/get-by-id"));
};

/** Guarded (`authorizeOrRespond`): a publishing credential answers from its grant. */
export const registerAdminFormsUpdateRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: formsUpdateRoute, deps: {
    ...formsPortDeps({ deps }),
    formDefinitionRepo: deps.formDefinitionRepo,
    // The admin surface's outward copy for a classified domain error is that error's own message.
    outwardErrorMessage: ({ error }) => error.message,
    updateFormDefinition: ({ input }) => updateFormDefinition({ deps: formWriteDeps({ deps }), input }),
    setFormDefinitionStatus: ({ input }) => setFormDefinitionStatus({ deps: formWriteDeps({ deps }), input }),
  } }, { failure: { operation: "routes/forms/update", code: "INTERNAL_ERROR" } });
};

export const registerAdminFormsListSubmissionsRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: formsListSubmissionsRoute, deps: { ...formsPortDeps({ deps }), formDefinitionRepo: deps.formDefinitionRepo, formSubmissionRepo: deps.formSubmissionRepo } }, directMountOptions("routes/forms/list-submissions"));
};

export const registerAdminFormsGetSubmissionRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: formsGetSubmissionRoute, deps: {
    ...formsPortDeps({ deps }), formDefinitionRepo: deps.formDefinitionRepo, formSubmissionRepo: deps.formSubmissionRepo, formDeliveryStatus: deps.formDeliveryStatus,
  } }, directMountOptions("routes/forms/get-submission"));
};

/**
 * The pull route's admin ports. A pull that failed before any published host was read
 * (`FormsPullFailedError`) keeps its own `forms-pull` copy, logged under the cause and correlated
 * to the reference the reply repeats; every other failure is the route's generic fallback.
 */
function formsPullPorts(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord> {
  const ports = createAdminJsonRoutePorts({ authorization: "direct", failure: { operation: "routes/forms/pull-submissions", code: "INTERNAL_ERROR" } });
  return { ...ports, onError: ({ res, error }) => {
    if (!(error instanceof FormsPullFailedError)) { ports.onError?.({ res, error }); return; }
    sendAdminFailure({ res, error: error.cause }, { operation: "forms-pull",
      message: "Form submission retrieval stopped before any published host was read.",
      failure: { action: "Try pulling submissions again. If it still fails, copy details and report this problem.", step: "forms.submissions.pull" },
    });
  } };
}

/**
 * POST — pull the submissions published static sites stored at their hosts into this site
 * (`FormsDeps.formSubmissionsPull`, the same composed port as the `forms_pull_submissions` tool).
 * Body: optional `{ targetId }` to pull from one hosting target only.
 *
 * Mounted at forms/submissions/pull behind {@link formsPullPorts}; never consulted the publishing-credential override.
 */
export const registerAdminFormsPullSubmissionsRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountJsonRoute<FormsPullSubmissionsInput, FormSubmissionsPullResult, FormsPullSubmissionsRouteDeps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...formsPullSubmissionsRoute, ports: formsPullPorts() }, deps: { ...formsPortDeps({ deps }), formSubmissionsPull: deps.formSubmissionsPull } });
};

export function createFormsAdminModule(deps: FormsRouteDeps): ServerModuleHandle {
  return {
    name: "forms-admin",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminFormsListRoute({ app, deps });
      registerAdminFormsCreateRoute({ app, deps });
      registerAdminFormsProvidersRoute({ app, deps });
      registerAdminFormsGetRoute({ app, deps });
      registerAdminFormsUpdateRoute({ app, deps });
      registerAdminFormsAuthoringRoute({ app, deps });
      registerAdminFormsListSubmissionsRoute({ app, deps });
      registerAdminFormsGetSubmissionRoute({ app, deps });
      registerAdminFormsDeleteSubmissionRoute({ app, deps });
      registerAdminFormsPullSubmissionsRoute({ app, deps });
    },
  };
}
