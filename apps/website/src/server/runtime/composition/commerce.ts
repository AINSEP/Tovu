import type { ToolRegistration } from '@jini-ai/core';
import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { describeErrorForLog } from '#src/contracts/core/model-facing-tool-errors';
import type { AuthorizeFn } from '@jini-ai/core/contracts/events';
import { buildRegistrations as buildCommerceStatusTools, buildCommerceCatalogRegistrations } from '@jini-ai/commerce/tools';
import { buildCommerceResolutionRegistrations, type CommerceResolutionToolsRequired } from '@jini-ai/commerce/payments/tools';
import { createCommerceWorker } from './commerce-worker.js';
import { commerceConfigurationKey, readCommerceDrain, selectCommerceDrain } from './commerce-drain.js';
import { tableExists, withKernelSessionLock, kernelSessionPoolMax, type KyselyKernel } from '@jini-ai/db/kernel';
import type { Clock, HttpClientPort, IdGenerator } from '@jini-ai/core/primitives';
import type { SettingsRepoPort } from '@jini-ai/core/settings';
import { createCommerceServer, CommerceUnavailableError, createOrderPaymentProjector, readOwnedCommerceOrder, type PayOrderDeps } from '@jini-ai/commerce';
import { commerceOrderRepoFor, commerceOrderPaymentRepoFor, commercePriceProviderRefRepoFor, commercePriceRepoFor,
  commerceProductRepoFor, commerceStorefrontFor } from '@jini-ai/commerce/repo';
import { createPaymentsService, createPaymentsOperator, createKernelProviderRegistry, createProviderContexts,
  createWebhookReceiver, createInboxWorker, createOutboxRelay, paymentError, type KernelProviderRegistry,
  LedgerConstraintError, type LedgerTx, type LedgerKeyScope, type QuarantineRecord,
  type PaymentsAlertPort, type PaymentScope, type ProviderContextPort, type WebhookReceiver } from '@jini-ai/commerce/payments/kernel';
import { migrateCommercePayments, sqlPaymentsLedger } from '@jini-ai/commerce/payments/ledger/sql';
import { runMigrations } from '@jini-ai/db/migrate';
import { migrateCommerceDatabase } from '#src/platform/db/migrations/index';
import { createAgentPluginEnabledReader } from '#src/features/agent-plugins/activation-effects';
import type { ProviderPluginPorts } from './provider-plugins.js';
import type { ProviderConfigSource } from './provider-config-source.js';
import { readCommerceConfiguration, type CommerceConfiguration } from './commerce-settings.js';

export type CommerceServer = ReturnType<typeof createCommerceServer>;
/** The host keeps scope/configuration private; routes supply only the authenticated member and order. */
export interface CommerceRuntime {
  forRequest(): Pick<CommerceRuntime, 'status' | 'activate' | 'checkoutOrigin' | 'createOrder' | 'pay' | 'readOrder'>;
  createOrder: CommerceServer['createOrder'];
  pay: CommerceServer['pay'];
  readOrder: CommerceServer['readOrder'];
  activate: CommerceServer['activate'];
  toolRegistrations(required: { authorize: AuthorizeFn; askHuman: CommerceResolutionToolsRequired['askHuman'] }): ToolRegistration[];
  storefrontStatus: CommerceRuntime['status'];
  status(): Promise<{ active: boolean; ready: boolean; reason: string | null; webhookUrl?: string | null; checkoutOrigin?: string | null; needsAttention?: string[] }>;
  checkoutOrigin(): Promise<string | null>;
  resolveReceiver(): WebhookReceiver | null;
}
export interface ComposeCommerceRequired {
  kernel: KyselyKernel<unknown>; workerOwner: boolean; workerDirectory: string; workspaceId: string; siteId: string; workspaceRoot: string;
  settingsRepo: SettingsRepoPort; settingsReady: Promise<unknown>; providerConfig: ProviderConfigSource;
  providers: Pick<ProviderPluginPorts, 'paymentProviders'>; httpClient: HttpClientPort; clock: Clock; idGen: IdGenerator;
}
interface Binding { config: CommerceConfiguration; server: CommerceServer; receiver: WebhookReceiver; contexts: ProviderContextPort; problem(): Promise<string | null> }

