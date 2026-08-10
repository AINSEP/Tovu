import {
  createBrowserConnectorAuthBridge,
  createBrowserConnectorAuthPendingStorage,
  type Connector,
  type ConnectorActionResult,
  type ConnectorStatusMap,
  type ConnectorsDependencies,
  type ConnectorsPort,
  type FetchConnectorDetailOptions,
} from "@jini-ai/ui";

import { api } from "../../lib/api";

/**
 * @file The real `ConnectorsPort` — Tovu's implementation of the transport `@jini-ai/ui`'s
 * connectors feature declares but deliberately does not ship (the package ships only
 * `createFakeConnectorsPort`, an empty in-memory double). Same convention as
 * `features/media/media-providers-port.ts`.
 *
 * The full port is real, including the OAuth half. Authorization is a TWO-GESTURE flow, by design:
 *
 * 1. "Connect" calls {@link connectConnector}, which returns Composio's redirect URL; the card
 *    stores it as pending state and renders a "Continue in browser" button.
 * 2. Clicking THAT button calls {@link openExternalUrl} — synchronously, inside a fresh user
 *    gesture — which is the only way the popup survives a popup blocker. Opening it straight from
 *    the connect handler would mean calling `window.open` after an awaited request, with the user
 *    activation already spent.
 * 3. Composio redirects to the public callback (`/api/connectors/composio/callback/:connectorId`),
 *    which completes the handshake and `postMessage`s this window.
 *
 * `createBrowserConnectorAuthBridge` — supplied below — listens for that message, and separately
 * for the window regaining focus, which is how a system-browser flow with no opener still resolves.
 */

/**
 * The connector catalog.
 *
 * REJECTS on failure rather than resolving `[]`, unlike `media-providers-port.ts`'s read: an empty
 * array is a legitimate catalog answer that would render as "no connectors exist", so collapsing an
 * unreachable server into it would state something false. The feature's own `useConnectorCatalog`
 * models the rejection as an error state.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function fetchConnectors(): Promise<Connector[]> {
  return (await api.listConnectors()).connectors as Connector[];
}

/**
 * A live re-fetch of the catalog from Composio. Only called once `unlocked`, so a configured API
 * key is a precondition the caller has already established.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function fetchConnectorEnrichment(options?: { refresh?: boolean }): Promise<Connector[]> {
  return (await api.listConnectors(options?.refresh ?? true)).connectors as Connector[];
}

/**
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function fetchConnectorStatuses(): Promise<ConnectorStatusMap> {
  return (await api.getConnectorStatuses()) as ConnectorStatusMap;
}

/**
 * One connector plus a bounded page of its tools.
 *
 * Resolves `null` rather than rejecting when the connector cannot be loaded, because that is the
 * port's declared return type and the drawer renders `null` as its own "couldn't load" state.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function fetchConnectorDetail(
  connectorId: string,
  options?: FetchConnectorDetailOptions
): Promise<Connector | null> {
  try {
    return (await api.getConnector(connectorId, options)) as Connector;
  } catch {
    return null;
  }
}

/**
 * Starts authorizing a connector.
 *
 * Resolves `{ connector: null, error }` rather than rejecting on failure, because that is the
 * shape `ConnectorActionResult` declares and what the feature renders as a per-connector alert; a
 * rejection here would surface as an unhandled error instead of an inline message on the card.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function connectConnector(connectorId: string): Promise<ConnectorActionResult> {
  try {
    const result = await api.connectConnector(connectorId);
    return {
      connector: result.connector as Connector,
      ...(result.auth === undefined ? {} : { auth: result.auth }),
    };
  } catch (err) {
    return { connector: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Revokes the account and drops the stored credentials.
 *
 * Resolves `null` on failure, matching the port's declared return type — the feature treats `null`
 * as "the connector did not change" and keeps the card in its previous state.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function disconnectConnector(connectorId: string): Promise<Connector | null> {
  try {
    return (await api.disconnectConnector(connectorId)) as Connector;
  } catch {
    return null;
  }
}

/**
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function cancelConnectorAuthorization(connectorId: string): Promise<Connector | null> {
  try {
    return (await api.cancelConnectorAuthorization(connectorId)) as Connector;
  } catch {
    return null;
  }
}

/**
 * Opens Composio's consent page in a popup.
 *
 * Deliberately WITHOUT `noopener`: the callback page finishes the handshake by `postMessage`-ing
 * `window.opener`, and `noopener` would null that reference, leaving the popup unable to report
 * back. The bridge's focus/`visibilitychange` listener would eventually recover, but only after the
 * operator manually returned — so the flow would appear to hang. The target is a URL this app's own
 * server minted from Composio's response, not arbitrary user input.
 *
 * Reports `false` when the popup was blocked, which is what the authorization hook checks.
 *
 * @complexity O(1).
 * @overallScore 100
 */
async function openExternalUrl(url: string): Promise<boolean> {
  return window.open(url, "_blank", "popup=yes,width=620,height=760") !== null;
}

export const connectorsPort: ConnectorsPort = {
  fetchConnectors,
  fetchConnectorEnrichment,
  fetchConnectorStatuses,
  fetchConnectorDetail,
  connectConnector,
  disconnectConnector,
  cancelConnectorAuthorization,
  openExternalUrl,
};

/**
 * The dependency bag `ConnectorsBrowser` takes.
 *
 * `authPendingStorage` and `authBridge` are `@jini-ai/ui`'s own real browser implementations, not
 * fakes — they touch only `sessionStorage`/`postMessage`/focus events, so they are already correct
 * for Tovu and the package ships them precisely so a host only has to supply `data`.
 *
 * A module-level singleton: it closes over nothing, so every call site shares one object and no
 * component needs a `useRef` to keep it stable across renders.
 */
export const connectorsDependencies: ConnectorsDependencies = {
  data: connectorsPort,
  authPendingStorage: createBrowserConnectorAuthPendingStorage(),
  authBridge: createBrowserConnectorAuthBridge(),
};
