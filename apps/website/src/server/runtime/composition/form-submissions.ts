import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import { processOutbox } from "#src/contracts/core/events/index";
import type { CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import type { DeployHostKit } from "#src/features/deployments/deploy-targets/types";
import type { StaticPublishFormDestinationPort } from "#src/features/deployments/static-publish/index";
import { createFormDestinationPort, listFormDestinations, pullFromFormDestination, type FormDestinationAddress, type FormDestinationRegistry } from "#src/features/form-destinations/index";
import { readFormDestinationSetting } from "#src/features/settings/form-destination";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { buildFormDestinationManifest, importRemoteFormSubmissions, type FormDestinationPullReport, type FormSubmissionReceiptPort, type FormSubmissionsPullPort, type RemoteImportResult } from "#src/features/forms/index";
import type { ObservabilityPort } from "#src/platform/observability/index";

/**
 * @file Composes the site's form destination once: the publish-side port (active forms, the receiver
 * the site's `core.forms` setting selects, its key) and the pull that brings stored submissions
 * back. The pull joins a form destination module's `pull`/`ack` (`features/form-destinations/`) to
 * the forms feature's import, so neither feature imports the other.
 */
export interface FormSubmissionsCompositionDeps {
  readonly formDefinitionRepo: Pick<FormDefinitionRepoPort, "list" | "findBySlug">;
  readonly formSubmissionRepo: Pick<FormSubmissionRepoPort, "create" | "transaction">;
  readonly receipts: FormSubmissionReceiptPort;
  readonly outbox: OutboxPort;
  readonly bus: EventBusPort;
  readonly clock: Clock & { nowIso(): string };
  readonly idGen: IdGenerator;
  readonly credentials: CustomCredentialWriteDeps;
  readonly loadFormDestinations: (workspaceId: string) => Promise<FormDestinationRegistry>;
  /** For the site's `core.forms` `receiver` read (`features/settings/form-destination.ts`). */
  readonly settingsRepo: SettingsRepoPort;
}

/** @complexity O(1) to build; see each port for its own cost. */
export function composeFormSubmissions(
  required: FormSubmissionsCompositionDeps,
  optional: { observability?: ObservabilityPort; kit?: DeployHostKit; warn?: (message: string) => void; logError?: (message: string) => void } = {},
): { destination: StaticPublishFormDestinationPort; pull: FormSubmissionsPullPort } {
  const destination = createFormDestinationPort({
    listForms: async ({ workspaceId }) => buildFormDestinationManifest({ definitions: await required.formDefinitionRepo.list({ workspaceId }) }),
    credentials: required.credentials,
    loadRegistry: required.loadFormDestinations,
    readSetting: ({ workspaceId }) => readFormDestinationSetting({ settingsRepo: required.settingsRepo, workspaceId }),
  });
  return { destination, pull: { pull: (input, options = {}) => pullAll({ deps: required, workspaceId: input.workspaceId }, { ...optional, ...options }) } };
}

/** Each saved destination in turn; one failing host is reported and the others still run. Delivery
 * of `form.submission.received` starts in the background, as on the live submit path.
 * @complexity O(destinations * pull cap). */
async function pullAll(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string },
  optional: { targetId?: string; observability?: ObservabilityPort; kit?: DeployHostKit; warn?: (message: string) => void; logError?: (message: string) => void },
): Promise<{ message: string; destinations: FormDestinationPullReport[] }> {
  const { deps, workspaceId } = required;
  // `targetId` (the tool's field name, kept for compatibility) is the receiver scope: the hosting
  // target id for a co-hosted receiver.
  const saved = await listFormDestinations({ credentials: deps.credentials, workspaceId }, optional.targetId ? { scope: optional.targetId } : {});
  if (saved.length === 0) return { message: "No published site receives form submissions yet. Publish the site with its forms to a hosting target that supports them, then pull again.", destinations: [] };
  const registry = await deps.loadFormDestinations(workspaceId);
  const kit = optional.kit ?? createDeployHostKit({ observability: optional.observability });
  const destinations: FormDestinationPullReport[] = [];
  for (const { scope, destination } of saved) {
    destinations.push(await pullOne({ deps, workspaceId, scope, destination, module: registry.resolve({ scope })?.module ?? {}, kit }, { logError: optional.logError }));
  }
  if (destinations.some((report) => report.imported > 0)) {
    void processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock }).catch(() => (optional.warn ?? console.warn)("[form-submissions] notification delivery for pulled submissions failed; the outbox retries it"));
  }
  return { message: pullMessage({ destinations }), destinations };
}