/** Use the provider host's current guarded leases; duplicate claims are rejected by the domain registry. */
function providerRegistry({ providers }: Pick<ComposeCommerceRequired, 'providers'>): KernelProviderRegistry {
  const current = () => createKernelProviderRegistry({ items: providers.paymentProviders({}) });
  return { get: input => current().get(input), list: () => current().list() };
}

/** URLs are owner-configured HTTPS, never inferred from Host or return query parameters. */
function providerContexts(required: ComposeCommerceRequired & { config: CommerceConfiguration; scope: PaymentScope }, optional: { orderId?: string } = {}): ProviderContextPort {
  const bindings = () => Object.fromEntries(required.providers.paymentProviders({}).map(item => [item.module.id, item.pluginId]));
  const origin = new URL(required.config.publicOrigin).origin;
  const order = optional.orderId === undefined ? '' : `?orderId=${encodeURIComponent(optional.orderId)}`;
  return createProviderContexts({ bindings, configFor: () => required.providerConfig, httpClient: required.httpClient,
    now: () => required.clock.nowMs(), urlsFor: () => ({
      webhookUrl: `${origin}/api/payments/webhooks/${encodeURIComponent(required.siteId)}/${required.config.providerId}/${required.config.mode}`,
      returnUrl: `${origin}/commerce/return${order}`, cancelUrl: `${origin}/commerce/cancel${order}`,
    }) });
}

/** Keeps the alert de-duplication cache bounded: drops the entry that has been there longest. */
function evictOldestAlert({ alerted }: { alerted: Set<string> }, _optional = {}): void {
  const oldest = alerted.values().next();
  if (oldest.done) throw new Error('payment alert cache has no oldest entry');
  alerted.delete(oldest.value);
}

/** Compose lazily: commerce-off boot neither migrates nor queries catalog or payment tables.
 * @complexity O(1) per request plus existing bounded repository/provider work. */
export function composeCommerce(required: ComposeCommerceRequired, optional: { warn?: (message: string) => void } = {}): {
  commerce: CommerceRuntime;
  commerceCatalog: {
    listProducts(required?: Record<string, never>, optional?: { readiness?: { active: boolean; ready: boolean } }): ReturnType<ReturnType<typeof commerceStorefrontFor>['listProducts']>;
    findProduct(required: { idOrSlug: string }, optional?: { readiness?: { active: boolean; ready: boolean } }): Promise<Awaited<ReturnType<ReturnType<typeof commerceStorefrontFor>['listProducts']>>[number] | null>;
  };
  close(): Promise<void>;
} {
  const warn = optional.warn ?? (message => console.warn(`[commerce] ${message}`));
  const isActive = createCommerceActivation(required, warn);
  const ports = createCommercePorts(required);
  const { providers, orders, orderPayments, ledger, catalog, storage } = ports;
  const resolve = createCommerceBinding(required, { ...ports, isActive, warn,
    sharedDeps: () => sharedDeps, settle: () => settle, kick: () => worker.kick(),
  });
  const sharedDeps = createCommerceSharedDeps(required, { ledger, providers }, resolve);
  const alerts = createCommerceAlerts(warn);
  const sharedPayments = createPaymentsService(sharedDeps, { alerts });
  const settle = { orders, orderPayments, payments: sharedPayments, alerts, clock: required.clock };
  const inbox = createInboxWorker(sharedDeps, { alerts });
  const projector = createOrderPaymentProjector({ deps: settle });
  const relay = createCommerceProjectionRelay(required, { ledger, sharedDeps, alerts, projector });
  const operator = createPaymentsOperator(sharedDeps, { alerts });
  const { readyServer, checkoutServer } = createCommerceCheckout(storage.poolProblem, resolve);
  const worker = createCommerceSettlementWorker(required, { storage, ledger, sharedDeps, operator, inbox, relay, isActive, resolve, warn });
  const readStatus = createCommerceStatusReader(required, { resolve, isActive, poolProblem: storage.poolProblem });
  const needsAttention = createCommerceAttentionReader(required, { storage, ledger, sharedDeps });
  const warming = warmCommerceRuntime({ storage, isActive, resolve, worker, warn });
  const commerce = createCommerceRuntime(required, { ...ports, isActive, resolve, readyServer, checkoutServer,
    worker, readStatus, needsAttention, sharedPayments, operator, resolveReceiver: resolve.resolveReceiver,
  });
  return { commerce, commerceCatalog: createCommerceCatalog(catalog, { isActive, resolve, warn }),
    // Schema failures are reported by the operation that started migration; close only waits for it.
    close: async () => { storage.closed = true; await warming; await worker.close(); await storage.schema?.catch(() => {}); },
  };
}

