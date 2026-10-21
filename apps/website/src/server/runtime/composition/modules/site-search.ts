import type { HttpClientPort as JiniHttpClientPort } from "@jini-ai/core/primitives";
import type { SetValueRequired, SettingsRepoPort } from "@jini-ai/core/settings";
import {
  BUILTIN_SEARCH_PROVIDER_ID, createSearchIndexer, createSearchProviderRegistry, createSearchService, searchIndexName,
  type SearchAccessPort, type SearchDocumentSource, type SearchIndexer, type SearchIndexStatePort, type SearchProvider,
  type SearchProviderContext, type SearchProviderRegistry, type SearchService, type SearchSourceEvent, type SearchTarget, type SearchTargetPort,
} from "@jini-ai/search";
import { contributeProviders } from "@jini-ai/search/contribution";

import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { loadSearchProviderContributions, type LoadedSearchProviders } from "#src/features/agent-plugins/search-provider-registry";
import type { MemberContext } from "#src/features/members/types";
import { deriveInstallationId } from "#src/features/publish-trust/keys";
import { createCmsSearchAccessPort, memberSearchAudiences } from "#src/features/site-search/access";
import { createCmsSearchDocumentSources } from "#src/features/site-search/cms-document-source";
import { createSqlSearchIndexStore } from "#src/features/site-search/index-state-store";
import { readSearchProviderSetting, writeSearchProviderSetting } from "#src/features/site-search/settings";
import type { KeyringPort } from "#src/features/webhooks/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { HttpClientPort } from "#src/platform/http/index";

/**
 * @file Site search composition (lots S4/S5/S6): binds `@jini-ai/search`'s generic registry, query
 * service and indexer to this site — the CMS document sources, the `search_index_*` bookkeeping
 * tables (migration 0023), the fail-closed access port, the per-site `core.search/provider` setting,
 * plugin-contributed vendor providers and the vault credentials those vendors need.
 *
 * Built ONCE per composed `RouteDeps` (`deps.ts`'s `createSiteRouteDeps`), never per `createApp`:
 * the registry is mutable (plugin providers join it after boot) and every consumer — the public
 * `GET /api/search` route, the bus subscription, the serving process's maintenance loop and the
 * assistant's search tools — must see the same one.
 *
 * **Built-in provider.** The owner builds the in-process provider; until it exists the optional
 * `builtinProvider` port is empty, so the site's default `builtin` provider is simply unregistered.
 * That is the honest state, not an error: queries answer `unavailable/not_configured`, and the
 * boot rebuild still records a `building` target for `builtin`, so `search_status` shows
 * `registered: false` instead of pretending nothing was chosen.
 *
 * **Vendor credentials.** No new table: a vendor's key is a saved custom credential (Access Tokens →
 * "Add custom provider") labeled exactly {@link searchCredentialLabel} — `Tovu Search — <Provider
 * label>`, e.g. `Tovu Search — Meilisearch` — with `baseUrl` = the vendor's HTTPS endpoint (passed to
 * the provider as `host`) and the API key as the token (passed as `apiKey`). The same fixed-label
 * convention `boot/resolve-mailer.ts` uses for mail providers, for the same reason: the credential
 * store has no purpose column to key on. A provider receives only the keys it declares in
 * `credentialKeys`; one declaring any other key is not configured (logged).
 *
 * **Index names** come from this install's existing id (`deriveInstallationId`, derived from the site
 * key; the same id publish-trust advertises), so no new setting is persisted. A restore onto a
 * DIFFERENT site key derives a different id, so its index names change and a reindex
 * (`search_reindex`) refills them — which is also what keeps a restored copy running next to the
 * original from writing into the original's vendor index.
 *
 * **Site id.** v1 serves one workspace per content database, and `deps.ts` already reuses
 * `workspaceId` as the site id (ADR-041 §7); this module does the same, and `resolveSiteId` answers
 * `null` for any other workspace so a stray event can never write another site's documents.
 */

/** Exact prefix of the custom-credential label a vendor search provider's key is saved under. */
export const SEARCH_CREDENTIAL_LABEL_PREFIX = "Tovu Search — ";

/** Hard per-request budget handed to every provider (and the service's own deadline). */
export const SEARCH_PROVIDER_TIMEOUT_MS = 3000;

