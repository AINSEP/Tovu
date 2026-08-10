import type { ClockPort, UUID } from "@jini-ai/cms/core";
import { ComposioConnectorProvider, ComposioConnectorService } from "@jini-ai/integrations/composio";

import type { KeyringPort, SecretSealerPort } from "../integrations/ports";
import {
  createSnapshotComposioConfigStore,
  readComposioConfig,
  saveComposioAuthConfigIds,
  type ComposioConfigRepoPort,
  type MutableComposioConfigStore,
} from "./composio-config-store";
import { probeComposioApiKey, type ComposioKeyProbeResult } from "./composio-key-probe";
import {
  createSnapshotConnectorCredentialStore,
  type ConnectorCredentialRepoPort,
} from "./connector-credential-store";

/**
 * @file Builds the one long-lived `ComposioConnectorService` the admin's Connectors routes talk to.
 *
 * A SINGLETON, not a per-request construction, and that is load-bearing rather than an
 * optimisation: `ComposioConnectorProvider` holds the discovery/definition caches AND — for the
 * OAuth handshake — the pending-connection map keyed by OAuth `state`. Rebuilding it per request
 * would discard the pending state between starting an authorization and completing it, so the
 * callback could never match the connect that produced it.
 *
 * That same in-process pending map is why connector OAuth is single-process-only today: a second
 * worker would not share it. Not a problem for Tovu's single-server boot, but it is the reason the
 * OAuth completion route (when it lands) cannot be moved behind a load balancer unchanged.
 */

/** Composio's per-connector definition cache is keyed by this; see {@link composioUserIdFor}. */
const COMPOSIO_USER_ID_PREFIX = "tovu-workspace";

/**
 * The `userId` Composio scopes connected accounts under.
 *
 * The workspace id, because the API key that authorizes these connections is itself
 * workspace-scoped (`db/schema.ts`'s `composioConfig`): one Composio "user" per Tovu workspace
 * keeps the two scopes aligned, so revoking the workspace's key cannot orphan accounts belonging
 * to some other scope. Prefixed rather than bare so a Composio project shared with another product
 * cannot collide with a same-named id.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function composioUserIdFor(workspaceId: UUID): string {
  return `${COMPOSIO_USER_ID_PREFIX}-${workspaceId}`;
}

export interface ComposioConnectorsDeps {
  workspaceId: UUID;
  repo: ComposioConfigRepoPort;
  credentialRepo: ConnectorCredentialRepoPort;
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  /** Injected for tests. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Overrides Composio's API origin. Set from `TOVU_COMPOSIO_BASE_URL` for the e2e fake. */
  baseUrl?: string;
}

export interface ComposioConnectors {
  service: ComposioConnectorService;
  /**
   * Re-reads the sealed API key, provisioned auth-config ids, and stored account credentials from
   * the database. Called once at boot and after every key change, because both stores handed to
   * Jini are synchronous in-memory views that cannot read the DB themselves.
   */
  refresh(): Promise<void>;
  /**
   * Resolves once every queued credential write has hit the database, or rejects with the first
   * failure. Connect/disconnect routes MUST await this before responding — see
   * `connector-credential-store.ts` for why these writes are not fire-and-forget.
   */
  flushCredentials(): Promise<void>;
  /**
   * Asks Composio whether a CANDIDATE key is usable, before it is stored.
   *
   * Lives on this handle rather than being called directly by the route so the probe inherits the
   * same `baseUrl`/`fetchFn` the provider uses. A route reading `TOVU_COMPOSIO_BASE_URL` from the
   * environment itself would be a hidden dependency that no test could redirect — and would send
   * every test's dummy key to the real Composio.
   */
  probeApiKey(apiKey: string): Promise<ComposioKeyProbeResult>;
}

/**
 * Assembles the provider, both snapshot stores, and the service.
 *
 * Connected-account credentials are sealed into `composio_connector_credentials` via
 * {@link createSnapshotConnectorCredentialStore}, so an authorized account survives a restart.
 *
 * No `catalogCachePath` is configured, so the provider serves its 186-entry static catalog and
 * caches discovery in memory only. Deliberate: a disk cache would make this write files outside
 * the database for a payload that costs one API call to rebuild.
 *
 * @complexity O(1) construction; the static catalog is built once inside the provider.
 * @overallScore 100
 */
export function createComposioConnectors(deps: ComposioConnectorsDeps): ComposioConnectors {
  const configStore: MutableComposioConfigStore = createSnapshotComposioConfigStore({
    initial: { apiKey: "", authConfigIds: {} },
    persistAuthConfigIds: (authConfigIds) => {
      void saveComposioAuthConfigIds(
        { repo: deps.repo, clock: deps.clock },
        { workspaceId: deps.workspaceId, authConfigIds }
      ).catch((err: unknown) => {
        console.error(`composio auth-config persistence failed: ${(err as Error).message}`);
      });
    },
  });

  const provider = new ComposioConnectorProvider({
    userId: composioUserIdFor(deps.workspaceId),
    configStore,
    productName: "Tovu",
    ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
    ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }),
    onError: (event) => {
      console.error(
        `composio ${event.operation} failed: ${event.error instanceof Error ? event.error.message : String(event.error)}`
      );
    },
  });

  const credentialStore = createSnapshotConnectorCredentialStore({
    workspaceId: deps.workspaceId,
    repo: deps.credentialRepo,
    sealer: deps.sealer,
    keyring: deps.keyring,
    clock: deps.clock,
  });

  const service = new ComposioConnectorService({ provider });
  service.setCredentialStore(credentialStore);

  return {
    service,
    async refresh(): Promise<void> {
      configStore.replace(
        await readComposioConfig(
          { repo: deps.repo, sealer: deps.sealer },
          { workspaceId: deps.workspaceId }
        )
      );
      await credentialStore.hydrate();
      // Definition caches are keyed to the previous key's project; a key swap must not serve them.
      provider.clearDiscoveryCache();
    },
    flushCredentials: () => credentialStore.flush(),
    probeApiKey: (apiKey: string) =>
      probeComposioApiKey(
        {
          ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
          ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }),
        },
        { apiKey }
      ),
  };
}