function createCommerceActivation(required: ComposeCommerceRequired, warn: (message: string) => void) {
  const enabled = createAgentPluginEnabledReader({ workspaceRoot: required.workspaceRoot });
  let activationUnreadable = false;
  async function isActive(): Promise<boolean> {
    try { const active = await enabled('commerce'); activationUnreadable = false; return active; }
    catch (error) {
      if (!activationUnreadable) warn(`Commerce activation cannot be confirmed. Checkout is paused; existing payments continue draining. Re-enable Commerce through plugin settings once activation storage is available. Cause: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`);
      activationUnreadable = true; return false;
    }
  }
  return isActive;
}

function createCommercePorts(required: ComposeCommerceRequired) {
  const providers = providerRegistry(required);
  const products = commerceProductRepoFor(required), prices = commercePriceRepoFor(required), orders = commerceOrderRepoFor(required);
  const orderPayments = commerceOrderPaymentRepoFor(required), priceRefs = commercePriceProviderRefRepoFor(required);
  const ledger = sqlPaymentsLedger(required);
  const catalog = commerceStorefrontFor(required);
  const storage = createCommerceStorage(required);
  return { providers, products, prices, orders, orderPayments, priceRefs, ledger, catalog, storage };
}

function createCommerceStorage(required: ComposeCommerceRequired) {
  let schema: Promise<void> | undefined;
  let paymentSchema: Promise<unknown> | undefined;
  let closed = false;
  let storageReady = false;
  let catalogReady = false;
  const storageProbe = Promise.all([tableExists({ kernel: required.kernel, table: 'commerce_payments' }), tableExists({ kernel: required.kernel, table: 'commerce_products' })])
    .then(([payments, products]) => { storageReady = payments; catalogReady = products; });
  const poolProblem = required.kernel.transport === 'node-postgres' && (kernelSessionPoolMax({ kernel: required.kernel }) ?? 2) < 2
    ? 'Checkout is paused because payment settlement requires a PostgreSQL pool with at least 2 connections.' : null;
  const ensurePaymentSchema = async () => {
    paymentSchema ??= migrateCommercePayments({ kernel: required.kernel, runMigrations });
    try { await paymentSchema; } catch (error) { paymentSchema = undefined; throw error; }
  };
  const ensureSchema = async () => {
    schema ??= migrateCommerceDatabase({ kernel: required.kernel }).then(ensurePaymentSchema).then(() => { storageReady = true; catalogReady = true; });
    try { await schema; } catch (error) { schema = undefined; throw error; }
  };
  return { storageProbe, poolProblem, ensureSchema, ensurePaymentSchema,
    get schema() { return schema; }, get storageReady() { return storageReady; }, get catalogReady() { return catalogReady; },
    get closed() { return closed; }, set closed(value: boolean) { closed = value; },
  };
}

function createCommerceConfigurationReporter(isActive: () => Promise<boolean>, warn: (message: string) => void) {
  let warnedConfiguration: string | null = null;
  return async function reportConfiguration({ problem }: { problem: string | null }, _optional = {}): Promise<void> {
    if (!problem) { warnedConfiguration = null; return; }
    if (problem === warnedConfiguration || !await isActive()) return;
    warnedConfiguration = problem; warn(problem);
  };
}

function createCommerceBinding(required: ComposeCommerceRequired, context: ReturnType<typeof createCommercePorts> & {
  isActive: () => Promise<boolean>; warn: (message: string) => void;
  sharedDeps: () => ReturnType<typeof createCommerceSharedDeps>;
  settle: () => { orders: ReturnType<typeof commerceOrderRepoFor>; orderPayments: ReturnType<typeof commerceOrderPaymentRepoFor>;
    payments: ReturnType<typeof createPaymentsService>; alerts: PaymentsAlertPort; clock: Clock };
  kick: ReturnType<typeof createCommerceWorker>["kick"];
}): (() => Promise<Binding | null>) & { resolveReceiver: () => WebhookReceiver | null } {
  const state: { binding: Binding | undefined; configurationProblem: string | null; configurationChecked: boolean } = {
    binding: undefined, configurationProblem: null, configurationChecked: false,
  };
  const { storage, isActive, warn } = context;
  const reportConfiguration = createCommerceConfigurationReporter(isActive, warn);
  function reusable({ configured }: { configured: CommerceConfiguration | null }, _optional = {}): boolean {
    if (!state.binding || state.configurationProblem) return false;
    return (!storage.storageReady || state.configurationChecked) && commerceConfigurationKey({ config: state.binding.config }) === commerceConfigurationKey({ config: configured });
  }
  const resolve = resolveCommerceBinding(required, context, { state, reusable, reportConfiguration });
  return Object.assign(resolve, { resolveReceiver: () => state.binding?.receiver ?? null });
}

