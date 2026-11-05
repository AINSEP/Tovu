import type { ToolRegistration } from '@jini-ai/core';
import type { AuthorizeFn } from '@jini-ai/cms/core';
import { buildRegistrations as buildCommerceStatusTools, buildCommerceCatalogRegistrations } from '@jini-ai/commerce/tools';
import { buildCommerceResolutionRegistrations } from '@jini-ai/commerce/payments/tools';
import { createCommerceWorker } from './commerce-worker.js';
import { commerceConfigurationKey, readCommerceDrain, selectCommerceDrain } from './commerce-drain.js';
import { withKernelSessionLock, type StorageKernel } from '@jini-ai/db/kernel';
import type { Clock, HttpClientPort, IdGenerator } from '@jini-ai/core/primitives';
import type { SettingsRepoPort } from '@jini-ai/core/settings';
import { createCommerceServer, CommerceUnavailableError, createOrderPaymentProjector, readOwnedCommerceOrder, type PayOrderDeps } from '@jini-ai/commerce';
import { commerceOrderRepoFor, commerceOrderPaymentRepoFor, commercePriceProviderRefRepoFor, commercePriceRepoFor,
  commerceProductRepoFor, commerceStorefrontFor } from '@jini-ai/commerce/repo';
import { createPaymentsService, createPaymentsOperator, createKernelProviderRegistry, createProviderContexts,
  createWebhookReceiver, createInboxWorker, createOutboxRelay, paymentError, type KernelProviderRegistry,
  type PaymentScope, type ProviderContextPort, type WebhookReceiver } from '@jini-ai/commerce/payments/kernel';
import { migrateCommercePayments, sqlPaymentsLedger } from '@jini-ai/commerce/payments/ledger/sql';
import { migrateCommerceDatabase } from '#src/platform/db/migrations/index';
import { createAgentPluginEnabledReader } from '#src/features/agent-plugins/activation-effects';
import type { ProviderPluginPorts } from './provider-plugins.js';
import type { ProviderConfigSource } from './provider-config-source.js';
import { readCommerceConfiguration, type CommerceConfiguration } from './commerce-settings.js';