/** One destination's pull and import; a failure becomes that destination's report, never a throw.
 * The failure's full cause is logged under a reference the report repeats, so a person can quote it.
 * @complexity O(pull cap * rows). */
async function pullOne(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string; scope: string; destination: FormDestinationAddress; module: Parameters<typeof pullFromFormDestination>[0]["module"]; kit: DeployHostKit },
  optional: { logError?: (message: string) => void } = {},
): Promise<FormDestinationPullReport> {
  const { deps, workspaceId, scope, destination, module, kit } = required;
  const base = { targetId: scope, url: new URL(destination.url).origin };
  try {
    const pulled = await pullFromFormDestination({ module, scope, destination, kit,
      importPage: ({ items, destinationKey }) => importRemoteFormSubmissions({ deps: { definitionRepo: deps.formDefinitionRepo, submissionRepo: deps.formSubmissionRepo,
        receipts: deps.receipts, outbox: deps.outbox, clock: deps.clock, idGen: deps.idGen }, workspaceId, destinationKey, items }) });
    return { ...base, ...sumPages({ pages: pulled.pages }), pulled: pulled.pulled, acknowledged: pulled.acknowledged, hasMore: pulled.hasMore };
  } catch (error) {
    const reference = deps.idGen.newId();
    (optional.logError ?? console.error)(`[form-submissions] pull from ${base.url} (${scope}) failed, reference ${reference}: ${failureDetail({ error, secret: destination.secret })}`);
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, pulled: 0, imported: 0, duplicates: 0, acknowledged: 0, hasMore: false, invalid: [], skipped: [],
      error: `${message} If it fails again, report reference ${reference}: the site's server log has the details.` };
  }
}

/** The failure's root stack for the log (the original cause when there is one), with the key removed.
 * @complexity O(stack bytes). */
function failureDetail({ error, secret }: { error: unknown; secret: string }, _optional = {}): string {
  const root = error instanceof Error && error.cause !== undefined ? error.cause : error;
  const text = root instanceof Error ? root.stack ?? root.message : String(root);
  return secret ? text.replaceAll(secret, "[redacted]") : text;
}

/** @complexity O(pages + rows). */
function sumPages({ pages }: { pages: readonly RemoteImportResult[] }, _optional = {}) {
  return {
    imported: pages.reduce((total, page) => total + page.imported, 0),
    duplicates: pages.reduce((total, page) => total + page.duplicates, 0),
    invalid: pages.flatMap((page) => page.invalid),
    skipped: pages.flatMap((page) => page.skipped),
  };
}

/** One plain sentence for the person, plus the per-destination next steps. @complexity O(destinations). */
function pullMessage({ destinations }: { destinations: readonly FormDestinationPullReport[] }, _optional = {}): string {
  const imported = destinations.reduce((total, report) => total + report.imported, 0);
  const parts = [`Imported ${imported} new form submission${imported === 1 ? "" : "s"} from ${destinations.length} published site${destinations.length === 1 ? "" : "s"}.`];
  const invalid = destinations.reduce((total, report) => total + report.invalid.length, 0);
  if (invalid > 0) parts.push(`${invalid} did not pass the form's checks; they are imported so you can review them in Submissions.`);
  const skipped = destinations.reduce((total, report) => total + report.skipped.length, 0);
  if (skipped > 0) parts.push(`${skipped} belong to forms that no longer exist and were left at the host.`);
  if (destinations.some((report) => report.hasMore)) parts.push("More are waiting: pull again.");
  for (const report of destinations) if (report.error) parts.push(`${report.url}: ${report.error}`);
  return parts.join(" ");
}