function resolveCommerceBinding(required: ComposeCommerceRequired, context: Parameters<typeof createCommerceBinding>[1], {
  state, reusable, reportConfiguration,
}: { state: { binding: Binding | undefined; configurationProblem: string | null; configurationChecked: boolean };
  reusable: (input: { configured: CommerceConfiguration | null }) => boolean;
  reportConfiguration: (input: { problem: string | null }) => Promise<void>;
}) {
  const { storage, providers } = context;
  return async function resolve(): Promise<Binding | null> {
    if (storage.closed) return null;
    await required.settingsReady;
    await storage.storageProbe;
    const configured = await readCommerceConfiguration(required);
    if (reusable({ configured }) && state.binding) { await state.binding.server.activate(); return state.binding; }
    const selection = selectCommerceDrain({ configured, previous: state.binding?.config ?? null,
      recorded: storage.storageReady ? await readCommerceDrain(required, { configured }) : null });
    state.configurationProblem = selection.problem;
    await reportConfiguration({ problem: state.configurationProblem });
    state.configurationChecked = storage.storageReady;
    const config = selection.config;
    if (!config) return null;
    if (state.binding && commerceConfigurationKey({ config: state.binding.config }) === commerceConfigurationKey({ config })) return state.binding;
    const { scope, contexts, deps, server } = prepareCommerceMerchant(required, config, context);
    // Preparation follows an enabled configuration change; disabled commerce performs no DDL.
    await server.activate();
    const receiver = createCommerceReceiver(required, { ...context, scope, deps });
    state.binding = { config, server, receiver, contexts, problem: async () => {
      if (state.configurationProblem) return state.configurationProblem;
      const registered = providers.get({ id: scope.providerId });
      if (!registered) return 'The selected payment provider is disabled, detached, or unavailable. Enable its plugin before accepting checkout.';
      const resolved = await contexts.resolve({ scope, provider: registered.provider });
      return resolved.ok ? null : 'Payment provider settings do not match the selected account and mode, or required keys are unavailable.';
    } };
    return state.binding;
  };
}

function prepareCommerceMerchant(required: ComposeCommerceRequired, config: CommerceConfiguration, context: Parameters<typeof createCommerceBinding>[1]) {
  const { products, orders, prices, priceRefs, orderPayments, isActive, storage, warn } = context;
  const ensureSchema = storage.ensureSchema;
  const scope: PaymentScope = { workspaceId: required.workspaceId, siteId: required.siteId,
    providerId: config.providerId, providerAccountId: config.accountId, mode: config.mode };
  const contexts = providerContexts({ ...required, config, scope });
  const deps = { ...context.sharedDeps(), contexts };
  const payOrderDeps = ({ orderId }: { orderId: string }): PayOrderDeps => ({ orders, prices, priceRefs, orderPayments, settle: context.settle(),
    payments: createPaymentsService({ ...deps, contexts: providerContexts({ ...required, config, scope }, { orderId }) }) });
  const server = createCommerceServer({ scope, publicOrigin: config.publicOrigin, isActive, ensureSchema,
    checkoutDeps: { products, prices, orders, clock: required.clock, idGen: required.idGen }, payOrderDeps, warn });
  return { scope, contexts, deps, server };
}

