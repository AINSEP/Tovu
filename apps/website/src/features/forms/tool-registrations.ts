/**
 * @file Forms' half of ADR-049 Decision 4, the host binding: the catalog, the nine handlers, the
 * authored risk map, the typed-error mapping and the `content_duplicate` form copy live in
 * `@jini-ai/cms/forms` (`buildFormsToolRegistrations`, `duplicateFormDefinition`). This file supplies
 * what is Tovu's: the route deps (read live), the audited write wrappers with the forms permission,
 * reserved slugs and admin-editor wording (`./index.ts`), the slug rule, the duplicate-name search,
 * and the search vocabulary and approval policy (`toolMetadata`).
 */
import {
  withToolMetadata,
  type ToolContributor,
  type ToolRegistration,
} from "@jini-ai/core";
import type { AuthorizeFn, ChangeSetRepoPort, OutboxPort } from "@jini-ai/core/contracts/events";
import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import { contentReadVocabulary } from "../../contracts/core/tool-metadata/content-read.js";
import {
  buildFormsToolRegistrations,
  duplicateFormDefinition,
  formsDerivedRisk,
  type FormCollectionRegistry,
  type FormCommandExecutorPort,
  type FormDefinitionRepoPort,
  type FormsPackageToolDeps,
  type FormSubmissionRepoPort,
} from "@jini-ai/cms/forms";
import type { DuplicateResourceHandlerContributor } from "@jini-ai/core/contracts/site/assistant-tool-contributions";
import { toolMetadata } from "@jini-ai/core/tool-metadata/site/forms";
import { deriveDuplicateName } from "../content-duplication/derive-available-name.js";
import type { FormDeliveryStatusPort } from "@jini-ai/core/contracts/headless/form-delivery-status";
import { createFormDefinition, formSlugPolicy, setFormDefinitionStatus, updateFormDefinition } from "#src/features/forms/index";
import type { FormSubmissionsPullPort } from "./import-remote-submissions.js";

/**
 * The exact slice of the route-deps bag Forms' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object, with the CMS command executor supplied by composition.
 */
export interface FormsToolDeps {
  /** Same app-scoped collection registry as the admin provider listing. */
  formCollectionProviders?: () => FormCollectionRegistry;
  executeCommand: FormCommandExecutorPort;
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: Clock;
  idGen: IdGenerator;
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
  /** `RouteDeps.formSubmissionsPull`: absent outside the real site composition. */
  formSubmissionsPull?: FormSubmissionsPullPort;
  /** `RouteDeps.formDeliveryStatus`: absent outside the real site composition. */
  formDeliveryStatus?: FormDeliveryStatusPort;
}

/**
 * The package deps for one set of route deps. The route deps bag is a live object (a host can swap
 * its authorizer or repos after the registrations are built), so every field is read from it at
 * call time, never copied here. The audited write wrappers (permission, reserved slugs, the
 * admin-editor wording), the slug rule and the duplicate-name search are the host's.
 */
function toPackageDeps({ routeDeps }: { routeDeps: FormsToolDeps }, _optional = {}): FormsPackageToolDeps {
  return {
    get formCollectionProviders() { return routeDeps.formCollectionProviders; },
    get executeCommand() { return routeDeps.executeCommand; },
    get authorize() { return routeDeps.authorize; },
    get workspaceId() { return routeDeps.workspaceId; },
    get clock() { return routeDeps.clock; },
    get idGen() { return routeDeps.idGen; },
    get changeSets() { return routeDeps.changeSets; },
    get outbox() { return routeDeps.outbox; },
    get formDefinitionRepo() { return routeDeps.formDefinitionRepo; },
    get formSubmissionRepo() { return routeDeps.formSubmissionRepo; },
    get formSubmissionsPull() { return routeDeps.formSubmissionsPull; },
    get formDeliveryStatus() { return routeDeps.formDeliveryStatus; },
    formWrites: { create: createFormDefinition, update: updateFormDefinition, setStatus: setFormDefinitionStatus },
    slugPolicy: formSlugPolicy,
    deriveDuplicateName,
  };
}

export function buildFormsRegistrations(routeDeps: FormsToolDeps): ToolRegistration[] {
  return withToolMetadata({ registrations: buildFormsToolRegistrations({ deps: toPackageDeps({ routeDeps }) }, { hostReads: contentReadVocabulary }), metadata: toolMetadata });
}

/**
 * `content_duplicate`'s resource contributor for `"form"`, resolving to `admin.forms.manage` — the
 * SAME permission this domain's own `forms_create_definition`/`forms_update_definition` already
 * declare. No new permission is invented for the generic tool.
 *
 * Called from the composition root (`server/runtime/composition/tool-catalog-manifest.ts`), never
 * from within this domain: `.dependency-cruiser.mjs`'s
 * `domain-no-direct-assistant-tool-registration` rule bans any non-type-only `features/** ->
 * assistant/**` import, so this function returns plain data and imports only the registry's TYPE.
 */
export function contributeFormsDuplicateHandlers(): DuplicateResourceHandlerContributor<FormsToolDeps>[] {
  return [
    {
      resource: "form",
      build: (routeDeps, _optional = {}) => ({
        permission: "admin.forms.manage",
        duplicate: (input, _optional = {}) => duplicateFormDefinition({ deps: toPackageDeps({ routeDeps }), input }),
      }),
    },
  ];
}

/**
 * Contributes Forms' AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildFormsRegistrations`/
 * `formsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2). Like
 * `content-types`, this converts AFTER `widgets` (this batch's first conversion) specifically because
 * the former Tovu copies of `Jini/packages/cms/src/widgets/resolvers/{contact-form,create-core-resolvers}.ts` imported `forms` internally — with
 * `widgets` off the static `DOMAIN_SLICES` array first, `assistant -> widgets -> forms -> assistant`
 * cannot close.
 */
export function contributeFormsTools(): ToolContributor<FormsToolDeps, unknown> {
  return { domain: "forms", build: buildFormsRegistrations, risk: formsDerivedRisk };
}
