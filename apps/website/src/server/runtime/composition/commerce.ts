import type { ToolRegistration } from '@jini-ai/core';
import type { AuthorizeFn } from '@jini-ai/cms/core';
import { buildRegistrations as buildCommerceStatusTools, buildCommerceCatalogRegistrations } from '@jini-ai/commerce/tools';
import { sql } from 'kysely';
import { createCommerceWorker } from './commerce-worker.js';
import { withKernelSessionLock, type StorageKernel } from '@jini-ai/db/kernel';
import type { Clock, HttpClientPort, IdGenerator } from '@jini-ai/core/primitives';
import type { SettingsRepoPort } from '@jini-ai/core/settings';
import { createCommerceServer, CommerceUnavailableError, createOrderPaymentProjector, type PayOrderDeps } from '@jini-ai/commerce';
import { commerceOrderRepoFor, commerceOrderPaymentRepoFor, commercePriceProviderRefRepoFor, commercePriceRepoFor,
  commerceProductRepoFor, commerceStorefrontFor } from '@jini-ai/commerce/repo';
import { createPaymentsService, createPaymentsOperator, createKernelProviderRegistry, createProviderContexts,
  createWebhookReceiver, createInboxWorker, createOutboxRelay, noopAlertPort, type KernelProviderRegistry,
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
  status(): Promise<{ active: boolean; ready: boolean; reason: string | null }>;
  checkoutOrigin(): Promise<string | null>;
  resolveReceiver(): WebhookReceiver | null;
}
export interface ComposeCommerceRequired {
  kernel: StorageKernel<unknown>; workerOwner: boolean; workerDirectory: string; workspaceId: string; siteId: string; workspaceRoot: string;
  settingsRepo: SettingsRepoPort; settingsReady: Promise<unknown>; providerConfig: ProviderConfigSource;
  providers: Pick<ProviderPluginPorts, 'paymentProviders'>; httpClient: HttpClientPort; clock: Clock; idGen: IdGenerator;
}
interface Binding { config: CommerceConfiguration; server: CommerceServer; receiver: WebhookReceiver; problem(): Promise<string | null>; run(): Promise<void> }

/** Use the provider host's current guarded leases; duplicate claims are rejected by the domain registry. */
function providerRegistry({ providers }: Pick<ComposeCommerceRequired, 'providers'>): KernelProviderRegistry {
  const current = () => createKernelProviderRegistry({ items: providers.paymentProviders({}) });
  return { get: input => current().get(input), list: () => current().list() };
}