function createCommerceReceiver(required: ComposeCommerceRequired, context: {
  ledger: ReturnType<typeof sqlPaymentsLedger>; scope: PaymentScope; deps: ReturnType<typeof createCommerceSharedDeps>;
  kick: ReturnType<typeof createCommerceWorker>["kick"];
}) {
  const { ledger, scope, deps } = context;
  const coreReceiver = createWebhookReceiver({ ...deps, endpoints: { resolve: async path => {
    if (path.siteId !== required.siteId || (path.endpointId !== 'test' && path.endpointId !== 'live')) return null;
    const open = await ledger.transaction({ fn: tx => tx.findOpenPayment({ workspaceId: required.workspaceId },
      { siteId: path.siteId, providerId: path.providerId, mode: path.endpointId as 'test' | 'live' }) });
    if (open) return { workspaceId: open.workspaceId, siteId: open.siteId, providerId: open.providerId,
      providerAccountId: open.providerAccountId, mode: open.mode };
    return path.providerId === scope.providerId && path.endpointId === scope.mode ? scope : null;
  } } });
  const receiver: WebhookReceiver = { resolveEndpoint: coreReceiver.resolveEndpoint, receive: async (input, options) => {
    const result = await coreReceiver.receive(input, options);
    if (result.status === 200) void context.kick();
    return result;
  } };
  return receiver;
}

function createCommerceSharedDeps(required: ComposeCommerceRequired, { ledger, providers }: { ledger: ReturnType<typeof sqlPaymentsLedger>; providers: KernelProviderRegistry }, resolve: () => Promise<Binding | null>) {
  // Inbox application and durable projection need no currently selected merchant configuration.
  // Only a provider retrieval delegates to the existing scoped context resolver.
  return { ledger, providers, contexts: { resolve: async (input: Parameters<ProviderContextPort['resolve']>[0]) => {
    const current = await resolve();
    return current ? current.contexts.resolve(input) : { ok: false as const, error: paymentError({ code: 'NO_CREDENTIALS_CONFIGURED', message: 'Restore the original payment configuration to resume provider reconciliation.' }) };
  } }, now: () => required.clock.nowMs(), newId: () => required.idGen.newId(),
    grants: { mint: async (): Promise<string> => { throw new Error('Refunds, capture and void are unavailable in one-time checkout.'); }, redeem: async () => false } };
}

function createCommerceAlerts(warn: (message: string) => void): PaymentsAlertPort {
  const alerted = new Set<string>();
  const alerts: PaymentsAlertPort = { raise: async ({ alert }) => {
    const key = JSON.stringify([alert.kind, alert.paymentId ?? alert.detail]);
    if (alerted.has(key)) return;
    if (alerted.size >= 1000) evictOldestAlert({ alerted });
    alerted.add(key); warn(`Payment settlement needs attention: ${JSON.stringify(alert)}`);
  } };
  return alerts;
}

function createCommerceProjectionRelay(required: ComposeCommerceRequired, { ledger, sharedDeps, alerts, projector }: {
  ledger: ReturnType<typeof sqlPaymentsLedger>; sharedDeps: ReturnType<typeof createCommerceSharedDeps>;
  alerts: PaymentsAlertPort; projector: ReturnType<typeof createOrderPaymentProjector>;
}) {
  return createOutboxRelay({ ledger, now: sharedDeps.now, publish: { publish: async ({ message }) => {
    // Acknowledgement follows durable failure evidence; thrown storage/alert faults redeliver.
    const outcome = await projector.handle({ message });
    if (outcome !== 'blocked' && outcome !== 'not_succeeded') return;
    try {
      await ledger.transaction({ fn: tx => tx.insertQuarantine({ entry: { id: `commerce-projection:${message.id}`,
        workspaceId: message.workspaceId, mode: message.mode, paymentId: message.aggregateId, subject: 'order-projection',
        reason: outcome, evidenceJson: JSON.stringify({ ...message.payload, siteId: required.siteId }), createdAt: sharedDeps.now() } }) });
    } catch (error) {
      // A publish acknowledgement may fail after this insert; the same message keeps one record.
      if (!(error instanceof LedgerConstraintError && error.kind === 'unique' && error.table === 'commerce_quarantine')) throw error;
    }
    await alerts.raise({ alert: { kind: 'fulfillment-blocked', workspaceId: message.workspaceId, mode: message.mode,
      paymentId: message.aggregateId, detail: `order ${message.payload.reference}: ${outcome}` } });
  } } });
}

function createCommerceCheckout(poolProblem: string | null, resolve: () => Promise<Binding | null>) {
  async function readyServer({ current }: { current: Binding | null }, _optional = {}): Promise<CommerceServer> {
    if (poolProblem) throw new CommerceUnavailableError(poolProblem);
    if (!current) throw new CommerceUnavailableError('The store owner needs to configure a payment account and deployed HTTPS site before checkout can accept payments.');
    const problem = await current.problem();
    if (problem) throw new CommerceUnavailableError(problem);
    return current.server;
  }
  async function checkoutServer(): Promise<CommerceServer> { return readyServer({ current: await resolve() }); }
  return { readyServer, checkoutServer };
}

