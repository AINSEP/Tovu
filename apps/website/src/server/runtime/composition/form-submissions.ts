import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import { withFormPullLease, type FormDefinitionRepoPort, type FormPullLeasePort, type FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import { processOutbox } from "#src/contracts/core/events/index";
import type { CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import type { DeployHostKit } from "#src/features/deployments/deploy-targets/types";
import type { StaticPublishFormDestinationPort } from "#src/features/deployments/static-publish/index";
import { createFormDestinationPort, FORM_PULL_LEASE_MS, formDestinationKey, listFormDestinations, pullFromFormDestination, type FormDestinationAddress, type FormDestinationRegistry } from "#src/features/form-destinations/index";
import { readFormDestinationSetting } from "#src/features/settings/form-destination";
import { readFormsAutoPull } from "#src/features/settings/index";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { buildFormDestinationManifest, importRemoteFormSubmissions, type FormDestinationPullReport, type FormImportCounts, type FormPullCounts, type FormSubmissionReceiptPort, type FormSubmissionsPullPort, type FormSubmissionsPullResult, type FormsAutoPullPort, type RemoteImportResult, type RemoteSubmissionInput } from "#src/features/forms/index";
import type { ObservabilityPort } from "#src/platform/observability/index";

/**
 * @file Composes the site's form destination once: the publish-side port (active forms, the receiver
 * the site's `core.forms` setting selects, its key) and the pull that brings stored submissions
 * back. The pull joins a form destination module's `pull`/`ack` (`features/form-destinations/`) to
 * the forms feature's import, so neither feature imports the other.
 *
 * Every pull, manual or automatic, holds its receiver's lease (`withFormPullLease`), so two pulls
 * never read the same receiver at once. The automatic pull (`autoPull`) is what the serving app's
 * startup and admin sign-in triggers run (`form-pull-triggers.ts`); it reads `core.forms/autoPull`
 * fresh each time and is also skipped when the receiver's last pull started under a minute ago.
 */
export interface FormSubmissionsCompositionDeps {
  readonly formDefinitionRepo: Pick<FormDefinitionRepoPort, "list" | "findBySlug">;
  readonly formSubmissionRepo: Pick<FormSubmissionRepoPort, "create" | "transaction">;
  readonly receipts: FormSubmissionReceiptPort;
  /** Per-receiver pull admission, shared by manual and automatic pulls. */
  readonly pullLeases: FormPullLeasePort;
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
): { destination: StaticPublishFormDestinationPort; pull: FormSubmissionsPullPort; autoPull: FormsAutoPullPort } {
  const destination = createFormDestinationPort({
    listForms: async ({ workspaceId }) => buildFormDestinationManifest({ definitions: await required.formDefinitionRepo.list({ workspaceId }) }),
    credentials: required.credentials,
    loadRegistry: required.loadFormDestinations,
    readSetting: ({ workspaceId }) => readFormDestinationSetting({ settingsRepo: required.settingsRepo, workspaceId }),
  });
  return {
    destination,
    pull: { pull: (input, options = {}) => pullAll({ deps: required, workspaceId: input.workspaceId }, { ...optional, ...options }) },
    autoPull: { run: async ({ workspaceId }) => {
      // `core.forms/autoPull` is read fresh at every trigger; manual pulls never read it.
      if (!await readFormsAutoPull({ settingsRepo: required.settingsRepo, workspaceId })) return;
      await pullAll({ deps: required, workspaceId }, { ...optional, trigger: "automatic" });
    } },
  };
}

/** One receiver's report plus its rows counted per form slug. */
interface ReceiverPull {
  readonly report: FormDestinationPullReport;
  readonly forms: readonly SlugPullCounts[];
}
type SlugPullCounts = FormImportCounts & { failed: number };

/** Each saved destination in turn; one failing host is reported and the others still run. Delivery
 * of `form.submission.received` starts in the background, as on the live submit path.
 * @complexity O(destinations * pull cap). */
async function pullAll(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string },
  optional: { trigger?: "automatic"; targetId?: string; observability?: ObservabilityPort; kit?: DeployHostKit; warn?: (message: string) => void; logError?: (message: string) => void },
): Promise<FormSubmissionsPullResult> {
  const { deps, workspaceId } = required;
  // `targetId` (the tool's field name, kept for compatibility) is the receiver scope: the hosting
  // target id for a co-hosted receiver.
  const saved = await listFormDestinations({ credentials: deps.credentials, workspaceId }, optional.targetId ? { scope: optional.targetId } : {});
  if (saved.length === 0) return { message: "No published site receives form submissions yet. Publish the site with its forms to a hosting target that supports them, then pull again.", destinations: [], forms: [], totals: { imported: 0, alreadyImported: 0, unmapped: 0, failed: 0 }, ran: true };
  const registry = await deps.loadFormDestinations(workspaceId);
  const kit = optional.kit ?? createDeployHostKit({ observability: optional.observability });
  const receivers: ReceiverPull[] = [];
  for (const { scope, destination } of saved) {
    receivers.push(await pullLeased({ deps, workspaceId, scope, destination, module: registry.resolve({ scope })?.module ?? {}, kit, trigger: optional.trigger ?? "manual" }, { logError: optional.logError }));
  }
  if (receivers.some(({ report }) => report.imported > 0)) {
    void processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock }).catch(() => (optional.warn ?? console.warn)("[form-submissions] notification delivery for pulled submissions failed; the outbox retries it"));
  }
  return pullResult({ deps, workspaceId, receivers });
}

