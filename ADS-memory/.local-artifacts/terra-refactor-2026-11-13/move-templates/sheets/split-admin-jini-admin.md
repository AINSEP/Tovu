# admin/integrations/jini-admin (W1 #35, level 3): 1 executable slice, the rest STAY
Written 2026-11-16 from Tovu b28d38c6 / Jini b7666092 (refactor/terra); skeleton by make-sheet.py. Tier: Opus wrote the split; Sonnet executes.
kind: SPLIT (label). This folder IS Tovu's host binding of the Jini admin modules (workspace paths, Tovu i18n dictionaries, Tovu `ApiError` -> Jini `AdminApiError`, Tovu permission names, Tovu route mounts). Per file:
  - ModulePanel.tsx (blob fb8501165cb0e5c8d7472c3f23aa43d1145d3cf2, 5 loc), label DELETE: re-kinded STAY. Not dead: the media-swap test renders it (__tests__/media-swap.unit.test.tsx:6,14,21) and apps/admin/src/media-panel.ts:4,14 keeps its mount commented out "until parity sign-off". Deleting it would mean rewriting that test fixture (COMMON rule 20 risk) for a 5-line component. Revisit when media-panel.ts mounts or drops it.
  - forms-ports.ts (c2b030f158fe0974acad26fb3c07a264493e705f), redirects-ports.ts (6a612929c7b2eeec622128be555f1449d08b2e33), comments-ports.ts (81d38e625e975def0c942be323b7167209b1db9b): STAY-WIRING. Every generic piece they call is already Jini (`createHttpFormsApi`, `createHttpRedirectsApi`, `hasPermission`, `interpolate`); what is left is Tovu workspace paths, dictionaries, permission names, and the Tovu error-class translation.
  - modules.hooks.ts (9bf79c7342aeead073667a7c287a4b39d0b322ef): STAY-WIRING. `createHostAdminScope`/`useAdminModules` compose Tovu's module set; `useModulePanel` uses Tovu `navigate`, `MODULE_PAGE_PATHS` ('/media/new' parity mount) and Tovu's `Runtime` context; `resolveModulePage` is 6 lines over Tovu's `Runtime.bindings` shape. Moving it would need a Jini "bindings registry" contract that does not exist: not worth a port.
  - media-ports.ts (b6824c193c40767339371bd47778fdfd5eee76d1, 167 loc): SPLIT -> slice SP-admin-jini-admin-1 below (READY). The restore-through-Trash method and mediaSessionGrants STAY (Tovu Trash route protocol and grant names).