/**
 * The custom-credential label for a provider, e.g. `Tovu Search — Meilisearch`.
 * @complexity O(label length).
 */
export function searchCredentialLabel(required: { readonly providerLabel: string }, _optional: Record<string, never> = {}): string {
  return `${SEARCH_CREDENTIAL_LABEL_PREFIX}${required.providerLabel}`;
}

/** A saved credential as the vault returns it (`resolveCustomCredentialByLabel`'s relevant half). */
export interface SearchVaultCredential {
  readonly baseUrl: string;
  readonly token: string;
}

/** Everything the runtime needs, as ports (the concrete binding is {@link bindSiteSearchPorts}). */
export interface SiteSearchPorts {
  readonly workspaceId: string;
  readonly siteId: string;
  readonly sources: readonly SearchDocumentSource[];
  readonly indexState: SearchIndexStatePort;
  readonly targets: SearchTargetPort;
  readonly access: SearchAccessPort;
  /** This install's stable id (rejects when the site key is missing). */
  installId(): Promise<string>;
  /** The saved credential with this exact label, or null when none is saved. May throw on decrypt. */
  resolveCredential(required: { readonly label: string }): Promise<SearchVaultCredential | null>;
  /** The guarded outbound client (Tovu's request-first shape; adapted for providers here). */
  readonly httpClient: HttpClientPort;
  /** Plugin-contributed vendor providers (`loadSearchProviderContributions` in production). */
  loadPluginProviders(): Promise<LoadedSearchProviders>;
  /** A viewer's audiences from their member session cookie; `[]` for an anonymous viewer. */
  audiencesForSession(required: { readonly sessionToken?: string }): Promise<readonly string[]>;
  readProviderSetting(): Promise<string>;
  writeProviderSetting(required: { readonly principalId: string; readonly providerId: string }): Promise<void>;
  now(): number;
}

export interface SiteSearchRuntimeOptional {
  /** The owner's in-process provider, registered as the core `builtin`. EMPTY today. */
  readonly builtinProvider?: SearchProvider;
  /** Opaque storage handle for in-process providers (`ctx.storage`); vendors ignore it. */
  readonly storage?: unknown;
  /** Awaited before plugin providers are offered (the boot settings-definition chain). */
  readonly settingsReady?: Promise<unknown>;
  readonly timeoutMs?: number;
  readonly log?: (message: string) => void;
}