function createCommerceSettlementWorker(required: ComposeCommerceRequired, { storage, ledger, sharedDeps, operator, inbox, relay, isActive, resolve, warn }: {
  storage: ReturnType<typeof createCommerceStorage>; ledger: ReturnType<typeof sqlPaymentsLedger>;
  sharedDeps: ReturnType<typeof createCommerceSharedDeps>; operator: ReturnType<typeof createPaymentsOperator>;
  inbox: ReturnType<typeof createInboxWorker>; relay: ReturnType<typeof createCommerceProjectionRelay>;
  isActive: () => Promise<boolean>; resolve: () => Promise<Binding | null>; warn: (message: string) => void;
}) {
  let lastReconcile = 0;
  return createCommerceWorker({ owner: required.workerOwner, directory: required.workerDirectory,
    // The worker's logger takes the object-args shape; this module's `warn` still takes a bare string.
    warn: ({ message }) => warn(message),
    active: isActive, hasPending: async () => {
      if (!storage.storageReady) return false;
      if (await ledger.transaction({ fn: tx => tx.hasOpenPayment({ workspaceId: required.workspaceId }) })) return true;
      return ledger.transaction({ fn: async tx => (await tx.listDueInbox({ now: Number.MAX_SAFE_INTEGER, limit: 1 })).length > 0
        || (await tx.listPendingOutbox({ limit: 1 })).length > 0 });
    }, run: async () => {
      if (await isActive()) await storage.ensureSchema();
      else await storage.ensurePaymentSchema();
      await resolve(); // Refresh original-scope drain selection even when there is no provider I/O.
      await inbox.runOnce({ limit: 25 });
      const projected = storage.catalogReady ? await relay.runOnce({ limit: 25 }) : { stopped: false };
      if (sharedDeps.now() - lastReconcile >= 60_000) {
        lastReconcile = sharedDeps.now();
        for (const mode of ['test', 'live'] as const) await operator.reconcileUnknown({ olderThanMs: 60_000, limit: 10 }, { scope: { workspaceId: required.workspaceId, mode } });
      }
      if (projected.stopped) throw new Error('Durable order projection is delayed; its outbox message remains queued.');
    } }, required.kernel.transport === 'node-postgres' ? { withOwnership: run => withKernelSessionLock({ kernel: required.kernel, key: JSON.stringify(['commerce:settlement-worker', required.workspaceId, required.siteId]), run }) } : {});
}

async function warmCommerceRuntime(context: {
  storage: ReturnType<typeof createCommerceStorage>; isActive: () => Promise<boolean>; resolve: () => Promise<Binding | null>;
  worker: ReturnType<typeof createCommerceWorker>; warn: (message: string) => void;
}): Promise<void> {
  const { storage, isActive, resolve, worker, warn } = context;
  try {
    // Probe only these two tables in either activation mode, including removed settings after restart.
    await storage.storageProbe;
    if (await isActive()) { const current = await resolve(); if (current) await current.server.activate(); }
    else if (storage.storageReady) await storage.ensurePaymentSchema();
    if (storage.storageReady) { await resolve(); await worker.kick(); }
  } catch (error) { warn(`Commerce is unavailable; the rest of the site remains online. Cause: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`); }
}

async function quarantinedOrder({ tx, scope, row }: { tx: LedgerTx; scope: LedgerKeyScope; row: QuarantineRecord }, required: Pick<ComposeCommerceRequired, "siteId">): Promise<string | null> {
  const payment = row.paymentId ? await tx.getPayment({ ...scope, id: row.paymentId }) : null;
  if (payment) return payment.siteId === required.siteId ? payment.reference : null;
  if (row.subject !== 'order-projection') return null;
  // Only this host's projection quarantine carries a trusted site identity.
  try {
    const evidence = JSON.parse(row.evidenceJson) as { siteId?: unknown; reference?: unknown };
    return evidence.siteId === required.siteId && typeof evidence.reference === 'string' ? evidence.reference : null;
  } catch { return null; }
}