type PullOneInput = { deps: FormSubmissionsCompositionDeps; workspaceId: string; scope: string; destination: FormDestinationAddress; module: Parameters<typeof pullFromFormDestination>[0]["module"]; kit: DeployHostKit };

/** One receiver's pull under its lease. A refused lease reads nothing and is reported as refused.
 * `FORM_PULL_LEASE_MS` outlasts the bounded pull (proof next to the bounds in `pull.ts`).
 * @throws whatever the lease store throws; pull failures become the report instead.
 * @complexity O(pull cap * rows) plus one lease claim and release. */
async function pullLeased(
  required: PullOneInput & { trigger: "manual" | "automatic" },
  optional: { logError?: (message: string) => void } = {},
): Promise<ReceiverPull> {
  const { deps, workspaceId, scope, destination, trigger } = required;
  const leased = await withFormPullLease({ leases: deps.pullLeases, workspaceId, receiverKey: formDestinationKey({ scope, url: destination.url }),
    token: deps.idGen.newId(), nowIso: deps.clock.nowIso(), leaseMs: FORM_PULL_LEASE_MS, trigger, pull: () => pullOne(required, optional) });
  if (leased.ran) return leased.result;
  return { report: { ...emptyReport({ scope, destination }), refused: leased.reason }, forms: [] };
}

/** A receiver report with nothing read. @complexity O(1). */
function emptyReport({ scope, destination }: { scope: string; destination: FormDestinationAddress }, _optional = {}) {
  return { targetId: scope, url: new URL(destination.url).origin, pulled: 0, imported: 0, duplicates: 0, acknowledged: 0, hasMore: false, invalid: [], skipped: [] };
}

/** One destination's pull and import; a failure becomes that destination's report, never a throw.
 * The failure's full cause is logged under a reference the report repeats, so a person can quote it.
 * @complexity O(pull cap * rows). */
async function pullOne(
  required: PullOneInput,
  optional: { logError?: (message: string) => void } = {},
): Promise<ReceiverPull> {
  const { deps, workspaceId, scope, destination, module, kit } = required;
  const base = { targetId: scope, url: new URL(destination.url).origin };
  const forms = new Map<string, SlugPullCounts>();
  try {
    const pulled = await pullFromFormDestination({ module, scope, destination, kit,
      importPage: ({ items, destinationKey }) => importCounted({ forms, items, run: () => importRemoteFormSubmissions({ deps: { definitionRepo: deps.formDefinitionRepo, submissionRepo: deps.formSubmissionRepo,
        receipts: deps.receipts, outbox: deps.outbox, clock: deps.clock, idGen: deps.idGen }, workspaceId, destinationKey, items }) }) });
    return { report: { ...base, ...sumPages({ pages: pulled.pages }), pulled: pulled.pulled, acknowledged: pulled.acknowledged, hasMore: pulled.hasMore }, forms: [...forms.values()] };
  } catch (error) {
    const reference = deps.idGen.newId();
    (optional.logError ?? console.error)(`[form-submissions] pull from ${base.url} (${scope}) failed, reference ${reference}: ${failureDetail({ error, secret: destination.secret })}`);
    const message = error instanceof Error ? error.message : String(error);
    return { report: { ...emptyReport({ scope, destination }),
      error: `${message} If it fails again, report reference ${reference}: the site's server log has the details.` }, forms: [...forms.values()] };
  }
}