/** URLs are owner-configured HTTPS, never inferred from Host or return query parameters. */
function providerContexts(required: ComposeCommerceRequired & { config: CommerceConfiguration; scope: PaymentScope }, optional: { orderId?: string } = {}): ProviderContextPort {
  const bindings = Object.fromEntries(required.providers.paymentProviders({}).map(item => [item.module.id, item.pluginId]));
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
  commerceCatalog: { listProducts(required?: Record<string, never>, optional?: Record<string, never>): ReturnType<ReturnType<typeof commerceStorefrontFor>['listProducts']> };
  close(): Promise<void>;
} {
  const warn = optional.warn ?? (message => console.warn(`[commerce] ${message}`));
  const enabled = createAgentPluginEnabledReader({ workspaceRoot: required.workspaceRoot });
  const providers = providerRegistry(required);
  const products = commerceProductRepoFor(required), prices = commercePriceRepoFor(required), orders = commerceOrderRepoFor(required);
  const orderPayments = commerceOrderPaymentRepoFor(required), priceRefs = commercePriceProviderRefRepoFor(required);
  const ledger = sqlPaymentsLedger(required);
  const catalog = commerceStorefrontFor(required);
  let schema: Promise<void> | undefined;
  let binding: Binding | undefined;
  let closed = false;
  let storageReady = false;
  const ensureSchema = async () => {
    schema ??= migrateCommerceDatabase({ kernel: required.kernel }).then(() => migrateCommercePayments({ kernel: required.kernel })).then(() => { storageReady = true; });
    try { await schema; } catch (error) { schema = undefined; throw error; }
  };
  async function resolve(): Promise<Binding | null> {
    if (closed) return null;
    await required.settingsReady;
    const config = await readCommerceConfiguration(required);
    if (!config) return null;
    if (binding && JSON.stringify(binding.config) === JSON.stringify(config)) return binding;
    const scope: PaymentScope = { workspaceId: required.workspaceId, siteId: required.siteId,
      providerId: config.providerId, providerAccountId: config.accountId, mode: config.mode };
    const contexts = providerContexts({ ...required, config, scope });
    const deps = { ledger, providers, contexts, now: () => required.clock.nowMs(), newId: () => required.idGen.newId(),
      grants: { mint: async (): Promise<string> => { throw new Error('Refunds, capture and void are unavailable in one-time checkout.'); }, redeem: async () => false } };
    const payments = createPaymentsService(deps);
    const settle = { orders, orderPayments, payments, alerts: noopAlertPort, clock: required.clock };
    const payOrderDeps = ({ orderId }: { orderId: string }): PayOrderDeps => ({ orders, prices, priceRefs, orderPayments, settle,
      payments: createPaymentsService({ ...deps, contexts: providerContexts({ ...required, config, scope }, { orderId }) }) });
    const server = createCommerceServer({ scope, publicOrigin: config.publicOrigin, isActive: () => enabled('commerce'), ensureSchema,
      checkoutDeps: { products, prices, orders, clock: required.clock, idGen: required.idGen }, payOrderDeps, warn });
    const receiver = createWebhookReceiver({ ...deps, endpoints: { resolve: async path =>
      path.siteId === scope.siteId && path.providerId === scope.providerId && path.endpointId === scope.mode ? scope : null } });
    const worker = createInboxWorker(deps);
    const projector = createOrderPaymentProjector({ deps: settle });
    const relay = createOutboxRelay({ ledger, now: deps.now, publish: { publish: async ({ message }) => {
      const outcome = await projector.handle({ message });
      if (outcome === "blocked" || outcome === "not_succeeded") throw new Error('Order projection remains unresolved.');
    } } });
    const operator = createPaymentsOperator(deps);
    let lastReconcile = 0;
    binding = { config, server, receiver, problem: async () => {
      const registered = providers.get({ id: scope.providerId });
      if (!registered) return 'The selected payment provider is disabled, detached, or unavailable. Enable its plugin before accepting checkout.';
      const resolved = await contexts.resolve({ scope, provider: registered.provider });
      return resolved.ok ? null : 'Payment provider settings do not match the selected account and mode, or required keys are unavailable.';
    }, run: async () => {
      await worker.runOnce({ limit: 25 });
      await relay.runOnce({ limit: 25 });
      if (deps.now() - lastReconcile >= 60_000) {
        lastReconcile = deps.now();
        await operator.reconcileUnknown({ olderThanMs: 60_000, limit: 10 }, { scope: { workspaceId: required.workspaceId, mode: config.mode } });
      }
    } };
    return binding;
  }
  async function server(): Promise<CommerceServer> {
    const current = await resolve();
    if (!current) throw new CommerceUnavailableError('Commerce has no configured payment account and deployed HTTPS site. Configure core.commerce.configuration before enabling checkout.');
    return current.server;
  }
  async function checkoutServer(): Promise<CommerceServer> {
    const current = await resolve();
    if (!current) return server();
    const problem = await current.problem();
    if (problem) throw new CommerceUnavailableError(problem);
    return current.server;
  }
  const worker = createCommerceWorker({ owner: required.workerOwner, directory: required.workerDirectory, warn,
    active: () => enabled('commerce'), hasPending: async () => {
      if (!storageReady) return false;
      const rows = await required.kernel.query<{ pending: number }>(sql`SELECT 1 AS pending FROM commerce_payments WHERE workspace_id=${required.workspaceId} AND intent_status NOT IN ('succeeded','failed','canceled') LIMIT 1`);
      if (rows.length > 0) return true;
      return ledger.transaction({ fn: async tx => (await tx.listDueInbox({ now: Number.MAX_SAFE_INTEGER, limit: 1 })).length > 0
        || (await tx.listPendingOutbox({ limit: 1 })).length > 0 });
    }, run: async () => { const current = await resolve(); if (current) { await ensureSchema(); await current.run(); } } }, required.kernel.transport === 'node-postgres' ? { withOwnership: run => withKernelSessionLock({ kernel: required.kernel, key: 'commerce:settlement-worker', run }) } : {});
  async function warm(): Promise<void> {
    try {
      if (await enabled('commerce')) { const current = await resolve(); if (current) await current.server.activate(); }
      else {
        // One metadata read at boot recovers previously-started work without creating an off catalog.
        const tables = await required.kernel.run(db => db.introspection.getTables());
        storageReady = tables.some(table => table.name === 'commerce_payments');
      }
      if (storageReady) await worker.kick();
    } catch { warn('Commerce is unavailable; the rest of the site remains online.'); }
  }
  const warming = warm();
  const commerce: CommerceRuntime = {
      createOrder: async input => { const result = await (await checkoutServer()).createOrder(input); void worker.kick(); return result; },
      pay: async input => { const result = await (await checkoutServer()).pay(input); void worker.kick(); return result; },
      readOrder: async input => (await server()).readOrder(input),
      activate: async () => (await checkoutServer()).activate(),
      status: async () => { try { const current = await resolve();
        if (!current) return { active: false, ready: false, reason: 'Commerce has no configured payment account and deployed HTTPS site.' };
        const status = await current.server.activate();
        const problem = status.active ? await current.problem() : null;
        return problem ? { ...status, ready: false, reason: problem } : status; }
        catch { return { active: false, ready: false, reason: 'Commerce configuration could not be read; checkout is unavailable while the site remains online.' }; } },
      checkoutOrigin: async () => (await resolve())?.config.publicOrigin ?? null,
      resolveReceiver: () => storageReady ? binding?.receiver ?? null : null,
      toolRegistrations: ({ authorize }) => [
        ...buildCommerceStatusTools({ workspaceId: required.workspaceId, authorize, commerce }),
        ...buildCommerceCatalogRegistrations({ workspaceId: required.workspaceId, authorize, commerce, products, prices, clock: required.clock, idGen: required.idGen }),
      ],
    };
  return { commerce,
    commerceCatalog: { listProducts: async () => {
      try {
        if (!await enabled('commerce')) return [];
        const current = await resolve();
        if (!current || !(await current.server.activate()).ready) return [];
        return catalog.listProducts({});
      } catch { warn('The catalog is unavailable; the rest of the site remains online.'); return []; }
    } },
    close: async () => { closed = true; await warming; await worker.close(); await schema?.catch(() => {}); },
  };
}