export type CommerceServer = ReturnType<typeof createCommerceServer>;
/** The host keeps scope/configuration private; routes supply only the authenticated member and order. */
export interface CommerceRuntime {
  createOrder: CommerceServer['createOrder'];
  pay: CommerceServer['pay'];
  readOrder: CommerceServer['readOrder'];
  activate: CommerceServer['activate'];
  toolRegistrations(required: { authorize: AuthorizeFn }): ToolRegistration[];
  status(): Promise<{ active: boolean; ready: boolean; reason: string | null; webhookUrl?: string | null; checkoutOrigin?: string | null }>;
  checkoutOrigin(): Promise<string | null>;
  resolveReceiver(): WebhookReceiver | null;
}
export interface ComposeCommerceRequired {
  kernel: StorageKernel<unknown>; workerOwner: boolean; workerDirectory: string; workspaceId: string; siteId: string; workspaceRoot: string;
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
  const enabled = createAgentPluginEnabledReader({ workspaceRoot: required.workspaceRoot });
  let activationUnreadable = false;
  async function isActive(): Promise<boolean> {
    try { const active = await enabled('commerce'); activationUnreadable = false; return active; }
    catch {
      if (!activationUnreadable) warn('Commerce activation cannot be confirmed. Checkout is paused; existing payments continue draining. Re-enable Commerce through plugin settings once activation storage is available.');
      activationUnreadable = true; return false;
    }
  }
  const providers = providerRegistry(required);
  const products = commerceProductRepoFor(required), prices = commercePriceRepoFor(required), orders = commerceOrderRepoFor(required);
  const orderPayments = commerceOrderPaymentRepoFor(required), priceRefs = commercePriceProviderRefRepoFor(required);
  const ledger = sqlPaymentsLedger(required);
  const catalog = commerceStorefrontFor(required);
  let schema: Promise<void> | undefined;
  let binding: Binding | undefined;
  let closed = false;
  let storageReady = false;
  let catalogReady = false;
  let configurationProblem: string | null = null;
  let configurationChecked = false;
  let warnedConfiguration: string | null = null;
  async function reportConfiguration(problem: string | null): Promise<void> {
    if (!problem) { warnedConfiguration = null; return; }
    if (problem === warnedConfiguration || !await isActive()) return;
    warnedConfiguration = problem; warn(problem);
  }
  const ensureSchema = async () => {
    schema ??= migrateCommerceDatabase({ kernel: required.kernel }).then(() => migrateCommercePayments({ kernel: required.kernel })).then(() => { storageReady = true; catalogReady = true; });
    try { await schema; } catch (error) { schema = undefined; throw error; }
  };
  // Inbox application and durable projection need no currently selected merchant configuration.
  // Only a provider retrieval delegates to the existing scoped context resolver.
  const sharedDeps = { ledger, providers, contexts: { resolve: async (input: Parameters<ProviderContextPort['resolve']>[0]) => {
    const current = await resolve();
    return current ? current.contexts.resolve(input) : { ok: false as const, error: paymentError({ code: 'NO_CREDENTIALS_CONFIGURED', message: 'Restore the original payment configuration to resume provider reconciliation.' }) };
  } }, now: () => required.clock.nowMs(), newId: () => required.idGen.newId(),
    grants: { mint: async (): Promise<string> => { throw new Error('Refunds, capture and void are unavailable in one-time checkout.'); }, redeem: async () => false } };
  const alerted = new Set<string>();
  const alerts = { raise: async ({ alert }: { alert: { kind: string } }) => {
    if (alerted.has(alert.kind)) return;
    alerted.add(alert.kind); warn(`Payment settlement needs attention (${alert.kind}); inspect recorded payment, inbox and projection state before retrying.`);
  } };
  const sharedPayments = createPaymentsService(sharedDeps, { alerts });
  const settle = { orders, orderPayments, payments: sharedPayments, alerts, clock: required.clock };
  const inbox = createInboxWorker(sharedDeps, { alerts });
  const projector = createOrderPaymentProjector({ deps: settle });
  const relay = createOutboxRelay({ ledger, now: sharedDeps.now, publish: { publish: async ({ message }) => {
    // Domain mismatches have raised their alert; only thrown storage/alert faults redeliver.
    await projector.handle({ message });
  } } });
  const operator = createPaymentsOperator(sharedDeps, { alerts });
  let lastReconcile = 0;
  function reusable(configured: CommerceConfiguration | null): boolean {
    if (!binding || configurationProblem) return false;
    return (!storageReady || configurationChecked) && commerceConfigurationKey({ config: binding.config }) === commerceConfigurationKey({ config: configured });
  }
  async function resolve(): Promise<Binding | null> {
    if (closed) return null;
    await required.settingsReady;
    const configured = await readCommerceConfiguration(required);
    if (reusable(configured) && binding) { await binding.server.activate(); return binding; }
    const selection = selectCommerceDrain({ configured, previous: binding?.config ?? null,
      recorded: storageReady ? await readCommerceDrain(required) : null });
    configurationProblem = selection.problem;
    await reportConfiguration(configurationProblem);
    configurationChecked = storageReady;
    const config = selection.config;
    if (!config) return null;
    if (binding && commerceConfigurationKey({ config: binding.config }) === commerceConfigurationKey({ config })) return binding;
    const scope: PaymentScope = { workspaceId: required.workspaceId, siteId: required.siteId,
      providerId: config.providerId, providerAccountId: config.accountId, mode: config.mode };
    const contexts = providerContexts({ ...required, config, scope });
    const deps = { ...sharedDeps, contexts };
    const payOrderDeps = ({ orderId }: { orderId: string }): PayOrderDeps => ({ orders, prices, priceRefs, orderPayments, settle,
      payments: createPaymentsService({ ...deps, contexts: providerContexts({ ...required, config, scope }, { orderId }) }) });
    const server = createCommerceServer({ scope, publicOrigin: config.publicOrigin, isActive, ensureSchema,
      checkoutDeps: { products, prices, orders, clock: required.clock, idGen: required.idGen }, payOrderDeps, warn });
    // Preparation follows an enabled configuration change; disabled commerce performs no DDL.
    await server.activate();
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
      if (result.status === 200) void worker.kick();
      return result;
    } };
    binding = { config, server, receiver, contexts, problem: async () => {
      if (configurationProblem) return configurationProblem;
      const registered = providers.get({ id: scope.providerId });
      if (!registered) return 'The selected payment provider is disabled, detached, or unavailable. Enable its plugin before accepting checkout.';
      const resolved = await contexts.resolve({ scope, provider: registered.provider });
      return resolved.ok ? null : 'Payment provider settings do not match the selected account and mode, or required keys are unavailable.';
    } };
    return binding;
  }
  async function server(): Promise<CommerceServer> {
    const current = await resolve();
    if (!current) throw new CommerceUnavailableError('The store owner needs to configure a payment account and deployed HTTPS site before checkout can accept payments.');
    return current.server;
  }
  async function checkoutServer(): Promise<CommerceServer> {
    let current = await resolve();
    if (!current) return server();
    await current.server.activate();
    current = await resolve();
    if (!current) return server();
    const problem = await current.problem();
    if (problem) throw new CommerceUnavailableError(problem);
    return current.server;
  }
  const worker = createCommerceWorker({ owner: required.workerOwner, directory: required.workerDirectory, warn,
    active: isActive, hasPending: async () => {
      if (!storageReady) return false;
      if (await ledger.transaction({ fn: tx => tx.hasOpenPayment({ workspaceId: required.workspaceId }) })) return true;
      return ledger.transaction({ fn: async tx => (await tx.listDueInbox({ now: Number.MAX_SAFE_INTEGER, limit: 1 })).length > 0
        || (await tx.listPendingOutbox({ limit: 1 })).length > 0 });
    }, run: async () => {
      if (await isActive()) await ensureSchema();
      else await migrateCommercePayments({ kernel: required.kernel });
      await resolve(); // Refresh original-scope drain selection even when there is no provider I/O.
      await inbox.runOnce({ limit: 25 });
      const projected = catalogReady ? await relay.runOnce({ limit: 25 }) : { stopped: false };
      if (sharedDeps.now() - lastReconcile >= 60_000) {
        lastReconcile = sharedDeps.now();
        for (const mode of ['test', 'live'] as const) await operator.reconcileUnknown({ olderThanMs: 60_000, limit: 10 }, { scope: { workspaceId: required.workspaceId, mode } });
      }
      if (projected.stopped) throw new Error('Durable order projection is delayed; its outbox message remains queued.');
    } }, required.kernel.transport === 'node-postgres' ? { withOwnership: run => withKernelSessionLock({ kernel: required.kernel, key: JSON.stringify(['commerce:settlement-worker', required.workspaceId, required.siteId]), run }) } : {});
  async function warm(): Promise<void> {
    try {
      if (await isActive()) { const current = await resolve(); if (current) await current.server.activate(); }
      else {
        // One metadata read at boot recovers previously-started work without creating an off catalog.
        const tables = await required.kernel.run(db => db.introspection.getTables());
        storageReady = tables.some(table => table.name === 'commerce_payments');
        catalogReady = tables.some(table => table.name === 'commerce_products');
        if (storageReady) await migrateCommercePayments({ kernel: required.kernel });
      }
      if (storageReady) { await resolve(); await worker.kick(); }
    } catch { warn('Commerce is unavailable; the rest of the site remains online.'); }
  }
  const warming = warm();
  const commerce: CommerceRuntime = {
      createOrder: async input => { const result = await (await checkoutServer()).createOrder(input); void worker.kick(); return result; },
      pay: async input => { const result = await (await checkoutServer()).pay(input); void worker.kick(); return result; },
      readOrder: async input => readOwnedCommerceOrder({ deps: { workspaceId: required.workspaceId, siteId: required.siteId, orders, orderPayments, payments: sharedPayments }, input }),
      activate: async () => { const status = await (await checkoutServer()).activate(); if (status.ready) { void worker.kick(); } return status; },
      status: async () => { try { const current = await resolve();
        if (!current) return { active: await isActive(), ready: false, reason: 'Commerce has no configured payment account and deployed HTTPS site.' };
        const status = await current.server.status();
        const problem = status.active ? await current.problem() : null;
        const webhookUrl = `${new URL(current.config.publicOrigin).origin}/api/payments/webhooks/${encodeURIComponent(required.siteId)}/${current.config.providerId}/${current.config.mode}`;
        const checkoutOrigin = new URL(current.config.publicOrigin).origin;
        return problem ? { ...status, ready: false, reason: problem, webhookUrl, checkoutOrigin } : { ...status, webhookUrl, checkoutOrigin }; }
        catch { return { active: false, ready: false, reason: 'Commerce configuration could not be read; checkout is unavailable while the site remains online.' }; } },
      checkoutOrigin: async () => { const current = await resolve(); return current ? new URL(current.config.publicOrigin).origin : null; },
      resolveReceiver: () => storageReady && !closed ? binding?.receiver ?? null : null,
      toolRegistrations: ({ authorize }) => [
        ...buildCommerceStatusTools({ workspaceId: required.workspaceId, authorize, commerce }),
        ...buildCommerceResolutionRegistrations({ workspaceId: required.workspaceId, authorize, operator, targetFor: async ({ orderId }) => {
          const row = await orderPayments.findByOrder({ workspaceId: required.workspaceId, orderId });
          if (!row?.paymentId || row.workspaceId !== required.workspaceId || row.siteId !== required.siteId) return null;
          return { paymentId: row.paymentId, scope: { workspaceId: row.workspaceId, siteId: row.siteId,
            providerId: row.providerId, providerAccountId: row.providerAccountId, mode: row.mode } };
        } }),
        ...buildCommerceCatalogRegistrations({ workspaceId: required.workspaceId, authorize, commerce, products, prices, clock: required.clock, idGen: required.idGen }),
      ],
    };
  async function catalogAvailable(readiness?: { active: boolean; ready: boolean }): Promise<boolean> {
    if (readiness) return readiness.active && readiness.ready;
    if (!await isActive()) return false;
    const current = await resolve();
    return current !== null && (await current.server.status()).ready;
  }
  return { commerce,
    commerceCatalog: {
      listProducts: async (_input = {}, options = {}) => {
        try {
          if (!await catalogAvailable(options.readiness)) return [];
          return catalog.listProducts({});
        } catch { warn('The catalog is unavailable; the rest of the site remains online.'); return []; }
      },
      findProduct: async (input, options = {}) => {
        try {
          if (!await catalogAvailable(options.readiness)) return null;
          return catalog.findProduct(input);
        } catch { warn('The catalog is unavailable; the rest of the site remains online.'); return null; }
      },
    },
    close: async () => { closed = true; await warming; await worker.close(); await schema?.catch(() => {}); },
  };
}