/** What every consumer receives. */
export interface SiteSearchRuntime {
  readonly siteId: string;
  readonly workspaceId: string;
  readonly registry: SearchProviderRegistry;
  readonly service: SearchService;
  readonly indexer: SearchIndexer;
  /** Settles (never rejects) once plugin providers were offered to the registry. */
  readonly ready: Promise<void>;
  audiencesForSession(required: { readonly sessionToken?: string }): Promise<readonly string[]>;
  readProviderSetting(): Promise<string>;
  writeProviderSetting(required: { readonly principalId: string; readonly providerId: string }): Promise<void>;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Tovu's guarded client is `send(request)`; Jini providers call `send({ request })`. */
function toProviderHttpClient(client: HttpClientPort): JiniHttpClientPort {
  return { send: ({ request }) => client.send(request) };
}

/**
 * Plugins may not register under `builtin`: the site default would then silently route every
 * document to a vendor the owner never chose. Refused here, before the registry sees it.
 * @complexity O(n) contributions.
 */
function withoutReservedIds(loaded: LoadedSearchProviders): LoadedSearchProviders {
  const reserved = loaded.items.filter(item => item.definition.id === BUILTIN_SEARCH_PROVIDER_ID);
  return {
    items: loaded.items.filter(item => item.definition.id !== BUILTIN_SEARCH_PROVIDER_ID),
    refusals: [
      ...loaded.refusals,
      ...reserved.map(item => `search provider '${item.definition.id}' from '${item.pluginId}' was not loaded: that id is reserved for the owner's built-in provider`),
    ],
  };
}

/** The declared credential keys from a saved credential, or why the provider is not configured. */
function pickCredentials(provider: SearchProvider, saved: SearchVaultCredential): Record<string, string> | string {
  const available: Record<string, string> = { host: saved.baseUrl, apiKey: saved.token };
  const unknown = provider.credentialKeys.find(key => !Object.hasOwn(available, key));
  if (unknown !== undefined) return `search provider '${provider.id}' declares credential key '${unknown}', which a saved credential cannot supply (only host and apiKey)`;
  return Object.fromEntries(provider.credentialKeys.map(key => [key, available[key]!]));
}

/**
 * The per-target provider context resolver both the service and the indexer use: the provider's
 * declared credentials from the vault, this install's index name, the guarded client and the
 * deadline. `null` (not configured) for an unregistered provider, a missing credential or a missing
 * install id. Never throws: vault and install-id faults are logged.
 * @complexity At most one vault read per call; the install id is read once per resolver.
 */
export function createSearchContextResolver(
  required: Pick<SiteSearchPorts, "installId" | "resolveCredential" | "httpClient" | "now"> & { readonly registry: SearchProviderRegistry; readonly log: (message: string) => void },
  optional: { readonly storage?: unknown; readonly timeoutMs?: number } = {},
): (input: { readonly target: SearchTarget; readonly workspaceId: string }) => Promise<SearchProviderContext | null> {
  const { registry, log } = required;
  const { storage, timeoutMs = SEARCH_PROVIDER_TIMEOUT_MS } = optional;
  const httpClient = toProviderHttpClient(required.httpClient);

  // Memoized: the id is a pure function of the site key, which cannot change while the process runs.
  // A missing key is logged once and leaves every target unconfigured (no index name to write to).
  let installId: Promise<string | null> | undefined;
  const readInstallId = () => {
    installId ??= required.installId().catch((error: unknown) => {
      log(`[site-search] this install has no id (${errorText(error)}); search stays unconfigured until the site key is restored`);
      return null;
    });
    return installId;
  };

  const credentialsFor = async (provider: SearchProvider): Promise<Record<string, string> | null> => {
    if (provider.credentialKeys.length === 0) return {};
    const label = searchCredentialLabel({ providerLabel: provider.label });
    let saved: SearchVaultCredential | null;
    try {
      saved = await required.resolveCredential({ label });
    } catch (error) {
      log(`[site-search] the "${label}" credential could not be read (${errorText(error)})`);
      return null;
    }
    if (saved === null) return null;
    const picked = pickCredentials(provider, saved);
    if (typeof picked === "string") {
      log(`[site-search] ${picked}`);
      return null;
    }
    return picked;
  };

  return async ({ target, workspaceId }) => {
    const provider = registry.get({ id: target.providerId })?.provider;
    if (!provider) return null;
    const credentials = await credentialsFor(provider);
    if (credentials === null) return null;
    const id = await readInstallId();
    if (id === null) return null;
    return {
      workspaceId, siteId: target.siteId, mode: "live",
      indexName: searchIndexName({ installId: id, siteId: target.siteId, providerId: target.providerId, generation: target.generation }),
      credentials, httpClient, timeoutMs, now: required.now,
      ...(storage === undefined ? {} : { storage }),
    };
  };
}

/**
 * Build the site's search runtime: registry (built-in seed + plugin contributions), service and
 * indexer over the given ports.
 * @param required - The site's ports (see {@link SiteSearchPorts}).
 * @param optional.builtinProvider - The owner's provider; absent today, so `builtin` is unregistered.
 * @returns The runtime; plugin providers join the registry in the background (`ready`).
 * @throws {ProviderRegistryError} Only for a malformed `builtinProvider` (a boot-time programming error).
 * @complexity O(1) to build; each provider context costs at most one vault read.
 */
export function createSiteSearchRuntime(required: SiteSearchPorts, optional: SiteSearchRuntimeOptional = {}): SiteSearchRuntime {
  const { siteId, workspaceId } = required;
  const { builtinProvider, storage, settingsReady, timeoutMs = SEARCH_PROVIDER_TIMEOUT_MS, log = (message: string) => console.error(message) } = optional;
  const registry = createSearchProviderRegistry({}, builtinProvider ? { seed: [{ id: BUILTIN_SEARCH_PROVIDER_ID, provider: builtinProvider }] } : {});
  const contextFor = createSearchContextResolver({ ...required, registry, log }, { storage, timeoutMs });

  const ready = (async () => {
    await settingsReady;
    try {
      const { refusals } = contributeProviders({ registry, loaded: withoutReservedIds(await required.loadPluginProviders()) });
      for (const refusal of refusals) log(`[site-search] ${refusal}`);
    } catch (error) {
      log(`[site-search] plugin search providers could not be loaded (${errorText(error)}); only the built-in provider is available`);
    }
  })();

  const ports = { registry, targets: required.targets, state: required.indexState, contextFor };
  return {
    siteId, workspaceId, registry, ready,
    service: createSearchService({ ...ports, access: required.access }, { timeoutMs }),
    indexer: createSearchIndexer({
      ...ports, sources: required.sources, now: required.now,
      resolveSiteId: async ({ workspaceId: ws }) => (ws === workspaceId ? siteId : null),
    }),
    audiencesForSession: input => required.audiencesForSession(input),
    readProviderSetting: () => required.readProviderSetting(),
    writeProviderSetting: input => required.writeProviderSetting(input),
  };
}

/** The slice of the site event bus the indexer subscribes on. */
export interface SiteSearchBus {
  subscribe(required: { eventName: string; handler: (event: SearchSourceEvent) => Promise<void> }): Promise<unknown>;
}

/**
 * Subscribe the indexer to every event its sources name. Each delivery waits for plugin providers
 * (so a vendor target is never written as "not configured" during boot), then re-loads and writes
 * the named document. Errors propagate on purpose: the outbox keeps the event and redelivers it.
 * No runtime (a composition without search) subscribes nothing.
 * @complexity O(e) subscriptions.
 */
export function subscribeSiteSearchIndexer(required: { readonly bus: SiteSearchBus; readonly runtime?: SiteSearchRuntime }, _optional: Record<string, never> = {}): void {
  const { bus, runtime } = required;
  if (!runtime) return;
  for (const eventName of runtime.indexer.eventNames) {
    void bus.subscribe({
      eventName,
      handler: async (event) => {
        await runtime.ready;
        await runtime.indexer.handleEvent({ event });
      },
    });
  }
}

/** Injected timers so tests control the schedule. */
export interface MaintenanceTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimers: MaintenanceTimers = {
  set: (run, ms) => {
    const handle = setTimeout(run, ms);
    // Never keeps the process alive on its own, like the outbox drainer's timer.
    handle.unref();
    return handle;
  },
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SiteSearchMaintenance {
  /** Stops scheduling and waits for a running pass. */
  stop(): Promise<void>;
}

export interface SiteSearchMaintenanceOptional {
  /** Idle wait between passes (default 30 s). */
  readonly intervalMs?: number;
  /** Rows settled per pass (default 50). */
  readonly reconcileLimit?: number;
  /** Source pages backfilled per pass (default 5). */
  readonly pageBudget?: number;
  readonly timers?: MaintenanceTimers;
  readonly log?: (message: string, error?: unknown) => void;
}

/** First pass only: a site with no active and no building target starts filling its configured provider. */
async function ensureBootTarget(runtime: SiteSearchRuntime): Promise<void> {
  const { siteId, workspaceId } = runtime;
  const status = await runtime.service.status({ siteId });
  if (status.active !== null || status.building !== null) return;
  const providerId = await runtime.readProviderSetting();
  await runtime.indexer.startRebuild({ siteId, workspaceId, providerId });
}

/**
 * The serving process's search maintenance loop: once at boot it starts a rebuild for the configured
 * provider when the site has no target yet; every pass then settles indeterminate/failed writes
 * (`reconcile`) and continues the resumable backfill (`backfill`, which promotes a finished rebuild).
 * Budgets are bounded per pass; a failure is logged and retried after the idle interval, never thrown.
 * Only `createServingApp` starts it (the same ownership rule as the outbox drainer and trash sweeper).
 * @param required.runtime - Absent in a composition without search: a no-op handle.
 * @complexity Each pass: O(reconcileLimit) rows plus O(pageBudget) source pages.
 */
export function startSiteSearchMaintenance(required: { readonly runtime?: SiteSearchRuntime }, optional: SiteSearchMaintenanceOptional = {}): SiteSearchMaintenance {
  const { runtime } = required;
  if (!runtime) return { stop: async () => undefined };
  const { intervalMs = 30_000, reconcileLimit = 50, pageBudget = 5, timers = defaultTimers } = optional;
  const log = optional.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const scope = { siteId: runtime.siteId, workspaceId: runtime.workspaceId };
  let stopped = false;
  let booted = false;
  let handle: unknown;
  let running: Promise<void> = Promise.resolve();

  /** One bounded step; true when it completed. A stop between steps skips the rest of the pass. */
  const step = async (name: string, run: () => Promise<unknown>): Promise<boolean> => {
    if (stopped) return false;
    try {
      await run();
      return true;
    } catch (error) {
      log(`[site-search] ${name} failed; retrying after the idle interval`, error);
      return false;
    }
  };

  const pass = async () => {
    await runtime.ready;
    // Retried on every pass until it succeeds once (e.g. the settings read failed at boot).
    if (!booted) booted = await step("boot rebuild", () => ensureBootTarget(runtime));
    await step("reconcile", () => runtime.indexer.reconcile(scope, { limit: reconcileLimit }));
    await step("backfill", () => runtime.indexer.backfill(scope, { pageBudget }));
  };

  const schedule = (ms: number) => {
    handle = timers.set(() => {
      running = pass()
        .catch((error: unknown) => log("[site-search] maintenance pass failed; retrying after the idle interval", error))
        .finally(() => { if (!stopped) schedule(intervalMs); });
    }, ms);
  };
  schedule(0);

  return {
    async stop() {
      stopped = true;
      timers.clear(handle);
      await running;
    },
  };
}

/** The site's concrete pieces {@link bindSiteSearchPorts} turns into ports. */
export interface SiteSearchBindings {
  readonly workspaceId: string;
  readonly kernel: ContentKernel;
  readonly now: () => number;
  readonly settingsRepo: SettingsRepoPort;
  /** The settings chokepoint deps (authorize + ledger), for the provider-setting write. */
  readonly settingsWriteDeps: SetValueRequired["deps"];
  readonly keyring: KeyringPort;
  /** `resolveCustomCredentialByLabel` bound to the site's credential repo and sealer. */
  resolveCredentialByLabel(required: { readonly workspaceId: string; readonly label: string }): Promise<{ readonly baseUrl: string; readonly connection: { readonly token: string } } | null>;
  /** `DefaultMemberAccessResolver.resolveContext` bound to the site's member repos. */
  resolveMemberContext(required: { readonly workspaceId: string; readonly sessionToken?: string; readonly nowIso: string }): Promise<MemberContext>;
  readonly httpClient: HttpClientPort;
  readonly loadContributions: LoadPluginContributions;
}

/**
 * Bind the site's content database, settings, vault, member sessions and plugin loader to the
 * runtime's ports.
 * @complexity O(1); every port defers its work to call time.
 */
export function bindSiteSearchPorts(required: SiteSearchBindings, _optional: Record<string, never> = {}): SiteSearchPorts {
  const { workspaceId, kernel, now } = required;
  const readSetting = readSearchProviderSetting({ settingsRepo: required.settingsRepo });
  const writeSetting = writeSearchProviderSetting({ deps: required.settingsWriteDeps });
  return {
    workspaceId,
    // v1 topology: one workspace per content database, and the workspace id doubles as the site id.
    siteId: workspaceId,
    sources: createCmsSearchDocumentSources({ kernel, now }),
    ...createSqlSearchIndexStore({ kernel, now }),
    access: createCmsSearchAccessPort({ kernel, now }),
    installId: () => deriveInstallationId({ keyring: required.keyring, workspaceId }),
    resolveCredential: async ({ label }) => {
      const resolved = await required.resolveCredentialByLabel({ workspaceId, label });
      return resolved === null ? null : { baseUrl: resolved.baseUrl, token: resolved.connection.token };
    },
    httpClient: required.httpClient,
    loadPluginProviders: () => loadSearchProviderContributions({ workspaceId }, { loadContributions: required.loadContributions }),
    audiencesForSession: async ({ sessionToken }) => memberSearchAudiences({
      context: await required.resolveMemberContext({ workspaceId, nowIso: new Date(now()).toISOString(), ...(sessionToken === undefined ? {} : { sessionToken }) }),
    }),
    readProviderSetting: () => readSetting({ workspaceId }),
    writeProviderSetting: async ({ principalId, providerId }) => {
      await writeSetting({ workspaceId, callerPrincipalId: principalId, providerId });
    },
    now,
  };
}
