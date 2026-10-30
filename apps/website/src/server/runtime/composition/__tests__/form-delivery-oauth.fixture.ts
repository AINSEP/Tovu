import type { DomainEvent, OutboxPort, OutboxRecord } from "@jini-ai/cms/core";
import { FORM_DELIVERY_EVENT, InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FormDeliveryBinding, type FormDeliveryJob, type FormDeliveryPlan,
  type FormDeliveryPlanPort } from "@jini-ai/cms/forms";
import type { HttpClientPort } from "@jini-ai/core/primitives";
import { createAdminSurfaceActionDispatcher, defineAdminSurfaceContribution, type AdminSurfaceActionOutcome } from "@jini-ai/agent-plugins/admin-surfaces";
import { InMemorySettingsRepo, type AuthorizeFn } from "@jini-ai/core/settings";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { createFakeClock, type FakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "#src/contracts/core/events/index";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { ADMIN_SURFACES_FILENAME } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import type { ApiConnectionHost } from "#src/features/api-connections/host";
import { createCustomCredential, InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { InMemoryKeyring as CustomCredentialKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer as CustomCredentialSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { loadFormDestinationRegistry, type FormDestinationKit } from "#src/features/form-destinations/index";
import { createSettingsPrincipalLookup, ensureFormDeliverySettings, readFormDeliveryBindings, writeFormDeliveryBindings } from "#src/features/settings/index";
import { composeAgentPluginConnections } from "../agent-plugin-connections.js";
import { composeFormDelivery } from "../form-delivery.js";
import { composeFormDeliveryDeliverer } from "../form-delivery-deliverer.js";

/**
 * @file Harness for the G14b end-to-end proof that a form submission reaches a push destination
 * through a plugin's OAuth connection. Real pieces: `composeAgentPluginConnections` (API-connection
 * host, sealed vault token store, plugin settings), `composeFormDelivery` (Jini planner and
 * subscriptions), `composeFormDeliveryDeliverer` (OAuth port ahead of saved custom credentials) and
 * the site's `processOutbox` with its form-delivery retry policy. Stand-ins: an in-memory outbox
 * observed by {@link ObservedOutbox}, and a plan store that enqueues each plan's child jobs (the SQL
 * one does it in the plan's transaction). The caller routes `http` and `kit` to its local fake
 * provider; both must throw for any other host. Used by the acme-office test next to this file and
 * by the google-workspace plugin's own end-to-end test.
 */

export const WORKSPACE = "ws-1";
export const FORM_ID = "form-contact";
export const FORM_SLUG = "contact";
const ADMIN = "admin-1";
const T0 = "2026-10-20T10:00:00.000Z";
/** The site's public origin; the hosted callback URL is built on it (no request is ever sent there). */
const PUBLIC_URL = "https://site.example.test";

/** One outbox row as the ledger holds it. */
export interface OutboxRowView {
  readonly id: string;
  readonly event: DomainEvent;
  readonly status: OutboxRecord["status"];
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly lastError?: string;
}

/** The site's in-memory outbox, with every row's current state readable by the test. */
export class ObservedOutbox implements OutboxPort {
  private readonly inner = new InMemoryOutbox();
  readonly rows = new Map<string, OutboxRowView>();

  async enqueue(event: DomainEvent): Promise<void> {
    await this.inner.enqueue(event);
    this.rows.set(event.id, { id: event.id, event, status: "pending", attempts: 0, nextAttemptAt: event.occurredAt });
  }

  async claimPending(input: Parameters<OutboxPort["claimPending"]>[0]): Promise<OutboxRecord[]> {
    const claimed = await this.inner.claimPending(input);
    for (const row of claimed) this.update(row.id, { status: "processing", attempts: row.attempts });
    return claimed;
  }

  async markDelivered(input: Parameters<OutboxPort["markDelivered"]>[0]): Promise<void> {
    await this.inner.markDelivered(input);
    this.update(input.id, { status: "delivered" });
  }

  async markFailed(input: Parameters<OutboxPort["markFailed"]>[0]): Promise<void> {
    await this.inner.markFailed(input);
    this.update(input.id, { status: input.nextStatus, lastError: input.error, nextAttemptAt: input.nextAttemptAt });
  }

  private update(id: string, change: Partial<OutboxRowView>): void {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...change });
  }
}

/** One delivery child job and its ledger state. */
export interface DeliveryJobView extends OutboxRowView { readonly job: FormDeliveryJob }

/** Plan-once storage that enqueues the plan's child jobs, keyed by (workspace, submission); each
 * enqueued job is also kept typed by its outbox id in `jobs`. */
function enqueueingPlans(outbox: ObservedOutbox, jobs: Map<string, FormDeliveryJob>): FormDeliveryPlanPort {
  const stored = new Map<string, FormDeliveryPlan>();
  return {
    async once({ workspaceId, submissionId, build }) {
      const key = JSON.stringify([workspaceId, submissionId]);
      const found = stored.get(key);
      if (found) return found;
      const plan = await build();
      stored.set(key, plan);
      for (const job of plan.jobs) {
        jobs.set(job.id, job.payload);
        await outbox.enqueue({ ...job, payload: { ...job.payload } });
      }
      return plan;
    },
  };
}

export interface OAuthDeliverySite {
  readonly clock: FakeClock;
  readonly outbox: ObservedOutbox;
  readonly host: ApiConnectionHost;
  /** The composed deliverer itself (one attempt), for a job the planner would not produce. */
  readonly deliver: ReturnType<typeof composeFormDeliveryDeliverer>;
  /** Signs the plugin's connection in (or reconnects it) through the real service; returns its ref. */
  connect(required: { pluginId: string; consent: Consent; scopeSetIds?: readonly string[] }): Promise<string>;
  /** Stages a sign-in as another account and confirms the switch (same ref, new account). */
  switchAccount(required: { pluginId: string; consent: Consent; scopeSetIds?: readonly string[] }): Promise<void>;
  /** Writes one of the plugin's own settings, as its admin surface would. */
  setPluginSetting(required: { pluginId: string; key: string; value: Record<string, boolean> }): Promise<void>;
  /** Saves `core.forms/deliveryBindings` through the validating writer. */
  bind(required: { bindings: readonly Record<string, unknown>[] }): Promise<void>;
  /** The stored `core.forms/deliveryBindings` list, as delivery planning reads it. */
  bindings(): Promise<readonly FormDeliveryBinding[]>;
  /** One admin-surface action as the admin route runs it: the composition's handler host (reloaded first) behind Jini's dispatcher. */
  surfaceAction(required: { pluginId: string; surfaceId: string; action: string; payload?: unknown }, optional?: { principalId?: string }): Promise<AdminSurfaceActionOutcome>;
  /** A saved custom credential (the static connection kind); returns its id. */
  saveCustomCredential(required: { label: string; baseUrl: string; worksFor: readonly string[]; token: string }): Promise<string>;
  /** Stores a submission of the contact form and enqueues its `form.submission.received` event. */
  submit(required: { submissionId: string; answers: Record<string, string> }): Promise<void>;
  /** Enqueues `form.submission.received` again for a stored submission (a replayed event). */
  replayReceived(required: { submissionId: string }): Promise<void>;
  /** Enqueues an already-planned child job again under a new outbox id (an at-least-once redelivery). */
  redeliver(required: { job: DeliveryJobView }): Promise<void>;
  /** One drain of the outbox at the fake clock's time. */
  drain(): Promise<void>;
  jobsFor(required: { submissionId: string }): DeliveryJobView[];
}

/** The "browser" at the provider's consent screen: the callback query its redirect carries. */
export type Consent = (authorizationUrl: string) => Promise<Readonly<Record<string, string>>>;

/**
 * Composes one site around the caller's plugin and fake provider.
 * @param required.env - The plugin's client env names (ids and secrets are test placeholders).
 */
export async function createOAuthDeliverySite(required: {
  readonly loadContributions: LoadPluginContributions;
  readonly http: HttpClientPort;
  readonly kit: FormDestinationKit;
  readonly env: Readonly<Record<string, string>>;
}): Promise<OAuthDeliverySite> {
  const clock = createFakeClock({ startIso: T0 });
  const keyring = new InMemoryKeyring({ hkdfSalt: "form-delivery-oauth-e2e" });
  const sealer = new AesGcmSecretSealer({ keyring });
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  let next = 0;
  const idGen = { newId: () => `id-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  await ensureFormDeliverySettings({ deps: { settingsRepo, clock, ids: idGen, principals }, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test owner" });
  const settings = { repo: settingsRepo, clock, ids: idGen, authorize, principals };
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const connections = composeAgentPluginConnections({
    workspaceId: WORKSPACE, loadContributions: required.loadContributions, vaultRepo: new InMemoryVaultRepo({}), keyring, sealer, customCredentialRepo,
    clock, http: required.http, env: { ...required.env, TOVU_PUBLIC_URL: PUBLIC_URL, TOVU_API_CONNECTION_CALLBACK_ORIGINS: PUBLIC_URL }, derivedPublicOrigin: undefined,
  }, { deliveryBindings: { settings, forms: formDefinitionRepo, newBindingId: () => idGen.newId() } });
  const { host } = connections.apiConnections;
  const formSubmissionRepo = new InMemoryFormSubmissionRepo();
  await formDefinitionRepo.create({ id: FORM_ID, workspaceId: WORKSPACE, name: "Contact", slug: FORM_SLUG, status: "active", version: 1, createdAt: T0, updatedAt: T0,
    notify: { enabled: false, recipients: [] },
    fields: [{ id: "email", label: "Email", type: "email", required: true }, { id: "message", label: "Message", type: "textarea", required: false }] });
  const bus = new InMemoryEventBus();
  const outbox = new ObservedOutbox();
  const jobs = new Map<string, FormDeliveryJob>();
  // Saved custom credentials use the site-assistant sealer types, as in the site composition.
  const customKeyring = new CustomCredentialKeyring();
  const customSealer = new CustomCredentialSealer(customKeyring);
  const deliver = composeFormDeliveryDeliverer({
    apiConnections: connections.apiConnections, kit: required.kit, credentials: { repo: customCredentialRepo, sealer: customSealer },
    loadRegistry: ({ workspaceId }) => loadFormDestinationRegistry({ workspaceId }, { loadContributions: required.loadContributions }),
  });
  await composeFormDelivery({ bus, plans: enqueueingPlans(outbox, jobs), settingsRepo, formDefinitionRepo, formSubmissionRepo, deliver, idGen, clock }).start();

  const received = (submissionId: string): DomainEvent => ({ id: idGen.newId(), name: "form.submission.received", workspaceId: WORKSPACE, occurredAt: clock.nowIso(),
    aggregateId: submissionId, payload: { submissionId, formDefinitionId: FORM_ID } });

  async function signIn(input: { pluginId: string; consent: Consent; scopeSetIds?: readonly string[]; intent: "connect" | "switch-account" }) {
    const [connection] = await host.listConnections({ pluginId: input.pluginId });
    if (!connection) throw new Error(`plugin ${input.pluginId} declares no connection`);
    const service = host.serviceFor({ connection });
    const redirectUri = host.hostedCallbackUrl({ connection });
    const start = await service.start({ workspaceId: WORKSPACE, actorId: ADMIN, intent: input.intent, scopeSetIds: [...(input.scopeSetIds ?? [])], redirectUri });
    await service.complete({ workspaceId: WORKSPACE, actorId: ADMIN, redirectUri, callbackParams: { ...(await input.consent(start.authorizationUrl)) }, browserBinding: start.browserBinding });
    return { service, connectionRef: (await host.statusOf({ connection })).connectionRef };
  }

  return {
    clock, outbox, host, deliver,
    async connect(input) { return (await signIn({ ...input, intent: "connect" })).connectionRef; },
    async switchAccount(input) {
      const { service, connectionRef } = await signIn({ ...input, intent: "switch-account" });
      await service.confirmSwitchAccount({ workspaceId: WORKSPACE, connectionRef, actorId: ADMIN });
    },
    async setPluginSetting({ pluginId, key, value }) { await host.pluginState.forPlugin({ workspaceId: WORKSPACE, pluginId }).set({ key, value }); },
    async bind({ bindings }) {
      await writeFormDeliveryBindings({ deps: settings, workspaceId: WORKSPACE, callerPrincipalId: "owner", value: bindings });
    },
    bindings: () => readFormDeliveryBindings({ settingsRepo, workspaceId: WORKSPACE }),
    async surfaceAction({ pluginId, surfaceId, action, payload = {} }, optional = {}) {
      await connections.adminSurfaceHost.refresh();
      const surfaces = await required.loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) });
      const surface = surfaces.items.find((item) => item.plugin.pluginId === pluginId && item.descriptor.id === surfaceId);
      if (!surface) throw new Error(`plugin ${pluginId} has no surface ${surfaceId}: ${surfaces.refusals.join("; ")}`);
      const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface.descriptor, handlers: connections.adminSurfaceHost.handlersFor({ pluginId, surfaceId }) });
      return dispatcher.dispatch({ action, payload, context: { workspaceId: WORKSPACE, principalId: optional.principalId ?? ADMIN, pluginId, surfaceId } });
    },
    async saveCustomCredential({ label, baseUrl, worksFor, token }) {
      const saved = await createCustomCredential({ repo: customCredentialRepo, sealer: customSealer, keyring: customKeyring, clock, idGen },
        { workspaceId: WORKSPACE, label, category: "general", baseUrl, worksFor: [...worksFor], connection: { token } });
      return saved.id;
    },
    async submit({ submissionId, answers }) {
      await formSubmissionRepo.create({ id: submissionId, workspaceId: WORKSPACE, formDefinitionId: FORM_ID, data: answers, sourceIp: "198.51.100.7", submittedAt: clock.nowIso() });
      await outbox.enqueue(received(submissionId));
    },
    async replayReceived({ submissionId }) { await outbox.enqueue(received(submissionId)); },
    async redeliver({ job }) {
      const id = idGen.newId();
      jobs.set(id, job.job);
      await outbox.enqueue({ ...job.event, id, occurredAt: clock.nowIso() });
    },
    async drain() { await processOutbox({ outbox, bus, clock }, { random: () => 0 }); },
    jobsFor({ submissionId }) {
      return [...outbox.rows.values()].filter((row) => row.event.name === FORM_DELIVERY_EVENT && row.event.aggregateId === submissionId)
        .map((row) => ({ ...row, job: jobs.get(row.id)! }));
    },
  };
}