untangle_overlap (files of this feature with rows in untangle/sheets/*.repoint.tsv):
  - C2.repoint.tsv:264 kit.ts @jini-ai/agentic agentHandle -> @jini-ai/core/agent-handles
  - C7.repoint.tsv:52 __tests__/modules.hooks.unit.test.tsx, :53 module-context.ts, :54 modules.hooks.ts (@jini-ai/admin/core/module -> @jini-ai/core/contracts/admin-module)
  None of those files is edited by slice 1, so slice 1 does NOT wait for wave B. The STAY files above are untouched here; the C2/C7 rows apply to them independently.

## Slice SP-admin-jini-admin-1 (T-SPLIT): the provider-map store moves to @jini-ai/admin/media/adapters/http
tovu_files:
  - apps/admin/src/integrations/jini-admin/media-ports.ts | blob b6824c193c40767339371bd47778fdfd5eee76d1
  - apps/admin/src/integrations/jini-admin/__tests__/media-ports.unit.test.ts | blob 07f33b4df37d484dddc17a35e1b0079d9356c42d | unchanged (pins the bound behaviour)
  - apps/admin/src/integrations/jini-admin/__tests__/media-providers-port.unit.test.ts | blob 706f2a4cbfa385f741749f1098b5a3208a0656d1 | unchanged (pins the bound behaviour)
split (media-ports.ts top-level declarations):
  - mediaBasePath, mediaTransport, httpMediaApi, mediaRestoreOutcome, mediaApi, capabilities, mediaSessionGrants, mediaEvents | STAY
  - catalogProvider, providerView, catalogViews, withoutProvider, withCredential, withSettings, trimmedEntry, withCatalogEntries | MOVE -> Jini adapters/http.ts (catalog passed in instead of the MEDIA_PROVIDER_CATALOG import; Tovu wire types replaced by Jini's identical `MediaProviderConfiguration(Map)`)
  - createMediaProvidersPort | STAY-WIRING, reduced to one call of Jini `createHttpMediaProvidersPort`
ports: transport `MediaProvidersTransportPort` (GET/PUT of the whole map; Tovu binds `{ request: authenticatedAdminRequest }`); `path` (Tovu: `${mediaBasePath}/providers`); `catalog` (Tovu: MEDIA_PROVIDER_CATALOG); optional `pinnedProviderIds` (Tovu: PINNED_MEDIA_PROVIDER_IDS). A separate transport type, not a widened `MediaTransportPort`, so existing implementers of MediaTransportPort (method union without PUT) are not broken (COMMON rule 14).
jini guards: packages/admin/src/media/adapters/http.ts | blob 291d8cfe8ef3884a8a2858fe142ddf8c9750162f; `rg -n "createHttpMediaProvidersPort|MediaProvidersTransportPort" packages/admin/src` prints nothing; models.ts declares `MediaProvider`, `MediaProviderConfiguration`, `MediaProviderConfigurationMap`, `MediaProviderOption` (rg each `export interface|export type` name: 1 hit each); ports.ts declares `MediaProvidersPort`.
jini_code: edit packages/admin/src/media/adapters/http.ts:
  - "import type { MediaApiPort } from '../ports.js';" -> "import type { MediaApiPort, MediaProvidersPort } from '../ports.js';"
  - "import type { MediaAsset, MediaRequestOptions } from '../models.js';" -> "import type { MediaAsset, MediaProvider, MediaProviderConfiguration, MediaProviderConfigurationMap, MediaProviderOption, MediaRequestOptions } from '../models.js';"
  - append at end of file after one blank line:
```ts
/** The host's whole-map provider settings route: GET returns the stored map, PUT replaces it and
 * returns the stored map with public markers only (never key material). */
export interface MediaProvidersTransportPort {
  request<T>(required: { path: string; method: 'GET' | 'PUT'; body?: unknown }, optional?: MediaRequestOptions): Promise<T>;
}
type ProviderChange = (input: { current: MediaProviderConfigurationMap }) => MediaProviderConfigurationMap;

function catalogProvider({ catalog, id }: { catalog: readonly MediaProviderOption[]; id: string }): MediaProviderOption {
  const provider = catalog.find(entry => entry.id === id);
  if (!provider) throw new Error(`Unknown media provider "${id}": it is not in this host's provider catalog`);
  return provider;
}
function providerView({ provider, values }: { provider: MediaProviderOption; values: MediaProviderConfigurationMap }): MediaProvider {
  const saved = values[provider.id] ?? {};
  return { id: provider.id, label: provider.label,
    configured: saved.apiKeyConfigured === true,
    ...(saved.apiKeyTail ? { apiKeyTail: saved.apiKeyTail.slice(-4) } : {}),
    ...(saved.baseUrl === undefined ? {} : { baseUrl: saved.baseUrl }),
    ...(saved.model === undefined ? {} : { model: saved.model }) };
}
function withoutProvider({ current, id }: { current: MediaProviderConfigurationMap; id: string }): MediaProviderConfigurationMap {
  const next = { ...current };
  // The server keeps blank keys; omission is its only supported clear operation.
  delete next[id];
  return next;
}
function withCredential({ current, id, credential }: { current: MediaProviderConfigurationMap; id: string; credential: string }): MediaProviderConfigurationMap {
  return { ...current, [id]: { ...current[id], apiKey: credential } };
}
function withSettings({ current, id, settings }: { current: MediaProviderConfigurationMap; id: string; settings: { baseUrl: string; model: string } }): MediaProviderConfigurationMap {
  const entry: MediaProviderConfiguration = { ...current[id], ...settings };
  // Blank settings clear their fields. Omit a provider only after its last
  // setting is gone and no saved credential needs the server's keep-key path.
  if (!settings.baseUrl.trim()) delete entry.baseUrl;
  if (!settings.model.trim()) delete entry.model;
  const next = { ...current, [id]: entry };
  if (!entry.baseUrl && !entry.model && !entry.apiKeyConfigured && !entry.apiKey) delete next[id];
  return next;
}
function trimmedEntry({ entry }: { entry: MediaProviderConfiguration }): MediaProviderConfiguration {
  const baseUrl = entry.baseUrl?.trim();
  const model = entry.model?.trim();
  const apiKey = entry.apiKey?.trim();
  return {
    ...(baseUrl ? { baseUrl } : {}), ...(model ? { model } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(entry.apiKeyConfigured ? { apiKeyConfigured: true } : {}),
  };
}
function withCatalogEntries({ catalog, current, providers }: { catalog: readonly MediaProviderOption[]; current: MediaProviderConfigurationMap; providers: MediaProviderConfigurationMap }): MediaProviderConfigurationMap {
  const next = { ...current };
  for (const { id } of catalog) {
    const entry = providers[id];
    const kept = entry ? trimmedEntry({ entry }) : {};
    // Blank keys use the server's keep-key path. Explicit omission (Clear) is
    // the only supported removal; markers are never recoverable key material.
    if (Object.keys(kept).length > 0 || entry?.apiKeyTail) next[id] = kept;
    else delete next[id];
  }
  return next;
}

/**
 * A `MediaProvidersPort` over a whole-map settings route. Every write is read-modify-write of the
 * whole map, serialized behind the previous write, and refused for a provider outside `catalog`
 * before anything is written. Providers outside the catalog are kept untouched.
 * @complexity O(catalog) per call.
 */
export function createHttpMediaProvidersPort(
  { transport, path, catalog }: { transport: MediaProvidersTransportPort; path: string; catalog: readonly MediaProviderOption[] },
  { pinnedProviderIds }: { pinnedProviderIds?: readonly string[] | undefined } = {},
): MediaProvidersPort {
  let writes: Promise<unknown> = Promise.resolve();
  const read = ({ signal }: MediaRequestOptions) => transport.request<MediaProviderConfigurationMap>({ path, method: 'GET' }, { signal });
  const views = ({ values }: { values: MediaProviderConfigurationMap }) => catalog.map(provider => providerView({ provider, values }));
  function replaceAll<T>({ change, present }: { change: ProviderChange; present: (input: { values: MediaProviderConfigurationMap }) => T }, { signal }: MediaRequestOptions = {}): Promise<T> {
    const operation = writes.then(async () => {
      signal?.throwIfAborted();
      const next = change({ current: await read({ signal }) });
      return present({ values: await transport.request<MediaProviderConfigurationMap>({ path, method: 'PUT', body: next }, { signal }) });
    });
    // The caller receives operation, while this recovery keeps later writes runnable.
    writes = operation.catch(() => undefined);
    return operation;
  }
  const writeProvider = ({ id, change }: { id: string; change: ProviderChange }, options: MediaRequestOptions = {}) => replaceAll({
    change: ({ current }) => { catalogProvider({ catalog, id }); return change({ current }); },
    present: ({ values }) => providerView({ provider: catalogProvider({ catalog, id }), values }),
  }, options);
  return {
    catalog,
    ...(pinnedProviderIds === undefined ? {} : { pinnedProviderIds }),
    saveChanges({ providers }, options = {}) {
      return replaceAll({
        change: ({ current }) => {
          for (const id of Object.keys(providers)) catalogProvider({ catalog, id });
          // One save replaces the catalog's working set. Reread first to retain providers outside
          // this host's catalog; no intermediate per-provider PUT can erase them.
          return withCatalogEntries({ catalog, current, providers });
        },
        present: views,
      }, options);
    },
    async list(_required, { signal } = {}) {
      try {
        return views({ values: await read({ signal }) });
      } catch (error) {
        if (signal?.aborted) throw error;
        // An unreachable read is not evidence that the server manages no providers.
        return null;
      }
    },
    saveSettings({ id, baseUrl, model }, options = {}) { return writeProvider({ id, change: ({ current }) => withSettings({ current, id, settings: { baseUrl, model } }) }, options); },
    saveCredential({ id, credential }, options = {}) { return writeProvider({ id, change: ({ current }) => withCredential({ current, id, credential }) }, options); },
    removeCredential({ id }, options = {}) { return writeProvider({ id, change: ({ current }) => withoutProvider({ current, id }) }, options); },
  };
}
```
  STOPs: if `MediaRequestOptions` is not `{ signal?: AbortSignal ... }` (rg "export interface MediaRequestOptions" -A3 packages/admin/src/media/models.ts), SKIP. If eslint flags max-lines-per-function / complexity on createHttpMediaProvidersPort, SKIP and report the numbers. If MediaProvidersPort's method signatures (saveSettings/saveCredential/removeCredential/list/saveChanges) differ from the calls above, SKIP.
jini_index: none (`./media/adapters/http` already exports this file; the new names are exported from it).
jini_tests: new file packages/admin/src/media/adapters/__tests__/http-providers.test.ts (create the folder if absent; if a sibling http.test.ts lives elsewhere, put it next to that file and adjust the import to the leaf `http.js`):
```ts
import { describe, expect, it } from 'vitest';
import type { MediaProviderConfigurationMap } from '../../models.js';
import { createHttpMediaProvidersPort, type MediaProvidersTransportPort } from '../http.js';

const catalog = [{ id: 'alpha', label: 'Alpha' }, { id: 'beta', label: 'Beta' }] as const;

function memoryTransport(initial: MediaProviderConfigurationMap) {
  let stored = initial;
  const puts: MediaProviderConfigurationMap[] = [];
  const transport: MediaProvidersTransportPort = {
    async request<T>({ method, body }: { path: string; method: 'GET' | 'PUT'; body?: unknown }): Promise<T> {
      if (method === 'PUT') { stored = body as MediaProviderConfigurationMap; puts.push(stored); }
      return stored as T;
    },
  };
  return { transport, puts };
}

describe('createHttpMediaProvidersPort', () => {
  it('lists one view per catalog provider and keeps only a four-character tail', async () => {
    const { transport } = memoryTransport({ alpha: { apiKeyConfigured: true, apiKeyTail: 'abcdef' }, foreign: { model: 'x' } });
    const port = createHttpMediaProvidersPort({ transport, path: '/p', catalog });
    await expect(port.list({})).resolves.toEqual([
      { id: 'alpha', label: 'Alpha', configured: true, apiKeyTail: 'cdef' },
      { id: 'beta', label: 'Beta', configured: false },
    ]);
  });

  it('refuses a provider outside the catalog without writing, and keeps foreign providers on a whole save', async () => {
    const { transport, puts } = memoryTransport({ foreign: { model: 'x' } });
    const port = createHttpMediaProvidersPort({ transport, path: '/p', catalog });
    await expect(port.saveCredential!({ id: 'nope', credential: 'k' })).rejects.toThrow('Unknown media provider "nope"');
    expect(puts).toEqual([]);
    await port.saveChanges!({ providers: { alpha: { apiKey: ' key ' } } });
    expect(puts).toEqual([{ foreign: { model: 'x' }, alpha: { apiKey: 'key' } }]);
  });

  it('answers null when the read fails, so an outage is not read as "no providers"', async () => {
    const transport: MediaProvidersTransportPort = { async request() { throw new Error('offline'); } };
    const port = createHttpMediaProvidersPort({ transport, path: '/p', catalog });
    await expect(port.list({})).resolves.toBeNull();
  });
});
```
  (If `saveCredential`/`saveChanges` are not optional on MediaProvidersPort, drop the `!` — that is a literal consequence, not an assertion change.)
changeset: .changeset/admin-media-providers-http.md: `"@jini-ai/admin": minor` | "`@jini-ai/admin/media/adapters/http` exports `createHttpMediaProvidersPort`, a serialized whole-map provider settings store gated by the host's catalog."
jini_msg: "feat(admin): createHttpMediaProvidersPort for whole-map provider settings routes"
Tovu edits (media-ports.ts):
  - "import { createHttpMediaApi } from '@jini-ai/admin/media/adapters/http';" -> "import { createHttpMediaApi, createHttpMediaProvidersPort } from '@jini-ai/admin/media/adapters/http';"
  - "import type { MediaApiPort, MediaProvidersPort, MediaProvider, MediaEventsPort, MediaProviderConfiguration, MediaProviderConfigurationMap } from '@jini-ai/admin/media';" -> "import type { MediaApiPort, MediaProvidersPort, MediaEventsPort } from '@jini-ai/admin/media';"
  - delete the line "import type { MediaProviderOption } from '@jini-ai/ui';"
  - "import { authenticatedAdminRequest, authenticatedAdminUrl, WORKSPACE_ID, type AdminMediaProviderCredentials, type AdminMediaProviderMap } from '../../lib/api';" -> "import { authenticatedAdminRequest, authenticatedAdminUrl, WORKSPACE_ID } from '../../lib/api';"
  - delete every line from "function catalogProvider({ id }: { id: string }): MediaProviderOption {" through the closing "}" of `createMediaProvidersPort` (end of the provider section; everything after `mediaEvents`'s closing "};"), including the doc comments that sit between them, and put in their place:
```ts
/** The workspace's media provider settings, in Tovu's catalog order; the store logic is Jini's. */
export function createMediaProvidersPort(_required: Record<string, never>, _optional: Record<string, never> = {}): MediaProvidersPort {
  return createHttpMediaProvidersPort(
    { transport: { request: authenticatedAdminRequest }, path: `${mediaBasePath}/providers`, catalog: MEDIA_PROVIDER_CATALOG },
    { pinnedProviderIds: PINNED_MEDIA_PROVIDER_IDS },
  );
}
```
    Before deleting, check that nothing between `mediaEvents` and the end of file other than the 8 moved helpers and createMediaProvidersPort is declared (`rg -n "^(export )?(function|const|let|class|interface|type) " media-ports.ts` lists, after mediaEvents, exactly: catalogProvider, providerView, catalogViews, withoutProvider, withCredential, withSettings, trimmedEntry, withCatalogEntries, createMediaProvidersPort); else SKIP. Why-comments in the deleted helpers are carried verbatim in jini_code.
census: python3 scripts/census.py <TOVU> apps/admin/src/integrations/jini-admin/media-ports.ts: importers unchanged (exports kept: mediaTransport, mediaApi, mediaSessionGrants, mediaEvents, createMediaProvidersPort).
tests: both Tovu test files unchanged; they must pass in the cloud run (identical behaviour through Jini). STOP if either imports a removed helper (rg -n "catalogProvider|providerView|withCatalogEntries|trimmedEntry" __tests__ prints nothing today).
tovu_msg: "refactor(admin-media): provider settings store comes from @jini-ai/admin" | body "Tovu keeps the route path, its provider catalog and pins."
type risk for the cloud run: Tovu MEDIA_PROVIDER_CATALOG is typed with `@jini-ai/ui`'s MediaProviderOption; Jini admin's has `{ id, label, defaultBaseUrl?, models? }`. Typecheck must pass; if not, the fix is a coordinator decision (record, do not cast).
est. executor tokens: ~55k Sonnet.