/** One page's import, counted per form: its own counts when it commits, every row as `failed` when
 * it throws (none of that page is acknowledged, so all of it is read again next time).
 * @throws whatever the import throws. @complexity O(rows). */
async function importCounted(
  required: { forms: Map<string, SlugPullCounts>; items: readonly RemoteSubmissionInput[]; run: () => Promise<RemoteImportResult> },
  _optional: Record<string, never> = {},
): Promise<RemoteImportResult> {
  const { forms, items } = required;
  try {
    const page = await required.run();
    for (const counts of page.forms) addCounts({ forms, counts: { ...counts, failed: 0 } });
    return page;
  } catch (error) {
    for (const item of items) addCounts({ forms, counts: { formSlug: item.formSlug, imported: 0, alreadyImported: 0, unmapped: 0, failed: 1 } });
    throw error;
  }
}

/** Adds `counts` to its slug's running total (created on first sight). @complexity O(1). */
function addCounts({ forms, counts }: { forms: Map<string, SlugPullCounts>; counts: SlugPullCounts }, _optional = {}): void {
  const total = forms.get(counts.formSlug);
  if (!total) { forms.set(counts.formSlug, { ...counts }); return; }
  total.imported += counts.imported;
  total.alreadyImported += counts.alreadyImported;
  total.unmapped += counts.unmapped;
  total.failed += counts.failed;
}

/** The whole pull's report: receivers, per-form counts with form ids, totals and the lease outcome.
 * `ran: false` only when every receiver refused (one refusal reason is reported).
 * @complexity O(receivers * forms) plus one form-definition list when anything was counted. */
async function pullResult(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string; receivers: readonly ReceiverPull[] },
  _optional: Record<string, never> = {},
): Promise<FormSubmissionsPullResult> {
  const destinations = required.receivers.map(({ report }) => report);
  const merged = new Map<string, SlugPullCounts>();
  for (const receiver of required.receivers) for (const counts of receiver.forms) addCounts({ forms: merged, counts });
  const forms = await withFormIds({ deps: required.deps, workspaceId: required.workspaceId, counts: [...merged.values()] });
  const totals = {
    imported: sum({ forms, key: "imported" }), alreadyImported: sum({ forms, key: "alreadyImported" }),
    unmapped: sum({ forms, key: "unmapped" }), failed: sum({ forms, key: "failed" }),
  };
  const base = { message: pullMessage({ destinations }), destinations, forms, totals };
  const refusal = destinations[0]?.refused;
  return refusal && destinations.every((report) => report.refused) ? { ...base, ran: false, reason: refusal } : { ...base, ran: true };
}

/** Joins each slug to its form id; one list read, skipped when nothing was counted. @complexity O(forms + definitions). */
async function withFormIds(
  required: { deps: FormSubmissionsCompositionDeps; workspaceId: string; counts: readonly SlugPullCounts[] },
  _optional: Record<string, never> = {},
): Promise<FormPullCounts[]> {
  if (required.counts.length === 0) return [];
  const ids = new Map((await required.deps.formDefinitionRepo.list({ workspaceId: required.workspaceId })).map((definition) => [definition.slug, definition.id]));
  return required.counts.map((counts) => ({ formId: ids.get(counts.formSlug) ?? null, ...counts }));
}

/** @complexity O(forms). */
function sum({ forms, key }: { forms: readonly FormPullCounts[]; key: "imported" | "alreadyImported" | "unmapped" | "failed" }, _optional = {}): number {
  return forms.reduce((total, counts) => total + counts[key], 0);
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
  for (const report of destinations) parts.push(...receiverNote({ report }));
  return parts.join(" ");
}

/** A receiver's failure, or that its lease refused the pull; nothing when it ran cleanly. Only a
 * manual pull's message reaches a person, and a manual pull is refused only as `already-running`
 * (an automatic pull's `recent` refusal is in its report, which no one reads). @complexity O(1). */
function receiverNote({ report }: { report: FormDestinationPullReport }, _optional = {}): string[] {
  if (report.error) return [`${report.url}: ${report.error}`];
  if (report.refused) return [`${report.url}: a pull from this site is already running; its submissions appear when it finishes.`];
  return [];
}
