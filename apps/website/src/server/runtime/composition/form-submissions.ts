import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import { processOutbox } from "#src/contracts/core/events/index";
import type { CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import type { DeployHostKit, DeployTargetRegistry, FormDestinationAddress } from "#src/features/deployments/deploy-targets/types";
import { createFormDestinationPort, listFormDestinations, pullFromFormDestination, type StaticPublishFormDestinationPort } from "#src/features/deployments/static-publish/index";
import { buildFormDestinationManifest, importRemoteFormSubmissions, type FormDestinationPullReport, type FormSubmissionReceiptPort, type FormSubmissionsPullPort, type RemoteImportResult } from "#src/features/forms/index";
import type { ObservabilityPort } from "#src/platform/observability/index";

/**
 * @file Composes the site's form destination once: the publish-side port (active forms + receiver
 * key) and the pull that brings stored submissions back. The pull joins the deploy target's generic
 * form methods to the forms feature's import, so neither feature imports the other.
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
  readonly loadDeployTargets: (workspaceId: string) => Promise<DeployTargetRegistry>;
}

/** @complexity O(1) to build; see each port for its own cost. */
export function composeFormSubmissions(
  required: FormSubmissionsCompositionDeps,
  optional: { observability?: ObservabilityPort; kit?: DeployHostKit; warn?: (message: string) => void } = {},
): { destination: StaticPublishFormDestinationPort; pull: FormSubmissionsPullPort } {
  const destination = createFormDestinationPort({
    listForms: async ({ workspaceId }) => buildFormDestinationManifest({ definitions: await required.formDefinitionRepo.list({ workspaceId }) }),
    credentials: required.credentials,
  });
  return { destination, pull: { pull: (input, options = {}) => pullAll({ deps: required, workspaceId: input.workspaceId }, { ...optional, ...options }) } };
}

/** Each saved destination in turn; one failing host is reported and the others still run. Delivery
 * of `form.submission.received` starts in the background, as on the live submit path.
 * @complexity O(destinations * pull cap). */
async function pullAll(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string },
  optional: { targetId?: string; observability?: ObservabilityPort; kit?: DeployHostKit; warn?: (message: string) => void },
): Promise<{ message: string; destinations: FormDestinationPullReport[] }> {
  const { deps, workspaceId } = required;
  const saved = await listFormDestinations({ credentials: deps.credentials, workspaceId }, optional.targetId ? { targetId: optional.targetId } : {});
  if (saved.length === 0) return { message: "No published site receives form submissions yet. Publish the site with its forms to a hosting target that supports them, then pull again.", destinations: [] };
  const registry = await deps.loadDeployTargets(workspaceId);
  const kit = optional.kit ?? createDeployHostKit({ observability: optional.observability });
  const destinations: FormDestinationPullReport[] = [];
  for (const { targetId, destination } of saved) {
    destinations.push(await pullOne({ deps, workspaceId, targetId, destination, module: registry.get(targetId)?.module ?? {}, kit }));
  }
  if (destinations.some((report) => report.imported > 0)) {
    void processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock }).catch(() => (optional.warn ?? console.warn)("[form-submissions] notification delivery for pulled submissions failed; the outbox retries it"));
  }
  return { message: pullMessage({ destinations }), destinations };
}

/** One destination's pull and import; a failure becomes that destination's report, never a throw.
 * @complexity O(pull cap * rows). */
async function pullOne(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string; targetId: string; destination: FormDestinationAddress; module: Parameters<typeof pullFromFormDestination>[0]["module"]; kit: DeployHostKit },
  _optional: Record<string, never> = {},
): Promise<FormDestinationPullReport> {
  const { deps, workspaceId, targetId, destination, module, kit } = required;
  const base = { targetId, url: new URL(destination.url).origin };
  try {
    const pulled = await pullFromFormDestination({ module, targetId, destination, kit,
      importPage: ({ items, destinationKey }) => importRemoteFormSubmissions({ deps: { definitionRepo: deps.formDefinitionRepo, submissionRepo: deps.formSubmissionRepo,
        receipts: deps.receipts, outbox: deps.outbox, clock: deps.clock, idGen: deps.idGen }, workspaceId, destinationKey, items }) });
    return { ...base, ...sumPages({ pages: pulled.pages }), pulled: pulled.pulled, acknowledged: pulled.acknowledged, hasMore: pulled.hasMore };
  } catch (error) {
    return { ...base, pulled: 0, imported: 0, duplicates: 0, acknowledged: 0, hasMore: false, invalid: [], skipped: [], error: error instanceof Error ? error.message : String(error) };
  }
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