function createCommerceAttentionReader(required: ComposeCommerceRequired, { storage, ledger, sharedDeps }: {
  storage: ReturnType<typeof createCommerceStorage>; ledger: ReturnType<typeof sqlPaymentsLedger>;
  sharedDeps: ReturnType<typeof createCommerceSharedDeps>;
}) {
  /** Four bounded scans on demand, plus at most twenty quarantined-payment lookups; never polls. */
  return async function needsAttention(): Promise<string[]> {
    if (!storage.storageReady) return [];
    const result = new Set<string>();
    await ledger.transaction({ fn: async tx => {
      for (const mode of ['test', 'live'] as const) {
        const scope = { workspaceId: required.workspaceId, mode };
        const payments = await tx.listUnknownPayments({ updatedBefore: Number.MAX_SAFE_INTEGER,
          unconfirmedBefore: sharedDeps.now() - 25 * 60 * 60_000, limit: 10 }, { scope });
        payments.filter(row => row.siteId === required.siteId).forEach(row => result.add(row.reference));
        const quarantine = await tx.listQuarantine(scope, { unresolvedOnly: true, limit: 10 });
        for (const row of quarantine) {
          const orderId = await quarantinedOrder({ tx, scope, row }, required);
          if (orderId) result.add(orderId);
        }
      }
    } });
    return [...result].slice(0, 10);
  };
}

function createCommerceStatusReader(required: ComposeCommerceRequired, { resolve, isActive, poolProblem }: {
  resolve: () => Promise<Binding | null>; isActive: () => Promise<boolean>; poolProblem: string | null;
}) {
  /** Current checkout admission and merchant binding, without operator attention scans. O(1) reads. */
  return async function readStatus(): ReturnType<CommerceRuntime['status']> { try { const current = await resolve();
        if (!current) return { active: await isActive(), ready: false, reason: 'Commerce has no configured payment account and deployed HTTPS site.' };
        const status = await current.server.status();
        const problem = status.active ? poolProblem ?? await current.problem() : null;
        const webhookUrl = `${new URL(current.config.publicOrigin).origin}/api/payments/webhooks/${encodeURIComponent(required.siteId)}/${current.config.providerId}/${current.config.mode}`;
        const checkoutOrigin = new URL(current.config.publicOrigin).origin;
        return problem ? { ...status, ready: false, reason: problem, webhookUrl, checkoutOrigin } : { ...status, webhookUrl, checkoutOrigin }; }
        catch (error) { console.warn('[commerce] Commerce configuration could not be read; checkout remains unavailable.', describeErrorForLog({ err: error })); return { active: false, ready: false, reason: 'Commerce configuration could not be read; checkout is unavailable while the site remains online.' }; }
  };
}

function createCommerceRuntime(required: ComposeCommerceRequired, context: ReturnType<typeof createCommercePorts> & {
  isActive: () => Promise<boolean>; resolve: () => Promise<Binding | null>; resolveReceiver: () => WebhookReceiver | null;
  readyServer: ReturnType<typeof createCommerceCheckout>["readyServer"]; checkoutServer: () => Promise<CommerceServer>;
  worker: ReturnType<typeof createCommerceWorker>; readStatus: CommerceRuntime["status"]; needsAttention: () => Promise<string[]>;
  sharedPayments: ReturnType<typeof createPaymentsService>; operator: ReturnType<typeof createPaymentsOperator>;
}) {
  const { orders, orderPayments, storage, isActive, resolve, readyServer,
    checkoutServer, worker, readStatus, needsAttention, sharedPayments } = context;
  const commerce: CommerceRuntime = {
    // One request keeps origin, admission and action on one merchant binding; no shared cache.
    forRequest: () => {
      let selected: Promise<Binding | null> | undefined;
      let ready: Promise<CommerceServer> | undefined;
      const current = () => selected ??= resolve();
      const checkout = () => ready ??= current().then((value) => readyServer({ current: value }));
      return {
        status: commerce.status, readOrder: commerce.readOrder,
        checkoutOrigin: async () => { const value = await current(); return value ? new URL(value.config.publicOrigin).origin : null; },
        activate: async () => (await checkout()).activate(),
        createOrder: async input => { const result = await (await checkout()).createOrder(input); void worker.kick(); return result; },
        pay: async input => { const result = await (await checkout()).pay(input); void worker.kick(); return result; },
      };
    },
    createOrder: async input => { const result = await (await checkoutServer()).createOrder(input); void worker.kick(); return result; },
    pay: async input => { const result = await (await checkoutServer()).pay(input); void worker.kick(); return result; },
    readOrder: async input => readOwnedCommerceOrder({ deps: { workspaceId: required.workspaceId, siteId: required.siteId, orders, orderPayments, payments: sharedPayments }, ...input }),
    activate: async () => { const status = await (await checkoutServer()).activate(); if (status.ready) { void worker.kick(); } return status; },
    status: async () => { try { return { ...await readStatus(), needsAttention: await needsAttention() }; }
      catch (error) { console.warn('[commerce] Commerce status could not be read; checkout remains unavailable.', describeErrorForLog({ err: error })); return { active: false, ready: false, reason: 'Commerce configuration could not be read; checkout is unavailable while the site remains online.' }; } },
    // Disabled storefront admission reads only plugin activation; operator status keeps drain details.
    storefrontStatus: async () => await isActive() ? readStatus() : { active: false, ready: false, reason: null },
    checkoutOrigin: async () => { const current = await resolve(); return current ? new URL(current.config.publicOrigin).origin : null; },
    resolveReceiver: () => storage.storageReady && !storage.closed ? context.resolveReceiver() : null,
    toolRegistrations: createCommerceToolRegistrations(required, { ...context, commerce: () => commerce }),
  };
  return commerce;
}

function createCommerceToolRegistrations(required: ComposeCommerceRequired, { providers, products, prices, orderPayments, operator, commerce }: {
  providers: KernelProviderRegistry; products: ReturnType<typeof commerceProductRepoFor>; prices: ReturnType<typeof commercePriceRepoFor>;
  orderPayments: ReturnType<typeof commerceOrderPaymentRepoFor>; operator: ReturnType<typeof createPaymentsOperator>;
  commerce: () => CommerceRuntime;
}): CommerceRuntime["toolRegistrations"] {
  return ({ authorize, askHuman }) => [
    ...buildCommerceStatusTools({ workspaceId: required.workspaceId, authorize, commerce: commerce(),
      paymentRuntime: { listProviders: () => providers.list().map(({ provider }) => ({ id: provider.id, displayName: provider.displayName,
        capabilities: { refunds: provider.capabilities.refunds, tokenization: false, recurring: false,
          confirmation: provider.capabilities.confirmation, currencies: provider.capabilities.currencies, webhooks: true } })) } }),
    ...buildCommerceResolutionRegistrations({ workspaceId: required.workspaceId, authorize, askHuman, operator, targetFor: async ({ orderId }) => {
      if (!await tableExists({ kernel: required.kernel, table: 'commerce_order_payments' })) return null;
      const row = await orderPayments.findByOrder({ workspaceId: required.workspaceId, orderId });
      if (!row?.paymentId || row.workspaceId !== required.workspaceId || row.siteId !== required.siteId) return null;
      return { paymentId: row.paymentId, amount: row.amount, scope: { workspaceId: row.workspaceId, siteId: row.siteId,
        providerId: row.providerId, providerAccountId: row.providerAccountId, mode: row.mode } };
    } }),
    ...buildCommerceCatalogRegistrations({ workspaceId: required.workspaceId, authorize, commerce: commerce(), products, prices, clock: required.clock, idGen: required.idGen }),
  ];
}

function createCommerceCatalog(catalog: ReturnType<typeof commerceStorefrontFor>, { isActive, resolve, warn }: {
  isActive: () => Promise<boolean>; resolve: () => Promise<Binding | null>; warn: (message: string) => void;
}): ReturnType<typeof composeCommerce>["commerceCatalog"] {
  async function catalogAvailable(readiness?: { active: boolean; ready: boolean }): Promise<boolean> {
    if (readiness) return readiness.active && readiness.ready;
    if (!await isActive()) return false;
    const current = await resolve();
    return current !== null && (await current.server.status()).ready;
  }
  return {
    listProducts: async (_input = {}, options = {}) => {
      try {
        if (!await catalogAvailable(options.readiness)) return [];
        return await catalog.listProducts({});
      } catch (error) { warn(`The catalog is unavailable; the rest of the site remains online. Cause: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`); return []; }
    },
    findProduct: async (input, options = {}) => {
      try {
        if (!await catalogAvailable(options.readiness)) return null;
        return await catalog.findProduct(input);
      } catch (error) { warn(`The catalog is unavailable; the rest of the site remains online. Cause: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`); return null; }
    },
  };
}
